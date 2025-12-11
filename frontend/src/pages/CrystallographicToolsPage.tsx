import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import crystallographyIcon from "../assets/unit_cell_icon.png";
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
  type SaedSpot,
  type StructurePayload,
  type XrdPeak,
  type XrdCurvePoint,
  exportStructure,
  fetchElementRadii,
  type ViewerLimits,
} from "../features/crystallographicTools/api";
import CrystalViewerTab from "../features/crystallographicTools/viewer/CrystalViewerTab";
import { SAMPLE_CIFS } from "../features/crystallographicTools/samples";
import { atomCountForSupercell, clampSupercell } from "../features/crystallographicTools/utils/crystalMath";
import { downloadBlob } from "../utils/files";
import "../styles/crystallography.css";

type TabKey = "viewer" | "xrd" | "tem" | "calculator";

const latticeFields = [
  { key: "a", label: "a (Å)" },
  { key: "b", label: "b (Å)" },
  { key: "c", label: "c (Å)" },
  { key: "alpha", label: "α (°)" },
  { key: "beta", label: "β (°)" },
  { key: "gamma", label: "γ (°)" },
] as const;

function SaedTooltip({ active, payload, isHexagonal = false }: any) {
  if (!active || !payload || !payload.length) return null;
  const spot = payload[0].payload as any;
  const hklLabel = isHexagonal ? formatIndexVector(planeThreeToFourLocal(spot.hkl)) : formatIndexVector(spot.hkl);
  return (
    <div className="cryst-tooltip">
      <div className="cryst-tooltip__title">({hklLabel})</div>
      <div>d = {spot.d_angstrom.toFixed(3)} Å</div>
      <div>2θ = {spot.two_theta_deg.toFixed(3)}°</div>
      <div>I = {spot.intensity_rel.toFixed(3)}</div>
    </div>
  );
}

function directionFourToThreeLocal([u, v, _t, w]: number[]): [number, number, number] {
  const H = 2 * u + v;
  const K = u + 2 * v;
  return [H, K, w];
}

function directionThreeToFourLocal([H, K, W]: number[]): [number, number, number, number] {
  const u = (2 * H - K) / 3;
  const v = (2 * K - H) / 3;
  const t = -(u + v);
  return [u, v, t, W];
}

function planeFourToThreeLocal([h, k, _i, l]: number[]): [number, number, number] {
  const H = 2 * h + k;
  const K = h + 2 * k;
  return [H, K, l];
}

function planeThreeToFourLocal([H, K, L]: number[]): [number, number, number, number] {
  const h = (2 * H - K) / 3;
  const k = (2 * K - H) / 3;
  const i = -(h + k);
  return [h, k, i, L];
}

function formatIndexValue(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-6) return `${rounded}`;
  return value.toFixed(1);
}

function formatIndexVector(values: number[]) {
  return values.map(formatIndexValue).join(" ");
}

const renderSaedPoint = (props: any) => {
  const { cx, cy, payload, r } = props;
  const isOrigin = payload?.isOrigin;
  const radius = isOrigin ? 8 : r || 4;
  const fill = isOrigin ? "#fbbf24" : "#2563eb";
  return <circle cx={cx} cy={cy} r={radius} fill={fill} stroke="#0b1224" strokeWidth={isOrigin ? 2 : 1} />;
};

