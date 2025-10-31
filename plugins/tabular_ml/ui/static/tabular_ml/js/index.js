import { bindForm, downloadBlob, setupDropzone } from "/static/js/core.js";

const datasetForm = document.getElementById("dataset-form");
const datasetInput = document.getElementById("dataset");
const dropzone = document.getElementById("dataset-dropzone");
const datasetName = document.getElementById("dataset-name");
const datasetBrowse = document.getElementById("dataset-browse");
const datasetReset = document.getElementById("dataset-reset");
const datasetOverview = document.getElementById("dataset-overview");
const datasetShape = document.getElementById("dataset-shape");
const datasetClear = document.getElementById("dataset-clear");
const previewTable = document.getElementById("preview-table");
const columnSummary = document.getElementById("column-summary");
const scatterForm = document.getElementById("scatter-form");
const scatterX = document.getElementById("scatter-x");
const scatterY = document.getElementById("scatter-y");
const scatterColor = document.getElementById("scatter-color");
const scatterPlot = document.getElementById("scatter-plot");
const scatterCaption = document.getElementById("scatter-caption");
const scatterReset = document.getElementById("scatter-reset");
const trainForm = document.getElementById("train-form");
const trainReset = document.getElementById("train-reset");
const results = document.getElementById("train-results");
const taskEl = document.getElementById("task");
const algorithmSelect = document.getElementById("algorithm");
const algorithmBadge = document.getElementById("algorithm-used");
const metricsEl = document.getElementById("metrics");
const importanceEl = document.getElementById("importance");
const predictionTable = document.getElementById("prediction-table");
const downloadPredictions = document.getElementById("download-predictions");
const downloadJson = document.getElementById("download-json");
const inferenceSection = document.getElementById("inference-section");
const inferenceForm = document.getElementById("inference-form");
const inferenceFields = document.getElementById("inference-fields");
const inferenceEmpty = document.getElementById("inference-empty");
const inferenceReset = document.getElementById("inference-reset");
const inferenceOutput = document.getElementById("inference-output");
const inferenceValue = document.getElementById("inference-value");
const inferenceProbabilities = document.getElementById("inference-probabilities");
const batchForm = document.getElementById("batch-form");
const batchFile = document.getElementById("batch-file");
const batchReset = document.getElementById("batch-reset");
const batchResults = document.getElementById("batch-results");
const batchSummary = document.getElementById("batch-summary");
const batchTable = document.getElementById("batch-table");
const batchDownload = document.getElementById("batch-download");
const histogramForm = document.getElementById("histogram-form");
const histogramColumn = document.getElementById("histogram-column");
const histogramPlot = document.getElementById("histogram-plot");
const histogramCaption = document.getElementById("histogram-caption");
const histogramReset = document.getElementById("histogram-reset");
const preprocessSection = document.getElementById("preprocess-section");
const outlierForm = document.getElementById("outlier-form");
const outlierColumns = document.getElementById("outlier-columns");
const outlierThreshold = document.getElementById("outlier-threshold");
const detectOutliersButton = document.getElementById("detect-outliers");
const removeOutliersButton = document.getElementById("remove-outliers");
const outlierSummary = document.getElementById("outlier-summary");
const filterForm = document.getElementById("filter-form");
const filterColumn = document.getElementById("filter-column");
const filterOperator = document.getElementById("filter-operator");
const filterValue = document.getElementById("filter-value");
const filterSummary = document.getElementById("filter-summary");
const filterReset = document.getElementById("filter-reset");
const scatterSettingsButton = document.getElementById("scatter-settings");
const histogramSettingsButton = document.getElementById("histogram-settings");
const trainingSettingsButton = document.getElementById("training-settings");
const settingsDialog = document.getElementById("settings-dialog");
const settingsContent = document.getElementById("settings-content");
const settingsTitle = document.getElementById("settings-title");

let currentDatasetId = null;
let currentColumns = [];
let currentNumericColumns = [];
let currentPredictionColumns = [];
let currentFeatureColumns = [];
let currentTargetColumn = "";
let currentRowCount = 0;
let hasPredictions = false;
let hasBatchPredictions = false;
let inferenceController = null;
let batchController = null;
let histogramController = null;
let filterController = null;
let scatterController = null;
let outlierController = null;
const scatterSettingsState = { maxPoints: 400, pointSize: 4 };
const histogramSettingsState = { bins: 30, density: false, range: null };
const trainingSettingsState = {};
let algorithmMetadataCache = {};
let lastHistogramRequest = null;
let activeSettingsTarget = null;

