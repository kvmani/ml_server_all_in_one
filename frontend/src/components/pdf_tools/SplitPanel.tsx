import { ChangeEvent, FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { Dropzone } from "../Dropzone";
import { StatusMessage } from "../StatusMessage";
import { useLoading } from "../../contexts/LoadingContext";
import { usePluginSettings } from "../../hooks/usePluginSettings";
import { useStatus } from "../../hooks/useStatus";
import { apiFetch } from "../../utils/api";
import { base64ToBlob, downloadBlob } from "../../utils/files";
import "../../styles/pdf_tools.css";

const SPLIT_CONTEXT = "PDF Tools · Split";
const RANGE_RE = /^(\d+(?:-\d+)?)(,\d+(?:-\d+)?)*$/;

type PdfPluginConfig = {
    split_upload?: { max_mb?: number };
};

type SplitResponse = {
    files: { name: string; pdf_base64: string }[];
    page_count?: number;
};

type SplitPlanRow = {
    id: string;
    name: string;
    range: string;
    error?: string;
};

function parseLimit(raw?: { max_files?: number; max_mb?: number }, defaults: { files: number; mb: number }) {
    return {
        maxFiles: Math.max(1, Number(raw?.max_files) || defaults.files),
        maxMb: Math.max(1, Number(raw?.max_mb) || defaults.mb),
    };
}

async function requestMetadata(file: File): Promise<number | null> {
    const form = new FormData();
    form.append("file", file, file.name);
    try {
        const payload = await apiFetch<{ pages?: number }>("/api/pdf_tools/metadata", { method: "POST", body: form });
        return payload.pages || null;
    } catch {
        return null;
    }
}

async function postSplit(file: File, plan?: Array<{ name: string; pages: string }>): Promise<SplitResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    if (plan && plan.length) {
        form.append("plan", JSON.stringify(plan));
    }
    return apiFetch<SplitResponse>("/api/pdf_tools/split", { method: "POST", body: form });
}

function normalizeName(input: string, fallbackIndex: number): string {
    const trimmed = input.trim() || `split-${fallbackIndex}.pdf`;
    if (trimmed.toLowerCase().endsWith(".pdf")) {
        return trimmed;
    }
    return `${trimmed}.pdf`;
}

function validateRange(range: string, totalPages?: number | null): string | null {
    const cleaned = range.replace(/\s+/g, "");
    if (!cleaned) return "Enter a page range";
    if (!RANGE_RE.test(cleaned)) return "Use commas and hyphens, e.g., 1-3,5";

    for (const token of cleaned.split(",")) {
        if (!token) continue;
        if (token.includes("-")) {
            const [startRaw, endRaw] = token.split("-", 2);
            const start = Number(startRaw);
            const end = Number(endRaw);
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
                return "Invalid page interval";
            }
            if (totalPages && end > totalPages) {
                return `Max page is ${totalPages}`;
            }
        } else {
            const page = Number(token);
            if (!Number.isInteger(page) || page < 1) {
                return "Pages start at 1";
            }
            if (totalPages && page > totalPages) {
                return `Max page is ${totalPages}`;
            }
        }
    }
    return null;
}

function validateCustomPlan(rows: SplitPlanRow[], totalPages: number | null) {
    const updated = rows.map((row) => ({ ...row, error: undefined }));
    const plan: Array<{ name: string; pages: string }> = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
        const safeName = normalizeName(row.name, index + 1);
        const rangeError = validateRange(row.range, totalPages);
        const key = safeName.toLowerCase();

        if (seen.has(key)) {
            updated[index].error = "Names must be unique";
        }
        if (rangeError) {
            updated[index].error = rangeError;
        }
        if (!updated[index].error) {
            seen.add(key);
            plan.push({ name: safeName, pages: row.range.replace(/\s+/g, "") });
        }
    });

    const hasError = updated.some((row) => Boolean(row.error));
    return { plan: hasError ? null : plan, rows: updated };
}

