from io import BytesIO

from PIL import Image

from plugins.super_resolution.core import (
    SuperResolutionError,
    SuperResolutionResult,
    enhance_image,
)


def _sample_png(width: int = 12, height: int = 8) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), color=(120, 20, 220)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_enhance_image_scales_dimensions():
    data = _sample_png()
    result = enhance_image(data, scale=1.5, mode="bicubic")
    assert isinstance(result, SuperResolutionResult)
    assert result.width == 18
    assert result.height == 12
    assert result.scale == 1.5
    assert result.image_bytes.startswith(b"\x89PNG")


def test_enhance_image_rejects_invalid_scale():
    data = _sample_png()
    try:
        enhance_image(data, scale=0)
    except SuperResolutionError as exc:
        assert "greater than" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected SuperResolutionError")


def test_enhance_image_rejects_unknown_mode():
    data = _sample_png()
    try:
        enhance_image(data, mode="unknown")
    except SuperResolutionError as exc:
        assert "Unsupported" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected SuperResolutionError")


def test_enhance_image_rejects_large_input(monkeypatch):
    data = _sample_png(width=4, height=4)
    try:
        enhance_image(data, scale=1.0, max_input_pixels=10)
    except SuperResolutionError as exc:
        assert "maximum" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("Expected SuperResolutionError for oversized image")


def test_enhance_image_rejects_large_output(monkeypatch):
    data = _sample_png(width=10, height=10)
    try:
        enhance_image(data, scale=5, max_output_pixels=200)
    except SuperResolutionError as exc:
        assert "upscaled" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("Expected SuperResolutionError for oversized output")
