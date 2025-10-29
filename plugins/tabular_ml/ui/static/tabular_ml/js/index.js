import { bindForm, setupDropzone } from "/static/js/core.js";

const form = document.getElementById("train-form");
const results = document.getElementById("train-results");
const taskEl = document.getElementById("task");
const metricsEl = document.getElementById("metrics");
const importanceEl = document.getElementById("importance");
const datasetInput = document.getElementById("dataset");
const dropzone = document.getElementById("dataset-dropzone");
const datasetName = document.getElementById("dataset-name");
const browseButton = document.getElementById("dataset-browse");
const resetButton = document.getElementById("train-reset");

function titleCase(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const controller = bindForm(form, {
  pendingText: "Training…",
  successText: "Training complete",
  async onSubmit(formData) {
    if (!datasetInput.files || !datasetInput.files.length) {
      throw new Error("Select a CSV dataset");
    }
    if (!form.target.value.trim()) {
      throw new Error("Provide a target column");
    }
    const response = await fetch("/tabular_ml/api/v1/train", {
      method: "POST",
      body: formData,
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
        li.innerHTML = `<span>${feature}</span><span>${importance.toFixed(4)}</span>`;
        importanceEl.appendChild(li);
      });
    results.hidden = false;
  },
});

controller.setStatus("Drop a CSV to begin", "info");

setupDropzone(dropzone, datasetInput, {
  accept: "text/csv",
  onFiles(files, meta) {
    if (!files.length) {
      if (meta?.rejected?.length) {
        controller.setStatus("Only CSV files are supported", "error");
      }
      datasetName.textContent = "";
      dropzone?.classList.remove("has-file");
      return;
    }
    const [file] = files;
    datasetName.textContent = `Selected: ${file.name}`;
    dropzone?.classList.add("has-file");
    controller.setStatus(`${file.name} ready`, "success");
  },
});

if (browseButton) {
  browseButton.addEventListener("click", () => datasetInput.click());
}

resetButton.addEventListener("click", () => {
  form.reset();
  datasetName.textContent = "";
  dropzone?.classList.remove("has-file");
  controller.setStatus("Ready", "info");
  results.hidden = true;
  metricsEl.innerHTML = "";
  importanceEl.innerHTML = "";
});
