import { useState } from "react";
import pdfToolsIcon from "../assets/pdf_tools_icon.png";
import { MergePanel } from "../components/pdf_tools/MergePanel";
import { SplitPanel } from "../components/pdf_tools/SplitPanel";
import { StitchPanel } from "../components/pdf_tools/StitchPanel";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import "../styles/pdf_tools.css";

export default function PdfToolsPage() {
  const [activeTab, setActiveTab] = useState<"merge" | "split" | "stitch">("merge");
  const helpHref = "/help/pdf_tools";

  return (
    <section className="shell surface-block pdf-shell" aria-labelledby="pdf-tools-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={pdfToolsIcon}
            titleId="pdf-tools-title"
            category="Document Utilities"
            title="PDF toolkit workspace"
            summary="Reorder, merge, split, and stitch PDF documents entirely in-memory. Drag files into the workspace to queue them, define page ranges, and export results."
            bullets={[
              "Merge: Combine multiple PDFs into one document",
              "Split: Extract every page as a separate file",
              "Stitch: Mix pages from multiple sources into a new sequence",
              "Offline processing with instant downloads",
            ]}
            actions={
              <a
                className="btn btn--subtle"
                data-keep-theme
                href={typeof helpHref === "string" ? helpHref : "/help/pdf_tools"}
              >
                Read PDF guide
              </a>
            }
          />
        }
        workspace={
          <div className="tool-shell__workspace">
            <div className="pdf-tabs" role="tablist" aria-label="PDF tools">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "merge"}
                className={`pdf-tab ${activeTab === "merge" ? "is-active" : ""}`}
                onClick={() => setActiveTab("merge")}
              >
                Merge
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "split"}
                className={`pdf-tab ${activeTab === "split" ? "is-active" : ""}`}
                onClick={() => setActiveTab("split")}
              >
                Split
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "stitch"}
                className={`pdf-tab ${activeTab === "stitch" ? "is-active" : ""}`}
                onClick={() => setActiveTab("stitch")}
              >
                Stitch
              </button>
            </div>
            <div role="tabpanel" hidden={activeTab !== "merge"}>
              {activeTab === "merge" && <MergePanel />}
            </div>
            <div role="tabpanel" hidden={activeTab !== "split"}>
              {activeTab === "split" && <SplitPanel />}
            </div>
            <div role="tabpanel" hidden={activeTab !== "stitch"}>
              {activeTab === "stitch" && <StitchPanel />}
            </div>
          </div>
        }
      />
    </section>
  );
}
