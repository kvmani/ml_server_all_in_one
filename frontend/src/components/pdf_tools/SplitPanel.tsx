import { useCallback, useState, useMemo, useRef, FormEvent } from "react";
import { Dropzone } from "../Dropzone";
import { StatusMessage } from "../StatusMessage";
import { useLoading } from "../../contexts/LoadingContext";
import { usePluginSettings } from "../../hooks/usePluginSettings";
import { useStatus } from "../../hooks/useStatus";
import { apiFetch } from "../../utils/api";
import { base64ToBlob, downloadBlob } from "../../utils/files";
import "../../styles/pdf_tools.css";

const SPLIT_CONTEXT = "PDF Tools · Split";

type PdfPluginConfig = {
    split_upload?: { max_mb?: number };
};

function parseLimit(raw?: { max_files?: number; max_mb?: number }, defaults: { files: number; mb: number }) {
    return {
        maxFiles: Math.max(1, Number(raw?.max_files) || defaults.files),
        maxMb: Math.max(1, Number(raw?.max_mb) || defaults.mb),
    };
}

async function postSplit(file: File): Promise<string[]> {
    const form = new FormData();
    form.append("file", file, file.name);
    const payload = await apiFetch<{ pages: string[] }>("/api/pdf_tools/split", { method: "POST", body: form });
    return payload.pages || [];
}

export function SplitPanel() {
    const pluginConfig = usePluginSettings<PdfPluginConfig>("pdf_tools", {});
    const splitLimit = useMemo(
        () => parseLimit(pluginConfig.split_upload, { files: 1, mb: 5 }),
        [pluginConfig.split_upload],
    );
    const splitMessage = "Drop a PDF to split";

    const { withLoader } = useLoading();
    const [splitFile, setSplitFile] = useState<File | null>(null);
    const [splitPages, setSplitPages] = useState<string[]>([]);
    const splitStatus = useStatus({ message: splitMessage, level: "info" }, { context: SPLIT_CONTEXT });
    const splitPickerRef = useRef<HTMLInputElement | null>(null);

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
        <div className="tool-shell__workspace">
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
    );
}
