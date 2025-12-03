import { useCallback, useMemo, useRef, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Bar, ReferenceLine } from "recharts";
import crystallographyIcon from "../assets/pdf_tools_icon.png";
import { StatusMessage } from "../components/StatusMessage";
import { useLoading } from "../contexts/LoadingContext";
import { useStatus } from "../hooks/useStatus";
import {
  editCif,
  loadCif,
  runCalculator,
  temSaed,
  xrdPattern,
  type CalculatorResult,
  type SaedPattern,
  type StructurePayload,
  type XrdPeak,
  type XrdCurvePoint,
} from "../features/crystallographicTools/api";
import feBccCif from "../features/crystallographicTools/samples/fe_bcc.cif?raw";
import { downloadBlob } from "../utils/files";
import "../styles/crystallography.css";

type TabKey = "xrd" | "tem" | "calculator";

const latticeFields = [
  { key: "a", label: "a (Å)" },
  { key: "b", label: "b (Å)" },
  { key: "c", label: "c (Å)" },
  { key: "alpha", label: "α (°)" },
  { key: "beta", label: "β (°)" },
  { key: "gamma", label: "γ (°)" },
] as const;

function SaedTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const spot = payload[0].payload as any;
  return (
    <div className="cryst-tooltip">
      <div className="cryst-tooltip__title">({spot.hkl.join(" ")})</div>
      <div>d = {spot.d_angstrom.toFixed(3)} Å</div>
      <div>2θ = {spot.two_theta_deg.toFixed(3)}°</div>
      <div>I = {spot.intensity_rel.toFixed(3)}</div>
    </div>
  );
}

