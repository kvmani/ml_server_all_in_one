import { apiFetch } from "../../utils/api";

export type LatticePayload = {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
};

export type SitePayload = { species: string; frac_coords: number[] };

export type StructurePayload = {
  lattice: LatticePayload;
  sites: SitePayload[];
  cif: string;
  num_sites: number;
  formula: string;
  is_hexagonal?: boolean;
  crystal_system?: string;
};

export async function loadCif(file: File): Promise<StructurePayload> {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiFetch<StructurePayload>("/api/crystallographic_tools/load_cif", {
    method: "POST",
    body: form,
  });
}

export async function editCif(payload: {
  cif: string;
  lattice?: Partial<LatticePayload>;
  sites?: SitePayload[];
  supercell?: number[];
}): Promise<StructurePayload> {
  return apiFetch<StructurePayload>("/api/crystallographic_tools/edit_cif", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type XrdPeak = { two_theta: number; intensity: number; intensity_normalized: number; d_spacing: number; hkl: number[] };
export type XrdCurvePoint = { two_theta: number; intensity: number };

export async function xrdPattern(payload: {
  cif: string;
  radiation?: string;
  two_theta?: { min?: number; max?: number; step?: number };
}): Promise<{ peaks: XrdPeak[]; curve: XrdCurvePoint[]; range: { min: number; max: number } }> {
  const body = {
    cif: payload.cif,
    radiation: payload.radiation || "CuKa",
    two_theta: {
      min: payload.two_theta?.min ?? 10,
      max: payload.two_theta?.max ?? 80,
      step: payload.two_theta?.step ?? 0.02,
    },
  };
  return apiFetch<{ peaks: XrdPeak[]; curve: XrdCurvePoint[]; range: { min: number; max: number } }>("/api/crystallographic_tools/xrd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type SaedSpot = {
  hkl: number[];
  x: number;
  y: number;
  intensity: number;
  g_magnitude: number;
  d_spacing: number;
  two_theta: number;
};

export type SaedPattern = {
  spots: SaedSpot[];
  calibration: {
    wavelength_angstrom: number;
    camera_length_mm: number;
    zone_axis: number[];
    max_index: number;
    g_max: number;
  };
  basis: { zone: number[]; x: number[]; y: number[] };
};

export async function temSaed(payload: {
  cif: string;
  zone_axis: number[];
  voltage_kv?: number;
  camera_length_mm?: number;
  max_index?: number;
  g_max?: number;
  rotation_deg?: number;
  zone_tolerance_deg?: number;
}): Promise<SaedPattern> {
  const body = {
    cif: payload.cif,
    zone_axis: payload.zone_axis,
    voltage_kv: payload.voltage_kv ?? 200,
    camera_length_mm: payload.camera_length_mm ?? 100,
    max_index: payload.max_index ?? 3,
    g_max: payload.g_max ?? 6,
    rotation_deg: payload.rotation_deg ?? 0,
    zone_tolerance_deg: payload.zone_tolerance_deg ?? 2.5,
  };
  return apiFetch<SaedPattern>("/api/crystallographic_tools/tem_saed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type CalculatorResult = {
  is_hexagonal: boolean;
  direction_angle_deg: number | null;
  plane_vector_angle_deg: number | null;
  direction_a: { three_index: number[] | null; four_index: number[] | null };
  direction_b: { three_index: number[] | null; four_index: number[] | null };
  plane: { three_index: number[] | null; four_index: number[] | null };
  equivalents: {
    direction: { three_index: number[][]; four_index?: number[][] };
    plane: { three_index: number[][]; four_index?: number[][] };
  };
};

export async function runCalculator(payload: {
  cif: string;
  directionA?: number[];
  directionB?: number[];
  plane?: number[];
  includeEquivalents?: boolean;
}): Promise<CalculatorResult> {
  const body: Record<string, unknown> = {
    cif: payload.cif,
    include_equivalents: payload.includeEquivalents ?? true,
  };
  if (payload.directionA) {
    body.direction_a = payload.directionA;
  }
  if (payload.directionB) {
    body.direction_b = payload.directionB;
  }
  if (payload.plane) {
    body.plane = payload.plane;
  }

  return apiFetch<CalculatorResult>("/api/crystallographic_tools/calculator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
