# Super Resolution - Implementation Notes

## Pipeline

1. The API validates the uploaded file size and MIME signature (PNG/JPG/WEBP).
2. The image is decoded with Pillow, EXIF orientation is normalized, and the payload is converted to RGB.
3. The Real-ESRGAN model is loaded once per process and cached by model name + device.
4. The upsampler runs in-memory and returns a NumPy array.
5. Output is encoded as PNG or JPG and streamed back with `Content-Disposition: attachment`.

No user input or output is written to disk at any point.

## Model details

Default models:

- `RealESRGAN_x4plus` (scale 4)
- `RealESRGAN_x2plus` (scale 2)

Weights are stored under `models/super_resolution/weights/` and are excluded from git.

## Device selection

`plugins.super_resolution.device` controls device selection:

- `auto` selects CUDA if available, otherwise CPU.
- `cuda` forces CUDA if available, otherwise falls back to CPU.
- `cpu` forces CPU.

## Configuration keys

```
plugins.super_resolution.enabled
plugins.super_resolution.device
plugins.super_resolution.max_upload_mb
plugins.super_resolution.default_scale
plugins.super_resolution.default_model
plugins.super_resolution.weights_dir
plugins.super_resolution.models.<name>.weights_path
plugins.super_resolution.models.<name>.scale
```

## Weights setup

Use `scripts/setup_super_resolution_weights.py` to copy or download official Real-ESRGAN weights. The script reads `config.yml` to determine expected targets.
