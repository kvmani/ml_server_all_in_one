export type GuidedRow = {
    id: string;
    alias: string;
    pages: string;
};

export type ManifestItem = {
    field: string;
    alias: string;
    file: File;
    pages: string;
};

export function parseInstructions(text: string): { instructions: { alias: string; pages: string }[]; error?: string } {
    const lines = text.split("\n");
    const instructions = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(":");
        if (parts.length < 2) {
            return { instructions: [], error: `Invalid line format: "${trimmed}". Expected "alias: pages"` };
        }
        const alias = parts[0].trim();
        const pages = parts.slice(1).join(":").trim();
        if (!alias || !pages) {
            return { instructions: [], error: `Missing alias or pages in line: "${trimmed}"` };
        }
        instructions.push({ alias, pages });
    }
    return { instructions };
}

export function buildManifest(
    instructions: { alias: string; pages: string }[],
    uploads: { alias: string; file: File }[]
): { manifest: ManifestItem[]; error?: string } {
    const manifest: ManifestItem[] = [];
    let counter = 0;
    for (const inst of instructions) {
        const upload = uploads.find((u) => u.alias === inst.alias);
        if (!upload) {
            return { manifest: [], error: `Unknown alias "${inst.alias}" in instructions.` };
        }
        manifest.push({
            field: `file-${counter++}`,
            alias: inst.alias,
            file: upload.file,
            pages: inst.pages,
        });
    }
    return { manifest };
}

export function guidedRowsToManifest(
    rows: GuidedRow[],
    uploads: { alias: string; file: File }[]
): { manifest: ManifestItem[]; error?: string } {
    const instructions = rows.map((r) => ({ alias: r.alias, pages: r.pages }));
    return buildManifest(instructions, uploads);
}
