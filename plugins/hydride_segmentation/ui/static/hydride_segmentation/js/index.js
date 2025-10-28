import { downloadBlob } from "/static/js/core.js";

const form = document.getElementById("segment-form");
const statusEl = form.querySelector("[data-role='status']");
const results = document.getElementById("results");
const modelSelect = document.getElementById("model");
const parameterPanel = document.querySelector(".parameters");
const parameterInputs = Array.from(document.querySelectorAll(".parameter-grid input"));
const cropToggle = document.getElementById("crop-enabled");
const cropPercent = document.getElementById("crop-percent");
const resetButton = document.getElementById("reset-params");
const clearButton = document.getElementById("clear-results");
const historyBack = document.getElementById("history-back");
const historyForward = document.getElementById("history-forward");
const historyStatus = document.getElementById("history-status");
const runLog = document.getElementById("run-log");
const brightnessInput = document.getElementById("brightness");
const contrastInput = document.getElementById("contrast");
const downloadBar = document.querySelector(".downloads");

const metricArea = document.getElementById("metric-area");
const metricAreaPercent = document.getElementById("metric-area-percent");
const metricCount = document.getElementById("metric-count");
const inputImage = document.getElementById("input-image");
const maskImage = document.getElementById("mask-image");
const overlayImage = document.getElementById("overlay-image");
const orientationMap = document.getElementById("orientation-map");
const sizeHist = document.getElementById("size-hist");
const angleHist = document.getElementById("angle-hist");
const combinedPanel = document.getElementById("combined-panel");

const defaults = new Map();
parameterInputs.forEach((input) => defaults.set(input.name, input.value));
defaults.set("crop_enabled", cropToggle.checked);
defaults.set("model", modelSelect.value);
defaults.set("brightness", brightnessInput.value);
defaults.set("contrast", contrastInput.value);

const history = [];
let historyIndex = -1;
let currentImages = {};

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function toDataUrl(data) {
  return `data:image/png;base64,${data}`;
}

function updateTone() {
  const brightnessFactor = (Number(brightnessInput.value) + 100) / 100;
  const contrastFactor = Number(contrastInput.value) / 100;
  inputImage.style.filter = `brightness(${brightnessFactor}) contrast(${contrastFactor})`;
}

function renderResult(payload) {
  currentImages = {
    input: payload.input_png_b64,
    mask: payload.mask_png_b64,
    overlay: payload.overlay_png_b64,
    orientation: payload.analysis.orientation_map_png_b64,
    combined: payload.analysis.combined_panel_png_b64,
  };

  inputImage.src = toDataUrl(payload.input_png_b64);
  maskImage.src = toDataUrl(payload.mask_png_b64);
  overlayImage.src = toDataUrl(payload.overlay_png_b64);
  orientationMap.src = toDataUrl(payload.analysis.orientation_map_png_b64);
  sizeHist.src = toDataUrl(payload.analysis.size_histogram_png_b64);
  angleHist.src = toDataUrl(payload.analysis.angle_histogram_png_b64);
  combinedPanel.src = toDataUrl(payload.analysis.combined_panel_png_b64);

  const fraction = payload.metrics.mask_area_fraction ?? 0;
  metricArea.textContent = fraction.toFixed(4);
  metricAreaPercent.textContent = `(${payload.metrics.mask_area_fraction_percent.toFixed(2)}%)`;
  metricCount.textContent = payload.metrics.hydride_count;

  runLog.innerHTML = "";
  payload.logs.forEach((line, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${line}`;
    runLog.appendChild(item);
  });

  brightnessInput.value = defaults.get("brightness");
  contrastInput.value = defaults.get("contrast");
  updateTone();

  results.hidden = false;
}

function updateHistoryControls() {
  historyBack.disabled = historyIndex <= 0;
  historyForward.disabled = historyIndex === -1 || historyIndex >= history.length - 1;
  historyStatus.textContent = history.length
    ? `Result ${historyIndex + 1} of ${history.length}`
    : "";
}

function applyHistory(index) {
  const payload = history[index];
  if (payload) {
    renderResult(payload);
    updateHistoryControls();
  }
}

function pushHistory(payload) {
  if (historyIndex < history.length - 1) {
    history.splice(historyIndex + 1);
  }
  history.push(payload);
  historyIndex = history.length - 1;
  applyHistory(historyIndex);
}

function clearResults() {
  history.length = 0;
  historyIndex = -1;
  currentImages = {};
  results.hidden = true;
  runLog.innerHTML = "";
  updateHistoryControls();
}

function base64ToBlob(data) {
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: "image/png" });
}

function toggleParameters() {
  const disabled = modelSelect.value === "ml";
  parameterPanel.classList.toggle("is-disabled", disabled);
  parameterInputs.forEach((input) => {
    input.disabled = disabled;
  });
  cropToggle.disabled = disabled;
  cropPercent.disabled = disabled || !cropToggle.checked;
}

toggleParameters();

modelSelect.addEventListener("change", toggleParameters);

cropToggle.addEventListener("change", () => {
  cropPercent.disabled = !cropToggle.checked;
  if (!cropToggle.checked) {
    cropPercent.value = defaults.get("crop_percent");
  }
});

resetButton.addEventListener("click", () => {
  parameterInputs.forEach((input) => {
    input.value = defaults.get(input.name);
  });
  cropToggle.checked = defaults.get("crop_enabled");
  cropPercent.disabled = !cropToggle.checked;
  if (!cropToggle.checked) {
    cropPercent.value = defaults.get("crop_percent");
  }
  modelSelect.value = defaults.get("model");
  toggleParameters();
  setStatus("Parameters reset to defaults");
});

clearButton.addEventListener("click", () => {
  clearResults();
  form.reset();
  parameterInputs.forEach((input) => {
    input.value = defaults.get(input.name);
  });
  cropToggle.checked = defaults.get("crop_enabled");
  cropPercent.disabled = !cropToggle.checked;
  cropPercent.value = defaults.get("crop_percent");
  modelSelect.value = defaults.get("model");
  toggleParameters();
  setStatus("Cleared");
});

historyBack.addEventListener("click", () => {
  if (historyIndex > 0) {
    historyIndex -= 1;
    applyHistory(historyIndex);
  }
});

historyForward.addEventListener("click", () => {
  if (historyIndex < history.length - 1) {
    historyIndex += 1;
    applyHistory(historyIndex);
  }
});

brightnessInput.addEventListener("input", updateTone);
contrastInput.addEventListener("input", updateTone);

downloadBar.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-download]");
  if (!button) {
    return;
  }
  const key = button.getAttribute("data-download");
  const data = currentImages[key];
  if (!data) {
    return;
  }
  const blob = base64ToBlob(data);
  const filename = `${key || "output"}.png`;
  downloadBlob(blob, filename);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("image");
  if (!fileInput.files || fileInput.files.length === 0) {
    setStatus("Select an image first");
    return;
  }

  const formData = new FormData();
  const file = fileInput.files[0];
  formData.append("image", file, file.name);
  formData.append("model", modelSelect.value);

  if (modelSelect.value !== "ml") {
    parameterInputs.forEach((input) => {
      formData.append(input.name, input.value);
    });
    if (cropToggle.checked) {
      formData.append("crop_enabled", "on");
    }
  }

  setStatus("Processing…");
  try {
    const response = await fetch("/hydride_segmentation/api/v1/segment", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Segmentation failed");
    }
    const payload = await response.json();
    pushHistory(payload);
    setStatus("Done");
  } catch (error) {
    setStatus(error.message);
  }
});
