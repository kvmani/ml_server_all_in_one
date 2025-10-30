import { downloadBlob, setupDropzone } from "/static/js/core.js";

const mergeForm = document.getElementById("merge-form");
const mergeDropzone = document.getElementById("merge-dropzone");
const mergePicker = document.getElementById("merge-picker");
const addMergeButton = document.getElementById("add-merge-files");
const mergeEntries = document.getElementById("merge-entries");
const mergeStatus = document.getElementById("merge-status");
const mergeOutput = document.getElementById("merge-output");
const clearMergeButton = document.getElementById("clear-merge");

const splitForm = document.getElementById("split-form");
const splitDropzone = document.getElementById("split-dropzone");
const splitBrowseButton = document.getElementById("split-browse");
const splitStatus = document.getElementById("split-status");
const splitResults = document.getElementById("split-results");
const splitList = splitResults.querySelector("ul");
const splitFileInput = document.getElementById("split-file");

let counter = 0;
const entryMap = new Map();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const mergeLimitCount = parseNumber(mergeDropzone?.dataset.maxFiles, 10);
const mergeLimitMb = parseNumber(mergeDropzone?.dataset.maxMb, 5);
const mergeLimitBytes = mergeLimitMb * 1024 * 1024;

function setMergeStatus(message, type = "info") {
  mergeStatus.textContent = message;
  if (message) {
    mergeStatus.dataset.status = type;
  } else {
    delete mergeStatus.dataset.status;
  }
}