export function SplitPanel() {
    const pluginConfig = usePluginSettings<PdfPluginConfig>("pdf_tools", {});
    const splitLimit = useMemo(
        () => parseLimit(pluginConfig.split_upload, { files: 1, mb: 5 }),
        [pluginConfig.split_upload],
    );
    const splitMessage = `Drop a PDF to split (up to ${splitLimit.maxMb} MB).`;

    const { withLoader } = useLoading();
    const [mode, setMode] = useState<"per-page" | "custom">("per-page");
    const [splitFile, setSplitFile] = useState<File | null>(null);
    const [pageCount, setPageCount] = useState<number | null>(null);
    const [planRows, setPlanRows] = useState<SplitPlanRow[]>([
        { id: "plan-1", name: "split-1.pdf", range: "1", error: undefined },
    ]);
    const [results, setResults] = useState<SplitResponse["files"]>([]);
    const [autoDownload, setAutoDownload] = useState(true);
    const splitStatus = useStatus({ message: splitMessage, level: "info" }, { context: SPLIT_CONTEXT });
    const splitPickerRef = useRef<HTMLInputElement | null>(null);
    const planCounterRef = useRef(1);

    const resetForm = useCallback(() => {
        setSplitFile(null);
        setPageCount(null);
        setResults([]);
        setMode("per-page");
        planCounterRef.current = 1;
        setPlanRows([{ id: "plan-1", name: "split-1.pdf", range: "1", error: undefined }]);
        splitStatus.setStatus(splitMessage, "info");
    }, [splitMessage, splitStatus]);

    const handleSelectedFile = useCallback(
        async (file: File) => {
            if (!file.type.includes("pdf") && !file.name.toLowerCase().endswith(".pdf")) {
                splitStatus.setStatus("Unsupported file format. Please upload PDF files only.", "error");
                return;
            }
            if (file.size > splitLimit.maxMb * 1024 * 1024) {
                splitStatus.setStatus(`File exceeds ${splitLimit.maxMb} MB limit`, "error");
                return;
            }
            setSplitFile(file);
            setResults([]);
            setPageCount(null);
            setMode("per-page");
            planCounterRef.current = 1;
            setPlanRows([{ id: "plan-1", name: "split-1.pdf", range: "1", error: undefined }]);
            splitStatus.setStatus(`Loaded ${file.name}. Fetching metadata…`, "progress");
            const pages = await withLoader(() => requestMetadata(file));
            if (pages) {
                setPageCount(pages);
                splitStatus.setStatus(
                    `The uploaded file has ${pages} page${pages === 1 ? "" : "s"}. Click Split to auto-download ${pages} single-page PDFs or switch to a custom plan.`,
                    "success",
                );
            } else {
                splitStatus.setStatus(
                    "Loaded file. Unable to read page count; you can still split or define custom ranges.",
                    "warning",
                );
            }
        },
        [splitLimit.maxMb, splitStatus, withLoader],
    );

    const onSplitDrop = useCallback(
        (files: FileList) => {
            const list = Array.from(files || []);
            if (!list.length) {
                return;
            }
            void handleSelectedFile(list[0]);
        },
        [handleSelectedFile],
    );

    const onSplitChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) {
                void handleSelectedFile(file);
            }
            event.target.value = "";
        },
        [handleSelectedFile],
    );

    const addPlanRow = useCallback(() => {
        planCounterRef.current += 1;
        const nextIndex = planRows.length + 1;
        const start = pageCount ? Math.min(pageCount, nextIndex) : nextIndex;
        const suggestedEnd = pageCount ? Math.min(pageCount, start + 1) : start;
        const range = start === suggestedEnd ? `${start}` : `${start}-${suggestedEnd}`;
        setPlanRows((rows) => [...rows, { id: `plan-${planCounterRef.current}`, name: `split-${nextIndex}.pdf`, range }]);
    }, [pageCount, planRows.length]);

    const removePlanRow = useCallback(
        (id: string) => {
            setPlanRows((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.id !== id)));
        },
        [],
    );

    const onSplitSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!splitFile) {
                splitStatus.setStatus("Select a PDF file before splitting", "error");
                return;
            }

            let plan: Array<{ name: string; pages: string }> | undefined;
            if (mode === "custom") {
                const { plan: validated, rows } = validateCustomPlan(planRows, pageCount);
                setPlanRows(rows);
                if (!validated) {
                    splitStatus.setStatus("Fix the highlighted ranges before splitting", "error");
                    return;
                }
                plan = validated;
            }

            splitStatus.setStatus("Splitting PDF pages. Please wait…", "progress");
            try {
                const payload = await withLoader(() => postSplit(splitFile, plan));
                const files = payload.files || [];
                if (payload.page_count && !pageCount) {
                    setPageCount(payload.page_count);
                }
                setResults(files);
                const label = mode === "custom" ? `${files.length} custom files ready` : `${files.length} pages ready`;
                splitStatus.setStatus(label, "success");
                if (autoDownload && files.length) {
                    files.forEach(({ name, pdf_base64 }) =>
                        downloadBlob(base64ToBlob(pdf_base64, "application/pdf"), name),
                    );
                }
            } catch (error) {
                splitStatus.setStatus(error instanceof Error ? error.message : "Split failed", "error");
            }
        },
        [autoDownload, mode, pageCount, planRows, splitFile, splitStatus, withLoader],
    );

    return (
        <section className="surface-muted split-panel" aria-labelledby="pdf-split-title">
            <header className="split-panel__header">
                <div>
                    <p className="tool-card__category">Split PDF</p>
                    <h2 id="pdf-split-title" className="form-section__title">
                        Export pages to individual PDFs
                    </h2>
                    {splitFile && (
                        <p className="split-panel__meta">
                            {pageCount
                                ? `The uploaded file has ${pageCount} page${pageCount === 1 ? "" : "s"}.`
                                : "Page count pending. Splitting still works once ready."}
                        </p>
                    )}
                </div>
                <div className="split-mode" role="tablist" aria-label="Split mode">
                    <button
                        type="button"
                        className={mode === "per-page" ? "is-active" : ""}
                        onClick={() => setMode("per-page")}
                        role="tab"
                        aria-selected={mode === "per-page"}
                    >
                        Split every page
                    </button>
                    <button
                        type="button"
                        className={mode === "custom" ? "is-active" : ""}
                        onClick={() => setMode("custom")}
                        role="tab"
                        aria-selected={mode === "custom"}
                    >
                        Custom split
                    </button>
                </div>
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
                            {splitFile ? (
                                <button className="btn btn--ghost" type="button" onClick={resetForm}>
                                    Clear selection
                                </button>
                            ) : null}
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

                <div className="split-meta">
                    <StatusMessage status={splitStatus.status} />
                    {splitFile ? (
                        <div className="split-meta__summary">
                            <div>
                                <div className="split-meta__filename">{splitFile.name}</div>
                                {pageCount ? (
                                    <div className="split-meta__pages">
                                        The uploaded file has {pageCount} page{pageCount === 1 ? "" : "s"}. Split will
                                        generate {mode === "custom" ? "your custom outputs" : `${pageCount} PDFs`}.
                                    </div>
                                ) : (
                                    <div className="split-meta__pages">Waiting for page count…</div>
                                )}
                            </div>
                            <label className="split-toggle">
                                <input
                                    type="checkbox"
                                    checked={autoDownload}
                                    onChange={(event) => setAutoDownload(event.target.checked)}
                                />
                                <span>Auto-download results after split</span>
                            </label>
                        </div>
                    ) : null}
                </div>

                {mode === "custom" ? (
                    <div className="split-custom surface-muted">
                        <div className="split-custom__header">
                            <div>
                                <h3 className="form-section__title">Custom split plan</h3>
                                <p className="split-panel__meta">
                                    Add rows to define output names and page ranges. Ranges are validated against the
                                    uploaded PDF.
                                </p>
                            </div>
                            <div className="split-custom__actions">
                                <button type="button" className="btn btn--ghost" onClick={addPlanRow}>
                                    Add row
                                </button>
                            </div>
                        </div>
                        <div className="split-custom__rows">
                            {planRows.map((row, index) => (
                                <div key={row.id} className={`split-custom__row ${row.error ? "has-error" : ""}`}>
                                    <label className="split-custom__field">
                                        <span>Output name</span>
                                        <input
                                            type="text"
                                            value={row.name}
                                            onChange={(event) =>
                                                setPlanRows((rows) =>
                                                    rows.map((item) =>
                                                        item.id === row.id
                                                            ? { ...item, name: event.target.value, error: undefined }
                                                            : item,
                                                    ),
                                                )
                                            }
                                            placeholder={`split-${index + 1}.pdf`}
                                            required
                                        />
                                    </label>
                                    <label className="split-custom__field">
                                        <span>Page range</span>
                                        <input
                                            type="text"
                                            value={row.range}
                                            onChange={(event) =>
                                                setPlanRows((rows) =>
                                                    rows.map((item) =>
                                                        item.id === row.id
                                                            ? { ...item, range: event.target.value, error: undefined }
                                                            : item,
                                                    ),
                                                )
                                            }
                                            placeholder={pageCount ? `1-${pageCount}` : "e.g., 1-3,5"}
                                            onBlur={() => {
                                                const validation = validateRange(row.range, pageCount);
                                                setPlanRows((rows) =>
                                                    rows.map((item) =>
                                                        item.id === row.id ? { ...item, error: validation || undefined } : item,
                                                    ),
                                                );
                                            }}
                                            required
                                        />
                                        {row.error ? <p className="form-error">{row.error}</p> : null}
                                    </label>
                                    {planRows.length > 1 ? (
                                        <button
                                            type="button"
                                            className="btn btn--ghost"
                                            onClick={() => removePlanRow(row.id)}
                                            aria-label={`Remove plan row ${index + 1}`}
                                        >
                                            Remove
                                        </button>
                                    ) : (
                                        <div />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="split-actions">
                    <button className="btn" type="submit" disabled={!splitFile}>
                        {mode === "custom" ? "Split with custom plan" : "Split every page"}
                    </button>
                </div>

                <div id="split-results" className="surface-muted split-results" hidden={!results.length}>
                    <h3 className="form-section__title">Downloads</h3>
                    <ul className="list-reset" aria-live="polite">
                        {results.map((file) => (
                            <li key={file.name}>
                                <div className="split-results__row">
                                    <div>
                                        <div className="split-meta__filename">{file.name}</div>
                                        <div className="split-panel__meta">PDF ready to download</div>
                                    </div>
                                    <button
                                        className="btn"
                                        type="button"
                                        onClick={() => downloadBlob(base64ToBlob(file.pdf_base64, "application/pdf"), file.name)}
                                    >
                                        Download again
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </form>
        </section>
    );
}
