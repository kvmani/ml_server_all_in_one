# Super Resolution

The Super Resolution plugin upscales microscopy and lab imagery using Real-ESRGAN. Inputs are processed in memory and returned as downloadable PNG or JPG files.

## Workflow

1. Upload a PNG, JPG, or WEBP image.
2. Choose the scale (2x or 4x) and model.
3. Select PNG or JPG output.
4. Run the upscale and compare the result in the before/after slider.

If you do not have a file handy, use the built-in sample image available in the UI.

## Configuration

Key settings in `config.yml`:

```yaml
plugins:
  super_resolution:
    device: "auto"
    max_upload_mb: 20
    default_scale: 4
    default_model: "RealESRGAN_x4plus"
```

## Notes

- Use `scripts/setup_super_resolution_weights.py` to place weight files under `models/super_resolution/weights/`.
- GPU acceleration is automatic when CUDA is available and enabled.