function setSplitStatus(message, type = "info") {
  splitStatus.textContent = message;
  if (message) {
    splitStatus.dataset.status = type;
  } else {
    delete splitStatus.dataset.status;
  }
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

function pdfViewerUrl(url, params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`);
  if (!entries.length) {
    return url;
  }
  return `${url}#${entries.join("&")}`;
}

function renderThumbnail(entry, url, filename) {
  const frame = entry.querySelector(".merge-entry__thumbnail iframe");
  if (!frame) {
    return;
  }
  frame.src = pdfViewerUrl(url, {
    page: 1,
    view: "FitH",
    toolbar: 0,
    navpanes: 0,
    statusbar: 0,
  });
  frame.title = `First page preview of ${filename}`;
}

function ensurePreview(entry, url, filename) {
  const preview = entry.querySelector(".merge-entry__preview");
  if (!preview) {
    return false;
  }
  const frame = preview.querySelector("iframe");
  if (!frame) {
    return false;
  }
  if (!frame.dataset.loaded) {
    frame.src = pdfViewerUrl(url, { page: 1, view: "FitH" });
    frame.title = `Detailed preview of ${filename}`;
    frame.dataset.loaded = "true";
  }
  const hidden = preview.hasAttribute("hidden");
  if (hidden) {
    preview.removeAttribute("hidden");
  } else {
    preview.setAttribute("hidden", "");
  }
  return hidden;
}

function renderMetadata(details, metadata, file) {
  if (!details) {
    return;
  }
  if (metadata) {
    details.dataset.state = "ready";
    const sizeBytes = Number(metadata.size_bytes);
    const pages = Number(metadata.pages);
    const sizeLabel = Number.isFinite(sizeBytes) ? humanSize(sizeBytes) : humanSize(file.size);
    const pageLabel = Number.isFinite(pages) ? pages : "—";
    details.innerHTML = `
      <dl class="merge-entry__meta-grid">
        <div>
          <dt>Pages</dt>
          <dd>${pageLabel}</dd>
        </div>
        <div>
          <dt>File size</dt>
          <dd>${sizeLabel}</dd>
        </div>
      </dl>
    `;
  } else {
    details.dataset.state = "error";
    details.innerHTML = '<p class="merge-entry__details-text">Unable to read PDF details. The file may be encrypted.</p>';
  }
}

async function requestMetadata(id) {
  const item = entryMap.get(id);
  if (!item) {
    return;
  }
  const details = item.element.querySelector(".merge-entry__details");
  if (!details) {
    return;
  }
  details.dataset.state = "loading";
  details.innerHTML = '<p class="merge-entry__details-text">Reading PDF metadata…</p>';
  const formData = new FormData();
  formData.append("file", item.file, item.file.name);
  try {
    const response = await fetch("/pdf_tools/api/v1/metadata", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Metadata request failed");
    }
    const payload = await response.json();
    item.metadata = payload;
    renderMetadata(details, payload, item.file);
  } catch (error) {
    console.error(error); // eslint-disable-line no-console
    item.metadata = null;
    renderMetadata(details, null, item.file);
  }
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
        <button type="button" data-action="preview" aria-pressed="false">Preview</button>
        <button type="button" data-action="up" aria-label="Move up">↑</button>
        <button type="button" data-action="down" aria-label="Move down">↓</button>
        <button type="button" data-action="remove" aria-label="Remove">Remove</button>
      </div>
    </div>
    <div class="merge-entry__layout">
      <div class="merge-entry__thumbnail" aria-hidden="true">
        <iframe loading="lazy"></iframe>
      </div>
      <div class="merge-entry__content">
        <div class="merge-entry__details" data-state="loading" aria-live="polite">
          <p class="merge-entry__details-text">Reading PDF metadata…</p>
        </div>
        <label>Page range <span class="form-field__hint">Use “all” or ranges like 1-3,5</span>
          <input type="text" name="range" value="all" placeholder="e.g. 1-3,5">
        </label>
        <div class="merge-entry__preview" hidden>
          <iframe loading="lazy"></iframe>
        </div>
      </div>
    </div>
  `;

  mergeEntries.appendChild(entry);
  entryMap.set(id, { file, url, element: entry, metadata: undefined });
  renderThumbnail(entry, url, file.name);
  mergeDropzone?.classList.add("has-file");
  requestMetadata(id);
}

function clearEntries() {
  entryMap.forEach(({ url }) => URL.revokeObjectURL(url));
  entryMap.clear();
  mergeEntries.innerHTML = "";
  setMergeStatus("Merge queue cleared", "info");
  mergeDropzone?.classList.remove("has-file");
}

function handleIncomingFiles(files) {
  const accepted = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (!accepted.length) {
    setMergeStatus("Only PDF files are supported", "error");
    return;
  }

  const result = {
    added: 0,
    oversized: 0,
    limited: false,
  };

  accepted.forEach((file) => {
    if (result.added + entryMap.size >= mergeLimitCount) {
      result.limited = true;
      return;
    }
    if (file.size > mergeLimitBytes) {
      result.oversized += 1;
      return;
    }
    addEntry(file);
    result.added += 1;
  });

  mergePicker.value = "";

  if (result.added && !result.oversized && !result.limited) {
    setMergeStatus(`${entryMap.size} file(s) queued`, "success");
    return;
  }

  const messages = [];
  if (result.added) {
    messages.push(`${result.added} file(s) added`);
  }
  if (result.oversized) {
    messages.push(`Skipped ${result.oversized} over ${mergeLimitMb} MB each`);
  }
  if (result.limited) {
    messages.push(`Limit of ${mergeLimitCount} files reached`);
  }

  if (messages.length) {
    setMergeStatus(messages.join(". "), result.added ? "warning" : "error");
  } else {
    setMergeStatus("No new files were added", "error");
  }
}

setMergeStatus(`Drop up to ${mergeLimitCount} PDFs (${mergeLimitMb} MB each) to begin`, "info");
setSplitStatus("Drop a PDF to split", "info");

if (addMergeButton) {
  addMergeButton.addEventListener("click", () => {
    mergePicker.click();
  });
}

if (clearMergeButton) {
  clearMergeButton.addEventListener("click", () => {
    clearEntries();
  });
}

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
    setMergeStatus(`${entryMap.size} file(s) queued`, entryMap.size ? "info" : "warning");
    if (!entryMap.size) {
      mergeDropzone?.classList.remove("has-file");
    }
  } else if (action === "preview") {
    const isVisible = ensurePreview(entry, item.url, item.file.name);
    button.textContent = isVisible ? "Hide preview" : "Preview";
    button.setAttribute("aria-pressed", String(isVisible));
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

setupDropzone(mergeDropzone, mergePicker, {
  accept: "application/pdf",
  onFiles(files, meta) {
    if (!files.length) {
      if (meta?.rejected?.length) {
        setMergeStatus("Only PDF files are supported", "error");
      }
      if (!entryMap.size) {
        mergeDropzone?.classList.remove("has-file");
      }
      return;
    }
    handleIncomingFiles(files);
  },
});

if (mergeForm) {
  mergeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entries = Array.from(mergeEntries.children);
    if (!entries.length) {
      setMergeStatus("Add at least one PDF", "error");
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
      setMergeStatus("Add at least one PDF", "error");
      return;
    }

    formData.append("manifest", JSON.stringify(manifest));
    const outputName = mergeOutput.value.trim() || "merged.pdf";
    if (!outputName.toLowerCase().endsWith(".pdf")) {
      setMergeStatus("Output name must end with .pdf", "error");
      return;
    }
    formData.append("output_name", outputName);

    setMergeStatus("Merging…", "progress");
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
      const filename = parseDisposition(response.headers.get("Content-Disposition")) || outputName;
      downloadBlob(blob, filename);
      setMergeStatus(`Downloaded ${filename}`, "success");
    } catch (error) {
      setMergeStatus(error instanceof Error ? error.message : "Merge failed", "error");
    }
  });
}

setupDropzone(splitDropzone, splitFileInput, {
  accept: "application/pdf",
  onFiles(files, meta) {
    if (!files.length) {
      if (meta?.rejected?.length) {
        setSplitStatus("Only PDF files are supported", "error");
      }
      splitDropzone?.classList.remove("has-file");
      return;
    }
    setSplitStatus(`${files[0].name} ready to split`, "success");
    splitDropzone?.classList.add("has-file");
    splitResults.hidden = true;
    splitList.innerHTML = "";
  },
});

if (splitBrowseButton) {
  splitBrowseButton.addEventListener("click", () => splitFileInput.click());
}

if (splitForm) {
  splitForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!splitFileInput.files || !splitFileInput.files.length) {
      setSplitStatus("Select a PDF file", "error");
      return;
    }
    const formData = new FormData();
    const file = splitFileInput.files[0];
    formData.append("file", file, file.name);

    setSplitStatus("Splitting…", "progress");
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
      setSplitStatus(`Created ${payload.pages.length} page(s)`, "success");
      splitDropzone?.classList.remove("has-file");
    } catch (error) {
      setSplitStatus(error instanceof Error ? error.message : "Split failed", "error");
    }
  });
}
