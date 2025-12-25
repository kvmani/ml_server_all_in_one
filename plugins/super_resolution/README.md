# Super Resolution Plugin

## Overview

The super-resolution plugin provides offline image upscaling using Real-ESRGAN. Inputs are processed entirely in memory and never written to disk. The React UI offers a before/after slider for direct visual comparison and download-ready outputs.

## Features

- Real-ESRGAN upscaling with 2x and 4x models
- PNG or JPG output formats
- Drag-and-drop upload with size and MIME validation
- Draggable, keyboard-accessible before/after slider
- Optional GPU acceleration when available

## Dependencies

Install the base dependencies:

```bash
pip install -r requirements.txt
```

Real-ESRGAN requires PyTorch. Install a CPU or CUDA build appropriate for your environment.
The Real-ESRGAN dependency chain currently expects `torchvision.transforms.functional_tensor`,
so stick to `torch==2.0.1` + `torchvision==0.15.2` (newer torchvision removes that module).

```bash
# CPU example (adjust to your platform or use your internal mirror)
python -m pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cpu
```

## Weights setup

Weights are stored under `models/super_resolution/weights` and are ignored by git.

Copy local weight files:

```bash
python scripts/setup_super_resolution_weights.py --source /path/to/weights_dir
```

Download official weights (requires internet on the setup machine):

```bash
python scripts/setup_super_resolution_weights.py --download
```

If you only want one model:

```bash
python scripts/setup_super_resolution_weights.py --download --model RealESRGAN_x4plus
```

## Configuration

Configure in `config.yml`:

```yaml
plugins:
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

## API

### Health

`GET /api/v1/super_resolution/health`

Response (wrapped in the standard envelope):

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "model_loaded": false,
    "model_name": "RealESRGAN_x4plus",
    "device": "cpu"
  }
}
```

### Predict

`POST /api/v1/super_resolution/predict`

Multipart fields:

- `image` (PNG/JPG/WEBP)
- `scale` (2 or 4)
- `model`
- `output_format` (`png` or `jpg`)

Response: raw image bytes with `Content-Disposition: attachment`.

## UI usage

1. Drop an image into the workspace or click **Select image**.
2. Choose scale, model, and output format.
3. Click **Run upscale** and wait for completion.
4. Compare in the slider and download the result.

## Sample image

Place a sample image at `frontend/src/assets/super_resolution_sample.png` and the
UI will expose a “Use sample image” button for quick testing.

## Tests

```bash
pytest plugins/super_resolution/tests -q
```

The predict test stubs the model to avoid GPU requirements in CI.