function titleCase(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clearScatter() {
  scatterPlot.innerHTML = "";
  scatterPlot.setAttribute("hidden", "hidden");
  scatterCaption.textContent = "";
}

function clearHistogram() {
  if (!histogramPlot || !histogramCaption) return;
  histogramPlot.innerHTML = "";
  histogramPlot.setAttribute("hidden", "hidden");
  histogramCaption.textContent = "";
}

function setFormsEnabled(enabled) {
  const controls = [scatterForm, trainForm, histogramForm, filterForm];
  controls.forEach((form) => {
    Array.from(form.elements).forEach((el) => {
      el.disabled = !enabled && el.type !== "reset";
    });
  });
  if (outlierForm) {
    Array.from(outlierForm.elements).forEach((el) => {
      el.disabled = !enabled && el.type !== "reset";
    });
  }
  [detectOutliersButton, removeOutliersButton, scatterSettingsButton, histogramSettingsButton, trainingSettingsButton].forEach(
    (button) => {
      if (button) button.disabled = !enabled;
    },
  );
  if (!enabled) {
    results.hidden = true;
    metricsEl.innerHTML = "";
    importanceEl.innerHTML = "";
    clearScatter();
    clearHistogram();
    if (predictionTable) {
      predictionTable.innerHTML = "";
    }
    hasPredictions = false;
    togglePredictionButtons(false);
    if (algorithmBadge) {
      algorithmBadge.textContent = "";
      algorithmBadge.hidden = true;
    }
    resetInference();
    if (outlierSummary) {
      outlierSummary.hidden = true;
      outlierSummary.textContent = "";
    }
    if (filterSummary) {
      filterSummary.textContent = "";
    }
    if (preprocessSection) {
      preprocessSection.hidden = true;
    }
    currentRowCount = 0;
  }
}

function togglePredictionButtons(available) {
  hasPredictions = available;
  [downloadPredictions, downloadJson].forEach((button) => {
    if (!button) return;
    button.disabled = !available;
  });
}

function resetInference() {
  currentFeatureColumns = [];
  currentTargetColumn = "";
  hasBatchPredictions = false;
  if (inferenceForm) {
    inferenceForm.reset();
  }
  if (inferenceFields) {
    inferenceFields.innerHTML = "";
  }
  if (inferenceEmpty) {
    inferenceEmpty.hidden = true;
  }
  if (inferenceOutput) {
    inferenceOutput.hidden = true;
  }
  if (inferenceValue) {
    inferenceValue.textContent = "";
  }
  if (inferenceProbabilities) {
    inferenceProbabilities.innerHTML = "";
    inferenceProbabilities.hidden = true;
  }
  if (inferenceSection) {
    inferenceSection.hidden = true;
  }
  if (inferenceController) {
    inferenceController.setStatus("Train a model to enable inference", "info");
  }
  if (batchForm) {
    batchForm.reset();
  }
  if (batchResults) {
    batchResults.hidden = true;
  }
  if (batchTable) {
    batchTable.innerHTML = "";
  }
  if (batchSummary) {
    batchSummary.textContent = "";
  }
  if (batchDownload) {
    batchDownload.disabled = true;
  }
  if (batchController) {
    batchController.setStatus("Upload a CSV after training to run batch predictions", "info");
  }
}

function renderInferenceFields(columns) {
  if (!inferenceSection || !inferenceFields) {
    return;
  }
  inferenceFields.innerHTML = "";
  if (!columns?.length) {
    inferenceSection.hidden = false;
    if (inferenceEmpty) {
      inferenceEmpty.hidden = false;
    }
    Array.from(inferenceForm?.elements || []).forEach((element) => {
      if (element.type !== "reset") {
        element.disabled = true;
      }
    });
    if (inferenceController) {
      inferenceController.setStatus("No numeric features available for inference", "warning");
    }
    return;
  }
  if (inferenceEmpty) {
    inferenceEmpty.hidden = true;
  }
  columns.forEach((column) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-field";
    const label = document.createElement("label");
    const fieldId = `inference-${column.replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}`;
    label.className = "form-field__label";
    label.setAttribute("for", fieldId);
    label.textContent = column;
    const input = document.createElement("input");
    input.id = fieldId;
    input.name = column;
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "any";
    input.required = true;
    input.placeholder = "Enter value";
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    inferenceFields.appendChild(wrapper);
  });
  Array.from(inferenceForm?.elements || []).forEach((element) => {
    if (element.type !== "reset") {
      element.disabled = false;
    }
  });
  inferenceSection.hidden = false;
  if (inferenceController) {
    inferenceController.setStatus("Provide feature values to run inference", "info");
  }
}

function renderInferenceResult(data) {
  if (!inferenceOutput || !inferenceValue) {
    return;
  }
  const label = currentTargetColumn ? titleCase(currentTargetColumn.replace(/_/g, " ")) : "value";
  let display = data.prediction;
  if (typeof display === "number") {
    display = Number.isFinite(display) ? display.toPrecision(5) : display;
  }
  let message = `Predicted ${label}: ${display}`;
  if (typeof data.confidence === "number") {
    message += ` (confidence ${(data.confidence * 100).toFixed(1)}%)`;
  }
  inferenceValue.textContent = message;
  if (inferenceProbabilities) {
    inferenceProbabilities.innerHTML = "";
    const probabilities = data.probabilities || {};
    const entries = Object.entries(probabilities).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    if (!entries.length) {
      inferenceProbabilities.hidden = true;
    } else {
      entries.forEach(([target, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = target;
        const dd = document.createElement("dd");
        const numeric = typeof value === "number" ? value : Number(value);
        dd.textContent = Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : value;
        inferenceProbabilities.appendChild(dt);
        inferenceProbabilities.appendChild(dd);
      });
      inferenceProbabilities.hidden = false;
    }
  }
  inferenceOutput.hidden = false;
}

function renderBatchPreview(columns, rows, totalRows) {
  if (!batchTable) {
    return;
  }
  batchTable.innerHTML = "";
  if (!columns?.length || !rows?.length) {
    batchTable.innerHTML = "<caption>No batch predictions available yet.</caption>";
    if (batchSummary) {
      batchSummary.textContent = "";
    }
    hasBatchPredictions = false;
    if (batchDownload) {
      batchDownload.disabled = true;
    }
    return;
  }
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.replace(/_/g, " ");
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      let value = row[column];
      if (typeof value === "number") {
        value = Number.isFinite(value) ? value.toPrecision(5) : value;
      }
      td.textContent = value ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  batchTable.appendChild(thead);
  batchTable.appendChild(tbody);
  if (batchSummary) {
    const previewCount = rows.length;
    batchSummary.textContent = `Showing ${Math.min(previewCount, totalRows)} of ${totalRows} rows`;
  }
  if (batchResults) {
    batchResults.hidden = false;
  }
  if (batchDownload) {
    batchDownload.disabled = false;
  }
  hasBatchPredictions = true;
}

async function fetchBatchCsv() {
  if (!currentDatasetId || !hasBatchPredictions) {
    throw new Error("Run batch predictions before downloading results");
  }
  const response = await fetch(
    `/tabular_ml/api/v1/datasets/${currentDatasetId}/predict/batch?format=csv`,
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to download batch predictions");
  }
  return response;
}

if (inferenceForm) {
  inferenceController = bindForm(inferenceForm, {
    pendingText: "Predicting…",
    successText: "Prediction ready",
    logContext: "Tabular ML · Inference",
    async onSubmit() {
      if (!currentDatasetId) {
        throw new Error("Load a dataset and train a model first");
      }
      if (!currentFeatureColumns.length) {
        throw new Error("Train a model before running inference");
      }
      const features = {};
      let missing = false;
      currentFeatureColumns.forEach((column) => {
        const field = inferenceForm.elements.namedItem(column);
        const value = field ? field.value : "";
        if (typeof value !== "string" || value.trim() === "") {
          missing = true;
        } else {
          features[column] = value;
        }
      });
      if (missing) {
        throw new Error("Provide values for all feature columns");
      }
      const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Prediction failed");
      }
      renderInferenceResult(data);
    },
  });
}

