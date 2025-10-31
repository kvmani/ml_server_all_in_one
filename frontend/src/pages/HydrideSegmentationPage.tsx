import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SettingsModal, type SettingsField } from "../components/SettingsModal";
import { StatusMessage } from "../components/StatusMessage";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { useToolSettings } from "../hooks/useToolSettings";
import { apiFetch } from "../utils/api";
import { base64ToBlob, downloadBlob } from "../utils/files";
import "../styles/hydride_segmentation.css";

type SegmentationResult = {
  images: {
    input: string;
    mask: string;
    overlay: string;
    orientation: string;
    sizeHistogram: string;
    angleHistogram: string;
    combined: string;
  };
  metrics: {
    mask_area_fraction: number;
    mask_area_fraction_percent: number;
    hydride_count: number;
    [key: string]: number;
  };
  logs: string[];
  parameters: Record<string, unknown>;
};

const SAMPLE_IMAGE = "/hydride_segmentation/static/img/hydride_sample.png";
const TOOL_ICON = "/hydride_segmentation/static/img/hydride_icon.svg";

const DEFAULTS = {
  model: "conventional",
  clahe_clip_limit: "2.0",
  clahe_grid_x: "8",
  clahe_grid_y: "8",
  adaptive_window: "13",
  adaptive_offset: "40",
  morph_kernel_x: "5",
  morph_kernel_y: "5",
  morph_iterations: "2",
  area_threshold: "500",
  crop_percent: "10",
  crop_enabled: false,
};

type HydridePreferences = {
  defaultModel: "conventional" | "ml";
  previewBrightness: number;
  previewContrast: number;
  autoResetImage: boolean;
};

type SegmentApiResponse = {
  input_png_b64: string;
  mask_png_b64: string;
  overlay_png_b64: string;
  analysis: {
    orientation_map_png_b64: string;
    size_histogram_png_b64: string;
    angle_histogram_png_b64: string;
    combined_panel_png_b64: string;
    [key: string]: unknown;
  };
  logs: string[];
  metrics: Record<string, number>;
  parameters: Record<string, unknown>;
};

