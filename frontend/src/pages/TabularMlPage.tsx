import { ChangeEvent, FormEvent, Fragment, MouseEvent, useMemo, useRef, useState } from "react";
import { useStatus } from "../hooks/useStatus";
import { StatusMessage } from "../components/StatusMessage";
import { downloadBlob } from "../utils/files";
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

type ScatterData = {
  x: number[];
  y: number[];
  color?: (number | string)[];
  color_mode?: "numeric" | "category";
  color_label?: string;
  x_label: string;
  y_label: string;
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

const ICON = "/tabular_ml/static/img/tabular_icon.svg";

export default function TabularMlPage({ props }: { props: Record<string, unknown> }) {
  const { helpHref, upload } = props as { helpHref?: string; upload?: { max_mb?: number } };
  const maxMb = Number(upload?.max_mb) || 2;

  const datasetStatus = useStatus({ message: "Drop a CSV to begin", level: "info" }, {
    context: "Tabular ML · Dataset",
  });
  const scatterStatus = useStatus({ message: "Select axes to render scatter", level: "info" }, {
    context: "Tabular ML · Scatter",
  });
  const trainStatus = useStatus({ message: "Train a model to unlock predictions", level: "info" }, {
    context: "Tabular ML · Training",
  });
  const inferenceStatus = useStatus({ message: "Train a model to enable inference", level: "info" }, {
    context: "Tabular ML · Inference",
  });
  const batchStatus = useStatus({ message: "Upload a CSV after training to run batch predictions", level: "info" }, {
    context: "Tabular ML · Batch",
  });

  const [datasetName, setDatasetName] = useState<string>("");
  const [dataset, setDataset] = useState<DatasetProfile | null>(null);
  const [datasetId, setDatasetId] = useState<string>("");
  const [scatterData, setScatterData] = useState<ScatterData | null>(null);
  const [trainResult, setTrainResult] = useState<TrainingResult | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const datasetInputRef = useRef<HTMLInputElement | null>(null);
  const scatterColorRef = useRef<HTMLSelectElement | null>(null);
  const batchFileRef = useRef<HTMLInputElement | null>(null);

  const numericColumns = dataset?.numeric_columns ?? [];
  const columnNames = useMemo(() => dataset?.columns.map((col) => col.name) ?? [], [dataset?.columns]);

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
    if (file.size > maxMb * 1024 * 1024) {
      datasetStatus.setStatus(`File exceeds ${maxMb} MB limit`, "error");
      return;
    }
    setDatasetName(`Selected: ${file.name}`);
    datasetStatus.setStatus(`${file.name} ready to upload`, "info");
  };

  const resetWorkspace = () => {
    setDataset(null);
    setDatasetId("");
    setScatterData(null);
    setTrainResult(null);
    setInferenceResult(null);
    setBatchPreview(null);
    setDatasetName("");
    datasetStatus.setStatus("Dataset removed", "info");
    scatterStatus.setStatus("Select axes to render scatter", "info");
    trainStatus.setStatus("Train a model to unlock predictions", "info");
    inferenceStatus.setStatus("Train a model to enable inference", "info");
    batchStatus.setStatus("Upload a CSV after training to run batch predictions", "info");
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
    datasetStatus.setStatus("Uploading…", "progress");
    try {
      const response = await fetch("/tabular_ml/api/v1/datasets", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to load dataset");
      }
      setDataset(data as DatasetProfile);
      setDatasetId(data.dataset_id);
      datasetStatus.setStatus("Dataset ready", "success");
      scatterStatus.setStatus("Select axes to render scatter", "info");
      trainStatus.setStatus("Train a model to unlock predictions", "info");
      inferenceStatus.setStatus("Train a model to enable inference", "info");
      batchStatus.setStatus("Upload a CSV after training to run batch predictions", "info");
    } catch (error) {
      datasetStatus.setStatus(error instanceof Error ? error.message : "Dataset upload failed", "error");
    }
  };

  const clearDataset = async () => {
    if (!datasetId) {
      resetWorkspace();
      return;
    }
    try {
      await fetch(`/tabular_ml/api/v1/datasets/${datasetId}`, { method: "DELETE" });
    } catch (error) {
      // ignore offline failures
    }
    resetWorkspace();
    if (datasetInputRef.current) {
      datasetInputRef.current.value = "";
    }
  };

  const renderTable = (rows: Array<Record<string, unknown>>, columns: string[]) => (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
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
    const payload: Record<string, string> = { x, y };
    const colorValue = scatterColorRef.current?.value;
    if (colorValue) {
      payload.color = colorValue;
    }
    scatterStatus.setStatus("Generating scatter…", "progress");
    try {
      const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/scatter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to build scatter plot");
      }
      setScatterData(data as ScatterData);
      scatterStatus.setStatus("Scatter updated", "success");
    } catch (error) {
      scatterStatus.setStatus(error instanceof Error ? error.message : "Failed to build scatter plot", "error");
    }
  };

  const resetScatter = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setScatterData(null);
    scatterStatus.setStatus("Ready", "info");
  };

  const submitTraining = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datasetId) {
      trainStatus.setStatus("Load a dataset before training", "error");
      return;
    }
    const form = event.currentTarget as typeof event.currentTarget & {
      target: HTMLInputElement;
      algorithm: HTMLSelectElement;
    };
    const target = form.target.value.trim();
    if (!target) {
      trainStatus.setStatus("Provide a target column", "error");
      return;
    }
    trainStatus.setStatus("Training…", "progress");
    try {
      const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, algorithm: form.algorithm.value || "auto" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Training failed");
      }
      setTrainResult(data as TrainingResult);
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
    const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/predictions?format=${format}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Export failed" }));
      trainStatus.setStatus(data.error || "Export failed", "error");
      return;
    }
    if (format === "json") {
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `${datasetId.slice(0, 8)}_predictions.json`);
    } else {
      const blob = await response.blob();
      downloadBlob(blob, `${datasetId.slice(0, 8)}_predictions.csv`);
    }
    trainStatus.setStatus("Predictions exported", "success");
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
      const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Inference failed");
      }
      setInferenceResult(data as InferenceResult);
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
      const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/predict/batch`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Batch prediction failed");
      }
      setBatchPreview(data as BatchPreview);
      batchStatus.setStatus("Batch predictions ready", "success");
    } catch (error) {
      batchStatus.setStatus(error instanceof Error ? error.message : "Batch prediction failed", "error");
    }
  };

  const downloadBatchCsv = async () => {
    if (!datasetId) {
      batchStatus.setStatus("No dataset loaded", "error");
      return;
    }
    const response = await fetch(`/tabular_ml/api/v1/datasets/${datasetId}/predict/batch?format=csv`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Download failed" }));
      batchStatus.setStatus(data.error || "Download failed", "error");
      return;
    }
    const blob = await response.blob();
    downloadBlob(blob, `${datasetId.slice(0, 8)}_batch_predictions.csv`);
    batchStatus.setStatus("Batch predictions downloaded", "success");
  };

  const renderScatterSvg = () => {
    if (!scatterData) {
      return null;
    }
    const points = scatterData.x.map((x, index) => ({
      x,
      y: scatterData.y[index],
      color: scatterData.color ? scatterData.color[index] : undefined,
    }));
    const minX = Math.min(...scatterData.x);
    const maxX = Math.max(...scatterData.x);
    const minY = Math.min(...scatterData.y);
    const maxY = Math.max(...scatterData.y);
    const width = 480;
    const height = 320;
    return (
      <svg id="scatter-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="scatter-title">
        <title id="scatter-title">Scatter plot</title>
        {points.map((point, index) => {
          const cx = ((point.x - minX) / (maxX - minX || 1)) * (width - 40) + 20;
          const cy = height - (((point.y - minY) / (maxY - minY || 1)) * (height - 40) + 20);
          let fill = "var(--accent-500, #64b5f6)";
          if (scatterData.color && scatterData.color_mode === "numeric" && typeof point.color === "number") {
            const minC = Math.min(...(scatterData.color as number[]));
            const maxC = Math.max(...(scatterData.color as number[]));
            const norm = maxC - minC === 0 ? 0.5 : (point.color - minC) / (maxC - minC);
            const hue = 200 - norm * 120;
            fill = `hsl(${hue}, 70%, 55%)`;
          } else if (scatterData.color && scatterData.color_mode === "category") {
            const palette = ["#64b5f6", "#ffb74d", "#81c784", "#e57373", "#ba68c8"];
            const categories = Array.from(new Set(scatterData.color as string[]));
            const colourIndex = categories.indexOf(String(point.color ?? ""));
            fill = palette[colourIndex % palette.length];
          }
          return <circle key={index} cx={cx} cy={cy} r={4} fill={fill} fillOpacity={0.85} />;
        })}
      </svg>
    );
  };

  const inferenceFields = trainResult?.feature_columns ?? [];

  return (
    <section className="shell surface-block tabular-shell" aria-labelledby="tabular-ml-title">
      <div className="tool-shell__layout">
        <aside className="tool-shell__intro">
          <div className="tool-shell__icon" aria-hidden="true">
            <img src={ICON} alt="" />
          </div>
          <p className="tool-card__category">Machine Learning</p>
          <h1 id="tabular-ml-title" className="section-heading">
            Tabular ML sandbox
          </h1>
          <p>
            Load CSV datasets entirely in memory, preview records, generate scatter plots, and train lightweight models. All computations are performed offline in this browser session.
          </p>
          <ul>
            <li>Automatic task detection (classification or regression)</li>
            <li>Column statistics and top feature importances</li>
            <li>SVG scatter plots with optional colour encoding</li>
          </ul>
          <div className="tool-shell__actions">
            <a className="btn btn--subtle" data-keep-theme href={typeof helpHref === "string" ? helpHref : "/help/tabular_ml"}>
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
                  datasetInputRef.current && (datasetInputRef.current.files = event.dataTransfer.files);
                }
              }}
            >
              <div className="dropzone__copy">
                <h2 className="section-heading">Load CSV dataset</h2>
                <p className="dropzone__hint">Data remains in this session. Max size {maxMb} MB. Ensure the first row contains column headers.</p>
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
                  if (datasetInputRef.current) {
                    datasetInputRef.current.value = "";
                  }
                  setDatasetName("");
                  datasetStatus.setStatus("Ready", "info");
                }}
              >
                Reset
              </button>
            </div>
            <StatusMessage status={datasetStatus.status} />
          </form>

          {dataset && (
            <section id="dataset-overview" className="surface-muted tabular-overview" aria-live="polite">
              <header className="tabular-overview__header">
                <div>
                  <p className="tool-card__category">Dataset preview</p>
                  <h2 className="form-section__title" id="dataset-title">
                    Loaded dataset
                  </h2>
                  <p className="form-field__hint" id="dataset-shape">
                    {dataset.shape[0]} rows × {dataset.shape[1]} columns
                  </p>
                </div>
                <button className="btn btn--ghost" type="button" id="dataset-clear" onClick={clearDataset}>
                  Remove dataset
                </button>
              </header>
              <div className="tabular-overview__grid">
                <div>
                  <h3 className="form-section__title">Sample rows</h3>
                  <div className="preview-table" role="region" aria-live="polite">
                    {renderTable(dataset.preview, dataset.columns.map((col) => col.name))}
                  </div>
                </div>
                <div>
                  <h3 className="form-section__title">Column summary</h3>
                  <ul id="column-summary" className="tabular-columns list-reset">
                    {dataset.columns.map((column) => (
                      <li key={column.name}>
                        <h4>{column.name}</h4>
                        <p>{column.dtype}</p>
                        <p>{column.missing} missing values</p>
                        {column.is_numeric && dataset.stats[column.name] ? (
                          <p>
                            Mean {dataset.stats[column.name].mean.toFixed(3)}, Std {dataset.stats[column.name].std.toFixed(3)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="tabular-overview__grid">
                <div>
                  <h3 className="form-section__title">Scatter plot</h3>
                  <form id="scatter-form" className="form-grid" onSubmit={submitScatter}>
                    <div className="input-grid">
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-x">X axis</label>
                        <select id="scatter-x" name="x" defaultValue={numericColumns[0] ?? ""}>
                          <option value=""></option>
                          {numericColumns.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-y">Y axis</label>
                        <select id="scatter-y" name="y" defaultValue={numericColumns[1] ?? ""}>
                          <option value=""></option>
                          {numericColumns.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label className="form-field__label" htmlFor="scatter-color">Colour (optional)</label>
                        <select id="scatter-color" name="color" ref={scatterColorRef} defaultValue="">
                          <option value="">None</option>
                          {columnNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <p className="form-field__hint">Use categorical columns to highlight clusters.</p>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn" type="submit">
                        Render scatter
                      </button>
                      <button className="btn btn--ghost" type="reset" id="scatter-reset" onClick={resetScatter}>
                        Reset
                      </button>
                    </div>
                    <StatusMessage status={scatterStatus.status} />
                  </form>
                  <figure className="scatter-figure">
                    {scatterData ? renderScatterSvg() : (
                      <svg id="scatter-plot" viewBox="0 0 480 320" role="img" aria-labelledby="scatter-title" hidden>
                        <title id="scatter-title">Scatter plot</title>
                      </svg>
                    )}
                    <figcaption id="scatter-caption" className="form-field__hint">
                      {scatterData
                        ? `${scatterData.x_label} vs ${scatterData.y_label}${scatterData.color_label ? ` · colour: ${scatterData.color_label}` : ""}`
                        : ""}
                    </figcaption>
                  </figure>
                </div>
                <div>
                  <h3 className="form-section__title">Train model</h3>
                  <form id="train-form" className="form-grid" onSubmit={submitTraining}>
                    <div className="form-field">
                      <label className="form-field__label" htmlFor="target">
                        Target column
                        <button
                          type="button"
                          className="tooltip-trigger"
                          data-tooltip="Provide the column name to predict. Only numeric features are used for training."
                          aria-label="Target column help"
                        >
                          ?
                        </button>
                      </label>
                      <input id="target" name="target" placeholder="e.g. hardness" required />
                      <p className="form-field__hint">Matches the header name in the CSV file.</p>
                    </div>
                    <div className="form-field">
                      <label className="form-field__label" htmlFor="algorithm">
                        Algorithm
                        <span className="form-field__hint">Choose an estimator style. Automatic picks a strong baseline for the detected task.</span>
                      </label>
                      <select id="algorithm" name="algorithm">
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
                        id="train-reset"
                        onClick={(event) => {
                          event.preventDefault();
                          setTrainResult(null);
                          setInferenceResult(null);
                          trainStatus.setStatus("Ready", "info");
                        }}
                      >
                        Reset
                      </button>
                    </div>
                    <StatusMessage status={trainStatus.status} />
                  </form>
                  {trainResult && (
                    <section id="train-results" className="surface-muted tabular-results">
                      <header className="tabular-results__header">
                        <div>
                          <p className="tool-card__category">Training results</p>
                          <h4 className="form-section__title">Performance summary</h4>
                        </div>
                        <div className="tabular-results__badges">
                          <p id="task" className="badge">
                            {trainResult.task}
                          </p>
                          <p id="algorithm-used" className="badge badge--muted">
                            {trainResult.algorithm_label}
                          </p>
                        </div>
                      </header>
                      <div className="tabular-results__grid">
                        <div>
                          <h5 className="form-section__title">Metrics</h5>
                          <dl id="metrics" className="tabular-metrics">
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
                          <ul id="importance" className="tabular-importance list-reset">
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
                            {renderTable(trainResult.preview, trainResult.columns)}
                          </div>
                          <div className="tabular-results__actions">
                            <button className="btn btn--subtle" type="button" id="download-predictions" onClick={() => downloadPredictions("csv")}>
                              Download CSV
                            </button>
                            <button className="btn btn--ghost" type="button" id="download-json" onClick={() => downloadPredictions("json")}>
                              Download JSON
                            </button>
                          </div>
                        </div>
                        <div>
                          <h5 className="form-section__title">Run inference</h5>
                          <p className="form-field__hint">Use the trained model to predict new rows.</p>
                          <section id="inference-section" className="tabular-inference" hidden={inferenceFields.length === 0}>
                            <form id="inference-form" className="form-grid" onSubmit={submitInference}>
                              <div id="inference-fields" className="input-grid">
                                {inferenceFields.map((field) => (
                                  <div className="form-field" key={field}>
                                    <label className="form-field__label" htmlFor={`inference-${field}`}>
                                      {field}
                                    </label>
                                    <input id={`inference-${field}`} name={field} type="number" inputMode="decimal" step="any" required placeholder="Enter value" />
                                  </div>
                                ))}
                              </div>
                              <p id="inference-empty" className="form-field__hint" hidden={inferenceFields.length !== 0}>
                                This model requires numeric feature columns. No compatible features were detected.
                              </p>
                              <div className="form-actions">
                                <button className="btn" type="submit">
                                  Predict
                                </button>
                                <button
                                  className="btn btn--ghost"
                                  type="reset"
                                  id="inference-reset"
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
                            <div id="inference-output" className="tabular-inference__output" hidden={!inferenceResult} aria-live="polite" role="status">
                              {inferenceResult && (
                                <>
                                  <p id="inference-value" className="tabular-inference__value">
                                    {inferenceResult.prediction as string}
                                  </p>
                                  {inferenceResult.probabilities ? (
                                    <dl id="inference-probabilities" className="tabular-inference__probabilities">
                                      {Object.entries(inferenceResult.probabilities).map(([label, prob]) => (
                                        <Fragment key={label}>
                                          <dt>{label}</dt>
                                          <dd>{(prob * 100).toFixed(2)}%</dd>
                                        </Fragment>
                                      ))}
                                    </dl>
                                  ) : null}
                                </>
                              )}
                            </div>
                            <section className="tabular-inference__batch">
                              <h6 className="tabular-inference__heading">Batch predictions</h6>
                              <p className="form-field__hint">Upload a CSV with the same feature columns. Omit the target column.</p>
                              <form id="batch-form" className="form-grid" onSubmit={submitBatch}>
                                <div className="form-field">
                                  <label className="form-field__label" htmlFor="batch-file">
                                    Batch CSV
                                  </label>
                                  <input id="batch-file" name="dataset" type="file" accept="text/csv,application/vnd.ms-excel" ref={batchFileRef} required />
                                </div>
                                <div className="form-actions">
                                  <button className="btn" type="submit">
                                    Run batch predictions
                                  </button>
                                  <button
                                    className="btn btn--ghost"
                                    type="reset"
                                    id="batch-reset"
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
                              <section id="batch-results" className="tabular-inference__batch-results" hidden={!batchPreview} aria-live="polite">
                                {batchPreview && (
                                  <>
                                    <header className="tabular-inference__batch-header">
                                      <p id="batch-summary" className="form-field__hint">
                                        {batchPreview.rows} rows predicted
                                      </p>
                                      <div className="tabular-results__actions">
                                        <button className="btn btn--subtle" type="button" id="batch-download" onClick={downloadBatchCsv}>
                                          Download CSV
                                        </button>
                                      </div>
                                    </header>
                                    <div className="prediction-preview" role="region">
                                      {renderTable(batchPreview.preview, batchPreview.columns)}
                                    </div>
                                  </>
                                )}
                              </section>
                            </section>
                          </section>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
