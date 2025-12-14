import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
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
  const hklLabel = isHexagonal && spot?.hkil?.length
    ? formatIndexVector(spot.hkil)
    : isHexagonal
      ? formatIndexVector(planeThreeToFourLocal(spot.hkl))
      : formatIndexVector(spot.hkl);
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

function isOriginHkl(hkl: number[] | undefined) {
  return Array.isArray(hkl) && hkl.length === 3 && hkl.every((v) => v === 0);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeFilename(value: string) {
  return value
    .trim()
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 120);
}

const renderSaedPoint = (props: any) => {
  const { cx, cy, payload } = props;
  const isOrigin = payload?.isOrigin;
  const rawRadius = Number(payload?.radius_px ?? props.size ?? payload?.size ?? props.r);
  const radius = isOrigin ? 8 : clampNumber(Number.isFinite(rawRadius) ? rawRadius : 4, 1.5, 24);
  const fill = isOrigin ? "#fbbf24" : "#2563eb";
  const testId = isOrigin
    ? "saed-spot-origin"
    : Array.isArray(payload?.hkl)
      ? `saed-spot-${payload.hkl.join("_")}`
      : "saed-spot";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={fill}
      stroke="#0b1224"
      strokeWidth={isOrigin ? 2 : 1}
      data-testid={testId}
    />
  );
};

const renderSaedDebugCirclePoint = (props: any) => {
  const { cx, cy } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={1.8}
      fill="#e2e8f0"
      opacity={0.65}
      pointerEvents="none"
    />
  );
};

