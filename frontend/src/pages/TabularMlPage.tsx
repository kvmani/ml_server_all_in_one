import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChartPanel } from "../components/ChartPanel";
import { SettingsModal, type SettingsField } from "../components/SettingsModal";
import { StatusMessage } from "../components/StatusMessage";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { useToolSettings } from "../hooks/useToolSettings";
import { apiFetch } from "../utils/api";
import { base64ToBlob, downloadBlob } from "../utils/files";
import "../styles/tabular_ml.css";

type DatasetColumn = {
  name: string;
  dtype: string;
  missing: number;
  is_numeric: boolean;
};

type DatasetProfile = {
  dataset_id: string;
  columns: DatasetColumn[];
  preview: Array<Record<string, unknown>>;
  shape: [number, number];
  stats: Record<string, { mean: number; std: number; min: number; max: number }>;
  numeric_columns: string[];
};

type ScatterResponse = {
  x: number[];
  y: number[];
  color?: (number | string)[];
  color_mode?: "numeric" | "category";
  color_label?: string;
  x_label: string;
  y_label: string;
};

type HistogramResponse = {
  column: string;
  bins: number;
  density: boolean;
  edges: number[];
  centres: number[];
  counts: number[];
};

type TrainingResult = {
  task: string;
  algorithm: string;
  algorithm_label: string;
  metrics: Record<string, number>;
  feature_importance: Record<string, number>;
  columns: string[];
  preview: Array<Record<string, unknown>>;
  rows: number;
  feature_columns: string[];
  target: string;
};

type InferenceResult = {
  prediction: unknown;
  task: string;
  target: string;
  probabilities?: Record<string, number>;
};

type BatchPreview = {
  columns: string[];
  preview: Array<Record<string, unknown>>;
  rows: number;
};

type FilePayload = {
  filename: string;
  content_base64: string;
  size_bytes: number;
};

type PredictionsPayload = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

type TabularPluginConfig = {
  upload?: { max_mb?: number; max_files?: number };
  docs?: string;
};

type TabularPreferences = {
  scatterMaxPoints: number;
  histogramBins: number;
  defaultAlgorithm: "auto" | "linear_model" | "random_forest" | "gradient_boosting";
};

const DATASET_CONTEXT = "Tabular ML · Dataset";
const SCATTER_CONTEXT = "Tabular ML · Scatter";
const HISTOGRAM_CONTEXT = "Tabular ML · Histogram";
const TRAIN_CONTEXT = "Tabular ML · Training";
const INFERENCE_CONTEXT = "Tabular ML · Inference";
const BATCH_CONTEXT = "Tabular ML · Batch";

function parseUploadLimit(
  raw: TabularPluginConfig["upload"],
  defaults: { maxMb: number; maxFiles: number },
) {
  return {
    maxMb: Math.max(1, Number(raw?.max_mb) || defaults.maxMb),
    maxFiles: Math.max(1, Number(raw?.max_files) || defaults.maxFiles),
  };
}

