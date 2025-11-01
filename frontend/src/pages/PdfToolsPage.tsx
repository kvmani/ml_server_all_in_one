import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfToolsIcon from "../assets/pdf_tools_icon.png";
import { Dropzone } from "../components/Dropzone";
import { SettingsModal, type SettingsField } from "../components/SettingsModal";
import { StatusMessage } from "../components/StatusMessage";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { useToolSettings } from "../hooks/useToolSettings";
import { apiFetch } from "../utils/api";
import { base64ToBlob, downloadBlob } from "../utils/files";
import "../styles/pdf_tools.css";

const MERGE_CONTEXT = "PDF Tools · Merge";
const SPLIT_CONTEXT = "PDF Tools · Split";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MergeMetadata = {
  pages?: number;
  size_bytes?: number;
};

type MergeEntry = {
  id: string;
  file: File;
  url: string;
  range: string;
  metadata?: MergeMetadata | null;
  previewVisible: boolean;
};

type PdfPluginConfig = {
  merge_upload?: { max_files?: number; max_mb?: number };
  split_upload?: { max_mb?: number };
};

type PdfToolPreferences = {
  defaultOutputName: string;
  autoDownload: boolean;
  fetchMetadata: boolean;
};

function parseLimit(raw?: { max_files?: number; max_mb?: number }, defaults: { files: number; mb: number }) {
  return {
    maxFiles: Math.max(1, Number(raw?.max_files) || defaults.files),
    maxMb: Math.max(1, Number(raw?.max_mb) || defaults.mb),
  };
}

async function requestMetadata(file: File): Promise<MergeMetadata | null> {
  const form = new FormData();
  form.append("file", file, file.name);
  try {
    return await apiFetch<MergeMetadata>("/api/pdf_tools/metadata", { method: "POST", body: form });
  } catch (error) {
    return null;
  }
}

async function postMerge(entries: MergeEntry[], outputName: string) {
  const form = new FormData();
  const manifest = entries.map((entry, index) => {
    const field = `file-${index}`;
    form.append(field, entry.file, entry.file.name);
    return {
      field,
      filename: entry.file.name,
      pages: (entry.range || "all").trim() || "all",
    };
  });
  form.append("manifest", JSON.stringify(manifest));
  form.append("output_name", outputName);
  return apiFetch<{ filename: string; pdf_base64: string; total_files: number }>("/api/pdf_tools/merge", {
    method: "POST",
    body: form,
  });
}

async function postSplit(file: File): Promise<string[]> {
  const form = new FormData();
  form.append("file", file, file.name);
  const payload = await apiFetch<{ pages: string[] }>("/api/pdf_tools/split", { method: "POST", body: form });
  return payload.pages || [];
}