if (batchForm) {
  batchController = bindForm(batchForm, {
    pendingText: "Running batch inference…",
    successText: "Batch predictions ready",
    logContext: "Tabular ML · Batch",
    async onSubmit() {
      if (!currentDatasetId) {
        throw new Error("Load a dataset and train a model first");
      }
      if (!currentFeatureColumns.length) {
        throw new Error("Train a model before running batch inference");
      }
      if (!batchFile?.files?.length) {
        throw new Error("Select a CSV file to upload");
      }
      const formData = new FormData(batchForm);
      const response = await fetch(
        `/tabular_ml/api/v1/datasets/${currentDatasetId}/predict/batch`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Batch prediction failed");
      }
      renderBatchPreview(data.columns, data.preview, data.rows || data.preview?.length || 0);
    },
  });
}

resetInference();

function renderPredictionPreview(columns, rows) {
  if (!predictionTable) return;
  predictionTable.innerHTML = "";
  if (!columns?.length || !rows?.length) {
    predictionTable.innerHTML = "<caption>No predictions available yet.</caption>";
    togglePredictionButtons(false);
    return;
  }
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.replace(/_/g, " ");
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  rows.slice(0, 5).forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      let value = row[column];
      if (typeof value === "number") {
        value = Number.isFinite(value) ? value.toPrecision(5) : value;
      }
      td.textContent = value ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  predictionTable.appendChild(thead);
  predictionTable.appendChild(tbody);
  togglePredictionButtons(true);
}

function renderPreview(preview, columns) {
  previewTable.innerHTML = "";
  if (!preview || !preview.length) {
    previewTable.innerHTML = "<caption>No rows available</caption>";
    return;
  }
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.name;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  const tbody = document.createElement("tbody");
  preview.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      const value = row[col.name];
      td.textContent = value === undefined || value === null ? "" : value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  previewTable.appendChild(thead);
  previewTable.appendChild(tbody);
}

function renderColumns(columns, stats) {
  columnSummary.innerHTML = "";
  columns.forEach((col) => {
    const li = document.createElement("li");
    li.className = "tabular-columns__item";
    const header = document.createElement("div");
    header.className = "tabular-columns__name";
    header.textContent = col.name;
    const dtype = document.createElement("span");
    dtype.className = "tabular-columns__dtype";
    dtype.textContent = col.dtype;
    header.appendChild(dtype);
    li.appendChild(header);
    const meta = document.createElement("p");
    meta.className = "tabular-columns__meta";
    meta.textContent = `${col.is_numeric ? "Numeric" : "Categorical"} · Missing: ${col.missing}`;
    li.appendChild(meta);
    if (col.is_numeric && stats[col.name]) {
      const statList = document.createElement("dl");
      statList.className = "tabular-columns__stats";
      ["mean", "std", "min", "max"].forEach((key) => {
        const dt = document.createElement("dt");
        dt.textContent = key.toUpperCase();
        const dd = document.createElement("dd");
        const value = stats[col.name][key];
        dd.textContent = Number.isFinite(value) ? value.toFixed(4) : "–";
        statList.appendChild(dt);
        statList.appendChild(dd);
      });
      li.appendChild(statList);
    }
    columnSummary.appendChild(li);
  });
}

function populatePreprocessSelectors(columns, numericColumns) {
  if (outlierColumns) {
    outlierColumns.innerHTML = "";
    numericColumns.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      outlierColumns.appendChild(option);
    });
  }
  if (outlierSummary) {
    outlierSummary.hidden = true;
    outlierSummary.textContent = "";
  }
  if (filterColumn) {
    filterColumn.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select column";
    filterColumn.appendChild(placeholder);
    columns.forEach((col) => {
      const option = document.createElement("option");
      option.value = col.name;
      option.textContent = col.name;
      filterColumn.appendChild(option);
    });
  }
  if (filterValue) {
    filterValue.value = "";
  }
  if (filterSummary) {
    filterSummary.textContent = "";
  }
  if (preprocessSection) {
    preprocessSection.hidden = !columns.length;
  }
}

function populateSelectors(columns, numericColumns) {
  scatterX.innerHTML = "";
  scatterY.innerHTML = "";
  scatterColor.innerHTML = "";
  if (histogramColumn) {
    histogramColumn.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select column";
    histogramColumn.appendChild(placeholder);
  }
  numericColumns.forEach((name) => {
    const optionX = document.createElement("option");
    optionX.value = name;
    optionX.textContent = name;
    scatterX.appendChild(optionX);
    const optionY = optionX.cloneNode(true);
    scatterY.appendChild(optionY);
    if (histogramColumn) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      histogramColumn.appendChild(option);
    }
  });
  scatterColor.appendChild(new Option("None", ""));
  columns.forEach((col) => {
    const option = document.createElement("option");
    option.value = col.name;
    option.textContent = col.name;
    scatterColor.appendChild(option);
  });
  if (scatterX.options.length) {
    scatterX.selectedIndex = 0;
  }
  if (scatterY.options.length > 1) {
    scatterY.selectedIndex = 1;
  }
  populatePreprocessSelectors(columns, numericColumns);
}

