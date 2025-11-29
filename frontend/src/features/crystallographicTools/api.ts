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

export type XrdPeak = { two_theta: number; intensity: number; d_spacing: number; hkl: number[] };

export async function xrdPattern(payload: {
  cif: string;
  radiation?: string;
  two_theta?: { min?: number; max?: number; step?: number };
}): Promise<{ peaks: XrdPeak[] }> {
  const body = {
    cif: payload.cif,
    radiation: payload.radiation || "CuKa",
    two_theta: {
      min: payload.two_theta?.min ?? 10,
      max: payload.two_theta?.max ?? 80,
      step: payload.two_theta?.step ?? 0.02,
    },
  };
  return apiFetch<{ peaks: XrdPeak[] }>("/api/crystallographic_tools/xrd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
