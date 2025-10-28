# Migration Notes

- Original repositories imported under `old_codes/` for reference only.
- Each legacy feature mapped to a plugin:
  - `hydridesegmentation` → `plugins/hydride_segmentation`
  - `pdf_tools` → `plugins/pdf_tools`
  - `ml_server` utilities → `plugins/unit_converter`, `plugins/tabular_ml`
- UI rewritten with shared shell (`app/ui`).
- All processing now happens in-memory with strict upload limits and MIME
  validation.