function renderScatter(data) {
  const width = 480;
  const height = 320;
  const margin = { top: 20, right: 20, bottom: 45, left: 55 };
  clearScatter();
  if (!data.x.length || !data.y.length) {
    scatterCaption.textContent = "No data available for scatter plot.";
    return;
  }
  const minX = Math.min(...data.x);
  const maxX = Math.max(...data.x);
  const minY = Math.min(...data.y);
  const maxY = Math.max(...data.y);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const svgNS = "http://www.w3.org/2000/svg";

  function scale(value, min, max, size) {
    if (max - min === 0) {
      return size / 2;
    }
    return ((value - min) / (max - min)) * size;
  }

  const axes = document.createElementNS(svgNS, "g");
  axes.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
  const xAxis = document.createElementNS(svgNS, "line");
  xAxis.setAttribute("x1", "0");
  xAxis.setAttribute("y1", plotHeight);
  xAxis.setAttribute("x2", plotWidth);
  xAxis.setAttribute("y2", plotHeight);
  xAxis.setAttribute("class", "scatter-axis");
  axes.appendChild(xAxis);
  const yAxis = document.createElementNS(svgNS, "line");
  yAxis.setAttribute("x1", "0");
  yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0");
  yAxis.setAttribute("y2", plotHeight);
  yAxis.setAttribute("class", "scatter-axis");
  axes.appendChild(yAxis);

  const pointsGroup = document.createElementNS(svgNS, "g");
  pointsGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);

  const palette = ["#64b5f6", "#ffb74d", "#81c784", "#ba68c8", "#e57373", "#ffd54f", "#4db6ac"];
  const categoryColours = new Map();
  let paletteIndex = 0;

  data.x.forEach((xValue, index) => {
    const yValue = data.y[index];
    const cx = scale(xValue, minX, maxX, plotWidth);
    const cy = plotHeight - scale(yValue, minY, maxY, plotHeight);
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    const radius = Number.isFinite(Number(scatterSettingsState.pointSize))
      ? Number(scatterSettingsState.pointSize)
      : 4;
    circle.setAttribute("r", Math.max(2, radius).toString());
    let fill = "var(--accent-500, #64b5f6)";
    if (data.color) {
      const colourValue = data.color[index];
      if (data.color_mode === "numeric") {
        const minC = Math.min(...data.color);
        const maxC = Math.max(...data.color);
        const norm = maxC - minC === 0 ? 0.5 : (colourValue - minC) / (maxC - minC);
        const hue = 200 - norm * 120;
        fill = `hsl(${hue}, 70%, 55%)`;
      } else {
        if (!categoryColours.has(colourValue)) {
          const colour = palette[paletteIndex % palette.length];
          categoryColours.set(colourValue, colour);
          paletteIndex += 1;
        }
        fill = categoryColours.get(colourValue);
      }
    }
    circle.setAttribute("fill", fill);
    circle.setAttribute("fill-opacity", "0.85");
    pointsGroup.appendChild(circle);
  });

  scatterPlot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  scatterPlot.appendChild(axes);
  scatterPlot.appendChild(pointsGroup);
  scatterPlot.removeAttribute("hidden");
  scatterCaption.textContent = `${data.x_label} vs ${data.y_label}${data.color_label ? ` · colour: ${data.color_label}` : ""}`;
}