export default function PdfToolsPage() {
  const pluginConfig = usePluginSettings<PdfPluginConfig>("pdf_tools", {});
  const mergeLimit = useMemo(
    () => parseLimit(pluginConfig.merge_upload, { files: 10, mb: 5 }),
    [pluginConfig.merge_upload],
  );
  const splitLimit = useMemo(
    () => parseLimit(pluginConfig.split_upload, { files: 1, mb: 5 }),
    [pluginConfig.split_upload],
  );
  const queueMessage = `Drop up to ${mergeLimit.maxFiles} PDFs (${mergeLimit.maxMb} MB each) to begin`;
  const splitMessage = "Drop a PDF to split";
  const helpHref = "/help/pdf_tools";

  const { withLoader } = useLoading();
  const { settings: preferences, updateSetting, resetSettings } = useToolSettings<PdfToolPreferences>(
    "pdf_tools",
    {
      defaultOutputName: "merged.pdf",
      autoDownload: true,
      fetchMetadata: true,
    },
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastMerged, setLastMerged] = useState<{ blob: Blob; filename: string } | null>(null);
  const [outputName, setOutputName] = useState(preferences.defaultOutputName);

  const [entries, setEntries] = useState<MergeEntry[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitPages, setSplitPages] = useState<string[]>([]);
  const mergeStatus = useStatus({ message: queueMessage, level: "info" }, { context: MERGE_CONTEXT });
  const splitStatus = useStatus({ message: splitMessage, level: "info" }, { context: SPLIT_CONTEXT });
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const splitPickerRef = useRef<HTMLInputElement | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    setOutputName(preferences.defaultOutputName);
  }, [preferences.defaultOutputName]);

  useEffect(() => {
    if (preferences.autoDownload && lastMerged) {
      setLastMerged(null);
    }
  }, [lastMerged, preferences.autoDownload]);

  const settingsFields = useMemo<SettingsField[]>(
    () => [
      {
        key: "defaultOutputName",
        label: "Default merge filename",
        type: "text",
        placeholder: "merged.pdf",
        description: "Applied when the output field is left blank. Extension is enforced automatically.",
      },
      {
        key: "autoDownload",
        label: "Auto-download merged PDFs",
        type: "boolean",
        description:
          "When enabled the merged file is saved immediately. Disable to keep downloads in the workspace queue.",
      },
      {
        key: "fetchMetadata",
        label: "Fetch PDF metadata",
        type: "boolean",
        description: "Toggle per-file page count and size analysis after uploading.",
      },
    ],
    [],
  );

  const addEntries = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        mergeStatus.setStatus("Unsupported file format. Please upload PDF files only.", "error");
        return;
      }
      const next: MergeEntry[] = [];
      const messages: string[] = [];
      for (const file of files) {
        if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
          continue;
        }
        if (entries.length + next.length >= mergeLimit.maxFiles) {
          messages.push(`Limit of ${mergeLimit.maxFiles} files reached`);
          break;
        }
        if (file.size > mergeLimit.maxMb * 1024 * 1024) {
          messages.push(`Skipped ${file.name} over ${mergeLimit.maxMb} MB`);
          continue;
        }
        const id = `merge-${(counterRef.current += 1)}`;
        const entry: MergeEntry = {
          id,
          file,
          url: URL.createObjectURL(file),
          range: "all",
          metadata: undefined,
          previewVisible: false,
        };
        next.push(entry);
      }

      if (next.length) {
        setEntries((current) => [...current, ...next]);
        mergeStatus.setStatus(`${entries.length + next.length} file(s) queued`, "success");
      } else if (messages.length) {
        mergeStatus.setStatus(messages.join(". "), "warning");
      } else {
        mergeStatus.setStatus("No new files were added", "error");
      }
    },
    [entries.length, mergeLimit.maxFiles, mergeLimit.maxMb, mergeStatus],
  );

  useEffect(() => {
    if (!preferences.fetchMetadata) {
      return;
    }
    const pending = entries.filter((entry) => entry.metadata === undefined);
    if (!pending.length) {
      return;
    }
    pending.forEach((entry) => {
      requestMetadata(entry.file)
        .then((metadata) => {
          setEntries((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, metadata } : item)),
          );
        })
        .catch(() => {
          setEntries((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, metadata: null } : item)),
          );
        });
    });
  }, [entries, preferences.fetchMetadata]);

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      addEntries(files);
      event.target.value = "";
    },
    [addEntries],
  );

  const handleMergeDrop = useCallback(
    (files: FileList) => {
      addEntries(Array.from(files || []));
    },
    [addEntries],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((current) => {
      const next = current.filter((entry) => {
        if (entry.id === id) {
          URL.revokeObjectURL(entry.url);
          return false;
        }
        return true;
      });
      mergeStatus.setStatus(`${next.length} file(s) queued`, next.length ? "info" : "warning");
      return next;
    });
  }, [mergeStatus]);

  const moveEntry = useCallback((id: string, direction: -1 | 1) => {
    setEntries((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      if (index === -1) {
        return current;
      }
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const togglePreview = useCallback((id: string) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, previewVisible: !entry.previewVisible } : entry,
      ),
    );
  }, []);

  const updateRange = useCallback((id: string, value: string) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, range: value } : entry)));
  }, []);

  const clearEntries = useCallback(() => {
    setEntries((current) => {
      current.forEach((entry) => URL.revokeObjectURL(entry.url));
      return [];
    });
    mergeStatus.setStatus("Merge queue cleared", "info");
  }, [mergeStatus]);

  const onMergeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!entries.length) {
        mergeStatus.setStatus("Add at least one PDF", "error");
        return;
      }
      const trimmed = (outputName || preferences.defaultOutputName || "merged.pdf").trim();
      const safeName = trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
      mergeStatus.setStatus("Merge in progress. Please wait…", "progress");
      try {
        const result = await withLoader(() => postMerge(entries, safeName));
        const blob = base64ToBlob(result.pdf_base64, "application/pdf");
        const filename = result.filename || safeName;
        if (preferences.autoDownload) {
          downloadBlob(blob, filename);
          setLastMerged(null);
          mergeStatus.setStatus(`Merged PDF saved as ${filename}`, "success");
        } else {
          setLastMerged({ blob, filename });
          mergeStatus.setStatus(`Merged PDF ready: ${filename}`, "success");
        }
      } catch (error) {
        mergeStatus.setStatus(error instanceof Error ? error.message : "Merge failed", "error");
      }
    },
    [entries, mergeStatus, outputName, preferences.autoDownload, preferences.defaultOutputName, withLoader],
  );

  const onSplitDrop = useCallback(
    (files: FileList) => {
      const list = Array.from(files || []);
      if (!list.length) {
        return;
      }
      const file = list[0];
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        splitStatus.setStatus("Unsupported file format. Please upload PDF files only.", "error");
        return;
      }
      if (file.size > splitLimit.maxMb * 1024 * 1024) {
        splitStatus.setStatus(`File exceeds ${splitLimit.maxMb} MB limit`, "error");
        return;
      }
      setSplitFile(file);
      setSplitPages([]);
      splitStatus.setStatus(`Loaded ${file.name}. Segmenting pages soon.`, "info");
    },
    [splitLimit.maxMb, splitStatus],
  );

  const onSplitChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (file.size > splitLimit.maxMb * 1024 * 1024) {
        splitStatus.setStatus(`File exceeds ${splitLimit.maxMb} MB limit`, "error");
        event.target.value = "";
        return;
      }
      setSplitFile(file);
      setSplitPages([]);
      splitStatus.setStatus(`Loaded ${file.name}. Segmenting pages soon.`, "info");
      event.target.value = "";
    },
    [splitLimit.maxMb, splitStatus],
  );

  const onSplitSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!splitFile) {
        splitStatus.setStatus("Select a PDF file before splitting", "error");
        return;
      }
      splitStatus.setStatus("Splitting PDF pages. Please wait…", "progress");
      try {
        const pages = await withLoader(() => postSplit(splitFile));
        setSplitPages(pages);
        splitStatus.setStatus(`Pages ready to download (${pages.length})`, "success");
      } catch (error) {
        splitStatus.setStatus(error instanceof Error ? error.message : "Split failed", "error");
      }
    },
    [splitFile, splitStatus, withLoader],
  );

  return (
    <section className="shell surface-block pdf-shell" aria-labelledby="pdf-tools-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={pdfToolsIcon}
            titleId="pdf-tools-title"
            category="Document Utilities"
            title="PDF toolkit workspace"
            summary="Reorder, merge, and split PDF documents entirely in-memory. Drag files into the workspace to queue them, define page ranges with inline validation, and export results instantly."
            bullets={[
              "Supports drag & drop or secure file browsing",
              "Granular page ranges with per-file tooltips",
              "Instant first-page thumbnails with inline full previews",
              "Instant downloads without server persistence",
            ]}
            actions={
              <>
                <button className="btn btn--ghost" type="button" onClick={() => setSettingsOpen(true)}>
                  ⚙️ Settings
                </button>
                <a className="btn btn--subtle" data-keep-theme href={typeof helpHref === "string" ? helpHref : "/help/pdf_tools"}>
                  Read PDF guide
                </a>
              </>
            }
            footer={
              <div className="surface-muted">
                <p className="form-field__hint">
                  Merge up to {mergeLimit.maxFiles} PDFs ({mergeLimit.maxMb} MB each). Split accepts one PDF up to {splitLimit.maxMb} MB.
                </p>
                <div className="tag-list">
                  <span className="badge">Offline merge</span>
                  <span className="badge">Queue reordering</span>
                </div>
              </div>
            }
          />
        }
        workspace={
          <div className="tool-shell__workspace">
            <form id="merge-form" className="surface-muted merge-panel" aria-describedby="merge-status" onSubmit={onMergeSubmit}>
              <header className="merge-panel__header">
                <div>
                  <p className="tool-card__category">Merge PDFs</p>
                  <h2 className="form-section__title">Build a combined document</h2>
                </div>
                <div className="merge-output">
                  <label className="form-field__label" htmlFor="merge-output">
                    Output filename
                    <button
                      type="button"
                      className="tooltip-trigger"
                      aria-label="Output filename help"
                      data-tooltip={`Use .pdf extension. Default name is ${preferences.defaultOutputName}.`}
                    >
                      ?
                    </button>
                  </label>
                  <input
                    id="merge-output"
                    type="text"
                    value={outputName}
                    onChange={(event) => setOutputName(event.target.value)}
                    placeholder={preferences.defaultOutputName}
                    autoComplete="off"
                  />
                </div>
            </header>

            <Dropzone
              id="merge-dropzone"
              hasFile={Boolean(entries.length)}
              data-max-files={mergeLimit.maxFiles}
              data-max-mb={mergeLimit.maxMb}
              onDropFiles={handleMergeDrop}
              copy={
                <>
                  <h3 className="section-heading">Drop PDFs to queue</h3>
                  <p className="dropzone__hint">
                    Drag up to {mergeLimit.maxFiles} PDFs ({mergeLimit.maxMb} MB each) or use the Add files button.
                  </p>
                </>
              }
              actions={
                <>
                  <button className="btn" type="button" id="add-merge-files" onClick={() => pickerRef.current?.click()}>
                    Add files
                  </button>
                  <button className="btn btn--ghost" type="button" id="clear-merge" onClick={clearEntries}>
                    Clear queue
                  </button>
                </>
              }
            >
              <input
                id="merge-picker"
                ref={pickerRef}
                type="file"
                accept="application/pdf"
                multiple
                className="visually-hidden"
                onChange={handleFileInput}
              />
            </Dropzone>

            <div id="merge-entries" className="merge-entries" aria-live="polite">
              {entries.map((entry, index) => (
                <article key={entry.id} className="merge-entry" data-id={entry.id}>
                  <div className="merge-entry__header">
                    <div>
                      <strong>{entry.file.name}</strong>
                      <span className="merge-entry__meta">{humanSize(entry.file.size)}</span>
                    </div>
                    <div className="merge-entry__actions">
                      <button
                        type="button"
                        data-action="preview"
                        aria-pressed={entry.previewVisible}
                        onClick={() => togglePreview(entry.id)}
                      >
                        {entry.previewVisible ? "Hide preview" : "Preview"}
                      </button>
                      <button type="button" data-action="up" aria-label="Move up" onClick={() => moveEntry(entry.id, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        data-action="down"
                        aria-label="Move down"
                        onClick={() => moveEntry(entry.id, 1)}
                        disabled={index === entries.length - 1}
                      >
                        ↓
                      </button>
                      <button type="button" data-action="remove" aria-label="Remove" onClick={() => removeEntry(entry.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="merge-entry__layout">
                    <div className="merge-entry__thumbnail" aria-hidden="true">
                      <iframe
                        title={`First page preview of ${entry.file.name}`}
                        loading="lazy"
                        src={`${entry.url}#page=1&view=FitH&toolbar=0&navpanes=0&statusbar=0`}
                      ></iframe>
                    </div>
                    <div className="merge-entry__content">
                      <div
                        className="merge-entry__details"
                        data-state={
                          !preferences.fetchMetadata
                            ? "disabled"
                            : entry.metadata === undefined
                              ? "loading"
                              : entry.metadata
                                ? "ready"
                                : "error"
                        }
                        aria-live="polite"
                      >
                        {!preferences.fetchMetadata ? (
                          <p className="merge-entry__details-text">Metadata fetching disabled in settings.</p>
                        ) : null}
                        {preferences.fetchMetadata && entry.metadata === undefined && (
                          <p className="merge-entry__details-text">Reading PDF metadata…</p>
                        )}
                        {preferences.fetchMetadata && entry.metadata && (
                          <dl className="merge-entry__meta-grid">
                            <div>
                              <dt>Pages</dt>
                              <dd>{entry.metadata.pages ?? "—"}</dd>
                            </div>
                            <div>
                              <dt>File size</dt>
                              <dd>{humanSize(entry.metadata.size_bytes ?? entry.file.size)}</dd>
                            </div>
                          </dl>
                        )}
                        {preferences.fetchMetadata && entry.metadata === null && (
                          <p className="merge-entry__details-text">
                            Unable to read PDF details. The file may be encrypted.
                          </p>
                        )}
                      </div>
                      <label>
                        Page range <span className="form-field__hint">Use “all” or ranges like 1-3,5</span>
                        <input
                          type="text"
                          name="range"
                          value={entry.range}
                          placeholder="e.g. 1-3,5"
                          onChange={(event) => updateRange(entry.id, event.target.value)}
                        />
                      </label>
                      <div className="merge-entry__preview" hidden={!entry.previewVisible}>
                        <iframe
                          title={`Detailed preview of ${entry.file.name}`}
                          loading="lazy"
                          src={entry.previewVisible ? `${entry.url}#page=1&view=FitH` : "about:blank"}
                        ></iframe>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <StatusMessage status={mergeStatus.status} />
            {lastMerged ? (
              <div className="surface-muted merge-result" aria-live="polite">
                <p>
                  Ready to download: <strong>{lastMerged.filename}</strong>
                </p>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    downloadBlob(lastMerged.blob, lastMerged.filename);
                    setLastMerged(null);
                  }}
                >
                  Download merged PDF
                </button>
              </div>
            ) : null}
            <div className="form-actions merge-actions">
              <button className="btn" type="submit">
                Merge selected
              </button>
            </div>
          </form>

          <section className="surface-muted split-panel">
            <header>
              <p className="tool-card__category">Split PDF</p>
              <h2 className="form-section__title">Export each page</h2>
            </header>
            <form id="split-form" className="form-grid" onSubmit={onSplitSubmit}>
              <Dropzone
                id="split-dropzone"
                hasFile={Boolean(splitFile)}
                onDropFiles={onSplitDrop}
                copy={
                  <>
                    <h3 className="section-heading">Drop a PDF to split</h3>
                    <p className="dropzone__hint">
                      Each page becomes an individual download. Single file up to {splitLimit.maxMb} MB.
                    </p>
                  </>
                }
                actions={
                  <>
                    <button className="btn" type="button" id="split-browse" onClick={() => splitPickerRef.current?.click()}>
                      Choose PDF
                    </button>
                  </>
                }
              >
                <input
                  id="split-file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  className="visually-hidden"
                  ref={splitPickerRef}
                  onChange={onSplitChange}
                />
              </Dropzone>
              <StatusMessage status={splitStatus.status} />
              <div id="split-results" className="surface-muted split-results" hidden={!splitPages.length}>
                <h3 className="form-section__title">Pages ready</h3>
                <ul className="list-reset" aria-live="polite">
                  {splitPages.map((encoded, index) => (
                    <li key={index}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => downloadBlob(base64ToBlob(encoded, "application/pdf"), `page-${index + 1}.pdf`)}
                      >
                        Download page {index + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </form>
          </section>
        </div>
        }
      />
      <SettingsModal
        isOpen={settingsOpen}
        title="PDF toolkit preferences"
        description="Configure default filenames, download behaviour, and metadata analysis."
        fields={settingsFields}
        values={preferences}
        onChange={(key, value) =>
          updateSetting(key as keyof PdfToolPreferences, value as PdfToolPreferences[keyof PdfToolPreferences])
        }
        onReset={() => {
          resetSettings();
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </section>
  );
}
