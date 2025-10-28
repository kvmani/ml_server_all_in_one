import { bindForm } from "/static/js/core.js";

const form = document.getElementById("train-form");
const results = document.getElementById("train-results");
const taskEl = document.getElementById("task");
const metricsEl = document.getElementById("metrics");
const importanceEl = document.getElementById("importance");

bindForm(form, {
  async onSubmit(formData) {
    const response = await fetch("/tabular_ml/api/v1/train", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Training failed");
    }
    taskEl.textContent = `Task: ${data.task}`;
    metricsEl.innerHTML = "";
    Object.entries(data.metrics).forEach(([key, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = value.toFixed(4);
      metricsEl.appendChild(dt);
      metricsEl.appendChild(dd);
    });
    importanceEl.innerHTML = "";
    Object.entries(data.feature_importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([feature, importance]) => {
        const li = document.createElement("li");
        li.textContent = `${feature}: ${importance.toFixed(4)}`;
        importanceEl.appendChild(li);
      });
    results.hidden = false;
  },
});