export default function CrystallographicToolsPage() {
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [cifText, setCifText] = useState("");
  const [peaks, setPeaks] = useState<XrdPeak[]>([]);
  const [xrdCurve, setXrdCurve] = useState<XrdCurvePoint[]>([]);
  const [xrdRange, setXrdRange] = useState<{ min: number; max: number }>({ min: 10, max: 80 });
  const [saedPattern, setSaedPattern] = useState<SaedPattern | null>(null);
  const [calculator, setCalculator] = useState<CalculatorResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("xrd");

  const [radiation, setRadiation] = useState("CuKa");
  const [thetaMin, setThetaMin] = useState(20);
  const [thetaMax, setThetaMax] = useState(80);
  const [thetaStep, setThetaStep] = useState(0.05);

  const [zoneAxis, setZoneAxis] = useState<[number, number, number]>([1, 0, 0]);
  const [xAxis, setXAxis] = useState<[number, number, number] | null>(null);
  const [voltage, setVoltage] = useState(200);
  const [cameraLengthCm, setCameraLengthCm] = useState(10);
  const [maxIndex, setMaxIndex] = useState(3);
  const [minD, setMinD] = useState(0.5);
  const [intensityThreshold, setIntensityThreshold] = useState(0.01);
  const [inplaneRotation, setInplaneRotation] = useState(0);

  const [directionA, setDirectionA] = useState<[number, number, number]>([1, 0, 0]);
  const [directionB, setDirectionB] = useState<[number, number, number]>([0, 1, 0]);
  const [plane, setPlane] = useState<[number, number, number]>([1, 0, 0]);
  const [includeEquivalents, setIncludeEquivalents] = useState(true);

  const status = useStatus({ message: "Upload a CIF to begin", level: "info" }, { context: "Crystallographic Tools" });
  const { withLoader } = useLoading();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const isHexagonal = structure?.is_hexagonal ?? false;

  const handleUpload = useCallback(
    async (file?: File) => {
      const selected = file || fileInput.current?.files?.[0];
      if (!selected) return;
      try {
        const payload = await withLoader(() => loadCif(selected));
        setStructure(payload);
        setCifText(payload.cif);
        setPeaks([]);
        setSaedPattern(null);
        setCalculator(null);
        status.setStatus(`Loaded ${payload.formula}`, "success");
      } catch (error) {
        status.setStatus(error instanceof Error ? error.message : "Failed to load CIF", "error");
      }
    },
    [status, withLoader],
  );

  const handleLoadSample = useCallback(async () => {
    try {
      const payload = await withLoader(() => editCif({ cif: feBccCif }));
      setStructure(payload);
      setCifText(payload.cif);
      setPeaks([]);
      setSaedPattern(null);
      setCalculator(null);
      setZoneAxis([0, 0, 1]);
      status.setStatus("Loaded Fe (bcc) sample", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Failed to load sample", "error");
    }
  }, [status, withLoader]);

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
      const { peaks, curve, range } = await withLoader(() =>
        xrdPattern({
          cif: cifText || structure.cif,
          radiation,
          two_theta: { min: thetaMin, max: thetaMax, step: thetaStep },
        }),
      );
      setPeaks(peaks);
      setXrdCurve(curve);
      setXrdRange(range);
      status.setStatus("XRD peaks computed", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "XRD calculation failed", "error");
    }
  }, [structure, cifText, radiation, thetaMin, thetaMax, thetaStep, status, withLoader]);

  const handleSaed = useCallback(async () => {
    if (!structure) return;
    try {
      const xAxisPayload = xAxis && xAxis.some((value) => value !== 0) ? xAxis : undefined;
      const pattern = await withLoader(() =>
        temSaed({
          cif: cifText || structure.cif,
          zone_axis: zoneAxis,
          voltage_kv: voltage,
          camera_length_cm: cameraLengthCm,
          max_index: maxIndex,
          min_d_angstrom: minD,
          intensity_min_relative: intensityThreshold,
          x_axis_hkl: xAxisPayload,
          inplane_rotation_deg: inplaneRotation,
        }),
      );
          setSaedPattern(pattern);
          status.setStatus("SAED pattern simulated", "success");
        } catch (error) {
          status.setStatus(error instanceof Error ? error.message : "SAED calculation failed", "error");
        }
      }, [structure, cifText, zoneAxis, voltage, cameraLengthCm, maxIndex, minD, intensityThreshold, xAxis, inplaneRotation, status, withLoader]);

  const handleCalculator = useCallback(async () => {
    if (!structure) return;
    const dirAPayload = isHexagonal ? [...directionA, -(directionA[0] + directionA[1])] : directionA;
    const dirBPayload = isHexagonal ? [...directionB, -(directionB[0] + directionB[1])] : directionB;
    const planePayload = isHexagonal ? [...plane, -(plane[0] + plane[1])] : plane;
    try {
      const result = await withLoader(() =>
        runCalculator({
          cif: cifText || structure.cif,
          directionA: dirAPayload,
          directionB: dirBPayload,
          plane: planePayload,
          includeEquivalents,
        }),
      );
      setCalculator(result);
      status.setStatus("Calculator results updated", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Calculation failed", "error");
    }
  }, [structure, cifText, directionA, directionB, plane, isHexagonal, includeEquivalents, status, withLoader]);

  const downloadCif = useCallback(() => {
    if (!cifText) return;
    const blob = new Blob([cifText], { type: "chemical/x-cif" });
    downloadBlob(blob, "structure.cif");
  }, [cifText]);

  const xrdChartData = useMemo(() => peaks.map((peak) => ({ ...peak, label: `(${peak.hkl.join(" ")})` })), [peaks]);

  const equivalents = useMemo(() => calculator?.equivalents ?? null, [calculator]);

  const renderComputedIndex = (label: string, value: number) => (
    <div className="cryst-computed" aria-live="polite">
      <span>{label}</span>
      <input value={value.toFixed(3)} readOnly aria-label={label} />
    </div>
  );

  return (
    <section className="shell surface-block cryst-shell" aria-labelledby="cryst-tools-title">
      <header className="cryst-compact__header">
        <div className="cryst-compact__title">
          <div className="cryst-compact__icon" aria-hidden="true">
            <img src={crystallographyIcon} alt="" />
          </div>
          <div>
            <p className="eyebrow">Materials analysis</p>
            <h1 id="cryst-tools-title" className="section-heading">
              Crystallographic Tools
            </h1>
            <p className="muted">CIF-backed XRD, SAED, and calculators in one shared workspace.</p>
          </div>
        </div>
      </header>

      <div className="cryst-compact__grid">
        <aside className="cryst-sidebar">
          <section className="cryst-card">
            <p className="eyebrow">Workspace</p>
            <p className="cryst-card__summary">Load one CIF and reuse it across tabs.</p>
            {structure ? (
              <dl className="cryst-card__meta">
                <div>
                  <dt>Formula</dt>
                  <dd>{structure.formula}</dd>
                </div>
                <div>
                  <dt>Sites</dt>
                  <dd>{structure.num_sites}</dd>
                </div>
                <div>
                  <dt>System</dt>
                  <dd>{structure.crystal_system || (structure.is_hexagonal ? "hexagonal" : "—")}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Upload a CIF to begin.</p>
            )}
          </section>

          <section className="cryst-panel">
            <header className="cryst-panel__header">
              <div>
                <p className="eyebrow">CIF</p>
                <h2>Load & edit</h2>
                <p className="muted">Upload once; edits propagate to all tabs.</p>
              </div>
              <div className="cryst-actions">
                <button className="btn" type="button" onClick={() => fileInput.current?.click()}>
                  Upload CIF
                </button>
                <button className="btn btn--subtle" type="button" onClick={handleLoadSample}>
                  Load Fe sample
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
              <>
                <div className="cryst-lattice-grid">
                  {latticeFields.map((field) => (
                    <label key={field.key} className="cryst-label">
                      {field.label}
                      <input
                        type="number"
                        step="0.01"
                        value={((structure.lattice as any)[field.key] as number).toFixed(3)}
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
                <div className="cryst-panel__actions">
                  <button className="btn" type="button" onClick={handleEdit}>
                    Apply edits
                  </button>
                  <button className="btn btn--subtle" type="button" onClick={downloadCif}>
                    Download CIF
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">No structure loaded.</p>
            )}
          </section>
        </aside>

        <main className="cryst-main">
          <div className="cryst-tabs" role="tablist" aria-label="Crystallographic tools">
            {[
              { key: "xrd", label: "XRD peaks" },
              { key: "tem", label: "TEM / SAED" },
              { key: "calculator", label: "Calculator" },
            ].map((tab) => (
              <button
                key={tab.key}
                role="tab"
                className={activeTab === tab.key ? "cryst-tab active" : "cryst-tab"}
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="cryst-panel">
            {activeTab === "xrd" && (
              <>
                <header className="cryst-panel__header">
                  <div>
                    <p className="eyebrow">Powder XRD</p>
                    <h2>Simulate diffraction peaks</h2>
                  </div>
                </header>
                <div className="cryst-grid">
                  <label className="cryst-label">
                    Radiation
                    <input value={radiation} onChange={(e) => setRadiation(e.target.value)} />
                  </label>
                  <label className="cryst-label">
                    2θ min
                    <input type="number" value={thetaMin} onChange={(e) => setThetaMin(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    2θ max
                    <input type="number" value={thetaMax} onChange={(e) => setThetaMax(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    Step
                    <input type="number" value={thetaStep} step="0.01" onChange={(e) => setThetaStep(Number(e.target.value))} />
                  </label>
                </div>
                <div className="cryst-panel__actions">
                  <button className="btn" type="button" disabled={!structure} onClick={handleXrd}>
                    Compute XRD
                  </button>
                </div>
                {peaks.length ? (
                  <div className="cryst-xrd">
                    <div className="cryst-xrd__chart">
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart
                          data={xrdCurve}
                          margin={{ top: 10, bottom: 20, left: 10, right: 10 }}
                          syncId="xrd"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="two_theta"
                            name="2θ"
                            unit="°"
                            type="number"
                            domain={[xrdRange.min, xrdRange.max]}
                            allowDataOverflow
                          />
                          <YAxis dataKey="intensity" name="I" domain={[0, 105]} />
                          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                          <Line type="monotone" dataKey="intensity" stroke="#22d3ee" dot={false} strokeWidth={2} />
                          {peaks.map((peak, idx) => (
                            <ReferenceLine
                              key={`peak-${idx}`}
                              x={peak.two_theta}
                              stroke="#0ea5e9"
                              strokeWidth={1}
                              strokeDasharray="2 2"
                            />
                          ))}
                          <Scatter data={xrdChartData} fill="#0f766e" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="cryst-xrd__list">
                      {peaks.slice(0, 25).map((peak, index) => (
                        <div key={index} className="cryst-xrd__row">
                          <div className="badge">{peak.hkl.join(" ") || "hkl"}</div>
                          <div>
                            <div className="cryst-xrd__title">{peak.two_theta.toFixed(2)}° 2θ</div>
                            <div className="cryst-xrd__meta">d = {peak.d_spacing.toFixed(3)} Å · I = {peak.intensity.toFixed(1)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">No peaks yet. Compute after loading a structure.</p>
                )}
              </>
            )}

            {activeTab === "tem" && (
              <>
                <header className="cryst-panel__header">
                  <div>
                    <p className="eyebrow">TEM</p>
                    <h2>SAED pattern for a zone axis</h2>
                  </div>
                </header>
                <div className="cryst-grid">
                  {["h", "k", "l"].map((label, idx) => (
                    <label key={label} className="cryst-label">
                      {label}
                      <input
                        type="number"
                        value={zoneAxis[idx]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setZoneAxis((axis) => {
                            const next = [...axis] as [number, number, number];
                            next[idx] = value;
                            return next;
                          });
                        }}
                      />
                    </label>
                  ))}
                  <label className="cryst-label">
                    Voltage (kV)
                    <input type="number" value={voltage} onChange={(e) => setVoltage(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    Camera length (cm)
                    <input type="number" step="0.1" value={cameraLengthCm} onChange={(e) => setCameraLengthCm(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    Max index
                    <input type="number" value={maxIndex} onChange={(e) => setMaxIndex(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    Min d-spacing (Å)
                    <input type="number" step="0.05" value={minD} onChange={(e) => setMinD(Number(e.target.value))} />
                  </label>
                  <label className="cryst-label">
                    Intensity cutoff
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      value={intensityThreshold}
                      onChange={(e) => setIntensityThreshold(Number(e.target.value))}
                    />
                  </label>
                  <label className="cryst-label">
                    Align x-axis to hkl (optional)
                    <div className="cryst-inline-inputs">
                      {["h", "k", "l"].map((label, idx) => (
                        <input
                          key={`x-axis-${label}`}
                          type="number"
                          value={xAxis ? xAxis[idx] : ""}
                          placeholder={xAxis ? undefined : "0"}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setXAxis((axis) => {
                              const next = axis ? [...axis] as [number, number, number] : [0, 0, 0];
                              next[idx] = value;
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                  </label>
                  <label className="cryst-label">
                    In-plane rotation (°)
                    <input type="number" value={inplaneRotation} onChange={(e) => setInplaneRotation(Number(e.target.value))} />
                  </label>
                </div>
                <div className="cryst-panel__actions">
                  <button className="btn" type="button" disabled={!structure} onClick={handleSaed}>
                    Simulate SAED
                  </button>
                </div>
                {saedPattern ? (
                  <>
                    <div className="cryst-saed">
                      <ResponsiveContainer width="100%" height={320}>
                        <ScatterChart margin={{ top: 10, left: 10, right: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="x_norm" name="X" tick={{ fontSize: 12 }} domain={[-1.05, 1.05]} />
                          <YAxis type="number" dataKey="y_norm" name="Y" tick={{ fontSize: 12 }} domain={[-1.05, 1.05]} />
                          <Tooltip content={<SaedTooltip />} />
                          <Scatter
                            data={saedPattern.spots.map((spot) => ({ ...spot, size: 6 + 80 * spot.intensity_rel }))}
                            fill="#2563eb"
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="cryst-list">
                      <div className="cryst-list__header">Top reflections ({saedPattern.spots.length})</div>
                      {saedPattern.spots.slice(0, 20).map((spot, idx) => (
                        <div key={idx} className="cryst-list__row">
                          <div className="badge">{spot.hkl.join(" ")}</div>
                          <div className="cryst-list__meta">
                            d = {spot.d_angstrom.toFixed(3)} Å · 2θ = {spot.two_theta_deg.toFixed(2)}° · I = {spot.intensity_rel.toFixed(3)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">Run a simulation to view spot positions and metadata.</p>
                )}
              </>
            )}

            {activeTab === "calculator" && (
              <>
                <header className="cryst-panel__header">
                  <div>
                    <p className="eyebrow">Calculator</p>
                    <h2>Angles & symmetry equivalents</h2>
                    {isHexagonal ? <p className="muted">Hexagonal detected — Miller–Bravais helpers enabled.</p> : null}
                  </div>
                </header>
                <div className="cryst-grid">
                  <label className="cryst-label">
                    Direction A [uvw]
                    <div className="cryst-inline-inputs">
                      {["u", "v", "w"].map((label, idx) => (
                        <input
                          key={label}
                          type="number"
                          value={directionA[idx]}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setDirectionA((vec) => {
                              const next = [...vec] as [number, number, number];
                              next[idx] = value;
                              return next;
                            });
                          }}
                          aria-label={`Direction A ${label}`}
                        />
                      ))}
                    </div>
                    {isHexagonal ? renderComputedIndex("t = -(u+v)", -(directionA[0] + directionA[1])) : null}
                  </label>
                  <label className="cryst-label">
                    Direction B [uvw]
                    <div className="cryst-inline-inputs">
                      {["u", "v", "w"].map((label, idx) => (
                        <input
                          key={label}
                          type="number"
                          value={directionB[idx]}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setDirectionB((vec) => {
                              const next = [...vec] as [number, number, number];
                              next[idx] = value;
                              return next;
                            });
                          }}
                          aria-label={`Direction B ${label}`}
                        />
                      ))}
                    </div>
                    {isHexagonal ? renderComputedIndex("t = -(u+v)", -(directionB[0] + directionB[1])) : null}
                  </label>
                  <label className="cryst-label">
                    Plane (hkl)
                    <div className="cryst-inline-inputs">
                      {["h", "k", "l"].map((label, idx) => (
                        <input
                          key={label}
                          type="number"
                          value={plane[idx]}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setPlane((vec) => {
                              const next = [...vec] as [number, number, number];
                              next[idx] = value;
                              return next;
                            });
                          }}
                          aria-label={`Plane ${label}`}
                        />
                      ))}
                    </div>
                    {isHexagonal ? renderComputedIndex("i = -(h+k)", -(plane[0] + plane[1])) : null}
                  </label>
                  <label className="cryst-checkbox">
                    <input
                      type="checkbox"
                      checked={includeEquivalents}
                      onChange={(e) => setIncludeEquivalents(e.target.checked)}
                    />
                    Include symmetry equivalents
                  </label>
                </div>
                <div className="cryst-panel__actions">
                  <button className="btn" type="button" disabled={!structure} onClick={handleCalculator}>
                    Compute angles
                  </button>
                </div>
                {calculator ? (
                  <div className="cryst-calculator">
                    <div className="cryst-calculator__result">
                      <p className="eyebrow">Angle between directions</p>
                      <p className="cryst-meta__value">
                        {calculator.direction_angle_deg !== null ? `${calculator.direction_angle_deg.toFixed(2)}°` : "—"}
                      </p>
                    </div>
                    <div className="cryst-calculator__result">
                      <p className="eyebrow">Plane ∠ Direction A</p>
                      <p className="cryst-meta__value">
                        {calculator.plane_vector_angle_deg !== null ? `${calculator.plane_vector_angle_deg.toFixed(2)}°` : "—"}
                      </p>
                    </div>
                    <div className="cryst-list">
                      <div className="cryst-list__header">Equivalent directions</div>
                      {(equivalents?.direction.three_index || []).slice(0, 12).map((hkl, idx) => (
                        <div key={idx} className="cryst-list__row">
                          <div className="badge">{hkl.join(" ")}</div>
                          {isHexagonal && equivalents?.direction.four_index?.[idx] ? (
                            <div className="cryst-list__meta">[uvtw] {equivalents.direction.four_index[idx].map((v) => v.toFixed(2)).join(" ")}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="cryst-list">
                      <div className="cryst-list__header">Equivalent planes</div>
                      {(equivalents?.plane.three_index || []).slice(0, 12).map((hkl, idx) => (
                        <div key={idx} className="cryst-list__row">
                          <div className="badge">{hkl.join(" ")}</div>
                          {isHexagonal && equivalents?.plane.four_index?.[idx] ? (
                            <div className="cryst-list__meta">(hkli) {equivalents.plane.four_index[idx].map((v) => v.toFixed(2)).join(" ")}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">Enter directions and a plane to compute angles and symmetry equivalents.</p>
                )}
              </>
            )}
          </div>
        </main>
      </div>
      {status.status ? <StatusMessage {...status.status} /> : null}
    </section>
  );
}