function renderHistogram(data) {
  if (!histogramPlot || !histogramCaption) {
    return;
  }
  clearHistogram();
  const counts = Array.isArray(data?.counts) ? data.counts.map(Number) : [];
  if (!counts.length) {
    histogramCaption.textContent = "No histogram data available.";
    return;
  }
  const edges = Array.isArray(data.edges) ? data.edges.map(Number) : [];
  const width = 480;
  const height = 320;
  const margin = { top: 20, right: 20, bottom: 45, left: 55 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const svgNS = "http://www.w3.org/2000/svg";
  const maxCount = Math.max(...counts, 0);
  const axes = document.createElementNS(svgNS, "g");
  axes.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
  const xAxis = document.createElementNS(svgNS, "line");
  xAxis.setAttribute("x1", "0");
  xAxis.setAttribute("y1", plotHeight);
  xAxis.setAttribute("x2", plotWidth);
  xAxis.setAttribute("y2", plotHeight);
  xAxis.setAttribute("class", "scatter-axis");
  axes.appendChild(xAxis);
  const yAxis = document.createElementNS(svgNS, "line");
  yAxis.setAttribute("x1", "0");
  yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0");
  yAxis.setAttribute("y2", plotHeight);
  yAxis.setAttribute("class", "scatter-axis");
  axes.appendChild(yAxis);

  const bars = document.createElementNS(svgNS, "g");
  bars.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
  const barWidth = counts.length ? plotWidth / counts.length : plotWidth;
  counts.forEach((count, index) => {
    const magnitude = Number.isFinite(count) ? count : 0;
    const barHeight = maxCount === 0 ? 0 : (magnitude / maxCount) * plotHeight;
    const rect = document.createElementNS(svgNS, "rect");
    const x = index * barWidth + barWidth * 0.1;
    rect.setAttribute("x", x.toString());
    rect.setAttribute("y", (plotHeight - barHeight).toString());
    rect.setAttribute("width", (barWidth * 0.8).toString());
    rect.setAttribute("height", barHeight.toString());
    rect.setAttribute("fill", "var(--accent-500, #64b5f6)");
    rect.setAttribute("fill-opacity", "0.85");
    bars.appendChild(rect);
  });

  histogramPlot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  histogramPlot.appendChild(axes);
  histogramPlot.appendChild(bars);

  if (edges.length >= 2) {
    const labelsGroup = document.createElementNS(svgNS, "g");
    labelsGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top + plotHeight + 20})`);
    const firstLabel = document.createElementNS(svgNS, "text");
    firstLabel.setAttribute("x", "0");
    firstLabel.setAttribute("y", "0");
    firstLabel.setAttribute("fill", "currentColor");
    firstLabel.setAttribute("font-size", "12");
    firstLabel.textContent = edges[0].toPrecision(4);
    labelsGroup.appendChild(firstLabel);
    const lastLabel = document.createElementNS(svgNS, "text");
    lastLabel.setAttribute("x", plotWidth.toString());
    lastLabel.setAttribute("y", "0");
    lastLabel.setAttribute("fill", "currentColor");
    lastLabel.setAttribute("font-size", "12");
    lastLabel.setAttribute("text-anchor", "end");
    lastLabel.textContent = edges[edges.length - 1].toPrecision(4);
    labelsGroup.appendChild(lastLabel);
    histogramPlot.appendChild(labelsGroup);
  }

  histogramPlot.removeAttribute("hidden");
  const suffix = data.density ? "density" : "counts";
  histogramCaption.textContent = `Histogram of ${data.column} (${suffix})`;
  lastHistogramRequest = { column: data.column };
}

function renderOutlierSummary(report) {
  if (!outlierSummary) {
    return;
  }
  outlierSummary.innerHTML = "";
  const total = Number(report.total_outliers || 0);
  const inspected = Array.isArray(report.inspected_columns) ? report.inspected_columns : [];
  const indices = Array.isArray(report.sample_indices) ? report.sample_indices : [];
  const summary = document.createElement("p");
  summary.className = "tabular-outliers__stats";
  summary.textContent =
    total > 0
      ? `Detected ${total} potential outliers across ${inspected.length} numeric column${inspected.length === 1 ? "" : "s"}.`
      : "No outliers detected for the selected columns.";
  outlierSummary.appendChild(summary);
  if (inspected.length) {
    const inspectedText = document.createElement("p");
    inspectedText.className = "form-field__hint";
    inspectedText.textContent = `Inspected columns: ${inspected.join(", ")}`;
    outlierSummary.appendChild(inspectedText);
  }
  if (indices.length) {
    const indicesText = document.createElement("p");
    indicesText.className = "form-field__hint";
    indicesText.textContent = `Sample rows: ${indices.slice(0, 10).join(", ")}${
      indices.length > 10 ? "…" : ""
    }`;
    outlierSummary.appendChild(indicesText);
  }
  outlierSummary.hidden = false;
}

function applyProfile(profile, options = {}) {
  const { resetTraining = true } = options;
  currentDatasetId = profile.dataset_id;
  currentColumns = profile.columns || [];
  currentNumericColumns = profile.numeric_columns || [];
  const rows = Array.isArray(profile.shape) ? Number(profile.shape[0]) : Number(profile.shape?.[0] ?? 0);
  const cols = Array.isArray(profile.shape) ? Number(profile.shape[1]) : Number(profile.shape?.[1] ?? 0);
  currentRowCount = Number.isFinite(rows) ? rows : 0;
  if (datasetShape) {
    datasetShape.textContent = `${currentRowCount} rows × ${cols || currentColumns.length} columns`;
  }
  renderPreview(profile.preview, currentColumns);
  renderColumns(currentColumns, profile.stats || {});
  populateSelectors(currentColumns, currentNumericColumns);
  datasetOverview.hidden = false;
  if (preprocessSection) {
    preprocessSection.hidden = false;
  }
  clearScatter();
  clearHistogram();
  lastHistogramRequest = null;
  if (resetTraining) {
    if (trainForm) {
      trainForm.reset();
    }
    results.hidden = true;
    metricsEl.innerHTML = "";
    importanceEl.innerHTML = "";
    togglePredictionButtons(false);
    if (predictionTable) {
      predictionTable.innerHTML = "";
    }
    if (algorithmSelect) {
      algorithmSelect.selectedIndex = 0;
    }
    if (algorithmBadge) {
      algorithmBadge.textContent = "";
      algorithmBadge.hidden = true;
    }
    resetInference();
  }
}

async function requestHistogram(column) {
  if (!currentDatasetId) {
    throw new Error("Load a dataset first");
  }
  if (!column) {
    throw new Error("Select a numeric column");
  }
  const payload = {
    column,
    bins: Number(histogramSettingsState.bins) || 30,
    density: Boolean(histogramSettingsState.density),
  };
  if (Array.isArray(histogramSettingsState.range) && histogramSettingsState.range.length === 2) {
    payload.range = histogramSettingsState.range;
  }
  const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/histogram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to generate histogram");
  }
  renderHistogram(data);
}

async function loadAlgorithmMetadata() {
  if (Object.keys(algorithmMetadataCache).length) {
    return algorithmMetadataCache;
  }
  try {
    const response = await fetch("/tabular_ml/api/v1/algorithms");
    const data = await response.json();
    if (response.ok && data.algorithms && typeof data.algorithms === "object") {
      algorithmMetadataCache = data.algorithms;
    }
  } catch (error) {
    // ignore network errors; metadata retrieval is optional
  }
  return algorithmMetadataCache;
}

function closeSettings() {
  if (!settingsDialog) {
    return;
  }
  settingsDialog.hidden = true;
  settingsContent?.replaceChildren();
  activeSettingsTarget = null;
}

function openSettings(target) {
  if (!settingsDialog) {
    return;
  }
  const template = document.getElementById(`${target}-settings-template`);
  if (!template) {
    return;
  }
  settingsContent?.replaceChildren(template.content.cloneNode(true));
  activeSettingsTarget = target;
  const titles = {
    scatter: "Scatter plot settings",
    histogram: "Histogram settings",
    training: "Model training settings",
  };
  if (settingsTitle) {
    settingsTitle.textContent = titles[target] || "Settings";
  }
  settingsDialog.hidden = false;
  const form = settingsContent?.querySelector("form[data-settings-form]");
  if (form) {
    if (target === "scatter") {
      initialiseScatterSettings(form);
    } else if (target === "histogram") {
      initialiseHistogramSettings(form);
    } else if (target === "training") {
      initialiseTrainingSettings(form);
    }
  }
  const focusTarget = settingsContent?.querySelector("input, select, button:not([data-settings-close])");
  focusTarget?.focus();
}

function initialiseScatterSettings(form) {
  const maxPointsInput = form.querySelector("#scatter-max-points");
  const pointSizeInput = form.querySelector("#scatter-point-size");
  if (maxPointsInput) {
    maxPointsInput.value = scatterSettingsState.maxPoints;
  }
  if (pointSizeInput) {
    pointSizeInput.value = scatterSettingsState.pointSize;
  }
  if (form._submitHandler) {
    form.removeEventListener("submit", form._submitHandler);
  }
  const submitHandler = (event) => {
    event.preventDefault();
    if (maxPointsInput) {
      const raw = Number(maxPointsInput.value);
      if (!Number.isFinite(raw) || raw < 50 || raw > 5000) {
        scatterController?.setStatus("Maximum points must be between 50 and 5000", "error");
        return;
      }
      scatterSettingsState.maxPoints = Math.round(raw);
    }
    if (pointSizeInput) {
      const raw = Number(pointSizeInput.value);
      scatterSettingsState.pointSize = Number.isFinite(raw) ? Math.min(Math.max(raw, 2), 10) : 4;
    }
    scatterController?.setStatus("Settings saved. Regenerate scatter to apply.", "info");
    closeSettings();
  };
  form._submitHandler = submitHandler;
  form.addEventListener("submit", submitHandler);
}

function initialiseHistogramSettings(form) {
  const binsInput = form.querySelector("#histogram-bins");
  const densitySelect = form.querySelector("#histogram-density");
  const rangeMinInput = form.querySelector("#histogram-range-min");
  const rangeMaxInput = form.querySelector("#histogram-range-max");
  if (binsInput) {
    binsInput.value = histogramSettingsState.bins;
  }
  if (densitySelect) {
    densitySelect.value = histogramSettingsState.density ? "true" : "false";
  }
  if (rangeMinInput && rangeMaxInput) {
    if (Array.isArray(histogramSettingsState.range)) {
      rangeMinInput.value = histogramSettingsState.range[0];
      rangeMaxInput.value = histogramSettingsState.range[1];
    } else {
      rangeMinInput.value = "";
      rangeMaxInput.value = "";
    }
  }
  if (form._submitHandler) {
    form.removeEventListener("submit", form._submitHandler);
  }
  const submitHandler = (event) => {
    event.preventDefault();
    const binsValue = Number(binsInput?.value || histogramSettingsState.bins);
    if (!Number.isFinite(binsValue) || binsValue < 2 || binsValue > 200) {
      histogramController?.setStatus("Bins must be between 2 and 200", "error");
      return;
    }
    histogramSettingsState.bins = Math.round(binsValue);
    if (densitySelect) {
      histogramSettingsState.density = densitySelect.value === "true";
    }
    if (rangeMinInput && rangeMaxInput) {
      const minText = rangeMinInput.value.trim();
      const maxText = rangeMaxInput.value.trim();
      if (minText && maxText) {
        const minValue = Number(minText);
        const maxValue = Number(maxText);
        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
          histogramController?.setStatus("Range values must be numeric", "error");
          return;
        }
        if (minValue >= maxValue) {
          histogramController?.setStatus("Range minimum must be less than maximum", "error");
          return;
        }
        histogramSettingsState.range = [minValue, maxValue];
      } else {
        histogramSettingsState.range = null;
      }
    }
    closeSettings();
    if (lastHistogramRequest?.column) {
      requestHistogram(lastHistogramRequest.column).then(() => {
        histogramController?.setStatus("Histogram updated", "success");
      }).catch((error) => {
        histogramController?.setStatus(
          error instanceof Error ? error.message : "Histogram update failed",
          "error",
        );
      });
    }
  };
  form._submitHandler = submitHandler;
  form.addEventListener("submit", submitHandler);
}

async function initialiseTrainingSettings(form) {
  const container = form.querySelector("#training-parameters");
  const resetButton = form.querySelector("[data-settings-reset]");
  if (!container) {
    return;
  }
  if (form._submitHandler) {
    form.removeEventListener("submit", form._submitHandler);
  }
  if (resetButton && form._resetHandler) {
    resetButton.removeEventListener("click", form._resetHandler);
  }
  await loadAlgorithmMetadata();
  container.innerHTML = "";
  const selectedAlgorithm = algorithmSelect?.value && algorithmSelect.value !== "auto"
    ? algorithmSelect.value
    : "linear_model";
  const metadata = algorithmMetadataCache[selectedAlgorithm];
  if (algorithmSelect && algorithmSelect.value === "auto") {
    const info = document.createElement("p");
    info.className = "form-field__hint";
    info.textContent = "Automatic mode uses a baseline linear model. Select a specific algorithm to apply custom settings.";
    container.appendChild(info);
  }
  if (!metadata) {
    const message = document.createElement("p");
    message.className = "form-field__hint";
    message.textContent = "Algorithm metadata unavailable.";
    container.appendChild(message);
  } else {
    const overrides = trainingSettingsState[selectedAlgorithm] || {};
    metadata.hyperparameters.forEach((param) => {
      const field = document.createElement("div");
      field.className = "form-field";
      const label = document.createElement("label");
      const inputId = `training-${selectedAlgorithm}-${param.name}`;
      label.className = "form-field__label";
      label.setAttribute("for", inputId);
      label.textContent = param.label || param.name;
      field.appendChild(label);
      let input;
      if (param.type === "select") {
        input = document.createElement("select");
        (param.choices || []).forEach((choice) => {
          const option = document.createElement("option");
          option.value = choice;
          option.textContent = choice;
          input.appendChild(option);
        });
        input.value = overrides[param.name] ?? param.default ?? (param.choices?.[0] ?? "");
      } else if (param.type === "bool") {
        input = document.createElement("select");
        [
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ].forEach((optionData) => {
          const option = document.createElement("option");
          option.value = optionData.value;
          option.textContent = optionData.label;
          input.appendChild(option);
        });
        const boolValue = overrides[param.name] ?? param.default ?? false;
        input.value = boolValue ? "true" : "false";
      } else {
        input = document.createElement("input");
        input.type = "number";
        if (param.type === "int") {
          input.step = param.step ?? "1";
        } else {
          input.step = param.step ?? "0.1";
        }
        if (param.min !== undefined) {
          input.min = param.min;
        }
        if (param.max !== undefined) {
          input.max = param.max;
        }
        const value = overrides[param.name];
        input.value = value !== undefined ? value : param.default ?? "";
        if (param.nullable) {
          input.placeholder = "Leave blank for automatic";
        }
      }
      input.id = inputId;
      input.name = param.name;
      field.appendChild(input);
      if (param.tasks && param.tasks.length) {
        const hint = document.createElement("p");
        hint.className = "form-field__hint";
        hint.textContent = `Applies to: ${param.tasks.join(", ")}`;
        field.appendChild(hint);
      }
      container.appendChild(field);
    });
  }
  const submitHandler = (event) => {
    event.preventDefault();
    if (!metadata) {
      closeSettings();
      return;
    }
    const overrides = {};
    let hasError = false;
    metadata.hyperparameters.forEach((param) => {
      const input = container.querySelector(`[name="${param.name}"]`);
      if (!input) {
        return;
      }
      let value;
      if (param.type === "select") {
        value = input.value;
      } else if (param.type === "bool") {
        value = input.value === "true";
      } else {
        const raw = input.value.trim();
        if (!raw) {
          value = undefined;
        } else {
          const numeric = Number(raw);
          if (!Number.isFinite(numeric)) {
            hasError = true;
            trainController?.setStatus(`Hyperparameter ${param.name} must be numeric`, "error");
            return;
          }
          value = param.type === "int" ? Math.round(numeric) : numeric;
        }
      }
      if (hasError) {
        return;
      }
      if (value === undefined || value === "") {
        return;
      }
      if (param.default !== undefined && value === param.default) {
        return;
      }
      overrides[param.name] = value;
    });
    if (hasError) {
      return;
    }
    if (Object.keys(overrides).length) {
      trainingSettingsState[selectedAlgorithm] = overrides;
      trainController?.setStatus("Hyperparameters saved", "success");
    } else {
      delete trainingSettingsState[selectedAlgorithm];
      trainController?.setStatus("Using algorithm defaults", "info");
    }
    closeSettings();
  };
  form._submitHandler = submitHandler;
  form.addEventListener("submit", submitHandler);
  if (resetButton) {
    const resetHandler = (event) => {
      event.preventDefault();
      delete trainingSettingsState[selectedAlgorithm];
      initialiseTrainingSettings(form);
    };
    form._resetHandler = resetHandler;
    resetButton.addEventListener("click", resetHandler, { once: true });
  }
}

const datasetController = bindForm(datasetForm, {
  pendingText: "Uploading…",
  successText: "Dataset loaded",
  logContext: "Tabular ML · Dataset",
  async onSubmit(formData) {
    if (!datasetInput.files || !datasetInput.files.length) {
      throw new Error("Select a CSV dataset");
    }
    const response = await fetch("/tabular_ml/api/v1/datasets", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to load dataset");
    }
    applyProfile(data);
    setFormsEnabled(true);
    datasetController.setStatus("Dataset ready", "success");
  },
});

datasetController.setStatus("Drop a CSV to begin", "info");
setFormsEnabled(false);
if (algorithmBadge) {
  algorithmBadge.hidden = true;
}

setupDropzone(dropzone, datasetInput, {
  accept: "text/csv,application/vnd.ms-excel",
  onFiles(files, meta) {
    if (!files.length) {
      if (meta?.rejected?.length) {
        datasetController.setStatus("Only CSV files are supported", "error");
      }
      datasetName.textContent = "";
      dropzone?.classList.remove("has-file");
      return;
    }
    const [file] = files;
    datasetName.textContent = `Selected: ${file.name}`;
    dropzone?.classList.add("has-file");
    datasetController.setStatus(`${file.name} ready to upload`, "info");
  },
});

if (datasetBrowse) {
  datasetBrowse.addEventListener("click", () => datasetInput.click());
}

datasetReset.addEventListener("click", () => {
  datasetForm.reset();
  datasetName.textContent = "";
  dropzone?.classList.remove("has-file");
  datasetController.setStatus("Ready", "info");
  clearHistogram();
  if (preprocessSection) {
    preprocessSection.hidden = true;
  }
  if (outlierSummary) {
    outlierSummary.hidden = true;
    outlierSummary.textContent = "";
  }
  if (filterSummary) {
    filterSummary.textContent = "";
  }
});

datasetClear.addEventListener("click", async () => {
  if (!currentDatasetId) {
    return;
  }
  try {
    await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}`, {
      method: "DELETE",
    });
  } catch (err) {
    // ignore network errors - dataset is local only
  }
  currentDatasetId = null;
  currentColumns = [];
  currentNumericColumns = [];
  datasetOverview.hidden = true;
  setFormsEnabled(false);
  clearScatter();
  clearHistogram();
  lastHistogramRequest = null;
  datasetController.setStatus("Dataset removed", "info");
  if (predictionTable) {
    predictionTable.innerHTML = "";
  }
  togglePredictionButtons(false);
  currentPredictionColumns = [];
  if (algorithmSelect) {
    algorithmSelect.selectedIndex = 0;
  }
  if (algorithmBadge) {
    algorithmBadge.textContent = "";
    algorithmBadge.hidden = true;
  }
});

