# Hydride Segmentation

The hydride segmentation tool processes zirconium alloy micrographs using a configurable conventional pipeline. All operations run in memory—no intermediate files touch disk.

## Workflow

1. Drag a PNG/JPEG/TIFF image (≤5 MB by default) onto the upload zone.
2. Choose the **Conventional** backend to expose manual controls or select **ML proxy** for a fixed-parameter shortcut.
3. Adjust preprocessing and thresholding parameters as required.
4. Run segmentation to generate overlays, masks, and computed metrics (mask fraction, hydride count, orientation histograms).
5. Download artefacts (input, mask, overlay, combined panel) for record keeping.

## Parameter reference

| Parameter | Purpose | Suggested range |
| --- | --- | --- |
| CLAHE clip limit | Local contrast enhancement | 1.5 – 3.0 |
| CLAHE tiles (X/Y) | Size of contextual histogram regions | 6 – 12 |
| Adaptive window | Kernel size for local thresholding (odd values) | 11 – 31 |
| Adaptive C offset | Bias applied to the threshold | 20 – 60 |
| Morph kernel (X/Y) | Closing kernel dimensions | 3 – 7 |
| Morph iterations | Number of closing passes | 0 – 3 |
| Area threshold | Minimum connected component size (pixels) | 50 – 200 |
| Crop percent | Percentage trimmed from the bottom edge | 0 – 20 |

## Configuration

Limits are defined in `config.yml` under `plugins.hydride_segmentation.upload`:

```yaml
plugins:
  hydride_segmentation:
    upload:
      max_files: 1
      max_mb: 5
```

Increase `max_mb` to support higher-resolution micrographs if memory allows. The UI automatically reflects updated values.

## Troubleshooting

* Empty masks usually indicate an aggressive adaptive offset—reduce `adaptive_offset` or `area_threshold`.
* Over-merged hydrides can be separated by lowering `morph_iterations` or kernel size.
* Use the history controls in the UI to compare successive parameter tweaks without re-uploading the sample.
