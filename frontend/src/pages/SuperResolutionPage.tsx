import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import superResolutionIcon from "../assets/super_resolution_icon.svg";
import superResolutionSample from "../assets/super_resolution_sample.png";
import { Dropzone } from "../components/Dropzone";
import { StatusMessage } from "../components/StatusMessage";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { BeforeAfterSlider } from "../components/super_resolution/BeforeAfterSlider";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { downloadBlob } from "../utils/files";
import "../styles/super_resolution.css";

type SuperResolutionConfig = {
  max_upload_mb?: number;
  default_scale?: number;
  default_model?: string;
  models?: Record<string, { scale?: number }>;
  docs?: string;
};

type ModelOption = { id: string; label: string; scale: number };

const DEFAULT_MODELS: ModelOption[] = [
  { id: "RealESRGAN_x4plus", label: "Real-ESRGAN x4plus", scale: 4 },
  { id: "RealESRGAN_x2plus", label: "Real-ESRGAN x2plus", scale: 2 },
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ACCEPTED_EXTS = ["png", "jpg", "jpeg", "webp"];

function getFileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export default function SuperResolutionPage() {
  const pluginConfig = usePluginSettings<SuperResolutionConfig>("super_resolution", {});
  const helpHref = typeof pluginConfig.docs === "string" ? pluginConfig.docs : "/help/super_resolution";
  const maxMb = Number(pluginConfig.max_upload_mb ?? 20);
  const { withLoader } = useLoading();
  const status = useStatus({ message: "Drop an image to begin", level: "info" }, { context: "Super Resolution" });

  const modelOptions = useMemo<ModelOption[]>(() => {
    const models = pluginConfig.models || {};
    const entries = Object.entries(models)
      .map(([id, config]) => ({
        id,
        label: id.replace(/_/g, " "),
        scale: Number(config.scale ?? 4),
      }))
      .filter((entry) => entry.id);
    return entries.length ? entries : DEFAULT_MODELS;
  }, [pluginConfig.models]);

  const defaultModel = pluginConfig.default_model || modelOptions[0]?.id || DEFAULT_MODELS[0].id;
  const defaultScale = Number(pluginConfig.default_scale ?? modelOptions.find((item) => item.id === defaultModel)?.scale ?? 4);
  const scaleOptions = useMemo(() => {
    const values = new Set<number>();
    modelOptions.forEach((option) => values.add(option.scale));
    return Array.from(values).sort((a, b) => a - b);
  }, [modelOptions]);

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedScale, setSelectedScale] = useState(defaultScale);
  const [outputFormat, setOutputFormat] = useState<"png" | "jpg">("png");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [resultDimensions, setResultDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    setSelectedScale(defaultScale);
  }, [defaultScale]);

  useEffect(() => {
    const model = modelOptions.find((option) => option.id === selectedModel);
    if (model && model.scale !== selectedScale) {
      setSelectedScale(model.scale);
    }
  }, [modelOptions, selectedModel, selectedScale]);

  useEffect(() => {
    const match = modelOptions.find((option) => option.scale === selectedScale);
    if (match && match.id !== selectedModel) {
      setSelectedModel(match.id);
    }
  }, [modelOptions, selectedModel, selectedScale]);

  useEffect(() => {
    if (!imageFile) {
      setSourceUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!resultBlob) {
      setResultUrl(null);
      return;
    }
    const url = URL.createObjectURL(resultBlob);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultBlob]);

  useEffect(() => {
    if (!sourceUrl) {
      setAspectRatio(null);
      setSourceDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setAspectRatio(img.width / img.height);
      setSourceDimensions({ width: img.width, height: img.height });
    };
    img.src = sourceUrl;
    return () => {
      img.onload = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!resultUrl) {
      setResultDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setResultDimensions({ width: img.width, height: img.height });
    };
    img.src = resultUrl;
    return () => {
      img.onload = null;
    };
  }, [resultUrl]);

  const handleFile = useCallback(
    (file: File) => {
      const extension = getFileExtension(file.name);
      if (file.size > maxMb * 1024 * 1024) {
        status.setStatus(`File exceeds ${maxMb} MB limit.`, "error");
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTS.includes(extension)) {
        status.setStatus("Unsupported format. Use PNG, JPG, or WEBP.", "error");
        return;
      }
      setImageFile(file);
      setResultBlob(null);
      setResultDimensions(null);
      setSliderPosition(50);
      status.setStatus(`Loaded ${file.name}`, "success");
    },
    [maxMb, status],
  );

  const handleDrop = useCallback(
    (files: FileList) => {
      if (files.length) {
        handleFile(files[0]);
      }
    },
    [handleFile],
  );

  const handlePicker = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    event.target.value = "";
  }, [handleFile]);

  const handleSample = useCallback(async () => {
    try {
      const response = await fetch(superResolutionSample);
      if (!response.ok) {
        throw new Error("Unable to load sample image");
      }
      const blob = await response.blob();
      const file = new File([blob], "super_resolution_sample.png", {
        type: blob.type || "image/png",
      });
      handleFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load sample image";
      status.setStatus(message, "error");
    }
  }, [handleFile, status]);

  const runUpscale = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!imageFile) {
        status.setStatus("Upload an image to upscale.", "error");
        return;
      }
      status.setStatus("Upscaling image...", "progress");
      const form = new FormData();
      form.append("image", imageFile, imageFile.name);
      form.append("scale", String(selectedScale));
      form.append("model", selectedModel);
      form.append("output_format", outputFormat);

      try {
        const response = await withLoader(() =>
          fetch("/api/v1/super_resolution/predict", {
            method: "POST",
            body: form,
          }),
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.error?.message || "Upscaling failed.";
          throw new Error(message);
        }
        const blob = await response.blob();
        setResultBlob(blob);
        status.setStatus("Upscale complete. Compare the result below.", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upscaling failed.";
        status.setStatus(message, "error");
      }
    },
    [imageFile, outputFormat, selectedModel, selectedScale, status, withLoader],
  );

  const resetWorkspace = useCallback(() => {
    setImageFile(null);
    setResultBlob(null);
    setResultDimensions(null);
    setSliderPosition(50);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    status.setStatus("Workspace cleared.", "info");
  }, [status]);

  const downloadResult = useCallback(() => {
    if (!resultBlob) {
      status.setStatus("Run an upscale before downloading.", "error");
      return;
    }
    downloadBlob(resultBlob, `upscaled.${outputFormat}`);
    status.setStatus("Download started.", "success");
  }, [outputFormat, resultBlob, status]);

  const filePicker = (
    <>
      <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
        Select image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={handlePicker}
        hidden
      />
    </>
  );

  const infoLines = [
    `Max upload: ${maxMb} MB`,
    sourceDimensions ? `Original: ${sourceDimensions.width}x${sourceDimensions.height}` : null,
    resultDimensions ? `Upscaled: ${resultDimensions.width}x${resultDimensions.height}` : null,
  ].filter(Boolean);

  return (
    <section className="shell surface-block superres-shell" aria-labelledby="super-resolution-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={superResolutionIcon}
            titleId="super-resolution-title"
            category="Image Enhancement"
            title="Super-resolution workspace"
            summary="Upscale microscopy and lab imagery with Real-ESRGAN, then inspect improvements with a precision before/after slider."
            bullets={[
              "Drag-and-drop input with strict size and format validation",
              "2x or 4x enhancement using local Real-ESRGAN weights",
              "Interactive before/after comparison with keyboard control",
              "Download ready-to-use PNG or JPG outputs",
            ]}
            actions={
              <a className="btn btn--subtle" data-keep-theme href={helpHref}>
                Read the super-resolution guide
              </a>
            }
            footer={<StatusMessage status={status.status} />}
          />
        }
        workspace={
          <div className="tool-shell__workspace superres-workspace">
            <form className="superres-panel" onSubmit={runUpscale}>
              <Dropzone
                hasFile={Boolean(imageFile)}
                onDropFiles={handleDrop}
                preview={sourceUrl ? <img src={sourceUrl} alt="" /> : undefined}
                copy={
                  <>
                    <p className="dropzone__title">Drop a PNG, JPG, or WEBP</p>
                    <p className="dropzone__subtitle">Up to {maxMb} MB. Files stay in memory and never touch disk.</p>
                  </>
                }
                actions={<div className="superres-actions">{filePicker}</div>}
              />
              <div className="superres-sample surface-muted" aria-label="Sample image">
                <img src={superResolutionSample} alt="Sample microscopy scene" />
                <div>
                  <p className="superres-sample__title">Want to try super-resolution on a sample image?</p>
                  <p className="superres-sample__hint">
                    Use the built-in sample to preview the workflow before uploading your own data.
                  </p>
                  <button className="btn btn--ghost" type="button" onClick={handleSample}>
                    Use sample image
                  </button>
                </div>
              </div>
              <div className="superres-controls">
                <label className="form-field">
                  <span className="form-field__label">Scale</span>
                  <select
                    value={selectedScale}
                    onChange={(event) => setSelectedScale(Number(event.target.value))}
                  >
                    {scaleOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}x
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-field__label">Model</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                  >
                    {modelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} ({option.scale}x)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-field__label">Output format</span>
                  <select
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as "png" | "jpg")}
                  >
                    <option value="png">PNG (lossless)</option>
                    <option value="jpg">JPG (compressed)</option>
                  </select>
                </label>
              </div>
              <div className="superres-meta">
                {infoLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
              <div className="superres-actions">
                <button className="btn" type="submit" disabled={!imageFile}>
                  Run upscale
                </button>
                <button className="btn btn--ghost" type="button" onClick={downloadResult} disabled={!resultBlob}>
                  Download
                </button>
                <button className="btn btn--subtle" type="button" onClick={resetWorkspace}>
                  Reset
                </button>
              </div>
            </form>
            <div className="superres-preview" aria-live="polite">
              <div className="superres-preview__header">
                <div>
                  <h2 className="superres-preview__title">Comparison viewer</h2>
                  <p className="superres-preview__caption">Drag the divider or use arrow keys to compare.</p>
                </div>
                <div className="superres-actions">
                  <button className="btn btn--ghost" type="button" onClick={() => setSliderPosition(50)}>
                    Center divider
                  </button>
                </div>
              </div>
              {sourceUrl && resultUrl ? (
                <BeforeAfterSlider
                  beforeSrc={sourceUrl}
                  afterSrc={resultUrl}
                  position={sliderPosition}
                  onPositionChange={setSliderPosition}
                  aspectRatio={aspectRatio}
                />
              ) : (
                <div className="superres-placeholder">
                  <p>
                    <strong>Upload an image, run the upscale, then compare.</strong>
                  </p>
                  <p>The slider appears once the enhanced output is ready.</p>
                </div>
              )}
            </div>
          </div>
        }
      />
    </section>
  );
}
