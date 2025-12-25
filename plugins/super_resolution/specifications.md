# Super Resolution - Specification

## Overview

An offline, privacy-first Image Super-Resolution plugin that upscales images using Real-ESRGAN. The UI delivers a before/after comparison slider with drag, touch, and keyboard support. All processing stays in memory and no user data is persisted to disk.

## Functional requirements

1. **Upscaling**
   - Use a stable Real-ESRGAN Python package for inference.
   - Models and weights are local to the repo and loaded once per worker.
   - Support scale factors 2x and 4x via model selection.
   - Output formats: PNG or JPG.

2. **Frontend UX**
   - Drag-and-drop and file picker upload.
   - Controls for scale, model, output format.
   - Run, reset, and download actions with progress indication.
   - Before/after slider:
     - Vertical divider, draggable with pointer events.
     - Keyboard control via arrow keys when focused.
     - Works with mouse and touch; responds to resize.
     - Preserves image aspect ratio.
     - Cleans up object URLs to avoid memory leaks.

3. **Privacy and offline**
   - No runtime network calls, no CDNs.
   - No cookies, localStorage, IndexedDB, or service workers.
   - No logging of user images or metadata.
   - No disk persistence of user inputs or outputs.

## Backend API

### Health
`GET /api/v1/super_resolution/health`

Response (wrapped in standard envelope):
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "model_loaded": true,
    "model_name": "RealESRGAN_x4plus",
    "device": "cuda"
  }
}
```

### Predict
`POST /api/v1/super_resolution/predict`

Input: `multipart/form-data`
- `image` (required): PNG, JPG, or WEBP.
- `scale` (optional): 2 or 4.
- `model` (optional): model key string.
- `output_format` (optional): `png` or `jpg`.

Output: raw image bytes with headers:
- `Content-Type`: `image/png` or `image/jpeg`
- `Content-Disposition`: `attachment; filename="upscaled.png"`

## Config keys

```yaml
super_resolution:
  enabled: true
  device: "auto"        # auto | cuda | cpu
  max_upload_mb: 20
  default_scale: 4
  default_model: "RealESRGAN_x4plus"
  weights_dir: "models/super_resolution/weights"
  models:
    RealESRGAN_x4plus:
      weights_path: "models/super_resolution/weights/RealESRGAN_x4plus.pth"
      scale: 4
    RealESRGAN_x2plus:
      weights_path: "models/super_resolution/weights/RealESRGAN_x2plus.pth"
      scale: 2
```

## Model and weights management

- Weights are stored at `models/super_resolution/weights/` and excluded from git.
- `scripts/setup_super_resolution_weights.py` copies weights from a local path with an optional offline download mode.
- Model load is cached at process scope; reuse between requests.

## Validation rules

- Enforce size limits from `max_upload_mb`; return 413 on violation.
- Accept only PNG/JPG/WEBP content types; reject others with a 400 error.
- Validate `scale` and `model` compatibility; reject mismatches with a 400 error.
- Enforce `output_format` in `{png, jpg}`.

## Error handling

- Use unified JSON errors via `common.responses.fail`.
- Do not include user-supplied data in logs or error details.

## Tests

- Unit test for `GET /api/v1/super_resolution/health`.
- Unit test for `POST /api/v1/super_resolution/predict` using a tiny synthetic image.
- Allow model mocking or stubbing for CPU-only CI environments.

## Repo integration

- Add plugin under `plugins/super_resolution` with `api/`, `core/`, and `tests/`.
- Register plugin in navigation and backend blueprint registration.
- Update `.gitignore` for weights, and document setup in `plugins/super_resolution/implementation.md` and Help/FAQ.

## Acceptance criteria

- Fully functional offline with no runtime network calls.
- No disk persistence of user data.
- Smooth before/after slider on Chrome, Firefox, Edge.
- Correct output format and download behavior.
- Tests pass.
