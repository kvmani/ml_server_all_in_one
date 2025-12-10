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

export type ViewerBasisSite = {
  element: string;
  frac_position: number[];
  frac_coords?: number[];
  cart_position: number[];
  occupancy?: number;
  atomic_number?: number | null;
  atomic_radius?: number | null;
};

export type ViewerLimits = {
  max_atoms: number;
  supercell_default: number[];
  supercell_max: number[];
  supercell_requested: number[];
  atom_count: number;
  atom_count_supercell: number;
};

export type StructurePayload = {
  lattice: LatticePayload;
  sites: SitePayload[];
  cif: string;
  num_sites: number;
  formula: string;
  is_hexagonal?: boolean;
  crystal_system?: string;
  lattice_matrix?: number[][];
  space_group?: { symbol: string; number: number | null };
  basis?: ViewerBasisSite[];
  viewer_limits?: ViewerLimits;
};

export async function loadCif(file: File, options?: { supercell?: number[] }): Promise<StructurePayload> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (options?.supercell) {
    form.append("supercell", JSON.stringify(options.supercell));
  }
  return apiFetch<StructurePayload>("/api/crystallographic_tools/crystal_viewer/parse", {
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

export async function exportStructure(payload: {
  cif?: string;
  poscar?: string;
  supercell?: number[];
  filename?: string;
}): Promise<StructurePayload> {
  const body: Record<string, unknown> = {
    cif: payload.cif,
    poscar: payload.poscar,
    filename: payload.filename,
  };
  if (payload.supercell) {
    body.supercell = payload.supercell;
  }
  return apiFetch<StructurePayload>("/api/crystallographic_tools/crystal_viewer/export_structure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchElementRadii(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>("/api/crystallographic_tools/crystal_viewer/element_radii");
}

export type XrdPeak = {
  two_theta: number;
  intensity: number;
  intensity_lp: number;
  intensity_normalized: number;
  d_spacing: number;
  hkl: number[];
  lorentz_polarization: number;
};
export type XrdCurvePoint = { two_theta: number; intensity: number };
export type XrdPattern = {
  peaks: XrdPeak[];
  curve: XrdCurvePoint[];
  range: { min: number; max: number; step: number };
  instrument: {
    radiation: string;
    wavelength_angstrom: number | null;
    geometry: string;
    polarization_ratio: number | null;
  };
  profile: { u: number; v: number; w: number; model: string };
  summary: { peak_count: number; max_intensity: number };
};

export async function xrdPattern(payload: {
  cif: string;
  radiation?: string;
  instrument?: {
    radiation?: string;
    wavelength_angstrom?: number | null;
    geometry?: string;
    polarization_ratio?: number | null;
  };
  two_theta?: { min?: number; max?: number; step?: number };
  profile?: { u?: number; v?: number; w?: number; profile?: string };
}): Promise<XrdPattern> {
  const body = {
    cif: payload.cif,
    instrument: {
      radiation: payload.instrument?.radiation || payload.radiation || "CuKa",
      wavelength_angstrom: payload.instrument?.wavelength_angstrom ?? null,
      geometry: payload.instrument?.geometry || "bragg_brentano",
      polarization_ratio: payload.instrument?.polarization_ratio ?? 0.5,
    },
    two_theta: {
      min: payload.two_theta?.min ?? 10,
      max: payload.two_theta?.max ?? 80,
      step: payload.two_theta?.step ?? 0.02,
    },
    profile: {
      u: payload.profile?.u ?? 0.02,
      v: payload.profile?.v ?? 0.0,
      w: payload.profile?.w ?? 0.1,
      profile: payload.profile?.profile || "gaussian",
    },
  };
  return apiFetch<XrdPattern>("/api/crystallographic_tools/xrd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type SaedSpot = {
  hkl: number[];
  zone: number;
  d_angstrom: number;
  s2: number | null;
  intensity_raw: number;
  intensity_rel: number;
  x_cm: number;
  y_cm: number;
  x_rot_cm: number;
  y_rot_cm: number;
  x_norm: number;
  y_norm: number;
  r_cm: number;
  two_theta_deg: number;
  label: string;
};

export type SaedPattern = {
  metadata: {
    phase_name: string | null;
    formula: string;
    spacegroup: string | null;
    zone_axis: number[];
    x_axis_hkl: number[] | null;
    inplane_rotation_deg: number;
    voltage_kv: number;
    lambda_angstrom: number;
    camera_length_cm: number;
    laue_zone: number;
    min_d_angstrom: number | null;
    max_index: number;
    intensity_min_relative: number;
  };
  limits: { x_min: number; x_max: number; y_min: number; y_max: number; r_max: number; i_max: number };
  spots: SaedSpot[];
};

export async function temSaed(payload: {
  cif: string;
  zone_axis: number[];
  voltage_kv?: number;
  camera_length_cm?: number;
  camera_length_mm?: number;
  max_index?: number;
  min_d_angstrom?: number;
  intensity_min_relative?: number;
  x_axis_hkl?: number[];
  inplane_rotation_deg?: number;
}): Promise<SaedPattern> {
  const body = {
    cif: payload.cif,
    zone_axis: payload.zone_axis,
    voltage_kv: payload.voltage_kv ?? 200,
    camera_length_cm: payload.camera_length_cm ?? (payload.camera_length_mm ? payload.camera_length_mm / 10 : 10),
    max_index: payload.max_index ?? 3,
    min_d_angstrom: payload.min_d_angstrom ?? 0.5,
    intensity_min_relative: payload.intensity_min_relative ?? 0.01,
    x_axis_hkl: payload.x_axis_hkl,
    inplane_rotation_deg: payload.inplane_rotation_deg ?? 0,
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
  plane_plane_angle_deg: number | null;
  direction_a: { three_index: number[] | null; four_index: number[] | null };
  direction_b: { three_index: number[] | null; four_index: number[] | null };
  plane: { three_index: number[] | null; four_index: number[] | null };
  plane_b: { three_index: number[] | null; four_index: number[] | null };
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
  planeB?: number[];
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
  if (payload.planeB) {
    body.plane_b = payload.planeB;
  }

  return apiFetch<CalculatorResult>("/api/crystallographic_tools/calculator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