export default function HydrideSegmentationPage() {
  const pluginConfig = usePluginSettings<{ upload?: { max_mb?: number }; docs?: string }>(
    "hydride_segmentation",
    {},
  );
  const uploadLimit = pluginConfig.upload || {};
  const maxMb = Number(uploadLimit.max_mb ?? 5);
  const helpHref =
    typeof pluginConfig.docs === "string" ? pluginConfig.docs : "/help/hydride_segmentation";
  const { withLoader } = useLoading();
  const { settings: preferences, updateSetting, resetSettings } = useToolSettings<HydridePreferences>(
    "hydride_segmentation",
    {
      defaultModel: "conventional",
      previewBrightness: 0,
      previewContrast: 100,
      autoResetImage: false,
    },
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const status = useStatus({ message: "Drop a microscopy image to begin", level: "info" }, {
    context: "Hydride Segmentation",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(SAMPLE_IMAGE);
  const [model, setModel] = useState<string>(preferences.defaultModel);
  const [cropEnabled, setCropEnabled] = useState<boolean>(DEFAULTS.crop_enabled);
  const [cropPercent, setCropPercent] = useState<string>(DEFAULTS.crop_percent);
  const [brightness, setBrightness] = useState<number>(preferences.previewBrightness);
  const [contrast, setContrast] = useState<number>(preferences.previewContrast);
  const [history, setHistory] = useState<SegmentationResult[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentResult = historyIndex >= 0 ? history[historyIndex] : null;

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  useEffect(() => {
    setModel(preferences.defaultModel);
  }, [preferences.defaultModel]);

  useEffect(() => {
    setBrightness(preferences.previewBrightness);
    setContrast(preferences.previewContrast);
  }, [preferences.previewBrightness, preferences.previewContrast]);

  const settingsFields = useMemo<SettingsField[]>(
    () => [
      {
        key: "defaultModel",
        label: "Default backend",
        type: "select",
        options: [
          { value: "conventional", label: "Conventional (parameterised)" },
          { value: "ml", label: "ML proxy (auto)" },
        ],
        description: "Applied whenever the workspace resets.",
      },
      {
        key: "previewBrightness",
        label: "Default preview brightness",
        type: "number",
        min: -100,
        max: 100,
        step: 5,
        description: "Offset applied to the preview image. 0 keeps the original exposure.",
      },
      {
        key: "previewContrast",
        label: "Default preview contrast (%)",
        type: "number",
        min: 50,
        max: 200,
        step: 5,
        description: "100 preserves the source. Higher values boost contrast.",
      },
      {
        key: "autoResetImage",
        label: "Reset image after segmentation",
        type: "boolean",
        description: "Clear the upload area once results are ready.",
      },
    ],
    [],
  );

  const setCurrentResult = (result: SegmentationResult) => {
    setHistory((prev) => {
      const next = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : prev;
      return [...next, result];
    });
    setHistoryIndex((prev) => prev + 1);
  };

  const resetImagePreview = useCallback(() => {
    if (imagePreview && imagePreview !== SAMPLE_IMAGE) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(SAMPLE_IMAGE);
    setBrightness(preferences.previewBrightness);
    setContrast(preferences.previewContrast);
  }, [imagePreview, preferences.previewBrightness, preferences.previewContrast]);

  const onFilesSelected = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files || []);
      if (!list.length) {
        return;
      }
      const [file] = list;
      const mimeOk = ["image/png", "image/jpeg", "image/tiff"].includes(file.type);
      if (!mimeOk) {
        status.setStatus("Unsupported format. Upload PNG, JPEG, or TIFF.", "error");
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        status.setStatus(`File exceeds ${maxMb} MB limit`, "error");
        return;
      }
      const url = URL.createObjectURL(file);
      if (imagePreview && imagePreview !== SAMPLE_IMAGE) {
        URL.revokeObjectURL(imagePreview);
      }
      setImageFile(file);
      setImagePreview(url);
      status.setStatus(`Loaded ${file.name}. Configure parameters then segment.`, "info");
    },
    [imagePreview, maxMb, status],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer?.files) {
      onFilesSelected(event.dataTransfer.files);
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    if (value === "ml") {
      status.setStatus("ML proxy uses tuned defaults", "info");
    }
  };

  const resetParameters = useCallback(() => {
    setModel(preferences.defaultModel);
    setCropEnabled(DEFAULTS.crop_enabled);
    setCropPercent(DEFAULTS.crop_percent);
    setBrightness(preferences.previewBrightness);
    setContrast(preferences.previewContrast);
    status.setStatus("Parameters reset to defaults", "info");
  }, [preferences.defaultModel, preferences.previewBrightness, preferences.previewContrast, status]);

  const clearResults = () => {
    setHistory([]);
    setHistoryIndex(-1);
    status.setStatus("Cleared segmentation history", "info");
  };

  const submitSegmentation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) {
      status.setStatus("Select a microscopy image first", "error");
      return;
    }
    status.setStatus("Segmenting image. Please wait…", "progress");
    try {
      const formData = new FormData(event.currentTarget);
      formData.delete("image");
      formData.append("image", imageFile, imageFile.name);
      formData.set("model", model);
      formData.set("crop_percent", cropPercent || DEFAULTS.crop_percent);
      if (cropEnabled) {
        formData.set("crop_enabled", "on");
      } else {
        formData.delete("crop_enabled");
      }
      const payload = await withLoader(() =>
        apiFetch<SegmentApiResponse>("/api/hydride_segmentation/segment", {
          method: "POST",
          body: formData,
        }),
      );
      const analysis = payload.analysis || {};
      const result: SegmentationResult = {
        images: {
          input: payload.input_png_b64,
          mask: payload.mask_png_b64,
          overlay: payload.overlay_png_b64,
          orientation: analysis.orientation_map_png_b64 ?? "",
          sizeHistogram: analysis.size_histogram_png_b64 ?? "",
          angleHistogram: analysis.angle_histogram_png_b64 ?? "",
          combined: analysis.combined_panel_png_b64 ?? "",
        },
        metrics: payload.metrics || {},
        logs: payload.logs || [],
        parameters: payload.parameters || {},
      };
      setCurrentResult(result);
      if (preferences.autoResetImage) {
        resetImagePreview();
      }
      status.setStatus("Segmentation complete", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Segmentation failed", "error");
    }
  };

  const goBack = () => {
    if (canGoBack) {
      setHistoryIndex((prev) => prev - 1);
      status.setStatus("Reverted to previous result", "info");
    }
  };

  const goForward = () => {
    if (canGoForward) {
      setHistoryIndex((prev) => prev + 1);
      status.setStatus("Advanced to next result", "info");
    }
  };

  const downloadImage = (label: string, data: string) => {
    const blob = base64ToBlob(data, "image/png");
    downloadBlob(blob, `${label}.png`);
  };

  const historyStatus = useMemo(() => {
    if (!history.length) {
      return "";
    }
    return `Result ${historyIndex + 1} of ${history.length}`;
  }, [history.length, historyIndex]);

  const brightnessStyle = {
    filter: `brightness(${(brightness + 100) / 100}) contrast(${contrast / 100})`,
  } as const;

  return (
    <section className="shell surface-block hydride-shell" aria-labelledby="hydride-title">
      <div className="tool-shell__layout">
        <aside className="tool-shell__intro">
          <div className="tool-shell__icon" aria-hidden="true">
            <img src={TOOL_ICON} alt="" />
          </div>
          <p className="tool-card__category">Microstructural Analysis</p>
          <h1 id="hydride-title" className="section-heading">
            Hydride segmentation workstation
          </h1>
          <p>
            Upload zirconium alloy microscopy images, tune the segmentation pipeline, and review high-resolution overlays, histograms, and quantitative metrics. Everything executes locally with no data persistence.
          </p>
          <ul>
            <li>Drag &amp; drop microscopy files or browse from disk</li>
            <li>Tooltips describe every parameter and default ranges</li>
            <li>Result history allows undo / redo across segmentation runs</li>
          </ul>
          <div className="tool-shell__actions">
            <button className="btn btn--ghost" type="button" onClick={() => setSettingsOpen(true)}>
              ⚙️ Settings
            </button>
            <a className="btn btn--subtle" data-keep-theme href={typeof helpHref === "string" ? helpHref : "/help/hydride_segmentation"}>
              Read hydride guide
            </a>
          </div>
          <div className="surface-muted">
            <p className="form-field__hint">Supported formats: PNG, JPEG, TIFF. Maximum size {maxMb} MB.</p>
            <div className="tag-list">
              <span className="badge">Offline inference</span>
              <span className="badge">On-device rendering</span>
            </div>
          </div>
        </aside>

        <form id="segment-form" className="form-grid tool-shell__workspace" onSubmit={submitSegmentation}>
          <section className="surface-muted">
            <h2 className="form-section__title">Microscopy input</h2>
            <div
              className={`dropzone${imageFile ? " has-file" : ""}`}
              id="image-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="dropzone__preview" aria-hidden="true">
                <img id="image-preview" src={imagePreview} alt="Sample microscopy placeholder" style={brightnessStyle} />
              </div>
              <div className="dropzone__copy">
                <h3 className="section-heading">Drop microscopy image here</h3>
                <p className="dropzone__hint">PNG, JPEG, or TIFF up to {maxMb} MB. Your files never leave this workstation.</p>
              </div>
              <div className="dropzone__actions">
                <button className="btn" type="button" id="image-browse" onClick={handleBrowse}>
                  Browse file
                </button>
                <button className="btn btn--ghost" type="button" id="image-reset" onClick={resetImagePreview}>
                  Reset sample
                </button>
              </div>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/tiff"
                className="visually-hidden"
                ref={fileInputRef}
                onChange={(event) => event.target.files && onFilesSelected(event.target.files)}
                required={!imageFile}
              />
            </div>
            <StatusMessage status={status.status} />
          </section>

          <section className="surface-muted">
            <h2 className="form-section__title">Pipeline selection</h2>
            <div className="input-grid">
              <div className="form-field">
                <label className="form-field__label" htmlFor="model">
                  Backend
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="The conventional pipeline exposes parameter controls. The ML proxy runs a pretrained lightweight model with fixed settings."
                    aria-label="Backend help"
                  >
                    ?
                  </button>
                </label>
                <select id="model" name="model" value={model} onChange={(event) => handleModelChange(event.target.value)}>
                  <option value="conventional">Conventional pipeline (parameterised)</option>
                  <option value="ml">ML proxy (auto)</option>
                </select>
              </div>
              <label className="form-field form-field--checkbox" htmlFor="crop-enabled">
                <span className="form-field__label">Crop bottom edge before segmentation</span>
                <div className="form-field__control">
                  <input
                    type="checkbox"
                    id="crop-enabled"
                    name="crop_enabled"
                    checked={cropEnabled}
                    onChange={(event) => setCropEnabled(event.target.checked)}
                    disabled={model === "ml"}
                  />
                  <span className="form-field__hint">Removes frame artefacts introduced by sample mounts.</span>
                </div>
              </label>
              <div className="form-field">
                <label className="form-field__label" htmlFor="crop-percent">
                  Crop percentage
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Percentage of pixels trimmed from the bottom prior to binarisation. Useful for removing rulers or labels."
                    aria-label="Crop percentage help"
                  >
                    ?
                  </button>
                </label>
                <input
                  type="number"
                  id="crop-percent"
                  name="crop_percent"
                  min="0"
                  max="95"
                  value={cropPercent}
                  onChange={(event) => setCropPercent(event.target.value)}
                  disabled={!cropEnabled || model === "ml"}
                />
                <p className="form-field__hint">Default 10%.</p>
              </div>
            </div>
          </section>

          <section className={`surface-muted hydride-parameters${model === "ml" ? " is-disabled" : ""}`}>
            <header className="hydride-parameters__header">
              <h2 className="form-section__title">Conventional parameters</h2>
              <span className="badge">Adjust when using conventional backend</span>
            </header>
            <div className="input-grid hydride-parameters__grid" role="group" aria-label="Segmentation parameters">
              <div className="form-field">
                <label className="form-field__label" htmlFor="clahe_clip_limit">
                  CLAHE clip limit
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Higher values increase contrast enhancement; lower values preserve smooth regions. Typical range 1.5–3.0."
                    aria-label="CLAHE clip limit help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="clahe_clip_limit" name="clahe_clip_limit" step="0.1" defaultValue={DEFAULTS.clahe_clip_limit} min="0.1" disabled={model === "ml"} />
                <p className="form-field__hint">Default 2.0</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="clahe_grid_x">
                  CLAHE tiles (X)
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Number of contextual regions along the X-axis used for adaptive equalisation."
                    aria-label="CLAHE tiles X help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="clahe_grid_x" name="clahe_grid_x" min="1" defaultValue={DEFAULTS.clahe_grid_x} disabled={model === "ml"} />
                <p className="form-field__hint">Default 8 tiles</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="clahe_grid_y">
                  CLAHE tiles (Y)
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Number of contextual regions along the Y-axis used for adaptive equalisation."
                    aria-label="CLAHE tiles Y help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="clahe_grid_y" name="clahe_grid_y" min="1" defaultValue={DEFAULTS.clahe_grid_y} disabled={model === "ml"} />
                <p className="form-field__hint">Default 8 tiles</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="adaptive_window">
                  Adaptive window
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Kernel size for adaptive thresholding. Larger windows smooth noise but may blur boundaries."
                    aria-label="Adaptive window help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="adaptive_window" name="adaptive_window" min="3" step="2" defaultValue={DEFAULTS.adaptive_window} disabled={model === "ml"} />
                <p className="form-field__hint">Default 13 pixels</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="adaptive_offset">
                  Adaptive C offset
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Constant subtracted from the adaptive threshold to control mask aggressiveness."
                    aria-label="Adaptive offset help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="adaptive_offset" name="adaptive_offset" defaultValue={DEFAULTS.adaptive_offset} disabled={model === "ml"} />
                <p className="form-field__hint">Default 40</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="morph_kernel_x">
                  Morphological kernel (X)
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Horizontal size of the closing kernel used to join nearby hydrides."
                    aria-label="Morphological kernel X help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="morph_kernel_x" name="morph_kernel_x" min="1" defaultValue={DEFAULTS.morph_kernel_x} disabled={model === "ml"} />
                <p className="form-field__hint">Default 5 px</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="morph_kernel_y">
                  Morphological kernel (Y)
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Vertical size of the closing kernel used to join nearby hydrides."
                    aria-label="Morphological kernel Y help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="morph_kernel_y" name="morph_kernel_y" min="1" defaultValue={DEFAULTS.morph_kernel_y} disabled={model === "ml"} />
                <p className="form-field__hint">Default 5 px</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="morph_iterations">
                  Morphological iterations
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Number of closing iterations to connect fragmented regions."
                    aria-label="Morphological iterations help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="morph_iterations" name="morph_iterations" min="0" defaultValue={DEFAULTS.morph_iterations} disabled={model === "ml"} />
                <p className="form-field__hint">Default 2</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="area_threshold">
                  Area threshold
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Minimum connected component area retained in the mask."
                    aria-label="Area threshold help"
                  >
                    ?
                  </button>
                </label>
                <input type="number" id="area_threshold" name="area_threshold" min="1" defaultValue={DEFAULTS.area_threshold} disabled={model === "ml"} />
                <p className="form-field__hint">Default 500 pixels</p>
              </div>
            </div>
          </section>

          <section className="surface-muted">
            <h2 className="form-section__title">Tone adjustments</h2>
            <div className="input-grid">
              <div className="form-field">
                <label className="form-field__label" htmlFor="brightness">Brightness</label>
                <input
                  type="range"
                  id="brightness"
                  name="brightness"
                  min="-50"
                  max="100"
                  value={brightness}
                  onChange={(event) => setBrightness(Number(event.target.value))}
                />
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="contrast">Contrast</label>
                <input
                  type="range"
                  id="contrast"
                  name="contrast"
                  min="50"
                  max="200"
                  value={contrast}
                  onChange={(event) => setContrast(Number(event.target.value))}
                />
              </div>
            </div>
          </section>

          <div className="form-actions">
            <button className="btn" type="submit">
              Run segmentation
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              id="reset-params"
              onClick={resetParameters}
            >
              Reset parameters
            </button>
            <button className="btn btn--ghost" type="button" id="clear-results" onClick={clearResults}>
              Clear results
            </button>
          </div>

          {currentResult && (
            <section className="surface-muted" id="results">
              <header className="hydride-results__header">
                <div>
                  <p className="tool-card__category">Segmentation results</p>
                  <h2 className="form-section__title">Analysis overview</h2>
                </div>
                <div className="hydride-history">
                  <button className="btn btn--ghost" type="button" id="history-back" onClick={goBack} disabled={!canGoBack}>
                    ← Prev
                  </button>
                  <button className="btn btn--ghost" type="button" id="history-forward" onClick={goForward} disabled={!canGoForward}>
                    Next →
                  </button>
                  <p id="history-status" className="form-field__hint">
                    {historyStatus}
                  </p>
                </div>
              </header>

              <div className="hydride-results__metrics">
                <p>
                  Hydride area fraction: <strong id="metric-area">{currentResult.metrics.mask_area_fraction.toFixed(4)}</strong>
                  <span id="metric-area-percent">({currentResult.metrics.mask_area_fraction_percent.toFixed(2)}%)</span>
                </p>
                <p>
                  Hydride count: <strong id="metric-count">{currentResult.metrics.hydride_count}</strong>
                </p>
              </div>

              <div className="hydride-results__grid">
                <figure>
                  <img id="input-image" src={`data:image/png;base64,${currentResult.images.input}`} alt="Input microscopy" />
                  <figcaption>Input</figcaption>
                </figure>
                <figure>
                  <img id="mask-image" src={`data:image/png;base64,${currentResult.images.mask}`} alt="Segmentation mask" />
                  <figcaption>Mask</figcaption>
                </figure>
                <figure>
                  <img id="overlay-image" src={`data:image/png;base64,${currentResult.images.overlay}`} alt="Overlay" />
                  <figcaption>Overlay</figcaption>
                </figure>
                <figure>
                  <img id="orientation-map" src={`data:image/png;base64,${currentResult.images.orientation}`} alt="Orientation map" />
                  <figcaption>Orientation</figcaption>
                </figure>
                <figure>
                  <img id="size-hist" src={`data:image/png;base64,${currentResult.images.sizeHistogram}`} alt="Size histogram" />
                  <figcaption>Size distribution</figcaption>
                </figure>
                <figure>
                  <img id="angle-hist" src={`data:image/png;base64,${currentResult.images.angleHistogram}`} alt="Angle histogram" />
                  <figcaption>Angle distribution</figcaption>
                </figure>
                <figure className="hydride-combined">
                  <img id="combined-panel" src={`data:image/png;base64,${currentResult.images.combined}`} alt="Combined analysis panel" />
                  <figcaption>Combined summary</figcaption>
                </figure>
              </div>

              <div className="downloads">
                <button className="btn btn--subtle" type="button" onClick={() => downloadImage("input-image", currentResult.images.input)}>
                  Download input
                </button>
                <button className="btn btn--subtle" type="button" onClick={() => downloadImage("mask", currentResult.images.mask)}>
                  Download mask
                </button>
                <button className="btn btn--subtle" type="button" onClick={() => downloadImage("overlay", currentResult.images.overlay)}>
                  Download overlay
                </button>
                <button className="btn btn--subtle" type="button" onClick={() => downloadImage("combined", currentResult.images.combined)}>
                  Download combined panel
                </button>
              </div>

              <section className="hydride-log">
                <h3 className="form-section__title">Pipeline log</h3>
                <ol id="run-log">
                  {currentResult.logs.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ol>
              </section>
            </section>
          )}
        </form>
      </div>
      <SettingsModal
        isOpen={settingsOpen}
        title="Hydride segmentation preferences"
        description="Tune default backend selection and preview adjustments."
        fields={settingsFields}
        values={preferences}
        onChange={(key, value) =>
          updateSetting(key as keyof HydridePreferences, value as HydridePreferences[keyof HydridePreferences])
        }
        onReset={() => resetSettings()}
        onClose={() => setSettingsOpen(false)}
      />
    </section>
  );
}
