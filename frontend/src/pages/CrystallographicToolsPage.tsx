import { useCallback, useMemo, useRef, useState } from "react";
import pdfToolsIcon from "../assets/pdf_tools_icon.png";
import { StatusMessage } from "../components/StatusMessage";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { useLoading } from "../contexts/LoadingContext";
import { useStatus } from "../hooks/useStatus";
import { loadCif, editCif, xrdPattern, type StructurePayload, type XrdPeak } from "../features/crystallographicTools/api";
import { base64ToBlob, downloadBlob } from "../utils/files";
import "../styles/pdf_tools.css";

export default function CrystallographicToolsPage() {
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [peaks, setPeaks] = useState<XrdPeak[]>([]);
  const [cifText, setCifText] = useState("");
  const [radiation, setRadiation] = useState("CuKa");
  const [thetaMin, setThetaMin] = useState(20);
  const [thetaMax, setThetaMax] = useState(80);
  const [thetaStep, setThetaStep] = useState(0.05);
  const status = useStatus({ message: "Upload a CIF to begin", level: "info" }, { context: "Crystallographic Tools" });
  const { withLoader } = useLoading();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const latticeFields = useMemo(
    () => [
      { key: "a", label: "a (Å)" },
      { key: "b", label: "b (Å)" },
      { key: "c", label: "c (Å)" },
      { key: "alpha", label: "α (°)" },
      { key: "beta", label: "β (°)" },
      { key: "gamma", label: "γ (°)" },
    ],
    [],
  );

  const handleUpload = useCallback(
    async (file?: File) => {
      const selected = file || fileInput.current?.files?.[0];
      if (!selected) return;
      try {
        const payload = await withLoader(() => loadCif(selected));
        setStructure(payload);
        setCifText(payload.cif);
        status.setStatus(`Loaded ${payload.formula}`, "success");
        setPeaks([]);
      } catch (error) {
        status.setStatus(error instanceof Error ? error.message : "Failed to load CIF", "error");
      }
    },
    [status, withLoader],
  );

  const handleEdit = useCallback(async () => {
    if (!structure) return;
    try {
      const payload = await withLoader(() =>
        editCif({
          cif: cifText || structure.cif,
          lattice: structure.lattice,
        }),
      );
      setStructure(payload);
      setCifText(payload.cif);
      status.setStatus("Structure updated", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Edit failed", "error");
    }
  }, [structure, cifText, status, withLoader]);

  const handleXrd = useCallback(async () => {
    if (!structure) return;
    try {
      const { peaks } = await withLoader(() =>
        xrdPattern({
          cif: cifText || structure.cif,
          radiation,
          two_theta: { min: thetaMin, max: thetaMax, step: thetaStep },
        }),
      );
      setPeaks(peaks);
      status.setStatus("XRD peaks computed", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "XRD calculation failed", "error");
    }
  }, [structure, cifText, radiation, thetaMin, thetaMax, thetaStep, status, withLoader]);

  const downloadCif = useCallback(() => {
    if (!cifText) return;
    const blob = base64ToBlob(btoa(cifText), "application/octet-stream");
    downloadBlob(blob, "edited.cif");
  }, [cifText]);

  return (
    <section className="shell surface-block pdf-shell" aria-labelledby="cryst-tools-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={pdfToolsIcon}
            titleId="cryst-tools-title"
            category="Materials Analysis"
            title="Crystallographic Tools"
            summary="Upload a CIF, tweak lattice parameters, and compute powder XRD peaks in-memory."
          />
        }
        workspace={
          <div className="tool-shell__workspace">
            <section className="surface-block pdf-shell__panel">
              <header className="pdf-shell__header">
                <div>
                  <p className="eyebrow">CIF</p>
                  <h2>Load structure</h2>
                  <p className="muted">Select a CIF file to view and edit lattice parameters.</p>
                </div>
                <div className="pdf-shell__actions">
                  <button className="btn" type="button" onClick={() => fileInput.current?.click()}>
                    Upload CIF
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".cif"
                    className="visually-hidden"
                    onChange={() => handleUpload()}
                  />
                </div>
              </header>

              {structure ? (
                <div className="pdf-plan">
                  <div className="lattice-grid">
                    {latticeFields.map((field) => (
                      <label key={field.key} className="pdf-plan__label lattice-field">
                        {field.label}
                        <input
                          type="number"
                          step="0.01"
                          value={((structure.lattice as any)[field.key] as number).toFixed(2)}
                          onChange={(event) =>
                            setStructure((current) =>
                              current
                                ? {
                                    ...current,
                                    lattice: { ...current.lattice, [field.key]: Number(event.target.value) },
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="pdf-plan__actions">
                    <button className="btn" type="button" onClick={handleEdit}>
                      Apply edits
                    </button>
                    <button className="btn btn--subtle" type="button" onClick={downloadCif}>
                      Download CIF
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted">No structure loaded.</p>
              )}
            </section>

            <section className="surface-block pdf-shell__panel">
              <header className="pdf-shell__header">
                <div>
                  <p className="eyebrow">Powder XRD</p>
                  <h2>Compute peaks</h2>
                  <p className="muted">Adjust the 2θ window and generate a peak list for the current structure.</p>
                </div>
              </header>
              <div className="pdf-plan">
                <div className="lattice-grid">
                  <label className="pdf-plan__label">
                    Radiation
                    <input value={radiation} onChange={(e) => setRadiation(e.target.value)} />
                  </label>
                  <label className="pdf-plan__label">
                    2θ min
                    <input type="number" value={thetaMin} onChange={(e) => setThetaMin(Number(e.target.value))} />
                  </label>
                  <label className="pdf-plan__label">
                    2θ max
                    <input type="number" value={thetaMax} onChange={(e) => setThetaMax(Number(e.target.value))} />
                  </label>
                  <label className="pdf-plan__label">
                    Step
                    <input type="number" value={thetaStep} step="0.01" onChange={(e) => setThetaStep(Number(e.target.value))} />
                  </label>
                </div>
                <div className="pdf-plan__actions">
                  <button className="btn" type="button" disabled={!structure} onClick={handleXrd}>
                    Compute XRD
                  </button>
                </div>
                {peaks.length ? (
                  <div className="pdf-queue">
                    <div className="pdf-queue__row">
                      <strong>Peaks ({peaks.length})</strong>
                    </div>
                    {peaks.slice(0, 25).map((peak, index) => (
                      <div key={index} className="pdf-queue__row">
                        <div className="pdf-queue__meta">
                          <div className="badge">{peak.hkl.join("") || "hkl"}</div>
                          <div>
                            <div className="pdf-queue__name">{peak.two_theta.toFixed(2)}° 2θ</div>
                            <div className="pdf-queue__stats">
                              d = {peak.d_spacing.toFixed(2)} Å · I = {peak.intensity.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No peaks yet. Compute after loading a structure.</p>
                )}
              </div>
            </section>
          </div>
        }
      />
      {status.status ? <StatusMessage {...status.status} /> : null}
    </section>
  );
}
