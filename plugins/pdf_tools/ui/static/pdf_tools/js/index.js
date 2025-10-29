import { downloadBlob } from "/static/js/core.js";

const mergeForm = document.getElementById("merge-form");
const mergePicker = document.getElementById("merge-picker");
const addMergeButton = document.getElementById("add-merge-files");
const mergeEntries = document.getElementById("merge-entries");
const mergeStatus = document.getElementById("merge-status");
const mergeOutput = document.getElementById("merge-output");
const clearMergeButton = document.getElementById("clear-merge");

const splitForm = document.getElementById("split-form");
const splitStatus = document.getElementById("split-status");
const splitResults = document.getElementById("split-results");
const splitList = splitResults.querySelector("ul");

let counter = 0;
const entryMap = new Map();

function setMergeStatus(message) {
  mergeStatus.textContent = message;
}

function setSplitStatus(message) {
  splitStatus.textContent = message;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDisposition(header) {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

function ensurePreview(entry, url) {
  const preview = entry.querySelector(".merge-entry__preview");
  const frame = preview.querySelector("iframe");
  if (!frame.src) {
    frame.src = url;
  }
  preview.hidden = !preview.hidden;
}

function addEntry(file) {
  const id = `merge-${counter}`;
  counter += 1;
  const url = URL.createObjectURL(file);

  const entry = document.createElement("article");
  entry.className = "merge-entry";
  entry.dataset.id = id;
  entry.innerHTML = `
    <div class="merge-entry__header">
      <div>
        <strong>${file.name}</strong>
        <span class="merge-entry__meta">${humanSize(file.size)}</span>
      </div>
      <div class="merge-entry__actions">
        <button type="button" data-action="preview">Preview</button>
        <button type="button" data-action="up" aria-label="Move up">↑</button>
        <button type="button" data-action="down" aria-label="Move down">↓</button>
        <button type="button" data-action="remove" aria-label="Remove">Remove</button>
      </div>
    </div>
    <label>Page range
      <input type="text" name="range" value="all" placeholder="e.g. 1-3,5">
    </label>
    <div class="merge-entry__preview" hidden>
      <iframe title="Preview of ${file.name}"></iframe>
    </div>
  `;

  mergeEntries.appendChild(entry);
  entryMap.set(id, { file, url, element: entry });
  setMergeStatus(`${entryMap.size} file(s) queued`);
}

function clearEntries() {
  entryMap.forEach(({ url }) => URL.revokeObjectURL(url));
  entryMap.clear();
  mergeEntries.innerHTML = "";
  setMergeStatus("Merge queue cleared");
}

addMergeButton.addEventListener("click", () => {
  mergePicker.click();
});

mergePicker.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  files.forEach((file) => addEntry(file));
  mergePicker.value = "";
});

clearMergeButton.addEventListener("click", () => {
  clearEntries();
});

mergeEntries.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const entry = button.closest(".merge-entry");
  const id = entry.dataset.id;
  const item = entryMap.get(id);
  const action = button.getAttribute("data-action");

  if (action === "remove") {
    URL.revokeObjectURL(item.url);
    entryMap.delete(id);
    entry.remove();
    setMergeStatus(`${entryMap.size} file(s) queued`);
  } else if (action === "preview") {
    ensurePreview(entry, item.url);
  } else if (action === "up" && entry.previousElementSibling) {
    mergeEntries.insertBefore(entry, entry.previousElementSibling);
  } else if (action === "down" && entry.nextElementSibling) {
    mergeEntries.insertBefore(entry.nextElementSibling, entry);
  }
});

function base64ToBlob(data, mime = "application/pdf") {
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

mergeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entries = Array.from(mergeEntries.children);
  if (!entries.length) {
    setMergeStatus("Add at least one PDF");
    return;
  }

  const formData = new FormData();
  const manifest = [];

  entries.forEach((entry, index) => {
    const id = entry.dataset.id;
    const item = entryMap.get(id);
    if (!item) {
      return;
    }
    const field = `file-${index}`;
    const rangeInput = entry.querySelector('input[name="range"]');
    formData.append(field, item.file, item.file.name);
    manifest.push({
      field,
      filename: item.file.name,
      pages: (rangeInput.value || "all").trim() || "all",
    });
  });

  if (!manifest.length) {
    setMergeStatus("Add at least one PDF");
    return;
  }

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("output_name", mergeOutput.value.trim() || "merged.pdf");

  setMergeStatus("Merging…");
  try {
    const response = await fetch("/pdf_tools/api/v1/merge", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Merge failed");
    }
    const blob = await response.blob();
    const filename = parseDisposition(response.headers.get("Content-Disposition")) || "merged.pdf";
    downloadBlob(blob, filename);
    setMergeStatus(`Downloaded ${filename}`);
  } catch (error) {
    setMergeStatus(error.message);
  }
});

splitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("split-file");
  if (!fileInput.files || !fileInput.files.length) {
    setSplitStatus("Select a PDF file");
    return;
  }
  const formData = new FormData();
  const file = fileInput.files[0];
  formData.append("file", file, file.name);

  setSplitStatus("Splitting…");
  try {
    const response = await fetch("/pdf_tools/api/v1/split", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Split failed");
    }
    const payload = await response.json();
    splitList.innerHTML = "";
    payload.pages.forEach((encoded, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.textContent = `Download page ${index + 1}`;
      button.addEventListener("click", () => {
        const blob = base64ToBlob(encoded);
        downloadBlob(blob, `page-${index + 1}.pdf`);
      });
      item.appendChild(button);
      splitList.appendChild(item);
    });
    splitResults.hidden = false;
    setSplitStatus(`Created ${payload.pages.length} page(s)`);
  } catch (error) {
    setSplitStatus(error.message);
  }
});
