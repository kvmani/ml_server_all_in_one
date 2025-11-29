import { FormEvent, useCallback, useMemo, useRef, useState, useEffect } from "react";
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
import {
  buildManifest,
  guidedRowsToManifest,
  parseInstructions,
  type ParsedInstruction,
  type GuidedRow,
} from "../plugins/pdf_stitch/parser";
import "../styles/pdf_tools.css";

type PluginConfig = { upload?: { max_files?: number; max_mb?: number } };
type Preferences = { autoDownload: boolean; fetchMetadata: boolean; defaultOutputName: string };

type StitchEntry = {
  id: string;
  alias: string;
  file: File;
  url: string;
  metadata?: { pages?: number; size_bytes?: number } | null;
};

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function requestMetadata(file: File): Promise<{ pages?: number; size_bytes?: number } | null> {
  const form = new FormData();
  form.append("file", file, file.name);
  try {
    return await apiFetch<{ pages?: number; size_bytes?: number }>("/api/pdf_stitch/metadata", {
      method: "POST",
      body: form,
    });
  } catch {
    return null;
  }
}

export default function PdfStitchPage() {
  const pluginConfig = usePluginSettings<PluginConfig>("pdf_stitch", {});
  const limits = useMemo(
    () => ({
      maxFiles: Math.max(1, Number(pluginConfig.upload?.max_files) || 3),
      maxMb: Math.max(1, Number(pluginConfig.upload?.max_mb) || 6),
    }),
    [pluginConfig.upload?.max_files, pluginConfig.upload?.max_mb],
  );
  const { withLoader } = useLoading();
  const status = useStatus({ message: "Drop PDFs to begin", level: "info" }, { context: "PDF Stitch" });
  const { settings: prefs, updateSetting, resetSettings } = useToolSettings<Preferences>("pdf_stitch", {
    autoDownload: true,
    fetchMetadata: true,
    defaultOutputName: "stitched.pdf",
  });
  const [uploads, setUploads] = useState<StitchEntry[]>([]);
  const [instructions, setInstructions] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState(prefs.defaultOutputName);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planMode, setPlanMode] = useState<"text" | "guided">("text");
  const [guidedRows, setGuidedRows] = useState<GuidedRow[]>([]);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const counterRef = useRef(0);
  const rowCounterRef = useRef(0);
  const [guidedErrors, setGuidedErrors] = useState<Record<string, string>>({});
  const [pageEstimate, setPageEstimate] = useState<number | null>(null);

  const settingsFields = useMemo<SettingsField[]>(
    () => [
      {
        key: "defaultOutputName",
        label: "Default output name",
        type: "text",
        placeholder: "stitched.pdf",
        description: "Used when the output name field is blank. Extension enforced automatically.",
      },
      {
        key: "autoDownload",
        label: "Auto-download stitched PDF",
        type: "boolean",
      },
      {
        key: "fetchMetadata",
        label: "Fetch PDF metadata after upload",
        type: "boolean",
      },
    ],
    [],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        status.setStatus("Unsupported file format. Please upload PDF files only.", "error");
        return;
      }
      const next: StitchEntry[] = [];
      const messages: string[] = [];
      for (const file of files) {
        if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) continue;
        if (uploads.length + next.length >= limits.maxFiles) {
          messages.push(`Limit of ${limits.maxFiles} files reached`);
          break;
        }
        if (file.size > limits.maxMb * 1024 * 1024) {
          messages.push(`Skipped ${file.name} over ${limits.maxMb} MB`);
          continue;
        }
        const id = `stitch-${(counterRef.current += 1)}`;
        const alias = `pdf-${uploads.length + next.length + 1}`;
        const entry: StitchEntry = { id, alias, file, url: URL.createObjectURL(file), metadata: undefined };
        next.push(entry);
      }
      if (next.length) {
        setUploads((current) => [...current, ...next]);
        status.setStatus(`${uploads.length + next.length} file(s) queued`, "success");
        if (prefs.fetchMetadata) {
          for (const entry of next) {
            const meta = await requestMetadata(entry.file);
            setUploads((current) =>
              current.map((item) => (item.id === entry.id ? { ...item, metadata: meta } : item)),
            );
          }
        }
      } else if (messages.length) {
        status.setStatus(messages.join(". "), "warning");
      }
    },
    [uploads.length, limits.maxFiles, limits.maxMb, prefs.fetchMetadata, status],
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length) {
        void addFiles(Array.from(files));
      }
      event.target.value = "";
    },
    [addFiles],
  );

  const clearQueue = useCallback(() => {
    setEntries([]);
    setInstructions("");
    setParseError(null);
    status.setStatus("Queue cleared", "info");
  }, [status]);

  const generateTemplate = useCallback(() => {
    if (!uploads.length) return;
    const lines = uploads.map((entry) => `${entry.alias}: all;`);
    setInstructions(lines.join("\n"));
    setParseError(null);
  }, [uploads]);

  const addGuidedRow = useCallback(() => {
    if (!uploads.length) {
      status.setStatus("Upload at least one PDF first.", "error");
      return;
    }
    const nextId = `row-${(rowCounterRef.current += 1)}`;
    const defaultAlias = uploads[0]?.alias || "pdf-1";
    setGuidedRows((current) => [...current, { id: nextId, alias: defaultAlias, pages: "all" }]);
    setGuidedErrors((current) => ({ ...current, [nextId]: "" }));
  }, [uploads, status]);

  const updateGuidedRow = useCallback((id: string, patch: Partial<GuidedRow>) => {
    setGuidedRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const removeGuidedRow = useCallback((id: string) => {
    setGuidedRows((current) => current.filter((row) => row.id !== id));
    setGuidedErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const validateRowPages = useCallback(
    (row: GuidedRow) => {
      const match = uploads.find((entry) => entry.alias === row.alias);
      const totalPages = match?.metadata?.pages;
      if (!totalPages) {
        setGuidedErrors((current) => ({ ...current, [row.id]: "" }));
        return;
      }
      const parts = row.pages.split(",").map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (part.toLowerCase() === "all" || part.toLowerCase() === "end") continue;
        if (part.includes("-")) {
          const [start, end] = part.split("-", 2).map((v) => Number(v));
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > totalPages) {
            setGuidedErrors((current) => ({ ...current, [row.id]: `Pages must be between 1 and ${totalPages}` }));
            return;
          }
        } else {
          const page = Number(part);
          if (!Number.isInteger(page) || page < 1 || page > totalPages) {
            setGuidedErrors((current) => ({ ...current, [row.id]: `Pages must be between 1 and ${totalPages}` }));
            return;
          }
        }
      }
      setGuidedErrors((current) => ({ ...current, [row.id]: "" }));
    },
    [uploads],
  );

  const recomputeEstimate = useCallback(
    (rows: GuidedRow[]) => {
      let total = 0;
      for (const row of rows) {
        const match = uploads.find((entry) => entry.alias === row.alias);
        const totalPages = match?.metadata?.pages;
        if (!totalPages) {
          setPageEstimate(null);
          return;
        }
        const parts = row.pages.split(",").map((p) => p.trim()).filter(Boolean);
        let count = 0;
        for (const part of parts) {
          if (part.toLowerCase() === "all") {
            count += totalPages;
            continue;
          }
          if (part.toLowerCase() === "end") {
            count += 1;
            continue;
          }
          if (part.includes("-")) {
            const [start, end] = part.split("-", 2).map((v) => Number(v));
            if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
              count += end - start + 1;
            }
          } else {
            count += 1;
          }
        }
        total += count;
      }
      setPageEstimate(total || null);
    },
    [uploads],
  );

  useEffect(() => {
    guidedRows.forEach((row) => validateRowPages(row));
    recomputeEstimate(guidedRows);
  }, [guidedRows, validateRowPages, recomputeEstimate]);


  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!uploads.length) {
        status.setStatus("Upload at least one PDF to stitch.", "error");
        return;
      }
      let manifest;
      let error: string | undefined;
      if (planMode === "text") {
        const parsed = parseInstructions(instructions);
        if (parsed.error) {
          setParseError(parsed.error);
          status.setStatus(parsed.error, "error");
          return;
        }
        ({ manifest, error } = buildManifest(parsed.instructions, uploads));
      } else {
        ({ manifest, error } = guidedRowsToManifest(guidedRows, uploads));
      }
      if (error) {
        setParseError(error);
        status.setStatus(error, "error");
        return;
      }
      status.setStatus("Stitching PDFs...", "progress");
      setParseError(null);
      status.setStatus("Stitching PDFs...", "progress");
      const form = new FormData();
      manifest.forEach((item) => {
        form.append(item.field, item.file, item.file.name);
      });
      form.append(
        "manifest",
        JSON.stringify(manifest.map((item) => ({ field: item.field, alias: item.alias, pages: item.pages }))),
      );
      form.append("output_name", outputName || prefs.defaultOutputName || "stitched.pdf");
      try {
        const payload = await withLoader(() =>
          apiFetch<{ filename: string; pdf_base64: string }>("/api/pdf_stitch/stitch", {
            method: "POST",
            body: form,
          }),
        );
        const blob = base64ToBlob(payload.pdf_base64, "application/pdf");
        if (prefs.autoDownload) {
          downloadBlob(blob, payload.filename);
        } else {
          status.setStatus(`Stitched PDF ready: ${payload.filename}`, "success");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to stitch PDFs";
        status.setStatus(message, "error");
      }
    },
    [uploads, instructions, outputName, prefs.autoDownload, prefs.defaultOutputName, status, withLoader],
  );

  const helperText = `Describe your page plan, one line per source:
pdf-1: 1-2,5
pdf-2: all
pdf-1: 6-end`;

  return (
    <section className="shell surface-block pdf-shell" aria-labelledby="pdf-stitch-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={pdfToolsIcon}
            titleId="pdf-stitch-title"
            category="Document Utilities"
            title="PDF Stitch"
            summary="Upload a few PDFs, assign auto-generated aliases (pdf-1, pdf-2, ...), and describe the exact page order you want to assemble."
            actions={
              <>
                <button className="btn btn--ghost" type="button" onClick={() => setSettingsOpen(true)}>
                  ⚙️ Settings
                </button>
                <button className="btn btn--subtle" type="button" onClick={clearQueue}>
                  Clear queue
                </button>
              </>
            }
            footer={
              <p className="form-field__hint">
                Supports up to {limits.maxFiles} PDFs ({limits.maxMb} MB each). Use &quot;end&quot; to reference the last
                page in a file.
              </p>
            }
          />
        }
        workspace={
          <div className="tool-shell__workspace">
            <section className="surface-block pdf-shell__panel" aria-labelledby="pdf-stitch-title">
              <header className="pdf-shell__header">
                <div>
                  <p className="eyebrow">Input queue</p>
                  <h2 id="pdf-stitch-title">Arrange your sources</h2>
                  <p className="muted">
                    Drop up to {limits.maxFiles} PDFs ({limits.maxMb} MB each). Aliases are assigned automatically.
                  </p>
                </div>
                <div className="pdf-shell__actions">
                  <button className="btn" type="button" onClick={() => pickerRef.current?.click()}>
                    Add PDF
                  </button>
                  <button className="btn btn--ghost" type="button" onClick={generateTemplate} disabled={!uploads.length}>
                    Prefill plan
                  </button>
                </div>
              </header>

              <Dropzone
                accept=".pdf,application/pdf"
                message="Drop PDFs here or browse"
                onFilesSelected={(files) => addFiles(Array.from(files))}
              />
              <input
                ref={pickerRef}
                type="file"
                accept="application/pdf"
                multiple
                className="visually-hidden"
                onChange={handleFileInput}
                aria-label="Add PDF"
              />

              <div className="pdf-queue">
                {uploads.map((entry) => (
                  <div key={entry.id} className="pdf-queue__row">
                    <div className="pdf-queue__meta">
                      <div className="badge">{entry.alias}</div>
                      <div>
                        <div className="pdf-queue__name">{entry.file.name}</div>
                        <div className="pdf-queue__stats">
                          {entry.metadata?.pages ? `${entry.metadata.pages} pages · ` : ""}
                          {humanSize(entry.file.size)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {uploads.length === 0 && <p className="muted">No PDFs queued yet.</p>}
              </div>

              <div className="pdf-plan">
                <div className="pdf-plan__tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={planMode === "text"}
                    className={planMode === "text" ? "is-active" : ""}
                    onClick={() => setPlanMode("text")}
                  >
                    Simple text
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={planMode === "guided"}
                    className={planMode === "guided" ? "is-active" : ""}
                    onClick={() => setPlanMode("guided")}
                  >
                    Guided builder
                  </button>
                </div>

                {planMode === "text" ? (
                  <div role="tabpanel">
                    <label className="pdf-plan__label" htmlFor="plan">
                      Page plan
                    </label>
                    <textarea
                      id="plan"
                      className="pdf-plan__input"
                      rows={6}
                      placeholder={helperText}
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                    />
                    <p className="muted small">
                      One line per alias. Pages accept comma-separated numbers and ranges; use &quot;end&quot; for the
                      last page.
                    </p>
                  </div>
                ) : (
                  <div role="tabpanel" className="pdf-guided">
                    <div className="pdf-guided__rows">
                      {guidedRows.map((row) => {
                        const entry = uploads.find((item) => item.alias === row.alias);
                        return (
                          <div key={row.id} className="pdf-guided__row">
                            <label>
                              Source
                              <select
                                value={row.alias}
                                onChange={(event) => updateGuidedRow(row.id, { alias: event.target.value })}
                              >
                                {uploads.map((entryOption) => (
                                  <option key={entryOption.id} value={entryOption.alias}>
                                    {entryOption.alias} — {entryOption.file.name}
                                  </option>
                                ))}
                              </select>
                              <span className="muted small">
                                Max pages: {entry?.metadata?.pages ?? "?"}
                              </span>
                            </label>
                            <label>
                              Pages
                              <input
                                type="text"
                                value={row.pages}
                                onChange={(event) => updateGuidedRow(row.id, { pages: event.target.value })}
                                placeholder="e.g. 1-3,12"
                              />
                              {guidedErrors[row.id] ? (
                                <span className="error-text">{guidedErrors[row.id]}</span>
                              ) : null}
                            </label>
                            <button type="button" className="btn btn--ghost" onClick={() => removeGuidedRow(row.id)}>
                              Remove
                            </button>
                          </div>
                        );
                      })}
                      {!guidedRows.length && <p className="muted">Add rows to describe the exact sequence you want.</p>}
                    </div>
                    <button type="button" className="btn" onClick={addGuidedRow}>
                      + Add row
                    </button>
                    <p className="muted small">
                      Rows run top-to-bottom; each row is the next chunk of pages in the stitched PDF.
                    </p>
                  </div>
                )}

                {parseError ? (
                  <StatusMessage level="error" message={parseError} />
                ) : status.status ? (
                  <StatusMessage {...status.status} />
                ) : null}

                <div className="pdf-plan__actions">
                  <div className="muted">
                    {pageEstimate !== null ? `Estimated output pages: ${pageEstimate}` : "Estimated output pages: ?" }
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="stitched.pdf"
                    value={outputName}
                    onChange={(event) => setOutputName(event.target.value)}
                    aria-label="Output filename"
                  />
                  <button type="submit" className="btn btn--primary" onClick={submit}>
                    Stitch PDFs
                  </button>
                </div>
              </div>
            </section>
          </div>
        }
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onReset={resetSettings}
        settings={prefs}
        onSave={updateSetting}
        fields={settingsFields}
        title="PDF Stitch Settings"
      />
    </section>
  );

}
