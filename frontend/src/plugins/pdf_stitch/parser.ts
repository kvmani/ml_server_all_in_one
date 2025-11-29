export type ParsedInstruction = { alias: string; pages: string };

const ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function parseInstructions(input: string): { instructions: ParsedInstruction[]; error?: string } {
  if (!input.trim()) return { instructions: [] };
  const lines = input.split("\n");
  const instructions: ParsedInstruction[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cleaned = line.endsWith(";") ? line.slice(0, -1) : line;
    const [aliasRaw, rest] = cleaned.split(":", 2);
    if (!aliasRaw || rest === undefined) {
      return { instructions: [], error: "Each line must be in the form 'alias: pages'" };
    }
    const alias = aliasRaw.trim();
    if (!ALIAS_PATTERN.test(alias)) {
      return { instructions: [], error: "Aliases may contain letters, numbers, dashes, and underscores only." };
    }
    const pages = rest.trim() || "all";
    instructions.push({ alias, pages });
  }

  if (!instructions.length) {
    return { instructions: [], error: "Provide at least one instruction line." };
  }
  return { instructions };
}

export function buildManifest(
  instructions: ParsedInstruction[],
  files: { alias: string; file: File }[],
): { manifest: { field: string; alias: string; pages: string; file: File }[]; error?: string } {
  if (!instructions.length) {
    const manifest = files.map((entry, index) => ({
      field: `file-${index}`,
      alias: entry.alias,
      pages: "all",
      file: entry.file,
    }));
    return { manifest };
  }
  const manifest: { field: string; alias: string; pages: string; file: File }[] = [];
  for (const [index, instr] of instructions.entries()) {
    const match = files.find((f) => f.alias === instr.alias);
    if (!match) {
      return { manifest: [], error: `Alias '${instr.alias}' has no matching file.` };
    }
    manifest.push({
      field: `file-${index}`,
      alias: instr.alias,
      pages: instr.pages,
      file: match.file,
    });
  }
  return { manifest };
}

export type GuidedRow = { id: string; alias: string; pages: string };
export type GuidedEntry = { alias: string; file: File; pages?: number };

export function guidedRowsToManifest(
  rows: GuidedRow[],
  entries: GuidedEntry[],
): { manifest: { field: string; alias: string; pages: string; file: File }[]; error?: string } {
  if (!rows.length) return { manifest: [], error: "Add at least one step to stitch." };
  const manifest = [];
  for (const [index, row] of rows.entries()) {
    const match = entries.find((entry) => entry.alias === row.alias);
    if (!match) return { manifest: [], error: `Alias '${row.alias}' has no matching file.` };
    manifest.push({
      field: `file-${index}`,
      alias: row.alias,
      pages: row.pages.trim() || "all",
      file: match.file,
    });
  }
  return { manifest };
}