export default function CrystallographicToolsPage() {
  const SAED_CHART_MARGIN = useMemo(() => ({ top: 10, left: 10, right: 10, bottom: 10 }), []);
  const SAED_X_AXIS_HEIGHT = 0;
  const SAED_Y_AXIS_WIDTH = 0;
  const SAED_DEBUG_CIRCLE_POINTS = 64;
  const saedDebugControlsEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("saed_debug_circle");
  }, []);
  const [showSaedDebugCircle, setShowSaedDebugCircle] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("saed_debug_circle") === "1";
  });

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
        }),
      );
      setSaedPattern(pattern);
      setDisplayCutoff(intensityThreshold);
      setSaedRotationDeg(0);
      setSaedSpotScale(1);
      setShowSaedInfo(false);
      status.setStatus("SAED pattern simulated", "success");
    } catch (error) {
      status.setStatus(error instanceof Error ? error.message : "SAED calculation failed", "error");
    }
  }, [structure, cifText, zoneAxis, voltage, cameraLengthCm, maxIndex, minD, intensityThreshold, xAxis, status, withLoader]);

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
  const [showSaedReflections, setShowSaedReflections] = useState(false);
  const [saedSpotScale, setSaedSpotScale] = useState(1);
  const [saedRotationDeg, setSaedRotationDeg] = useState(0);
  const [showSaedInfo, setShowSaedInfo] = useState(false);
  const saedChartRef = useRef<HTMLDivElement | null>(null);
  const [saedChartSize, setSaedChartSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [saedCamera, setSaedCamera] = useState<{ cx: number; cy: number; scale: number }>({
    cx: 0,
    cy: 0,
    scale: 1.05,
  });
  const formatSaedIndices = useCallback(
    (spot: Pick<SaedSpot, "hkl" | "hkil">) => {
      if (spot.hkil && isHexagonal) return formatIndexVector(spot.hkil);
      return isHexagonal ? formatIndexVector(planeThreeToFourLocal(spot.hkl)) : formatIndexVector(spot.hkl);
    },
    [isHexagonal],
  );

  useEffect(() => {
    const element = saedChartRef.current;
    if (!element) return undefined;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSaedChartSize({ width: rect.width, height: rect.height });
    };
    update();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  const saedPlotAspect = useMemo(() => {
    const { width, height } = saedChartSize;
    const plotWidth = Math.max(width - SAED_CHART_MARGIN.left - SAED_CHART_MARGIN.right - SAED_Y_AXIS_WIDTH, 1);
    const plotHeight = Math.max(height - SAED_CHART_MARGIN.top - SAED_CHART_MARGIN.bottom - SAED_X_AXIS_HEIGHT, 1);
    return plotWidth / plotHeight;
  }, [SAED_CHART_MARGIN, SAED_X_AXIS_HEIGHT, SAED_Y_AXIS_WIDTH, saedChartSize]);

  const computeSaedFitScale = useCallback(
    (pattern: SaedPattern | null) => {
      if (!pattern?.spots?.length) return 1.05;
      const maxR = Math.max(...pattern.spots.map((spot) => Math.hypot(spot.x_norm ?? 0, spot.y_norm ?? 0)), 1e-6);
      const aspect = Math.max(saedPlotAspect, 1e-6);
      const required = maxR * Math.max(1, 1 / aspect);
      return Math.min(Math.max(required * 1.05, 0.05), 50);
    },
    [saedPlotAspect],
  );

  useEffect(() => {
    if (!saedPattern?.spots?.length) return;
    setSaedCamera({ cx: 0, cy: 0, scale: computeSaedFitScale(saedPattern) });
  }, [computeSaedFitScale, saedPattern]);

  useEffect(() => {
    if (!showSaedInfo || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSaedInfo(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSaedInfo]);

  const saedDomains = useMemo((): { x: [number, number]; y: [number, number] } => {
    const aspect = Math.max(saedPlotAspect, 1e-6);
    const xHalf = saedCamera.scale * aspect;
    const yHalf = saedCamera.scale;
    return {
      x: [saedCamera.cx - xHalf, saedCamera.cx + xHalf],
      y: [saedCamera.cy - yHalf, saedCamera.cy + yHalf],
    };
  }, [saedCamera, saedPlotAspect]);

  const saedDebugCircleData = useMemo(() => {
    if (!showSaedDebugCircle || !saedPattern?.spots?.length) return [];

    const spots = saedPattern.spots;
    const visibleCandidates = spots.filter((spot) => !isOriginHkl(spot.hkl) && spot.intensity_rel >= displayCutoff);
    const candidates = visibleCandidates.length ? visibleCandidates : spots.filter((spot) => !isOriginHkl(spot.hkl));
    if (!candidates.length) return [];

    const radii = candidates
      .map((spot) => Math.hypot(spot.x_norm ?? 0, spot.y_norm ?? 0))
      .filter((radius) => Number.isFinite(radius) && radius > 0);
    if (!radii.length) return [];

    const radius = Math.min(...radii);
    return Array.from({ length: SAED_DEBUG_CIRCLE_POINTS }, (_, idx) => {
      const theta = (2 * Math.PI * idx) / SAED_DEBUG_CIRCLE_POINTS;
      return {
        x_norm: radius * Math.cos(theta),
        y_norm: radius * Math.sin(theta),
      };
    });
  }, [SAED_DEBUG_CIRCLE_POINTS, displayCutoff, saedPattern, showSaedDebugCircle]);

  const saedChartData = useMemo(() => {
    if (!saedPattern) return [];
    const rotationRad = (saedRotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rotationRad);
    const sinR = Math.sin(rotationRad);
    return saedPattern.spots
      .filter((spot) => spot.hkl.every((v) => v === 0) || spot.intensity_rel >= displayCutoff)
      .map((spot) => {
        const isOrigin = spot.hkl.every((v) => v === 0);
        const label = formatSaedIndices(spot);
        const x0 = spot.x_norm ?? 0;
        const y0 = spot.y_norm ?? 0;
        const xRot = cosR * x0 - sinR * y0;
        const yRot = sinR * x0 + cosR * y0;
        const intensity = Math.max(spot.intensity_rel ?? 0, 0);
        const radiusPx = isOrigin ? 8 : (2.4 + 6.8 * Math.sqrt(intensity)) * saedSpotScale;
        return {
          ...spot,
          x_norm: xRot,
          y_norm: yRot,
          radius_px: radiusPx,
          isOrigin,
          reflectionLabel: showSaedReflections ? `(${label})` : "",
        };
      });
  }, [displayCutoff, formatSaedIndices, saedPattern, saedRotationDeg, saedSpotScale, showSaedReflections]);

  const saedAxisReflections = useMemo(() => {
    if (!saedChartData.length) return { x: null as string | null, y: null as string | null };

    const candidates = saedChartData.filter(
      (spot: any) =>
        !spot.isOrigin &&
        typeof spot.x_norm === "number" &&
        typeof spot.y_norm === "number" &&
        Number.isFinite(spot.x_norm) &&
        Number.isFinite(spot.y_norm),
    );
    if (!candidates.length) return { x: null as string | null, y: null as string | null };

    const wrapAngle = (rad: number) => {
      let value = rad;
      while (value > Math.PI) value -= 2 * Math.PI;
      while (value < -Math.PI) value += 2 * Math.PI;
      return value;
    };

    const pickClosest = (targetRad: number, prefer: (spot: any) => boolean) => {
      const preferred = candidates.filter(prefer);
      const pool = preferred.length ? preferred : candidates;
      let best: any = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const spot of pool) {
        const angle = Math.atan2(spot.y_norm, spot.x_norm);
        const diff = Math.abs(wrapAngle(angle - targetRad));
        const score = diff - 0.0001 * (spot.intensity_rel ?? 0);
        if (score < bestScore) {
          bestScore = score;
          best = spot;
        }
      }
      return best;
    };

    const xSpot = pickClosest(0, (spot) => spot.x_norm > 0);
    const ySpot = pickClosest(Math.PI / 2, (spot) => spot.y_norm > 0);

    return {
      x: xSpot ? `(${formatSaedIndices(xSpot)})` : null,
      y: ySpot ? `(${formatSaedIndices(ySpot)})` : null,
    };
  }, [formatSaedIndices, saedChartData]);

  const renderSaedReflectionLabel = useCallback((props: any) => {
    const { x, y, value, payload } = props;
    if (!value) return null;
    const xNorm = typeof payload?.x_norm === "number" ? payload.x_norm : 0;
    const dx = xNorm >= 0 ? 10 : -10;
    const anchor = xNorm >= 0 ? "start" : "end";
    return (
      <text
        x={x}
        y={y}
        dx={dx}
        dy={-6}
        textAnchor={anchor}
        fontSize={11}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
        fill="#e2e8f0"
        stroke="#0b1224"
        strokeWidth={3}
        style={{ paintOrder: "stroke", strokeLinejoin: "round" }}
        pointerEvents="none"
        data-testid="saed-reflection-label"
      >
        {value}
      </text>
    );
  }, []);

  const zoomSaed = useCallback((factor: number) => {
    setSaedCamera((current) => ({
      ...current,
      scale: Math.min(Math.max(current.scale / factor, 0.02), 50),
    }));
  }, []);

  const panSaed = useCallback((dxFraction: number, dyFraction: number) => {
    setSaedCamera((current) => {
      const aspect = Math.max(saedPlotAspect, 1e-6);
      const xRange = current.scale * aspect * 2;
      const yRange = current.scale * 2;
      return {
        ...current,
        cx: current.cx + dxFraction * xRange,
        cy: current.cy + dyFraction * yRange,
      };
    });
  }, [saedPlotAspect]);

  const resetSaedView = useCallback(() => {
    setSaedCamera({ cx: 0, cy: 0, scale: computeSaedFitScale(saedPattern) });
  }, [computeSaedFitScale, saedPattern]);

  const handleSaedWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!saedPattern) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      zoomSaed(direction);
    },
    [saedPattern, zoomSaed],
  );

  const downloadSaedReport = useCallback(() => {
    if (!saedPattern) return;

    const svgElement = saedChartRef.current?.querySelector("svg");
    if (!svgElement) {
      status.setStatus("SAED chart not ready for export", "error");
      return;
    }

    const clone = svgElement.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("viewBox")) {
      const widthAttr = clone.getAttribute("width");
      const heightAttr = clone.getAttribute("height");
      const width = widthAttr && !widthAttr.includes("%") ? Number(widthAttr) : saedChartSize.width || 800;
      const height = heightAttr && !heightAttr.includes("%") ? Number(heightAttr) : saedChartSize.height || 800;
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const svgMarkup = new XMLSerializer().serializeToString(clone);
    const meta = saedPattern.metadata;
    const generatedAt = new Date().toISOString();
    const zoneAxisLabel = `[${formatIndexVector(meta.zone_axis)}]${
      meta.zone_axis_four_index ? ` / [${formatIndexVector(meta.zone_axis_four_index)}]` : ""
    }`;
    const xAxisAlignLabel = meta.x_axis_hkl
      ? `(${formatIndexVector(meta.x_axis_hkl)})${
          meta.x_axis_hkl_four_index ? ` / (${formatIndexVector(meta.x_axis_hkl_four_index)})` : ""
        }`
      : "Auto";

    const rotationRad = (saedRotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rotationRad);
    const sinR = Math.sin(rotationRad);
    const reportSpots = saedPattern.spots.map((spot) => {
      const x0 = spot.x_norm ?? 0;
      const y0 = spot.y_norm ?? 0;
      const xRot = cosR * x0 - sinR * y0;
      const yRot = sinR * x0 + cosR * y0;
      const displayed = spot.hkl.every((v) => v === 0) || spot.intensity_rel >= displayCutoff;
      return { ...spot, x_norm_rot: xRot, y_norm_rot: yRot, displayed };
    });

    const visibleCount = reportSpots.filter((spot) => spot.displayed).length;
    const metaRows: Array<[string, string]> = [
      ["Phase", meta.phase_name ?? "—"],
      ["Formula", meta.formula],
      ["Space group", meta.spacegroup ?? "—"],
      ["Zone axis", zoneAxisLabel],
      ["X-axis align", xAxisAlignLabel],
      ["Screen +X", saedAxisReflections.x ?? "—"],
      ["Screen +Y", saedAxisReflections.y ?? "—"],
      ["Voltage", `${meta.voltage_kv.toFixed(1)} kV`],
      ["Camera length", `${meta.camera_length_cm.toFixed(2)} cm`],
      ["λ", `${meta.lambda_angstrom.toFixed(5)} Å`],
      ["Laue zone", `${meta.laue_zone}`],
      ["Min d", meta.min_d_angstrom == null ? "—" : `${meta.min_d_angstrom.toFixed(3)} Å`],
      ["Max index", `${meta.max_index}`],
      ["Intensity min", `${meta.intensity_min_relative.toFixed(3)}`],
      ["Display cutoff", `${displayCutoff.toFixed(3)}`],
      ["Spot size", `${saedSpotScale.toFixed(2)}×`],
      ["Rotation", `${saedRotationDeg.toFixed(0)}°`],
      ["Spots shown", `${visibleCount} / ${reportSpots.length}`],
      ["Pan / zoom", `cx=${saedCamera.cx.toFixed(3)}, cy=${saedCamera.cy.toFixed(3)}, scale=${saedCamera.scale.toFixed(3)}`],
    ];
    const metaTable = metaRows
      .map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
      .join("\n");

    const spotRows = reportSpots
      .map((spot) => {
        const reflection = `(${formatSaedIndices(spot)})`;
        const displayed = spot.displayed ? "yes" : "no";
        const displayedClass = spot.displayed ? "yes" : "no";
        return `<tr>
  <td><span class="badge">${escapeHtml(reflection)}</span></td>
  <td>${Number.isFinite(spot.d_angstrom) ? spot.d_angstrom.toFixed(3) : "—"}</td>
  <td>${Number.isFinite(spot.two_theta_deg) ? spot.two_theta_deg.toFixed(3) : "—"}</td>
  <td>${Number.isFinite(spot.intensity_rel) ? spot.intensity_rel.toFixed(4) : "—"}</td>
  <td>${Number.isFinite((spot as any).x_norm_rot) ? (spot as any).x_norm_rot.toFixed(5) : "—"}</td>
  <td>${Number.isFinite((spot as any).y_norm_rot) ? (spot as any).y_norm_rot.toFixed(5) : "—"}</td>
  <td class="${displayedClass}">${displayed}</td>
</tr>`;
      })
      .join("\n");

    const reportData = {
      generated_at: generatedAt,
      metadata: meta,
      axis_reflections: saedAxisReflections,
      display: {
        display_cutoff: displayCutoff,
        spot_size_scale: saedSpotScale,
        rotation_deg: saedRotationDeg,
        labels_enabled: showSaedReflections,
      },
      camera: saedCamera,
      spots: reportSpots,
    };
    const reportJson = JSON.stringify(reportData, null, 2).replaceAll("<", "\\u003c");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SAED report</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        padding: 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: #0b1224;
        color: #e2e8f0;
      }
      h1 { margin: 0 0 4px; font-size: 1.4rem; }
      h2 { margin: 0 0 10px; font-size: 1.1rem; }
      .muted { color: #94a3b8; }
      .section {
        margin-top: 16px;
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.65);
      }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { padding: 8px 10px; border-top: 1px solid rgba(148, 163, 184, 0.15); text-align: left; vertical-align: top; }
      tr:first-child th, tr:first-child td { border-top: none; }
      th { width: 34%; color: #94a3b8; font-weight: 600; }
      .figure {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 14px;
        background: #050a16;
        padding: 12px;
      }
      .figure svg { width: 100%; height: auto; display: block; }
      .table-wrap {
        max-height: 460px;
        overflow: auto;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
      }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid rgba(59, 130, 246, 0.35);
        background: rgba(59, 130, 246, 0.15);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .yes { color: #34d399; font-weight: 700; }
      .no { color: #94a3b8; }
      details { margin-top: 12px; }
      pre {
        margin: 10px 0 0;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(2, 6, 23, 0.7);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>SAED report</h1>
    <div class="muted">Generated: ${escapeHtml(generatedAt)}</div>

    <div class="section">
      <h2>Summary</h2>
      <table><tbody>${metaTable}</tbody></table>
    </div>

    <div class="section">
      <h2>Pattern</h2>
      <div class="figure">${svgMarkup}</div>
    </div>

    <div class="section">
      <h2>Spots (${reportSpots.length})</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reflection</th>
              <th>d (Å)</th>
              <th>2θ (°)</th>
              <th>I (rel)</th>
              <th>x (norm)</th>
              <th>y (norm)</th>
              <th>Shown</th>
            </tr>
          </thead>
          <tbody>${spotRows}</tbody>
        </table>
      </div>
      <div class="muted" style="margin-top: 10px;">
        Coordinates use normalized x/y with display rotation applied (${escapeHtml(saedRotationDeg.toFixed(0))}°).
      </div>
      <details>
        <summary>Raw JSON</summary>
        <pre>${escapeHtml(reportJson)}</pre>
      </details>
    </div>
  </body>
</html>`;

    const zoneToken = safeFilename(meta.zone_axis.join("_")) || "zone";
    const phaseToken = safeFilename(meta.phase_name ?? meta.formula ?? "phase") || "phase";
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `saed_report_${phaseToken}_${zoneToken}.html`);
    status.setStatus("SAED report downloaded", "success");
  }, [
    displayCutoff,
    formatSaedIndices,
    saedAxisReflections,
    saedCamera,
    saedChartSize.height,
    saedChartSize.width,
    saedPattern,
    saedRotationDeg,
    saedSpotScale,
    showSaedReflections,
    status,
  ]);

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
                  <div className="cryst-field-row">
                    <label className="cryst-label">
                      Zone axis {isHexagonal ? "[uvw] (converted from [uvtw])" : "[uvw]"}
                      <div className="cryst-inline-inputs cryst-inline-inputs--compact">
                        {(["u", "v", "w"] as const).map((label, idx) => (
                          <input
                            key={label}
                            type="number"
                            value={zoneAxis[idx]}
                            aria-label={`Zone axis ${label}`}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setZoneAxis((axis) => {
                                const next = [...axis] as [number, number, number];
                                next[idx] = value;
                                return next;
                              });
                            }}
                          />
                        ))}
                      </div>
                    </label>
                    {isHexagonal ? (
                      <div className="cryst-chip" aria-live="polite">
                        t = {-(zoneAxis[0] + zoneAxis[1])}
                      </div>
                    ) : null}
                    <label className="cryst-label">
                      Voltage (kV)
                      <input
                        className="cryst-input--narrow"
                        type="number"
                        value={voltage}
                        onChange={(e) => setVoltage(Number(e.target.value))}
                      />
                    </label>
                    <label className="cryst-label">
                      Camera length (cm)
                      <input
                        className="cryst-input--narrow"
                        type="number"
                        step="0.1"
                        value={cameraLengthCm}
                        onChange={(e) => setCameraLengthCm(Number(e.target.value))}
                      />
                    </label>
                    <label className="cryst-label">
                      Max index
                      <input className="cryst-input--narrow" type="number" value={maxIndex} onChange={(e) => setMaxIndex(Number(e.target.value))} />
                    </label>
                    <label className="cryst-label">
                      Min d (Å)
                      <input className="cryst-input--narrow" type="number" step="0.05" value={minD} onChange={(e) => setMinD(Number(e.target.value))} />
                    </label>
                    <label className="cryst-label">
                      Intensity cutoff
                      <input
                        className="cryst-input--narrow"
                        type="number"
                        step="0.001"
                        min={0}
                        value={intensityThreshold}
                        onChange={(e) => setIntensityThreshold(Number(e.target.value))}
                      />
                    </label>
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
                  <label className="cryst-label" style={{ marginTop: "0.75rem" }}>
                    Align x-axis to plane (hkl) (optional)
                    <div className="cryst-inline-inputs cryst-inline-inputs--compact">
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
                  <div className="cryst-panel__actions">
                    <button className="btn" type="button" disabled={!structure} onClick={handleSaed}>
                      Simulate SAED
                    </button>
                  </div>
                  {saedPattern ? (
                    <>
                      <div className="cryst-saed">
                        <div
                          className="cryst-saed__chart"
                          ref={saedChartRef}
                          onWheel={handleSaedWheel}
                          onDoubleClick={resetSaedView}
                        >
                          <div className="cryst-saed__toolbar" aria-label="SAED zoom and pan tools">
                            <button className="cryst-toolbtn" type="button" onClick={() => zoomSaed(1.25)} aria-label="Zoom in">
                              +
                            </button>
                            <button className="cryst-toolbtn" type="button" onClick={() => zoomSaed(1 / 1.25)} aria-label="Zoom out">
                              −
                            </button>
                            <button className="cryst-toolbtn" type="button" onClick={resetSaedView} aria-label="Reset view">
                              Reset
                            </button>
                            <span className="cryst-tool-sep" aria-hidden="true" />
                            <button className="cryst-toolbtn" type="button" onClick={() => panSaed(-0.15, 0)} aria-label="Pan left">
                              ←
                            </button>
                            <button className="cryst-toolbtn" type="button" onClick={() => panSaed(0.15, 0)} aria-label="Pan right">
                              →
                            </button>
                            <button className="cryst-toolbtn" type="button" onClick={() => panSaed(0, 0.15)} aria-label="Pan up">
                              ↑
                            </button>
                            <button className="cryst-toolbtn" type="button" onClick={() => panSaed(0, -0.15)} aria-label="Pan down">
                              ↓
                            </button>
                            <span className="cryst-tool-sep" aria-hidden="true" />
                            <button
                              className="cryst-toolbtn"
                              type="button"
                              onClick={() => setShowSaedInfo((current) => !current)}
                              aria-label="SAED info"
                              aria-pressed={showSaedInfo}
                            >
                              i
                            </button>
                            <button
                              className="cryst-toolbtn"
                              type="button"
                              onClick={downloadSaedReport}
                              aria-label="Download SAED HTML report"
                            >
                              Report
                            </button>
                          </div>
                          <div className="cryst-saed__hud" aria-label="SAED display controls">
                            <div className="cryst-saed__hudpanel">
                              <div className="cryst-saed__hudrow">
                                <label className="cryst-saed__toggle">
                                  <input
                                    type="checkbox"
                                    checked={showSaedReflections}
                                    onChange={(event) => setShowSaedReflections(event.target.checked)}
                                    aria-label="Annotate reflections on the SAED chart"
                                  />
                                  Labels
                                </label>
                                {saedDebugControlsEnabled ? (
                                  <label className="cryst-saed__toggle">
                                    <input
                                      type="checkbox"
                                      checked={showSaedDebugCircle}
                                      onChange={(event) => setShowSaedDebugCircle(event.target.checked)}
                                      aria-label="Show SAED aspect debug circle"
                                    />
                                    Circle
                                  </label>
                                ) : null}
                              </div>
                              <div className="cryst-saed__hudrow">
                                <label className="cryst-saed__hudlabel">
                                  I ≥
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    value={displayCutoff}
                                    onChange={(event) => setDisplayCutoff(Math.min(Math.max(Number(event.target.value), 0), 1))}
                                    aria-label="Display intensity threshold"
                                  />
                                  <input
                                    type="number"
                                    className="cryst-saed__number"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    value={displayCutoff}
                                    onChange={(event) => setDisplayCutoff(Math.min(Math.max(Number(event.target.value), 0), 1))}
                                  />
                                </label>
                              </div>
                              <div className="cryst-saed__hudrow">
                                <label className="cryst-saed__hudlabel">
                                  Size
                                  <input
                                    type="range"
                                    min={0.5}
                                    max={2}
                                    step={0.05}
                                    value={saedSpotScale}
                                    onChange={(event) =>
                                      setSaedSpotScale(Math.min(Math.max(Number(event.target.value), 0.5), 2))
                                    }
                                    aria-label="SAED spot size scale"
                                  />
                                  <span className="cryst-saed__value">{saedSpotScale.toFixed(2)}×</span>
                                </label>
                              </div>
                              <div className="cryst-saed__hudrow">
                                <label className="cryst-saed__hudlabel">
                                  Rot°
                                  <input
                                    type="range"
                                    min={-180}
                                    max={180}
                                    step={1}
                                    value={saedRotationDeg}
                                    onChange={(event) =>
                                      setSaedRotationDeg(Math.min(Math.max(Number(event.target.value), -180), 180))
                                    }
                                    aria-label="SAED in-plane rotation"
                                  />
                                  <input
                                    type="number"
                                    className="cryst-saed__number"
                                    min={-180}
                                    max={180}
                                    step={1}
                                    value={saedRotationDeg}
                                    onChange={(event) =>
                                      setSaedRotationDeg(Math.min(Math.max(Number(event.target.value), -180), 180))
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                          {showSaedInfo ? (
                            <div
                              className="cryst-saed__overlay"
                              role="dialog"
                              aria-label="SAED summary"
                              onClick={() => setShowSaedInfo(false)}
                            >
                              <div className="cryst-saed__overlaypanel" onClick={(event) => event.stopPropagation()}>
                                <div className="cryst-saed__overlayheader">
                                  <div>
                                    <div className="cryst-saed__overlaytitle">SAED summary</div>
                                    <div className="cryst-saed__overlaysub">Press Esc to close.</div>
                                  </div>
                                  <button
                                    className="cryst-toolbtn"
                                    type="button"
                                    onClick={() => setShowSaedInfo(false)}
                                    aria-label="Close SAED info"
                                  >
                                    ×
                                  </button>
                                </div>
                                <table className="cryst-saed__infotable">
                                  <tbody>
                                    <tr>
                                      <th scope="row">Phase</th>
                                      <td>{saedPattern.metadata.phase_name ?? "—"}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Formula</th>
                                      <td>{saedPattern.metadata.formula}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Space group</th>
                                      <td>{saedPattern.metadata.spacegroup ?? "—"}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Zone axis</th>
                                      <td>
                                        [{formatIndexVector(saedPattern.metadata.zone_axis)}]
                                        {saedPattern.metadata.zone_axis_four_index ? (
                                          <>
                                            {" "}
                                            / [{formatIndexVector(saedPattern.metadata.zone_axis_four_index)}]
                                          </>
                                        ) : null}
                                      </td>
                                    </tr>
                                    <tr>
                                      <th scope="row">X-axis align</th>
                                      <td>
                                        {saedPattern.metadata.x_axis_hkl ? (
                                          <>
                                            ({formatIndexVector(saedPattern.metadata.x_axis_hkl)})
                                            {saedPattern.metadata.x_axis_hkl_four_index ? (
                                              <>
                                                {" "}
                                                / ({formatIndexVector(saedPattern.metadata.x_axis_hkl_four_index)})
                                              </>
                                            ) : null}
                                          </>
                                        ) : (
                                          "Auto"
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Screen +X</th>
                                      <td>{saedAxisReflections.x ?? "—"}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Screen +Y</th>
                                      <td>{saedAxisReflections.y ?? "—"}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Voltage</th>
                                      <td>{saedPattern.metadata.voltage_kv.toFixed(1)} kV</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Camera length</th>
                                      <td>{saedPattern.metadata.camera_length_cm.toFixed(2)} cm</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">λ</th>
                                      <td>{saedPattern.metadata.lambda_angstrom.toFixed(5)} Å</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Laue zone</th>
                                      <td>{saedPattern.metadata.laue_zone}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Min d</th>
                                      <td>{saedPattern.metadata.min_d_angstrom?.toFixed(3) ?? "—"} Å</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Max index</th>
                                      <td>{saedPattern.metadata.max_index}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Intensity min</th>
                                      <td>{saedPattern.metadata.intensity_min_relative.toFixed(3)}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Display cutoff</th>
                                      <td>{displayCutoff.toFixed(3)}</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Spot size</th>
                                      <td>{saedSpotScale.toFixed(2)}×</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Rotation</th>
                                      <td>{saedRotationDeg.toFixed(0)}°</td>
                                    </tr>
                                    <tr>
                                      <th scope="row">Spots shown</th>
                                      <td>
                                        {saedChartData.length} / {saedPattern.spots.length}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={SAED_CHART_MARGIN}>
                              <XAxis
                                type="number"
                                dataKey="x_norm"
                                height={SAED_X_AXIS_HEIGHT}
                                domain={saedDomains.x}
                                allowDataOverflow
                                axisLine={false}
                                tickLine={false}
                                tick={false}
                                hide
                              />
                              <YAxis
                                type="number"
                                dataKey="y_norm"
                                width={SAED_Y_AXIS_WIDTH}
                                domain={saedDomains.y}
                                allowDataOverflow
                                axisLine={false}
                                tickLine={false}
                                tick={false}
                                hide
                              />
                              <Tooltip content={(props) => <SaedTooltip isHexagonal={isHexagonal} {...props} />} />
                              {showSaedDebugCircle && saedDebugCircleData.length ? (
                                <Scatter
                                  data={saedDebugCircleData}
                                  shape={renderSaedDebugCirclePoint}
                                  line={{ stroke: "rgba(226, 232, 240, 0.55)", strokeWidth: 1, strokeDasharray: "4 4" }}
                                  isAnimationActive={false}
                                />
                              ) : null}
                              <Scatter data={saedChartData} shape={renderSaedPoint} fill="#2563eb">
                                {showSaedReflections ? (
                                  <LabelList dataKey="reflectionLabel" content={renderSaedReflectionLabel} />
                                ) : null}
                              </Scatter>
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="cryst-list">
                        <div className="cryst-list__header">Top reflections ({saedPattern.spots.length})</div>
                        {saedPattern.spots.slice(0, 20).map((spot, idx) => (
                          <div key={idx} className="cryst-list__row">
                            <div className="badge">({formatSaedIndices(spot)})</div>
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