scatterController = bindForm(scatterForm, {
  pendingText: "Generating scatter…",
  successText: "Scatter updated",
  logContext: "Tabular ML · Scatter",
  async onSubmit() {
    if (!currentDatasetId) {
      throw new Error("Load a dataset first");
    }
    if (!scatterX.value || !scatterY.value) {
      throw new Error("Select X and Y columns");
    }
    const payload = {
      x: scatterX.value,
      y: scatterY.value,
      max_points: scatterSettingsState.maxPoints,
    };
    if (scatterColor.value) {
      payload.color = scatterColor.value;
    }
    const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/scatter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to build scatter plot");
    }
    renderScatter(data);
  },
});

scatterReset.addEventListener("click", () => {
  scatterForm.reset();
  populateSelectors(currentColumns, currentNumericColumns);
  clearScatter();
  scatterController.setStatus("Ready", "info");
});

if (histogramForm) {
  histogramController = bindForm(histogramForm, {
    pendingText: "Rendering histogram…",
    successText: "Histogram updated",
    logContext: "Tabular ML · Histogram",
    async onSubmit() {
      if (!currentDatasetId) {
        throw new Error("Load a dataset first");
      }
      if (!histogramColumn?.value) {
        throw new Error("Select a numeric column");
      }
      await requestHistogram(histogramColumn.value);
    },
  });
}

