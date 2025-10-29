# PDF Tools

The PDF workspace provides offline merge and split workflows with consistent drag-and-drop queues.

## Merge PDFs

1. Add up to 10 PDFs (default, configurable) via drag-and-drop or the “Add files” button.
2. Optionally specify page ranges per file using comma-separated segments (e.g., `1-3,5`).
3. Reorder entries using the queue handles; the merge order matches the visual list.
4. Enter the desired output filename (must end with `.pdf`).
5. Submit to download the merged document instantly. Files never touch disk and are discarded after the response is sent.

## Split PDFs

1. Drop a single PDF (≤5 MB by default) onto the split zone.
2. The backend emits base64-encoded pages that the UI converts into downloadable files.
3. Use the generated list to save individual pages.

## Configuration

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
```

Adjust `max_files` and `max_mb` as required; the UI pulls these values to update hints automatically.

## Tips

* Page range validation is strict—invalid tokens return a `400` with an inline error message.
* Keep output filenames descriptive to avoid overwriting existing exports.
* Clear the merge queue between operations to prevent accidental reuse of stale files.
