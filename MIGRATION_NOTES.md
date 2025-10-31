# Backend Migration Notes

## Route consolidation

- **New shape:** `/api/<plugin>/<action>` returns the shared JSON envelope.
- **Legacy shape:** `/<plugin>/api/v1/...` remains available but will be removed in a future release. Update clients to the new paths to access richer validation details and request IDs.

### Plugin mappings

| Plugin | Previous endpoint | New endpoint |
| ------ | ----------------- | ------------ |
| PDF Tools | `/pdf_tools/api/v1/merge` | `/api/pdf_tools/merge` |
|  | `/pdf_tools/api/v1/split` | `/api/pdf_tools/split` |
|  | `/pdf_tools/api/v1/metadata` | `/api/pdf_tools/metadata` |
| Unit Converter | `/unit_converter/api/v1/families` | `/api/unit_converter/families` |
|  | `/unit_converter/api/v1/units/<family>` | `/api/unit_converter/units/<family>` |
|  | `/unit_converter/api/v1/convert` | `/api/unit_converter/convert` |
|  | `/unit_converter/api/v1/expressions` | `/api/unit_converter/expressions` |
| Hydride Segmentation | `/hydride_segmentation/api/v1/segment` | `/api/hydride_segmentation/segment` |
|  | `/hydride_segmentation/api/v1/warmup` | `/api/hydride_segmentation/warmup` |
| Tabular ML | `/tabular_ml/api/v1/datasets` | `/api/tabular_ml/datasets` |
|  | `/tabular_ml/api/v1/datasets/<id>/train` | `/api/tabular_ml/datasets/<id>/train` |
|  | `/tabular_ml/api/v1/datasets/<id>/predict` | `/api/tabular_ml/datasets/<id>/predict` |
|  | `/tabular_ml/api/v1/datasets/<id>/predict/batch` | `/api/tabular_ml/datasets/<id>/predict/batch` |
|  | `/tabular_ml/api/v1/datasets/<id>/predictions` | `/api/tabular_ml/datasets/<id>/predictions` |
|  | `/tabular_ml/api/v1/datasets/<id>/profile` | `/api/tabular_ml/datasets/<id>/profile` |

## Response envelope

- Success payloads now include `success: true` and place fields under `data`.
- Errors include machine-readable `code` and optional `details` for client-side diagnostics.
- Base64 encoded assets (PDF merges, CSV downloads) are returned inline with `filename` metadata to keep the API fully JSON.

## Validation

- All request payloads are validated via Pydantic models located in `common/validation.py`.
- File uploads now share consistent limit checks and MIME validation utilities from `common/`.