if (histogramReset) {
  histogramReset.addEventListener("click", () => {
    histogramForm?.reset();
    clearHistogram();
    lastHistogramRequest = null;
    histogramController?.setStatus("Ready", "info");
  });
}

if (outlierForm) {
  outlierController = bindForm(outlierForm, {
    pendingText: "Detecting outliers…",
    successText: "Outlier report ready",
    logContext: "Tabular ML · Outliers",
    async onSubmit() {
      if (!currentDatasetId) {
        throw new Error("Load a dataset first");
      }
      const thresholdValue = parseFloat(outlierThreshold?.value || "3");
      if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
        throw new Error("Provide a positive threshold");
      }
      const selected = Array.from(outlierColumns?.selectedOptions || [])
        .map((option) => option.value)
        .filter((value) => value);
      const response = await fetch(
        `/tabular_ml/api/v1/datasets/${currentDatasetId}/preprocess/outliers/detect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threshold: thresholdValue,
            columns: selected.length ? selected : undefined,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Outlier detection failed");
      }
      renderOutlierSummary(data);
    },
  });
}

if (removeOutliersButton) {
  removeOutliersButton.addEventListener("click", async () => {
    if (!currentDatasetId) {
      outlierController?.setStatus("Load a dataset first", "error");
      return;
    }
    const thresholdValue = parseFloat(outlierThreshold?.value || "3");
    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      outlierController?.setStatus("Provide a positive threshold", "error");
      return;
    }
    const selected = Array.from(outlierColumns?.selectedOptions || [])
      .map((option) => option.value)
      .filter((value) => value);
    try {
      const previousRows = currentRowCount;
      const response = await fetch(
        `/tabular_ml/api/v1/datasets/${currentDatasetId}/preprocess/outliers/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threshold: thresholdValue,
            columns: selected.length ? selected : undefined,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove outliers");
      }
      applyProfile(data);
      const removed = Math.max(previousRows - currentRowCount, 0);
      if (removed > 0) {
        outlierController?.setStatus(`Removed ${removed} rows flagged as outliers.`, "success");
      } else {
        outlierController?.setStatus("No rows removed; no outliers detected.", "info");
      }
      renderOutlierSummary({
        total_outliers: 0,
        inspected_columns: data.numeric_columns || selected,
        sample_indices: [],
      });
    } catch (error) {
      outlierController?.setStatus(
        error instanceof Error ? error.message : "Outlier removal failed",
        "error",
      );
    }
  });
}