function renderTable(rows: Array<Record<string, unknown>>, columns: string[], className?: string) {
  if (!rows.length || !columns.length) {
    return <p className="form-field__hint">No rows available.</p>;
  }
  return (
    <table className={className}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column}>{String(row[column] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TabularMlPage() {
  const pluginConfig = usePluginSettings<TabularPluginConfig>("tabular_ml", {});
  const uploadLimit = useMemo(
    () => parseUploadLimit(pluginConfig.upload, { maxMb: 2, maxFiles: 1 }),
    [pluginConfig.upload],
  );
  const helpHref = typeof pluginConfig.docs === "string" ? pluginConfig.docs : "/help/tabular_ml";

  const { withLoader } = useLoading();
  const { settings: preferences, updateSetting, resetSettings } = useToolSettings<TabularPreferences>(
    "tabular_ml",
    {
      scatterMaxPoints: 400,
      histogramBins: 30,
      defaultAlgorithm: "auto",
    },
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const datasetMessage = `Drop a CSV to begin (≤ ${uploadLimit.maxMb} MB).`;
  const datasetStatus = useStatus({ message: datasetMessage, level: "info" }, { context: DATASET_CONTEXT });
  const scatterStatus = useStatus(
    { message: "Select axes to render scatter", level: "info" },
    { context: SCATTER_CONTEXT },
  );
  const histogramStatus = useStatus(
    { message: "Select a numeric column to render histogram", level: "info" },
    { context: HISTOGRAM_CONTEXT },
  );
  const trainStatus = useStatus(
    { message: "Train a model to unlock predictions", level: "info" },
    { context: TRAIN_CONTEXT },
  );
  const inferenceStatus = useStatus(
    { message: "Train a model to enable inference", level: "info" },
    { context: INFERENCE_CONTEXT },
  );
  const batchStatus = useStatus(
    { message: "Upload a CSV after training to run batch predictions", level: "info" },
    { context: BATCH_CONTEXT },
  );

  const datasetInputRef = useRef<HTMLInputElement | null>(null);
  const scatterColorRef = useRef<HTMLSelectElement | null>(null);
  const batchFileRef = useRef<HTMLInputElement | null>(null);

  const [datasetName, setDatasetName] = useState<string>("");
  const [dataset, setDataset] = useState<DatasetProfile | null>(null);
  const [datasetId, setDatasetId] = useState<string>("");
  const [scatterData, setScatterData] = useState<ScatterResponse | null>(null);
  const [histogramData, setHistogramData] = useState<HistogramResponse | null>(null);
  const [trainResult, setTrainResult] = useState<TrainingResult | null>(null);
  const [algorithm, setAlgorithm] = useState<string>(preferences.defaultAlgorithm);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [selectedHistogramColumn, setSelectedHistogramColumn] = useState<string>("");

  useEffect(() => {
    setAlgorithm((current) =>
      current === preferences.defaultAlgorithm ? current : preferences.defaultAlgorithm,
    );
  }, [preferences.defaultAlgorithm]);

  useEffect(() => {
    if (!dataset) {
      setSelectedHistogramColumn("");
      return;
    }
    const firstNumeric = dataset.numeric_columns[0] ?? "";
    setSelectedHistogramColumn((prev) => (prev && dataset.numeric_columns.includes(prev) ? prev : firstNumeric));
  }, [dataset]);

  const numericColumns = dataset?.numeric_columns ?? [];
  const columnNames = useMemo(() => (dataset ? dataset.columns.map((column) => column.name) : []), [dataset]);

  const scatterChartData = useMemo(() => {
    if (!scatterData) {
      return null;
    }
    const meta: Record<string, unknown> = {
      chartType: "scatter",
      x_label: scatterData.x_label,
      y_label: scatterData.y_label,
    };
    if (scatterData.color_label) {
      meta.color_label = scatterData.color_label;
      meta.color_mode = scatterData.color_mode;
    }
    return {
      x: scatterData.x,
      y: scatterData.y,
      labels: scatterData.color?.map((value) => String(value)),
      meta,
    };
  }, [scatterData]);

  const histogramChartData = useMemo(() => {
    if (!histogramData) {
      return null;
    }
    return {
      x: histogramData.centres,
      y: histogramData.counts,
      meta: {
        chartType: "bar",
        column: histogramData.column,
        bins: histogramData.bins,
        density: histogramData.density ? "density" : "count",
        range: histogramData.edges.length >= 2
          ? [histogramData.edges[0], histogramData.edges[histogramData.edges.length - 1]]
          : undefined,
      },
    };
  }, [histogramData]);

  const settingsFields = useMemo<SettingsField[]>(
    () => [
      {
        key: "scatterMaxPoints",
        label: "Scatter sample size",
        type: "number",
        min: 50,
        max: 5000,
        step: 50,
        description: "Maximum number of points sampled for scatter plots.",
      },
      {
        key: "histogramBins",
        label: "Histogram bins",
        type: "number",
        min: 5,
        max: 200,
        step: 5,
        description: "Number of buckets when computing histograms.",
      },
      {
        key: "defaultAlgorithm",
        label: "Default algorithm",
        type: "select",
        options: [
          { value: "auto", label: "Automatic (recommended)" },
          { value: "linear_model", label: "Generalised linear model" },
          { value: "random_forest", label: "Random forest ensemble" },
          { value: "gradient_boosting", label: "Gradient boosting ensemble" },
        ],
        description: "Estimator pre-selected when training begins.",
      },
    ],
    [],
  );

  const handleDatasetFiles = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (!list.length) {
      return;
    }
    const [file] = list;
    if (!file.type.includes("csv") && !file.name.toLowerCase().endsWith(".csv")) {
      datasetStatus.setStatus("Only CSV files are supported", "error");
      return;
    }
    if (file.size > uploadLimit.maxMb * 1024 * 1024) {
      datasetStatus.setStatus(`File exceeds ${uploadLimit.maxMb} MB limit`, "error");
      return;
    }
    setDatasetName(`Selected: ${file.name}`);
    datasetStatus.setStatus(`${file.name} ready to upload`, "info");
  };

  const resetWorkspace = (message = "Dataset removed") => {
    setDataset(null);
    setDatasetId("");
    setScatterData(null);
    setHistogramData(null);
    setTrainResult(null);
    setInferenceResult(null);
    setBatchPreview(null);
    setDatasetName("");
    datasetStatus.setStatus(message, "info");
    scatterStatus.setStatus("Select axes to render scatter", "info");
    histogramStatus.setStatus("Select a numeric column to render histogram", "info");
    trainStatus.setStatus("Train a model to unlock predictions", "info");
    inferenceStatus.setStatus("Train a model to enable inference", "info");
    batchStatus.setStatus("Upload a CSV after training to run batch predictions", "info");
    setAlgorithm(preferences.defaultAlgorithm);
  };

  const submitDataset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = datasetInputRef.current;
    if (!input?.files?.length) {
      datasetStatus.setStatus("Select a CSV dataset", "error");
      return;
    }
    const form = new FormData();
    form.append("dataset", input.files[0], input.files[0].name);
    datasetStatus.setStatus("Uploading dataset…", "progress");
    try {
      const profile = await withLoader(() =>
        apiFetch<DatasetProfile>("/api/tabular_ml/datasets", {
          method: "POST",
          body: form,
        }),
      );
      setDataset(profile);
      setDatasetId(profile.dataset_id);
      setScatterData(null);
      setHistogramData(null);
      setTrainResult(null);
      setInferenceResult(null);
      setBatchPreview(null);
      scatterStatus.setStatus("Select axes to render scatter", "info");
      histogramStatus.setStatus("Select a numeric column to render histogram", "info");
      trainStatus.setStatus("Train a model to unlock predictions", "info");
      inferenceStatus.setStatus("Train a model to enable inference", "info");
      batchStatus.setStatus("Upload a CSV after training to run batch predictions", "info");
      datasetStatus.setStatus("Dataset ready", "success");
    } catch (error) {
      datasetStatus.setStatus(
        error instanceof Error ? error.message : "Dataset upload failed",
        "error",
      );
    }
  };

  const clearDataset = async () => {
    if (!datasetId) {
      resetWorkspace("Workspace reset");
      if (datasetInputRef.current) {
        datasetInputRef.current.value = "";
      }
      return;
    }
    try {
      await withLoader(() =>
        apiFetch<{ status: string }>(`/api/tabular_ml/datasets/${datasetId}`, {
          method: "DELETE",
        }),
      );
    } catch (error) {
      // Ignore offline failures when tearing down datasets
    } finally {
      if (datasetInputRef.current) {
        datasetInputRef.current.value = "";
      }
      resetWorkspace("Dataset removed");
    }
  };

  const submitScatter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId) {
      scatterStatus.setStatus("Load a dataset first", "error");
      return;
    }
    const form = event.currentTarget as typeof event.currentTarget & {
      x: HTMLSelectElement;
      y: HTMLSelectElement;
    };
    const x = form.x.value;
    const y = form.y.value;
    if (!x || !y) {
      scatterStatus.setStatus("Select X and Y columns", "error");
      return;
    }
    const payload: Record<string, string | number> = {
      x,
      y,
      max_points: preferences.scatterMaxPoints,
    };
    const colorValue = scatterColorRef.current?.value;
    if (colorValue) {
      payload.color = colorValue;
    }
    scatterStatus.setStatus("Generating scatter…", "progress");
    try {
      const data = await withLoader(() =>
        apiFetch<ScatterResponse>(`/api/tabular_ml/datasets/${datasetId}/scatter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setScatterData(data);
      scatterStatus.setStatus("Scatter updated", "success");
    } catch (error) {
      scatterStatus.setStatus(
        error instanceof Error ? error.message : "Failed to build scatter plot",
        "error",
      );
    }
  };

  const resetScatter = () => {
    setScatterData(null);
    scatterStatus.setStatus("Ready", "info");
  };

  const submitHistogram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId) {
      histogramStatus.setStatus("Load a dataset first", "error");
      return;
    }
    if (!selectedHistogramColumn) {
      histogramStatus.setStatus("Select a numeric column", "error");
      return;
    }
    histogramStatus.setStatus("Computing histogram…", "progress");
    try {
      const data = await withLoader(() =>
        apiFetch<HistogramResponse>(`/api/tabular_ml/datasets/${datasetId}/histogram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column: selectedHistogramColumn, bins: preferences.histogramBins }),
        }),
      );
      setHistogramData(data);
      histogramStatus.setStatus("Histogram ready", "success");
    } catch (error) {
      histogramStatus.setStatus(
        error instanceof Error ? error.message : "Failed to compute histogram",
        "error",
      );
    }
  };

  const resetHistogram = () => {
    setHistogramData(null);
    histogramStatus.setStatus("Ready", "info");
  };

  const submitTraining = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId) {
      trainStatus.setStatus("Load a dataset before training", "error");
      return;
    }
    const form = event.currentTarget as typeof event.currentTarget & {
      target: HTMLInputElement;
    };
    const target = form.target.value.trim();
    if (!target) {
      trainStatus.setStatus("Provide a target column", "error");
      return;
    }
    trainStatus.setStatus("Training model…", "progress");
    try {
      const result = await withLoader(() =>
        apiFetch<TrainingResult>(`/api/tabular_ml/datasets/${datasetId}/train`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, algorithm }),
        }),
      );
      setTrainResult(result);
      inferenceStatus.setStatus("Model ready for inference", "success");
      batchStatus.setStatus("Upload a CSV after training to run batch predictions", "info");
      trainStatus.setStatus("Training complete", "success");
    } catch (error) {
      trainStatus.setStatus(error instanceof Error ? error.message : "Training failed", "error");
    }
  };

  const downloadPredictions = async (format: "csv" | "json") => {
    if (!datasetId) {
      trainStatus.setStatus("Load a dataset before exporting", "error");
      return;
    }
    try {
      if (format === "csv") {
        const file = await withLoader(() =>
          apiFetch<FilePayload>(`/api/tabular_ml/datasets/${datasetId}/predictions?format=csv`),
        );
        const blob = base64ToBlob(file.content_base64, "text/csv");
        downloadBlob(blob, file.filename || `${datasetId.slice(0, 8)}_predictions.csv`);
      } else {
        const payload = await withLoader(() =>
          apiFetch<PredictionsPayload>(`/api/tabular_ml/datasets/${datasetId}/predictions`),
        );
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        downloadBlob(blob, `${datasetId.slice(0, 8)}_predictions.json`);
      }
      trainStatus.setStatus("Predictions exported", "success");
    } catch (error) {
      trainStatus.setStatus(error instanceof Error ? error.message : "Export failed", "error");
    }
  };

  const submitInference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId || !trainResult) {
      inferenceStatus.setStatus("Load data and train a model first", "error");
      return;
    }
    const form = event.currentTarget;
    const features: Record<string, number> = {};
    for (const column of trainResult.feature_columns) {
      const input = form.querySelector<HTMLInputElement>(`[name="${column}"]`);
      if (!input) {
        continue;
      }
      const value = input.value.trim();
      if (!value) {
        inferenceStatus.setStatus(`Provide a value for ${column}`, "error");
        return;
      }
      features[column] = Number(value);
    }
    inferenceStatus.setStatus("Running inference…", "progress");
    try {
      const result = await withLoader(() =>
        apiFetch<InferenceResult>(`/api/tabular_ml/datasets/${datasetId}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features }),
        }),
      );
      setInferenceResult(result);
      inferenceStatus.setStatus("Inference complete", "success");
    } catch (error) {
      inferenceStatus.setStatus(error instanceof Error ? error.message : "Inference failed", "error");
    }
  };

  const submitBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId || !trainResult) {
      batchStatus.setStatus("Train a model before running batch predictions", "error");
      return;
    }
    const input = batchFileRef.current;
    if (!input?.files?.length) {
      batchStatus.setStatus("Select a batch CSV", "error");
      return;
    }
    const form = new FormData();
    form.append("dataset", input.files[0], input.files[0].name);
    batchStatus.setStatus("Running batch predictions…", "progress");
    try {
      const preview = await withLoader(() =>
        apiFetch<BatchPreview>(`/api/tabular_ml/datasets/${datasetId}/predict/batch`, {
          method: "POST",
          body: form,
        }),
      );
      setBatchPreview(preview);
      batchStatus.setStatus("Batch predictions ready", "success");
    } catch (error) {
      batchStatus.setStatus(
        error instanceof Error ? error.message : "Batch prediction failed",
        "error",
      );
    }
  };

  const downloadBatchCsv = async () => {
    if (!datasetId) {
      batchStatus.setStatus("No dataset loaded", "error");
      return;
    }
    try {
      const file = await withLoader(() =>
        apiFetch<FilePayload>(`/api/tabular_ml/datasets/${datasetId}/predict/batch?format=csv`),
      );
      const blob = base64ToBlob(file.content_base64, "text/csv");
      downloadBlob(blob, file.filename || `${datasetId.slice(0, 8)}_batch_predictions.csv`);
      batchStatus.setStatus("Batch predictions downloaded", "success");
    } catch (error) {
      batchStatus.setStatus(error instanceof Error ? error.message : "Download failed", "error");
    }
  };

  const inferenceFields = trainResult?.feature_columns ?? [];

  return (
    <section className="shell surface-block tabular-shell" aria-labelledby="tabular-ml-title">
      <div className="tool-shell__layout">
        <aside className="tool-shell__intro">
          <div className="tool-shell__icon" aria-hidden="true">
            <img src="/tabular_ml/static/img/tabular_icon.svg" alt="" />
          </div>
          <p className="tool-card__category">Machine Learning</p>
          <h1 id="tabular-ml-title" className="section-heading">
            Tabular ML sandbox
          </h1>
          <p>
            Load CSV datasets entirely in memory, preview records, render interactive charts, and train lightweight models.
            All computations stay in this offline browser session.
          </p>
          <ul>
            <li>Column statistics with quick scatter and histogram visualisations</li>
            <li>Automatic task detection with exportable prediction previews</li>
            <li>Single-row inference plus batch CSV predictions</li>
          </ul>
          <div className="tool-shell__actions">
            <button className="btn btn--ghost" type="button" onClick={() => setSettingsOpen(true)}>
              ⚙️ Settings
            </button>
            <a className="btn btn--subtle" data-keep-theme href={helpHref}>
              Read ML guide
            </a>
          </div>
        </aside>

        <div className="tool-shell__workspace">
          <form id="dataset-form" className="surface-muted form-grid" onSubmit={submitDataset}>
            <div
              className={`dropzone${datasetName ? " has-file" : ""}`}
              id="dataset-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer?.files) {
                  handleDatasetFiles(event.dataTransfer.files);
                  if (datasetInputRef.current) {
                    datasetInputRef.current.files = event.dataTransfer.files;
                  }
                }
              }}
            >
              <div className="dropzone__copy">
                <h2 className="section-heading">Load CSV dataset</h2>
                <p className="dropzone__hint">
                  Data remains in this session. Max size {uploadLimit.maxMb} MB. Ensure the first row contains column headers.
                </p>
                <p className="dropzone__hint" id="dataset-name" aria-live="polite">
                  {datasetName}
                </p>
              </div>
              <div className="dropzone__actions">
                <button className="btn" type="button" id="dataset-browse" onClick={() => datasetInputRef.current?.click()}>
                  Browse CSV
                </button>
              </div>
              <input
                id="dataset"
                name="dataset"
                ref={datasetInputRef}
                type="file"
                accept="text/csv,application/vnd.ms-excel"
                className="visually-hidden"
                required
                onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && handleDatasetFiles(event.target.files)}
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                Load dataset
              </button>
              <button
                className="btn btn--ghost"
                type="reset"
                id="dataset-reset"
                onClick={(event) => {
                  event.preventDefault();
                  clearDataset();
                }}
              >
                Reset
              </button>
            </div>
            <StatusMessage status={datasetStatus.status} />
          </form>

          {dataset ? (
            <section id="dataset-overview" className="surface-muted tabular-overview" aria-live="polite">
              <header className="tabular-overview__header">
                <div>
                  <p className="tool-card__category">Dataset preview</p>
                  <h2 className="form-section__title" id="dataset-title">
                    {dataset.shape[0]} rows × {dataset.shape[1]} columns
                  </h2>
                </div>
                <div className="tabular-results__actions">
                  <button className="btn btn--ghost" type="button" onClick={() => clearDataset()}>
                    Remove dataset
                  </button>
                </div>
              </header>
              <div className="tabular-overview__grid">
                <div className="preview-table" role="region" aria-live="polite" aria-label="Dataset preview">
                  {renderTable(dataset.preview, columnNames, "preview-table__table")}
                </div>
                <div className="tabular-columns" aria-label="Column summary">
                  {dataset.columns.map((column) => (
                    <div className="tabular-columns__item" key={column.name}>
                      <div className="tabular-columns__name">
                        <span>{column.name}</span>
                        <span className="tabular-columns__dtype">{column.dtype}</span>
                      </div>
                      <p className="tabular-columns__meta">
                        {column.is_numeric ? "Numeric" : "Categorical"} · Missing values: {column.missing}
                      </p>
                      {dataset.stats[column.name] ? (
                        <dl className="tabular-columns__stats">
                          <dt>Min</dt>
                          <dd>{dataset.stats[column.name].min.toFixed(3)}</dd>
                          <dt>Max</dt>
                          <dd>{dataset.stats[column.name].max.toFixed(3)}</dd>
                          <dt>Mean</dt>
                          <dd>{dataset.stats[column.name].mean.toFixed(3)}</dd>
                          <dt>Std</dt>
                          <dd>{dataset.stats[column.name].std.toFixed(3)}</dd>
                        </dl>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {dataset ? (
            <section className="surface-muted tabular-visuals" aria-label="Visual analysis">
              <div className="tabular-visuals__grid">
                <div>
                  <h3 className="form-section__title">Scatter plot</h3>
                  <form id="scatter-form" className="form-grid" onSubmit={submitScatter}>
                    <div className="input-grid">
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-x">
                          X axis
                        </label>
                        <select id="scatter-x" name="x" required defaultValue="">
                          <option value="" disabled>
                            Select column
                          </option>
                          {numericColumns.map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-y">
                          Y axis
                        </label>
                        <select id="scatter-y" name="y" required defaultValue="">
                          <option value="" disabled>
                            Select column
                          </option>
                          {numericColumns.map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-color">
                          Colour (optional)
                        </label>
                        <select id="scatter-color" name="color" ref={scatterColorRef} defaultValue="">
                          <option value="">No colour</option>
                          {columnNames.map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                          ))}
                        </select>
                        <p className="form-field__hint">
                          Up to {preferences.scatterMaxPoints} points sampled per request.
                        </p>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn" type="submit">
                        Render scatter
                      </button>
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={() => resetScatter()}
                        disabled={!scatterData}
                      >
                        Reset
                      </button>
                    </div>
                    <StatusMessage status={scatterStatus.status} />
                  </form>
                  <ChartPanel
                    title="Scatter preview"
                    description={scatterData?.color_label ? `Colour: ${scatterData.color_label}` : undefined}
                    data={scatterChartData}
                  />
                </div>

                <div>
                  <h3 className="form-section__title">Histogram</h3>
                  <form id="histogram-form" className="form-grid" onSubmit={submitHistogram}>
                    <div className="form-field">
                      <label className="form-field__label" htmlFor="histogram-column">
                        Column
                      </label>
                      <select
                        id="histogram-column"
                        name="column"
                        value={selectedHistogramColumn}
                        onChange={(event) => setSelectedHistogramColumn(event.target.value)}
                        required
                      >
                        <option value="" disabled>
                          Select numeric column
                        </option>
                        {numericColumns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-actions">
                      <button className="btn" type="submit" disabled={!selectedHistogramColumn}>
                        Render histogram
                      </button>
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={() => resetHistogram()}
                        disabled={!histogramData}
                      >
                        Reset
                      </button>
                    </div>
                    <StatusMessage status={histogramStatus.status} />
                  </form>
                  <ChartPanel
                    title="Histogram preview"
                    description={histogramData ? `Bins: ${histogramData.bins}` : undefined}
                    data={histogramChartData}
                    variant="bar"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {dataset ? (
            <section className="surface-muted tabular-results" aria-label="Model training">
              <header className="tabular-results__header">
                <div>
                  <p className="tool-card__category">Model training</p>
                  <h3 className="form-section__title">Train model</h3>
                </div>
              </header>
              <form id="train-form" className="form-grid" onSubmit={submitTraining}>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="target">
                    Target column
                  </label>
                  <input id="target" name="target" placeholder="e.g. hardness" required />
                  <p className="form-field__hint">Matches the header name in the CSV file.</p>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="algorithm">
                    Algorithm
                  </label>
                  <select
                    id="algorithm"
                    name="algorithm"
                    value={algorithm}
                    onChange={(event) => setAlgorithm(event.target.value)}
                  >
                    <option value="auto">Automatic (recommended)</option>
                    <option value="linear_model">Generalised linear model</option>
                    <option value="random_forest">Random forest ensemble</option>
                    <option value="gradient_boosting">Gradient boosting ensemble</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit">
                    Train model
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="reset"
                    onClick={(event) => {
                      event.preventDefault();
                      setTrainResult(null);
                      setInferenceResult(null);
                      trainStatus.setStatus("Ready", "info");
                      inferenceStatus.setStatus("Ready", "info");
                    }}
                  >
                    Reset
                  </button>
                </div>
                <StatusMessage status={trainStatus.status} />
              </form>

              {trainResult ? (
                <section id="train-results" className="tabular-results__grid" aria-live="polite">
                  <div>
                    <h4 className="form-section__title">Performance summary</h4>
                    <div className="tabular-results__badges">
                      <p className="badge">{trainResult.task}</p>
                      <p className="badge badge--muted">{trainResult.algorithm_label}</p>
                    </div>
                  </div>
                  <div>
                    <h5 className="form-section__title">Metrics</h5>
                    <dl className="tabular-metrics">
                      {Object.entries(trainResult.metrics).map(([key, value]) => (
                        <Fragment key={key}>
                          <dt>{key}</dt>
                          <dd>{Number.isFinite(value) ? value.toFixed(4) : String(value)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <h5 className="form-section__title">Top features</h5>
                    <ul className="tabular-importance list-reset">
                      {Object.entries(trainResult.feature_importance)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([key, value]) => (
                          <li key={key}>
                            <strong>{key}</strong>: {value.toFixed(4)}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="form-section__title">Prediction preview</h5>
                    <div className="prediction-preview" role="region" aria-live="polite">
                      {renderTable(trainResult.preview, trainResult.columns, "tabular-predictions")}
                    </div>
                    <div className="tabular-results__actions">
                      <button
                        className="btn btn--subtle"
                        type="button"
                        onClick={() => downloadPredictions("csv")}
                      >
                        Download CSV
                      </button>
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={() => downloadPredictions("json")}
                      >
                        Download JSON
                      </button>
                    </div>
                  </div>
                  <div>
                    <h5 className="form-section__title">Run inference</h5>
                    <p className="form-field__hint">Use the trained model to predict new rows.</p>
                    <section className="tabular-inference" aria-label="Single-row inference">
                      <form id="inference-form" className="form-grid" onSubmit={submitInference}>
                        <div className="input-grid">
                          {inferenceFields.map((field) => (
                            <div className="form-field" key={field}>
                              <label className="form-field__label" htmlFor={`inference-${field}`}>
                                {field}
                              </label>
                              <input
                                id={`inference-${field}`}
                                name={field}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                required
                                placeholder="Enter value"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="form-actions">
                          <button className="btn" type="submit">
                            Predict
                          </button>
                          <button
                            className="btn btn--ghost"
                            type="reset"
                            onClick={(event) => {
                              event.preventDefault();
                              setInferenceResult(null);
                              inferenceStatus.setStatus("Ready", "info");
                            }}
                          >
                            Reset
                          </button>
                        </div>
                        <StatusMessage status={inferenceStatus.status} />
                      </form>
                      <div
                        className="tabular-inference__output"
                        hidden={!inferenceResult}
                        aria-live="polite"
                        role="status"
                      >
                        {inferenceResult ? (
                          <>
                            <p className="tabular-inference__value">{String(inferenceResult.prediction)}</p>
                            {inferenceResult.probabilities ? (
                              <dl className="tabular-inference__probabilities">
                                {Object.entries(inferenceResult.probabilities).map(([label, prob]) => (
                                  <Fragment key={label}>
                                    <dt>{label}</dt>
                                    <dd>{(prob * 100).toFixed(2)}%</dd>
                                  </Fragment>
                                ))}
                              </dl>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </section>
                  </div>
                  <div>
                    <h5 className="form-section__title">Batch predictions</h5>
                    <p className="form-field__hint">Upload a CSV with the same feature columns. Omit the target column.</p>
                    <form id="batch-form" className="form-grid" onSubmit={submitBatch}>
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="batch-file">
                          Batch CSV
                        </label>
                        <input
                          id="batch-file"
                          name="dataset"
                          type="file"
                          accept="text/csv,application/vnd.ms-excel"
                          ref={batchFileRef}
                          required
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn" type="submit">
                          Run batch predictions
                        </button>
                        <button
                          className="btn btn--ghost"
                          type="reset"
                          onClick={(event) => {
                            event.preventDefault();
                            if (batchFileRef.current) {
                              batchFileRef.current.value = "";
                            }
                            setBatchPreview(null);
                            batchStatus.setStatus("Ready", "info");
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <StatusMessage status={batchStatus.status} />
                    </form>
                    <section className="tabular-inference__batch-results" hidden={!batchPreview} aria-live="polite">
                      {batchPreview ? (
                        <>
                          <header className="tabular-inference__batch-header">
                            <p className="form-field__hint">{batchPreview.rows} rows predicted</p>
                            <div className="tabular-results__actions">
                              <button className="btn btn--subtle" type="button" onClick={() => downloadBatchCsv()}>
                                Download CSV
                              </button>
                            </div>
                          </header>
                          <div className="prediction-preview" role="region">
                            {renderTable(batchPreview.preview, batchPreview.columns, "tabular-predictions")}
                          </div>
                        </>
                      ) : null}
                    </section>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        title="Tabular ML preferences"
        description="Configure scatter sampling, histogram resolution, and default algorithms."
        fields={settingsFields}
        values={preferences}
        onChange={(key, value) =>
          updateSetting(key as keyof TabularPreferences, value as TabularPreferences[keyof TabularPreferences])
        }
        onReset={() => resetSettings()}
        onClose={() => setSettingsOpen(false)}
      />
    </section>
  );
}
