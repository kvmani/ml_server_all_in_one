export type SampleCif = {
  id: string;
  name: string;
  formula: string;
  cif: string;
};

const cifModules = import.meta.glob<string>("./*.cif", { as: "raw", eager: true });

function deriveNameFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  const base = file.replace(".cif", "");
  const words = base.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1));
  return words.join(" ");
}

function extractFormula(cif: string): string {
  const formulaMatch = cif.match(/_chemical_formula_sum\s+([^\r\n]+)/i)
    || cif.match(/_chemical\.(?:formula|compound)_sum\s+([^\r\n]+)/i);
  if (formulaMatch) {
    return formulaMatch[1].replace(/['"]/g, "").trim();
  }
  const lines = cif.split(/\r?\n/);
  const typeIndex = lines.findIndex((line) => line.toLowerCase().includes("_atom_site_type_symbol"));
  if (typeIndex >= 0) {
    const counts: Record<string, number> = {};
    for (let i = typeIndex + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || line.startsWith("_") || line.toLowerCase().startsWith("loop_")) break;
      const [sym] = line.split(/\s+/);
      if (sym) {
        counts[sym] = (counts[sym] || 0) + 1;
      }
    }
    if (Object.keys(counts).length) {
      return Object.entries(counts)
        .map(([sym, count]) => (count > 1 ? `${sym}${count}` : sym))
        .join("");
    }
  }
  return "Unknown";
}

export const SAMPLE_CIFS: SampleCif[] = Object.entries(cifModules)
  .map(([path, cif]) => {
    const id = path.replace("./", "").replace(".cif", "");
    const name = deriveNameFromPath(path);
    const formula = extractFormula(cif);
    return { id, name, formula, cif };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
