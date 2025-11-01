"""Super resolution core functionality."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError


class SuperResolutionError(ValueError):
    """Raised when super resolution parameters are invalid."""


@dataclass(frozen=True)
class SuperResolutionResult:
    """Result returned from the enhancement pipeline."""

    image_bytes: bytes
    width: int
    height: int
    scale: float


_RESAMPLE_MAP = {
    "nearest": Image.Resampling.NEAREST,
    "bilinear": Image.Resampling.BILINEAR,
    "bicubic": Image.Resampling.BICUBIC,
}


def enhance_image(data: bytes, *, scale: float = 2.0, mode: str = "bicubic") -> SuperResolutionResult:
    """Upscale an image purely in-memory.

    Args:
        data: Raw image bytes.
        scale: Multiplicative scale factor (> 0).
        mode: Resampling kernel name.

    Returns:
        SuperResolutionResult containing PNG bytes and metadata.

    Raises:
        SuperResolutionError: If the image cannot be processed or parameters are invalid.
    """

    if scale <= 0:
        raise SuperResolutionError("Scale factor must be greater than zero")

    try:
        image = Image.open(BytesIO(data))
    except UnidentifiedImageError as exc:  # pragma: no cover - defensive
        raise SuperResolutionError("Unsupported or corrupted image stream") from exc

    resample = _RESAMPLE_MAP.get(mode.lower())
    if resample is None:
        raise SuperResolutionError("Unsupported resampling mode")

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGB")

    width = max(1, int(round(image.width * scale)))
    height = max(1, int(round(image.height * scale)))
    upscaled = image.resize((width, height), resample)

    buffer = BytesIO()
    upscaled.save(buffer, format="PNG")

    return SuperResolutionResult(
        image_bytes=buffer.getvalue(),
        width=width,
        height=height,
        scale=scale,
    )


__all__ = ["SuperResolutionError", "SuperResolutionResult", "enhance_image"]
