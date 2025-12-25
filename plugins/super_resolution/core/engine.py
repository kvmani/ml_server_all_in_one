"""Real-ESRGAN powered super-resolution pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

REAL_ESRGAN_AVAILABLE = False
IMPORT_ERROR: str | None = None

try:  # Optional dependency (heavy)
    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    REAL_ESRGAN_AVAILABLE = True
except Exception as exc:  # pragma: no cover - exercised in integration
    IMPORT_ERROR = repr(exc)


class SuperResolutionError(RuntimeError):
    """Base error for super-resolution failures."""


class SuperResolutionUnavailableError(SuperResolutionError):
    """Raised when Real-ESRGAN dependencies are missing."""


class SuperResolutionModelError(SuperResolutionError):
    """Raised when model weights cannot be loaded."""


class SuperResolutionInputError(SuperResolutionError):
    """Raised when the input image is invalid."""


@dataclass(frozen=True)
class ModelSpec:
    name: str
    weights_path: Path
    scale: int
    num_block: int = 23
    num_feat: int = 64
    num_grow_ch: int = 32


@dataclass(frozen=True)
class UpscaleResult:
    image_bytes: bytes
    width: int
    height: int
    scale: float
    output_format: str


@dataclass(frozen=True)
class ModelBundle:
    spec: ModelSpec
    device: str
    upsampler: Any


_MODEL_CACHE: dict[tuple[str, str], ModelBundle] = {}
_MODEL_LOCK = Lock()


def is_available() -> bool:
    return REAL_ESRGAN_AVAILABLE


def import_error() -> str | None:
    return IMPORT_ERROR


def select_device(preference: str) -> str:
    normalized = (preference or "auto").lower()
    if normalized not in {"auto", "cpu", "cuda"}:
        normalized = "auto"
    if normalized == "cpu":
        return "cpu"
    if not REAL_ESRGAN_AVAILABLE:
        return "cpu"
    if normalized == "cuda":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


def model_cached(spec: ModelSpec, device: str) -> bool:
    return (spec.name, device) in _MODEL_CACHE


def _load_upsampler(spec: ModelSpec, device: str) -> ModelBundle:
    if not REAL_ESRGAN_AVAILABLE:
        raise SuperResolutionUnavailableError(
            "Real-ESRGAN is unavailable. Install torch and realesrgan."
        )
    if not spec.weights_path.exists():
        raise SuperResolutionModelError(
            f"Missing weights file: {spec.weights_path}"
        )

    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=spec.num_feat,
        num_block=spec.num_block,
        num_grow_ch=spec.num_grow_ch,
        scale=spec.scale,
    )

    upsampler = RealESRGANer(
        scale=spec.scale,
        model_path=str(spec.weights_path),
        model=model,
        tile=0,
        tile_pad=10,
        pre_pad=0,
        half=device == "cuda",
        device=torch.device(device),
    )
    return ModelBundle(spec=spec, device=device, upsampler=upsampler)


def get_upsampler(spec: ModelSpec, device: str) -> ModelBundle:
    key = (spec.name, device)
    bundle = _MODEL_CACHE.get(key)
    if bundle is not None:
        return bundle
    with _MODEL_LOCK:
        bundle = _MODEL_CACHE.get(key)
        if bundle is not None:
            return bundle
        bundle = _load_upsampler(spec, device)
        _MODEL_CACHE[key] = bundle
        return bundle


def _decode_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        return ImageOps.exif_transpose(image)
    except UnidentifiedImageError as exc:
        raise SuperResolutionInputError(
            "Unsupported or corrupted image stream"
        ) from exc


def _normalize_output_format(value: str) -> str:
    normalized = (value or "png").lower()
    if normalized in {"jpg", "jpeg"}:
        return "jpg"
    if normalized == "png":
        return "png"
    raise SuperResolutionInputError("Output format must be png or jpg")


def _prepare_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGB", image.size, (255, 255, 255))
        alpha = image.split()[-1]
        background.paste(image.convert("RGBA"), mask=alpha)
        return background
    if image.mode != "RGB":
        return image.convert("RGB")
    return image


def upscale_image(
    data: bytes,
    *,
    spec: ModelSpec,
    device: str,
    output_format: str,
    outscale: float | None = None,
) -> UpscaleResult:
    if not REAL_ESRGAN_AVAILABLE:
        raise SuperResolutionUnavailableError(
            "Real-ESRGAN is unavailable. Install torch and realesrgan."
        )

    image = _decode_image(data)
    image = _prepare_rgb(image)

    rgb = np.asarray(image)
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        raise SuperResolutionInputError("Input image must be RGB")
    bgr = rgb[:, :, ::-1]

    bundle = get_upsampler(spec, device)
    scale = float(outscale or spec.scale)
    output, _ = bundle.upsampler.enhance(bgr, outscale=scale)
    output_rgb = output[:, :, ::-1]

    result_image = Image.fromarray(output_rgb)
    fmt = _normalize_output_format(output_format)
    buffer = BytesIO()
    if fmt == "jpg":
        result_image.save(buffer, format="JPEG", quality=95)
    else:
        result_image.save(buffer, format="PNG")

    return UpscaleResult(
        image_bytes=buffer.getvalue(),
        width=result_image.width,
        height=result_image.height,
        scale=scale,
        output_format=fmt,
    )


__all__ = [
    "ModelSpec",
    "UpscaleResult",
    "SuperResolutionError",
    "SuperResolutionUnavailableError",
    "SuperResolutionModelError",
    "SuperResolutionInputError",
    "is_available",
    "import_error",
    "select_device",
    "model_cached",
    "get_upsampler",
    "upscale_image",
]
