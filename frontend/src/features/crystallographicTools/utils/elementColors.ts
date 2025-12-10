const DEFAULT_COLOR = "#38bdf8";

const ELEMENT_COLORS: Record<string, string> = {
  H: "#e5e7eb",
  He: "#c7cdd6",
  Li: "#d4b06f",
  Be: "#9f9bff",
  B: "#8b5cf6",
  C: "#9ca3af",
  N: "#2563eb",
  O: "#ef4444",
  F: "#10b981",
  Ne: "#94a3b8",
  Na: "#d97706",
  Mg: "#7c3aed",
  Al: "#60a5fa",
  Si: "#22c55e",
  P: "#f97316",
  S: "#facc15",
  Cl: "#14b8a6",
  Ar: "#6b7280",
  K: "#a16207",
  Ca: "#22d3ee",
  Ti: "#0ea5e9",
  Cr: "#10b981",
  Mn: "#8b5cf6",
  Fe: "#f97316",
  Co: "#0f766e",
  Ni: "#2563eb",
  Cu: "#16a34a",
  Zn: "#4b5563",
  Ga: "#d946ef",
  Ge: "#22c55e",
  As: "#f59e0b",
  Se: "#e11d48",
  Br: "#14b8a6",
  Kr: "#6b7280",
  Zr: "#0ea5e9",
  Mo: "#f59e0b",
  Ag: "#d4d4d8",
  Sn: "#60a5fa",
  Ba: "#fbbf24",
  W: "#a855f7",
  Pt: "#cbd5e1",
  Au: "#f4b400",
  Pb: "#94a3b8",
};

export function elementColor(symbol: string | undefined): string {
  if (!symbol) return DEFAULT_COLOR;
  return ELEMENT_COLORS[symbol] || DEFAULT_COLOR;
}

export { ELEMENT_COLORS, DEFAULT_COLOR as FALLBACK_ELEMENT_COLOR };
