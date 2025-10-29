import { bindForm, setupDropzone } from "/static/js/core.js";

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
const metricsEl = document.getElementById("metrics");
const importanceEl = document.getElementById("importance");

let currentDatasetId = null;
let currentColumns = [];
let currentNumericColumns = [];

function titleCase(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clearScatter() {
  scatterPlot.innerHTML = "";
  scatterPlot.setAttribute("hidden", "hidden");
  scatterCaption.textContent = "";
}

function setFormsEnabled(enabled) {
  const controls = [scatterForm, trainForm];
  controls.forEach((form) => {
    Array.from(form.elements).forEach((el) => {
      el.disabled = !enabled && el.type !== "reset";
    });
  });
  if (!enabled) {
    results.hidden = true;
    metricsEl.innerHTML = "";
    importanceEl.innerHTML = "";
    clearScatter();
  }
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

function populateSelectors(columns, numericColumns) {
  scatterX.innerHTML = "";
  scatterY.innerHTML = "";
  scatterColor.innerHTML = "";
  numericColumns.forEach((name) => {
    const optionX = document.createElement("option");
    optionX.value = name;
    optionX.textContent = name;
    scatterX.appendChild(optionX);
    const optionY = optionX.cloneNode(true);
    scatterY.appendChild(optionY);
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
    circle.setAttribute("r", "4");
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

const datasetController = bindForm(datasetForm, {
  pendingText: "Uploading…",
  successText: "Dataset loaded",
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
    currentDatasetId = data.dataset_id;
    currentColumns = data.columns;
    currentNumericColumns = data.numeric_columns;
    datasetShape.textContent = `${data.shape[0]} rows × ${data.shape[1]} columns`;
    renderPreview(data.preview, data.columns);
    renderColumns(data.columns, data.stats);
    populateSelectors(data.columns, data.numeric_columns);
    datasetOverview.hidden = false;
    setFormsEnabled(true);
    datasetController.setStatus("Dataset ready", "success");
  },
});

datasetController.setStatus("Drop a CSV to begin", "info");
setFormsEnabled(false);

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
  datasetController.setStatus("Dataset removed", "info");
});

const scatterController = bindForm(scatterForm, {
  pendingText: "Generating scatter…",
  successText: "Scatter updated",
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

const trainController = bindForm(trainForm, {
  pendingText: "Training…",
  successText: "Training complete",
  async onSubmit() {
    if (!currentDatasetId) {
      throw new Error("Load a dataset before training");
    }
    const target = trainForm.target.value.trim();
    if (!target) {
      throw new Error("Provide a target column");
    }
    const response = await fetch(`/tabular_ml/api/v1/datasets/${currentDatasetId}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
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
  },
});

trainReset.addEventListener("click", () => {
  trainForm.reset();
  results.hidden = true;
  metricsEl.innerHTML = "";
  importanceEl.innerHTML = "";
  trainController.setStatus("Ready", "info");
});
