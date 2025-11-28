import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
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
import { buildManifest, parseInstructions, type ParsedInstruction } from "../plugins/pdf_stitch/parser";
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
  const [entries, setEntries] = useState<StitchEntry[]>([]);
  const [instructions, setInstructions] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState(prefs.defaultOutputName);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const counterRef = useRef(0);

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
        if (entries.length + next.length >= limits.maxFiles) {
          messages.push(`Limit of ${limits.maxFiles} files reached`);
          break;
        }
        if (file.size > limits.maxMb * 1024 * 1024) {
          messages.push(`Skipped ${file.name} over ${limits.maxMb} MB`);
          continue;
        }
        const id = `stitch-${(counterRef.current += 1)}`;
        const alias = `pdf-${entries.length + next.length + 1}`;
        const entry: StitchEntry = { id, alias, file, url: URL.createObjectURL(file), metadata: undefined };
        next.push(entry);
      }
      if (next.length) {
        setEntries((current) => [...current, ...next]);
        status.setStatus(`${entries.length + next.length} file(s) queued`, "success");
        if (prefs.fetchMetadata) {
          for (const entry of next) {
            const meta = await requestMetadata(entry.file);
            setEntries((current) =>
              current.map((item) => (item.id === entry.id ? { ...item, metadata: meta } : item)),
            );
          }
        }
      } else if (messages.length) {
        status.setStatus(messages.join(". "), "warning");
      }
    },
    [entries.length, limits.maxFiles, limits.maxMb, prefs.fetchMetadata, status],
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
    if (!entries.length) return;
    const lines = entries.map((entry) => `${entry.alias}: all;`);
    setInstructions(lines.join("\n"));
    setParseError(null);
  }, [entries]);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!entries.length) {
        status.setStatus("Upload at least one PDF to stitch.", "error");
        return;
      }
      const parsed = parseInstructions(instructions);
      if (parsed.error) {
        setParseError(parsed.error);
        status.setStatus(parsed.error, "error");
        return;
      }
      const { manifest, error } = buildManifest(parsed.instructions, entries);
      if (error) {
        setParseError(error);
        status.setStatus(error, "error");
        return;
      }
      status.setStatus("Stitching PDFs...", "progress");
      setParseError(null);
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
    [entries, instructions, outputName, prefs.autoDownload, prefs.defaultOutputName, status, withLoader],
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
                  <button className="btn btn--ghost" type="button" onClick={generateTemplate} disabled={!entries.length}>
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
                {entries.map((entry) => (
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
                {entries.length === 0 && <p className="muted">No PDFs queued yet.</p>}
              </div>

              <form className="pdf-plan" onSubmit={submit}>
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
                  Use one line per alias. Pages accept comma-separated numbers and ranges; use &quot;end&quot; for the
                  last page. Leave blank to stitch every page in upload order.
                </p>
                {parseError ? (
                  <StatusMessage level="error" message={parseError} />
                ) : status.status ? (
                  <StatusMessage {...status.status} />
                ) : null}

                <div className="pdf-plan__actions">
                  <input
                    type="text"
                    className="input"
                    placeholder="stitched.pdf"
                    value={outputName}
                    onChange={(event) => setOutputName(event.target.value)}
                    aria-label="Output filename"
                  />
                  <button type="submit" className="btn btn--primary">
                    Stitch PDFs
                  </button>
                </div>
              </form>
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