if (filterForm) {
  filterController = bindForm(filterForm, {
    pendingText: "Applying filter…",
    successText: "Filter applied",
    logContext: "Tabular ML · Filter",
    async onSubmit() {
      if (!currentDatasetId) {
        throw new Error("Load a dataset first");
      }
      if (!filterColumn?.value) {
        throw new Error("Choose a column to filter");
      }
      const operator = filterOperator?.value || "eq";
      const rawValue = filterValue?.value ?? "";
      if (!rawValue.trim()) {
        throw new Error("Provide a value for the filter");
      }
      let value;
      if (operator === "in") {
        value = rawValue
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        if (!value.length) {
          throw new Error("Provide at least one value for the list filter");
        }
      } else {
        value = rawValue;
      }
      const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/preprocess/filter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: [
            {
              column: filterColumn.value,
              operator,
              value,
            },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Filtering failed");
      }
      const previousRows = currentRowCount;
      applyProfile(data);
      const removed = Math.max(previousRows - currentRowCount, 0);
      if (filterSummary) {
        filterSummary.textContent = removed
          ? `Removed ${removed} rows; ${currentRowCount} remain.`
          : `Filter kept ${currentRowCount} rows.`;
      }
    },
  });
}

if (filterReset) {
  filterReset.addEventListener("click", () => {
    if (filterSummary) {
      filterSummary.textContent = "";
    }
    filterController?.setStatus("Ready", "info");
  });
}

const trainController = bindForm(trainForm, {
  pendingText: "Training…",
  successText: "Training complete",
  logContext: "Tabular ML · Training",
  async onSubmit() {
    if (!currentDatasetId) {
      throw new Error("Load a dataset before training");
    }
    const target = trainForm.target.value.trim();
    if (!target) {
      throw new Error("Provide a target column");
    }
    const algorithmValue = algorithmSelect?.value || "auto";
    const payload = {
      target,
      algorithm: algorithmValue,
    };
    if (algorithmValue !== "auto") {
      const overrides = trainingSettingsState[algorithmValue];
      if (overrides && Object.keys(overrides).length) {
        payload.hyperparameters = overrides;
      }
    }
    const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Training failed");
    }
    taskEl.textContent = titleCase(data.task);
    metricsEl.innerHTML = "";
    Object.entries(data.metrics).forEach(([key, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = Number.isFinite(value) ? value.toFixed(4) : value;
      metricsEl.appendChild(dt);
      metricsEl.appendChild(dd);
    });
    importanceEl.innerHTML = "";
    Object.entries(data.feature_importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([feature, importance]) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${feature}</span><span>${Number.isFinite(importance) ? importance.toFixed(4) : importance}</span>`;
        importanceEl.appendChild(li);
      });
    results.hidden = false;
    if (algorithmBadge) {
      algorithmBadge.textContent = data.algorithm_label || "";
      algorithmBadge.hidden = !data.algorithm_label;
    }
    currentFeatureColumns = data.feature_columns || [];
    currentTargetColumn = data.target || "";
    renderInferenceFields(currentFeatureColumns);
    currentPredictionColumns = data.columns || [];
    renderPredictionPreview(currentPredictionColumns, data.preview || []);
  },
});

trainReset.addEventListener("click", () => {
  trainForm.reset();
  results.hidden = true;
  metricsEl.innerHTML = "";
  importanceEl.innerHTML = "";
  if (predictionTable) {
    predictionTable.innerHTML = "";
  }
  togglePredictionButtons(false);
  if (algorithmSelect) {
    algorithmSelect.selectedIndex = 0;
  }
  if (algorithmBadge) {
    algorithmBadge.textContent = "";
    algorithmBadge.hidden = true;
  }
  resetInference();
  trainController.setStatus("Ready", "info");
});

async function fetchPredictions(format = "csv") {
  if (!currentDatasetId || !hasPredictions) {
    throw new Error("Train a model before downloading predictions");
  }
  const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/predictions?format=${format}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to download predictions");
  }
  return response;
}

if (downloadPredictions) {
  downloadPredictions.addEventListener("click", async () => {
    try {
      const response = await fetchPredictions("csv");
      const blob = await response.blob();
      downloadBlob(blob, "predictions.csv");
    } catch (error) {
      trainController.setStatus(error instanceof Error ? error.message : "Download failed", "error");
    }
  });
}

if (downloadJson) {
  downloadJson.addEventListener("click", async () => {
    try {
      const response = await fetchPredictions("json");
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, "predictions.json");
    } catch (error) {
      trainController.setStatus(error instanceof Error ? error.message : "Download failed", "error");
    }
  });
}

if (inferenceReset) {
  inferenceReset.addEventListener("click", () => {
    if (inferenceOutput) {
      inferenceOutput.hidden = true;
    }
    if (inferenceValue) {
      inferenceValue.textContent = "";
    }
    if (inferenceProbabilities) {
      inferenceProbabilities.innerHTML = "";
      inferenceProbabilities.hidden = true;
    }
    inferenceController?.setStatus("Provide feature values to run inference", "info");
  });
}

if (batchReset) {
  batchReset.addEventListener("click", () => {
    if (batchResults) {
      batchResults.hidden = true;
    }
    if (batchTable) {
      batchTable.innerHTML = "";
    }
    if (batchSummary) {
      batchSummary.textContent = "";
    }
    if (batchDownload) {
      batchDownload.disabled = true;
    }
    hasBatchPredictions = false;
    batchController?.setStatus("Upload a CSV after training to run batch predictions", "info");
  });
}

if (batchDownload) {
  batchDownload.addEventListener("click", async () => {
    try {
      const response = await fetchBatchCsv();
      const blob = await response.blob();
      downloadBlob(blob, "batch_predictions.csv");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      (batchController || inferenceController)?.setStatus(message, "error");
    }
  });
}

if (settingsDialog) {
  settingsDialog.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.settingsClose !== undefined) {
      event.preventDefault();
      closeSettings();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsDialog?.hidden) {
    closeSettings();
  }
});

[scatterSettingsButton, histogramSettingsButton, trainingSettingsButton].forEach((button) => {
  if (!button) {
    return;
  }
  button.addEventListener("click", () => {
    const target = button.dataset.settingsTarget;
    if (!target) {
      return;
    }
    if (!currentDatasetId && target !== "training") {
      datasetController?.setStatus("Load a dataset first", "error");
      return;
    }
    openSettings(target);
  });
});

loadAlgorithmMetadata();