export default function CrystallographicToolsPage() {
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [cifText, setCifText] = useState("");
  const [viewerLimits, setViewerLimits] = useState<ViewerLimits | null>(null);
  const [supercell, setSupercell] = useState<[number, number, number]>([3, 3, 3]);
  const [elementRadii, setElementRadii] = useState<Record<string, number>>({});
  const [peaks, setPeaks] = useState<XrdPeak[]>([]);
  const [xrdCurve, setXrdCurve] = useState<XrdCurvePoint[]>([]);
  const [xrdRange, setXrdRange] = useState<{ min: number; max: number; step?: number }>({ min: 10, max: 80 });
  const [xrdProfile, setXrdProfile] = useState<{ u: number; v: number; w: number; model: string } | null>(null);
  const [xrdInstrument, setXrdInstrument] = useState<{
    radiation: string;
    wavelength_angstrom: number | null;
    geometry: string;
    polarization_ratio: number | null;
  } | null>(null);
  const [xrdSummary, setXrdSummary] = useState<{ peak_count: number; max_intensity: number } | null>(null);
  const [saedPattern, setSaedPattern] = useState<SaedPattern | null>(null);
  const [calculator, setCalculator] = useState<CalculatorResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("viewer");

  const [radiation, setRadiation] = useState("CuKa");
  const [geometry, setGeometry] = useState("bragg_brentano");
  const [wavelengthAngstrom, setWavelengthAngstrom] = useState<number | "">(1.5406);
  const [polarizationRatio, setPolarizationRatio] = useState(0.5);
  const [thetaMin, setThetaMin] = useState(20);
  const [thetaMax, setThetaMax] = useState(80);
  const [thetaStep, setThetaStep] = useState(0.02);
  const [profileU, setProfileU] = useState(0.02);
  const [profileV, setProfileV] = useState(0.0);
  const [profileW, setProfileW] = useState(0.1);
  const [profileModel, setProfileModel] = useState("gaussian");

  const [zoneAxis, setZoneAxis] = useState<[number, number, number]>([0, 0, 1]);
  const [zoneAxisFour, setZoneAxisFour] = useState<[number, number, number, number] | null>(null);
  const [xAxis, setXAxis] = useState<[number, number, number] | null>(null);
  const [xAxisFour, setXAxisFour] = useState<[number, number, number, number] | null>(null);
  const [voltage, setVoltage] = useState(200);
  const [cameraLengthCm, setCameraLengthCm] = useState(10);
  const [maxIndex, setMaxIndex] = useState(3);
  const [minD, setMinD] = useState(0.5);
  const [intensityThreshold, setIntensityThreshold] = useState(0.01);
  const [inplaneRotation, setInplaneRotation] = useState(0);

  const [directionA, setDirectionA] = useState<[number, number, number]>([1, 0, 0]);
  const [directionB, setDirectionB] = useState<[number, number, number]>([0, 1, 0]);
  const [plane, setPlane] = useState<[number, number, number]>([1, 0, 0]);
  const [planeB, setPlaneB] = useState<[number, number, number]>([0, 1, 0]);
  const [includeEquivalents, setIncludeEquivalents] = useState(true);
  const [angleMode, setAngleMode] = useState<"dir_dir" | "dir_plane" | "plane_plane">("dir_plane");

  const status = useStatus({ message: "Upload a CIF or POSCAR to begin", level: "info" }, { context: "Crystallographic Tools" });
  useEffect(() => {
    fetchElementRadii()
      .then(setElementRadii)
      .catch(() => setElementRadii({}));
  }, []);
  const { withLoader } = useLoading();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const isHexagonal = structure?.is_hexagonal ?? false;
  const preferredSample = useMemo(
    () => SAMPLE_CIFS.find((item) => item.id.toLowerCase().includes("alpha-zrp63mmc")) || SAMPLE_CIFS[0],
    [],
  );
  const defaultSampleName = preferredSample?.name || "library";
  useEffect(() => {
    if (isHexagonal) {
      setZoneAxisFour(directionThreeToFourLocal(zoneAxis));
      setXAxisFour(xAxis ? planeThreeToFourLocal(xAxis) : null);
    } else {
      setZoneAxisFour(null);
      setXAxisFour(null);
    }
  }, [isHexagonal, zoneAxis, xAxis]);

  const handleUpload = useCallback(
    async (file?: File) => {
      const selected = file || fileInput.current?.files?.[0];
      if (!selected) return;
      try {
        const payload = await withLoader(() => loadCif(selected, { supercell }));
        const nextSupercell = clampSupercell(payload.viewer_limits?.supercell_requested ?? supercell, payload.viewer_limits?.supercell_max);
        setStructure(payload);
        setViewerLimits(payload.viewer_limits ?? null);
        setSupercell(nextSupercell);
        setCifText(payload.cif);
        setPeaks([]);
        setXrdCurve([]);
        setXrdProfile(null);
        setXrdInstrument(null);
        setXrdSummary(null);
        setSaedPattern(null);
        setCalculator(null);
        setZoneAxis([0, 0, 1]);
        setXAxis(null);
        setActiveTab("viewer");
        status.setStatus(`Loaded ${payload.formula}`, "success");
      } catch (error) {
        status.setStatus(error instanceof Error ? error.message : "Failed to load structure", "error");
      }
    },
    [status, supercell, withLoader],
  );

  const handleSupercellChange = useCallback(
    (next: [number, number, number]) => {
      const baseAtoms = viewerLimits?.atom_count ?? structure?.num_sites ?? 0;
      const maxAtoms = viewerLimits?.max_atoms ?? 500;
      const clamped = clampSupercell(next, viewerLimits?.supercell_max);
      const atomCount = atomCountForSupercell(baseAtoms, clamped);
      if (atomCount > maxAtoms) {
        status.setStatus(`Supercell exceeds viewer budget (${atomCount} > ${maxAtoms} atoms).`, "error");
        return;
      }
      setSupercell(clamped);
      setViewerLimits((current) =>
        current
          ? { ...current, supercell_requested: clamped, atom_count_supercell: atomCount }
          : current,
      );
    },
    [status, structure, viewerLimits],
  );

  const handleLoadSample = useCallback(async (sampleId?: string) => {
    const sample = SAMPLE_CIFS.find((item) => item.id === sampleId) || preferredSample || SAMPLE_CIFS[0];
    if (!sample) {
      status.setStatus("No bundled CIFs found. Please upload your own.", "error");
      return;
    }
    try {
      const payload = await withLoader(() => exportStructure({ cif: sample.cif, supercell, filename: `${sample.id}.cif` }));
      const nextSupercell = clampSupercell(payload.viewer_limits?.supercell_requested ?? supercell, payload.viewer_limits?.supercell_max);
      setStructure(payload);
      setViewerLimits(payload.viewer_limits ?? null);
      setSupercell(nextSupercell);
      setCifText(payload.cif);
      setPeaks([]);
      setXrdCurve([]);
      setXrdProfile(null);
      setXrdInstrument(null);
      setXrdSummary(null);
      setSaedPattern(null);
      setCalculator(null);
      setZoneAxis([0, 0, 1]);
      setXAxis(null);
      setActiveTab("viewer");
      status.setStatus(`Loaded ${sample.name}`, "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Failed to load sample", "error");
    }
  }, [preferredSample, status, supercell, withLoader]);

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
      setViewerLimits(payload.viewer_limits ?? null);
      if (payload.viewer_limits?.supercell_requested) {
        setSupercell(clampSupercell(payload.viewer_limits.supercell_requested, payload.viewer_limits.supercell_max));
      }
      status.setStatus("Structure updated", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "Edit failed", "error");
    }
  }, [structure, cifText, status, withLoader]);

  const handleXrd = useCallback(async () => {
    if (!structure) return;
    try {
      const pattern = await withLoader(() =>
        xrdPattern({
          cif: cifText || structure.cif,
          instrument: {
            radiation,
            wavelength_angstrom: wavelengthAngstrom === "" ? null : Number(wavelengthAngstrom),
            geometry,
            polarization_ratio: polarizationRatio,
          },
          two_theta: { min: thetaMin, max: thetaMax, step: thetaStep },
          profile: { u: profileU, v: profileV, w: profileW, profile: profileModel },
        }),
      );
      setPeaks(pattern.peaks);
      setXrdCurve(pattern.curve);
      setXrdRange(pattern.range);
      setXrdProfile(pattern.profile);
      setXrdInstrument(pattern.instrument);
      setXrdSummary(pattern.summary);
      status.setStatus("XRD peaks computed", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "XRD calculation failed", "error");
    }
  }, [structure, cifText, radiation, geometry, wavelengthAngstrom, polarizationRatio, thetaMin, thetaMax, thetaStep, profileU, profileV, profileW, profileModel, status, withLoader]);

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
      setDisplayCutoff(intensityThreshold);
      status.setStatus("SAED pattern simulated", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "SAED calculation failed", "error");
    }
  }, [structure, cifText, zoneAxis, voltage, cameraLengthCm, maxIndex, minD, intensityThreshold, xAxis, inplaneRotation, status, withLoader]);

  const updateZoneAxisFromFour = useCallback(
    (value: number, index: 0 | 1 | 3) => {
      setZoneAxisFour((current) => {
        const base = current ? [...current] : directionThreeToFourLocal(zoneAxis);
        base[index] = value;
        base[2] = -(base[0] + base[1]);
        const threeIndex = directionFourToThreeLocal(base as [number, number, number, number]);
        setZoneAxis(threeIndex);
        return base as [number, number, number, number];
      });
    },
    [zoneAxis],
  );

  const updateXAxisFromFour = useCallback(
    (value: number, index: 0 | 1 | 3) => {
      setXAxisFour((current) => {
        const fallback = xAxis ? planeThreeToFourLocal(xAxis) : [0, 0, 0, 0];
        const base = current ? [...current] : fallback;
        base[index] = value;
        base[2] = -(base[0] + base[1]);
        const nextThree = planeFourToThreeLocal(base as [number, number, number, number]);
        if (nextThree.every((v) => Math.abs(v) < 1e-6)) {
          setXAxis(null);
        } else {
          setXAxis(nextThree as [number, number, number]);
        }
        return base as [number, number, number, number];
      });
    },
    [xAxis],
  );

  const handleCalculator = useCallback(async () => {
    if (!structure) return;
    const dirAPayload =
      angleMode !== "plane_plane"
        ? isHexagonal
          ? [directionA[0], directionA[1], -(directionA[0] + directionA[1]), directionA[2]]
          : directionA
        : undefined;
    const dirBPayload =
      angleMode === "dir_dir"
        ? isHexagonal
          ? [directionB[0], directionB[1], -(directionB[0] + directionB[1]), directionB[2]]
          : directionB
        : undefined;
    const planePayload =
      angleMode !== "dir_dir" ? (isHexagonal ? [plane[0], plane[1], -(plane[0] + plane[1]), plane[2]] : plane) : undefined;
    const planeBPayload =
      angleMode === "plane_plane"
        ? isHexagonal
          ? [planeB[0], planeB[1], -(planeB[0] + planeB[1]), planeB[2]]
          : planeB
        : undefined;

    const calculatorPayload: {
      cif: string;
      directionA?: number[];
      directionB?: number[];
      plane?: number[];
      planeB?: number[];
      includeEquivalents?: boolean;
    } = {
      cif: cifText || structure.cif,
      includeEquivalents,
    };
    if (dirAPayload) {
      calculatorPayload.directionA = dirAPayload;
    }
    if (dirBPayload) {
      calculatorPayload.directionB = dirBPayload;
    }
    if (planePayload) {
      calculatorPayload.plane = planePayload;
    }
    if (planeBPayload) {
      calculatorPayload.planeB = planeBPayload;
    }
    try {
      const result = await withLoader(() =>
        runCalculator(calculatorPayload),
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
  const [displayCutoff, setDisplayCutoff] = useState(0);
  const formatSaedIndices = useCallback(
    (spot: Pick<SaedSpot, "hkl" | "hkil">) => {
      if (spot.hkil && isHexagonal) return formatIndexVector(spot.hkil);
      return isHexagonal ? formatIndexVector(planeThreeToFourLocal(spot.hkl)) : formatIndexVector(spot.hkl);
    },
    [isHexagonal],
  );

  const renderComputedIndex = (label: string, value: number) => (
    <div className="cryst-computed" aria-live="polite">
      <span>{label}</span>
      <input value={value.toFixed(3)} readOnly aria-label={label} />
    </div>
  );

  return (
    <section className="cryst-page-container surface-block cryst-shell" aria-labelledby="cryst-tools-title">
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

      <div className="cryst-tabs" role="tablist" aria-label="Crystallographic tools">
        {[
          { key: "viewer", label: "Crystal Viewer" },
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

      {activeTab === "viewer" ? (
        <div className="cryst-panel cryst-panel--flush">
          <CrystalViewerTab
            structure={structure}
            supercell={supercell}
            limits={viewerLimits ?? undefined}
            elementRadii={elementRadii}
            samples={SAMPLE_CIFS}
            fileInputRef={fileInput}
            onUploadFile={handleUpload}
            onLoadSample={handleLoadSample}
            onSupercellChange={handleSupercellChange}
            onSendToXrd={() => setActiveTab("xrd")}
            onSendToTem={() => setActiveTab("tem")}
          />
        </div>
      ) : (
        <div className="cryst-compact__grid">
          <aside className="cryst-sidebar">
            <section className="cryst-card">
              <p className="eyebrow">Workspace</p>
              <p className="cryst-card__summary">Load one structure and reuse it across tabs.</p>
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
                <p className="muted">Upload a CIF or POSCAR to begin.</p>
              )}
            </section>

            <section className="cryst-panel">
              <header className="cryst-panel__header">
                <div>
                  <p className="eyebrow">Structure</p>
                  <h2>Load & edit</h2>
                  <p className="muted">Upload once; edits propagate to all tabs.</p>
                </div>
                <div className="cryst-actions">
                  <button className="btn" type="button" onClick={() => fileInput.current?.click()}>
                    Upload
                  </button>
                  <button className="btn btn--subtle" type="button" onClick={() => handleLoadSample(preferredSample?.id)}>
                    Load {defaultSampleName} sample
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".cif,.vasp,.poscar,.txt"
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
            <div className="cryst-panel">
              {activeTab === "xrd" && (
                <>
                  <header className="cryst-panel__header">
                    <div>
                      <p className="eyebrow">Powder XRD</p>
                      <h2>Simulate diffraction peaks</h2>
                      <p className="muted">Instrument-aware peak table with Caglioti broadening.</p>
                    </div>
                  </header>
                  <div className="cryst-grid cryst-grid--two">
                    <div className="cryst-subpanel">
                      <div className="cryst-subpanel__header">
                        <div>
                          <p className="eyebrow">Instrument</p>
                          <h3>Beam & geometry</h3>
                        </div>
                        <div className="cryst-chip-row">
                          {[
                            { label: "Cu Kα (1.5406 Å)", radiation: "CuKa", wavelength: 1.5406 },
                            { label: "Mo Kα (0.7093 Å)", radiation: "MoKa", wavelength: 0.7093 },
                            { label: "Fe Kα (1.9360 Å)", radiation: "FeKa", wavelength: 1.936 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              className="cryst-chip"
                              onClick={() => {
                                setRadiation(preset.radiation);
                                setWavelengthAngstrom(preset.wavelength);
                              }}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="cryst-grid">
                        <label className="cryst-label">
                          Radiation label
                          <input value={radiation} onChange={(e) => setRadiation(e.target.value)} />
                        </label>
                        <label className="cryst-label">
                          Wavelength (Å)
                          <input
                            type="number"
                            step="0.0001"
                            value={wavelengthAngstrom}
                            onChange={(e) => setWavelengthAngstrom(e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </label>
                        <label className="cryst-label">
                          Geometry
                          <select value={geometry} onChange={(e) => setGeometry(e.target.value)}>
                            <option value="bragg_brentano">Bragg–Brentano</option>
                            <option value="transmission">Transmission / Debye–Scherrer</option>
                          </select>
                        </label>
                        <label className="cryst-label">
                          Polarization ratio (K)
                          <input
                            type="number"
                            step="0.05"
                            min={0}
                            value={polarizationRatio}
                            onChange={(e) => setPolarizationRatio(Number(e.target.value))}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="cryst-subpanel">
                      <div className="cryst-subpanel__header">
                        <div>
                          <p className="eyebrow">Scan window</p>
                          <h3>2θ grid & profile</h3>
                        </div>
                        <p className="muted">Caglioti FWHM: √(U tan²θ + V tanθ + W)</p>
                      </div>
                      <div className="cryst-grid">
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
                        <label className="cryst-label">
                          Profile model
                          <select value={profileModel} onChange={(e) => setProfileModel(e.target.value)}>
                            <option value="gaussian">Gaussian</option>
                            <option value="pseudo_voigt">Pseudo-Voigt</option>
                          </select>
                        </label>
                        <label className="cryst-label">
                          U
                          <input type="number" step="0.001" value={profileU} onChange={(e) => setProfileU(Number(e.target.value))} />
                        </label>
                        <label className="cryst-label">
                          V
                          <input type="number" step="0.001" value={profileV} onChange={(e) => setProfileV(Number(e.target.value))} />
                        </label>
                        <label className="cryst-label">
                          W
                          <input type="number" step="0.001" value={profileW} onChange={(e) => setProfileW(Number(e.target.value))} />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="cryst-panel__actions">
                    <button className="btn" type="button" disabled={!structure} onClick={handleXrd}>
                      Compute XRD
                    </button>
                    <button className="btn btn--subtle" type="button" onClick={() => handleLoadSample()}>
                      Load Fe α preset
                    </button>
                  </div>
                  {xrdInstrument || xrdProfile ? (
                    <div className="cryst-meta-bar" aria-live="polite">
                      {xrdInstrument ? (
                        <div className="cryst-chip">{`${xrdInstrument.radiation} · ${xrdInstrument.geometry.replace("_", " ")}`}</div>
                      ) : null}
                      {xrdInstrument?.wavelength_angstrom ? (
                        <div className="cryst-chip">λ = {xrdInstrument.wavelength_angstrom.toFixed(4)} Å</div>
                      ) : null}
                      {xrdInstrument?.polarization_ratio !== null ? (
                        <div className="cryst-chip">K = {xrdInstrument.polarization_ratio?.toFixed(2)}</div>
                      ) : null}
                      {xrdProfile ? (
                        <div className="cryst-chip">Profile: {xrdProfile.model} (U={xrdProfile.u}, V={xrdProfile.v}, W={xrdProfile.w})</div>
                      ) : null}
                      {xrdSummary ? (
                        <div className="cryst-chip">Peaks: {xrdSummary.peak_count}</div>
                      ) : null}
                    </div>
                  ) : null}
                  {peaks.length ? (
                    <div className="cryst-xrd">
                      <div className="cryst-xrd__chart">
                        <ResponsiveContainer width="100%" height={500}>
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
                            <ReferenceArea x1={thetaMin} x2={thetaMax} fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.12)" />
                            <Line type="monotone" dataKey="intensity" stroke="#22d3ee" dot={false} strokeWidth={2} />
                            <Bar dataKey="intensity_normalized" data={xrdChartData} barSize={6} fill="rgba(16,185,129,0.7)" />
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
                        <table className="cryst-table">
                          <thead>
                            <tr>
                              <th>(hkl)</th>
                              <th className="text-right">2θ (°)</th>
                              <th className="text-right">d (Å)</th>
                              <th className="text-right">I (raw)</th>
                              <th className="text-right">I (LP)</th>
                              <th className="text-right">I (rel) %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {peaks
                              .slice()
                              .sort((a, b) => b.intensity_normalized - a.intensity_normalized)
                              .map((peak, index) => (
                                <tr key={index}>
                                  <td className="font-mono">{peak.hkl.join(" ") || "hkl"}</td>
                                  <td className="text-right">{peak.two_theta.toFixed(3)}</td>
                                  <td className="text-right">{peak.d_spacing.toFixed(4)}</td>
                                  <td className="text-right">{peak.intensity.toFixed(2)}</td>
                                  <td className="text-right">{peak.intensity_lp.toFixed(2)}</td>
                                  <td className="text-right">{peak.intensity_normalized.toFixed(1)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
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
                    {["u", "v", "w"].map((label, idx) => (
                      <label key={label} className="cryst-label">
                        Zone axis {label}
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
                    {isHexagonal ? renderComputedIndex("t = -(u+v)", -(zoneAxis[0] + zoneAxis[1])) : null}
                  </div>
                  {isHexagonal ? (
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                      <label className="cryst-label">
                        Zone axis (Miller–Bravais)
                        <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                          <input
                            type="number"
                            aria-label="Zone u (four-index)"
                            value={zoneAxisFour?.[0] ?? ""}
                            onChange={(e) => updateZoneAxisFromFour(Number(e.target.value), 0)}
                            placeholder="u"
                          />
                          <input
                            type="number"
                            aria-label="Zone v (four-index)"
                            value={zoneAxisFour?.[1] ?? ""}
                            onChange={(e) => updateZoneAxisFromFour(Number(e.target.value), 1)}
                            placeholder="v"
                          />
                          <input
                            type="number"
                            aria-label="Zone t (derived)"
                            value={zoneAxisFour ? -(zoneAxisFour[0] + zoneAxisFour[1]) : ""}
                            readOnly
                          />
                          <input
                            type="number"
                            aria-label="Zone w (four-index)"
                            value={zoneAxisFour?.[3] ?? ""}
                            onChange={(e) => updateZoneAxisFromFour(Number(e.target.value), 3)}
                            placeholder="w"
                          />
                        </div>
                        <p className="muted">t is enforced as -(u+v). Payload is converted to [H K L] before simulation.</p>
                      </label>
                    </div>
                  ) : null}
                  <div className="cryst-grid cryst-grid--three">
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
                      Align x-axis to plane (hkl) (optional)
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
                                const next = axis ? ([...axis] as [number, number, number]) : [0, 0, 0];
                                next[idx] = value;
                                return next;
                              });
                            }}
                          />
                        ))}
                      </div>
                      {isHexagonal && xAxis ? (
                        <p className="muted" aria-live="polite">
                          i (derived) = {-(xAxis[0] + xAxis[1])}
                        </p>
                      ) : null}
                      {isHexagonal ? (
                        <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                          <input
                            type="number"
                            aria-label="x-axis h (four-index)"
                            value={xAxisFour?.[0] ?? ""}
                            onChange={(e) => updateXAxisFromFour(Number(e.target.value), 0)}
                            placeholder="h"
                          />
                          <input
                            type="number"
                            aria-label="x-axis k (four-index)"
                            value={xAxisFour?.[1] ?? ""}
                            onChange={(e) => updateXAxisFromFour(Number(e.target.value), 1)}
                            placeholder="k"
                          />
                          <input
                            type="number"
                            aria-label="x-axis i (derived)"
                            value={xAxisFour ? -(xAxisFour[0] + xAxisFour[1]) : ""}
                            readOnly
                          />
                          <input
                            type="number"
                            aria-label="x-axis l (four-index)"
                            value={xAxisFour?.[3] ?? ""}
                            onChange={(e) => updateXAxisFromFour(Number(e.target.value), 3)}
                            placeholder="l"
                          />
                        </div>
                      ) : null}
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
                    {saedPattern ? (
                      <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                        <label className="cryst-label">
                          Display intensity ≥
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            max={1}
                            value={displayCutoff}
                            onChange={(e) => setDisplayCutoff(Number(e.target.value))}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                  {saedPattern ? (
                    <>
                      <div className="cryst-saed">
                        <div className="cryst-saed__chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, left: 10, right: 10, bottom: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" dataKey="x_norm" name="X" tick={{ fontSize: 12 }} domain={[-1.05, 1.05]} />
                              <YAxis type="number" dataKey="y_norm" name="Y" tick={{ fontSize: 12 }} domain={[-1.05, 1.05]} />
                              <Tooltip content={(props) => <SaedTooltip isHexagonal={isHexagonal} {...props} />} />
                              <Scatter
                                data={saedPattern.spots
                                  .filter(
                                    (spot) =>
                                      spot.hkl.every((v) => v === 0) || spot.intensity_rel >= displayCutoff,
                                  )
                                  .map((spot) => ({
                                    ...spot,
                                    size: 6 + 80 * spot.intensity_rel,
                                    isOrigin: spot.hkl.every((v) => v === 0),
                                  }))}
                                shape={renderSaedPoint}
                                fill="#2563eb"
                              />
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="cryst-list">
                        <div className="cryst-list__header">Top reflections ({saedPattern.spots.length})</div>
                        {saedPattern.spots.slice(0, 20).map((spot, idx) => (
                          <div key={idx} className="cryst-list__row">
                            <div className="badge">{formatSaedIndices(spot)}</div>
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
              <div className="cryst-grid cryst-grid--two">
                <label className="cryst-label">
                  Angle mode
                  <select value={angleMode} onChange={(e) => setAngleMode(e.target.value as typeof angleMode)}>
                    <option value="dir_dir">Direction ↔ Direction</option>
                    <option value="dir_plane">Direction ↔ Plane</option>
                    <option value="plane_plane">Plane ↔ Plane</option>
                  </select>
                </label>
              </div>
              <div className="cryst-field-row">
                {(angleMode === "dir_dir" || angleMode === "dir_plane") && (
                  <label className="cryst-label">
                    {angleMode === "dir_dir" ? "Direction 1" : "Direction"}
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                      <input
                        type="number"
                        value={directionA[0]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionA(([_, v, w]) => [value, v, w]);
                        }}
                        aria-label="Direction A u"
                      />
                      <input
                        type="number"
                        value={directionA[1]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionA(([u, _, w]) => [u, value, w]);
                        }}
                        aria-label="Direction A v"
                      />
                      {isHexagonal ? (
                        <input value={-(directionA[0] + directionA[1])} readOnly aria-label="Direction A t (derived)" />
                      ) : null}
                      <input
                        type="number"
                        value={directionA[2]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionA(([u, v, _]) => [u, v, value]);
                        }}
                        aria-label="Direction A w"
                      />
                    </div>
                    <p className="muted">{isHexagonal ? "[uvtw]" : "[uvw]"}</p>
                  </label>
                )}

                {angleMode === "dir_dir" && (
                  <label className="cryst-label">
                    Direction 2
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                      <input
                        type="number"
                        value={directionB[0]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionB(([_, v, w]) => [value, v, w]);
                        }}
                        aria-label="Direction B u"
                      />
                      <input
                        type="number"
                        value={directionB[1]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionB(([u, _, w]) => [u, value, w]);
                        }}
                        aria-label="Direction B v"
                      />
                      {isHexagonal ? (
                        <input value={-(directionB[0] + directionB[1])} readOnly aria-label="Direction B t (derived)" />
                      ) : null}
                      <input
                        type="number"
                        value={directionB[2]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setDirectionB(([u, v, _]) => [u, v, value]);
                        }}
                        aria-label="Direction B w"
                      />
                    </div>
                    <p className="muted">{isHexagonal ? "[uvtw]" : "[uvw]"}</p>
                  </label>
                )}

                {(angleMode === "dir_plane" || angleMode === "plane_plane") && (
                  <label className="cryst-label">
                    {angleMode === "plane_plane" ? "Plane 1" : "Plane"}
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                      <input
                        type="number"
                        value={plane[0]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlane(([_, k, l]) => [value, k, l]);
                        }}
                        aria-label="Plane h"
                      />
                      <input
                        type="number"
                        value={plane[1]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlane(([h, _, l]) => [h, value, l]);
                        }}
                        aria-label="Plane k"
                      />
                      {isHexagonal ? <input value={-(plane[0] + plane[1])} readOnly aria-label="Plane i (derived)" /> : null}
                      <input
                        type="number"
                        value={plane[2]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlane(([h, k, _]) => [h, k, value]);
                        }}
                        aria-label="Plane l"
                      />
                    </div>
                    <p className="muted">{isHexagonal ? "(hkil)" : "(hkl)"}</p>
                  </label>
                )}

                {angleMode === "plane_plane" && (
                  <label className="cryst-label">
                    Plane 2
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                      <input
                        type="number"
                        value={planeB[0]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlaneB(([_, k, l]) => [value, k, l]);
                        }}
                        aria-label="Plane B h"
                      />
                      <input
                        type="number"
                        value={planeB[1]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlaneB(([h, _, l]) => [h, value, l]);
                        }}
                        aria-label="Plane B k"
                      />
                      {isHexagonal ? <input value={-(planeB[0] + planeB[1])} readOnly aria-label="Plane B i (derived)" /> : null}
                      <input
                        type="number"
                        value={planeB[2]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setPlaneB(([h, k, _]) => [h, k, value]);
                        }}
                        aria-label="Plane B l"
                      />
                    </div>
                    <p className="muted">{isHexagonal ? "(hkil)" : "(hkl)"}</p>
                  </label>
                )}

                <label className="cryst-checkbox cryst-checkbox--inline">
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
                    {angleMode === "dir_dir" && (
                      <div className="cryst-calculator__result">
                        <p className="eyebrow">Angle between directions</p>
                        <p className="cryst-meta__value">
                          {calculator.direction_angle_deg !== null ? `${calculator.direction_angle_deg.toFixed(2)}°` : "—"}
                        </p>
                      </div>
                    )}
                    {angleMode === "dir_plane" && (
                      <div className="cryst-calculator__result">
                        <p className="eyebrow">Direction ↔ Plane</p>
                        <p className="cryst-meta__value">
                          {calculator.plane_vector_angle_deg !== null ? `${calculator.plane_vector_angle_deg.toFixed(2)}°` : "—"}
                        </p>
                      </div>
                    )}
                    {angleMode === "plane_plane" && (
                      <div className="cryst-calculator__result">
                        <p className="eyebrow">Angle between planes</p>
                        <p className="cryst-meta__value">
                          {calculator.plane_plane_angle_deg !== null ? `${calculator.plane_plane_angle_deg.toFixed(2)}°` : "—"}
                        </p>
                      </div>
                    )}
                      <div className="cryst-list">
                        <div className="cryst-list__header">Equivalent directions</div>
                        {(equivalents?.direction.three_index || []).slice(0, 12).map((hkl, idx) => (
                          <div key={idx} className="cryst-list__row">
                            <div className="badge">{hkl.join(" ")}</div>
                            {isHexagonal && equivalents?.direction.four_index?.[idx] ? (
                              <div className="cryst-list__meta">[uvtw] {formatIndexVector(equivalents.direction.four_index[idx])}</div>
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
                              <div className="cryst-list__meta">(hkli) {formatIndexVector(equivalents.plane.four_index[idx])}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Enter directions and planes to compute angles and symmetry equivalents.</p>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      )}
      {status.status ? <StatusMessage {...status.status} /> : null}
    </section>
  );
}
