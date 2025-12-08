# PDF Tools

The PDF workspace provides three offline workflows—merge, split, and stitch—plus a quick metadata probe. Everything runs in memory; no PDFs are written to disk.

## What you can do

- **Merge** – Combine up to 10 PDFs, set a page range per file, drag to reorder, and download a single combined PDF.
- **Split** – Upload one PDF and download either a ZIP of all pages or pick individual pages from the list.
- **Stitch** – Build a scripted sequence (e.g., `A:1-3`, `B:all`, `A:end`) using aliases so you can interleave pages from multiple PDFs in one pass.
- **Metadata** – Check page count and byte size before deciding whether to merge, split, or stitch.

## Merge workflow

1. Drag-and-drop PDFs or click **Add files** (default: ≤10 files, 5 MB each).
2. For each file, optionally enter a page range. Use comma-separated tokens with whole numbers only: single pages (`5`) or closed ranges (`3-7`). Invalid tokens (letters, open ranges, negatives) are rejected before processing.
3. Drag the row handles to reorder; the visual order is the merge order.
4. Type an output name. If you omit `.pdf`, the backend appends it safely.
5. Click **Merge**. The UI immediately offers a download and shows the server-side filename and file count. If you prefer a streamed download, use the **Download** toggle.

## Split workflow

1. Drop one PDF (default: ≤5 MB). Oversized uploads trigger a `413` message before any work is done.
2. The backend slices each page to base64; the UI renders a list so you can download pages individually or as a ZIP archive.
3. Use the **Clear** action before starting another split to avoid mixing batches.

## Stitch workflow

1. Upload up to 6 PDFs and assign each an alias (short uppercase names work best, e.g., `A`, `B`, `C`).
2. In the sequence text area, write one instruction per line in the format `<ALIAS>:<pages>`.
   - Examples: `A:1-2`, `B:all`, `A:end`, `C:3-5,end`.
   - Blank lines are ignored; whitespace is trimmed.
3. Choose an output filename (auto-suffixed with `.pdf`).
4. Submit to receive a combined PDF. The response includes a summary table showing which alias contributed which pages.

## Metadata probe

Upload a single PDF to reveal its page count and size. This is useful before committing to a merge or stitch plan on large files.

## Limits and configuration

`config.yml` exposes per-operation limits:

```yaml
plugins:
  pdf_tools:
    merge_upload:
      max_files: 10
      max_mb: 5
    split_upload:
      max_files: 1
      max_mb: 5
    stitch_upload:
      max_files: 6
      max_mb: 6
```

Adjust `max_files` and `max_mb` as required; the UI pulls these values automatically into its hints and validation messages.

## Tips and troubleshooting

- Invalid page tokens trigger a clear inline error; fix the token and retry without re-uploading files.
- Use descriptive output names to avoid overwriting local files after download.
- If a file is rejected for size or MIME, lower the resolution on the client side or raise the configured limits if resources allow.
- Clear the queue after each operation when running multiple merges or stitches in a row.
