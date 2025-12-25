"""Optional ML-backed hydride segmentation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from skimage import morphology

from .conventional import SegmentationOutput

TORCH_AVAILABLE = False
IMPORT_ERROR: str | None = None

try:  # Optional dependency
    import segmentation_models_pytorch as smp  # noqa: F401
    import torch

    TORCH_AVAILABLE = True
except Exception as exc:  # pragma: no cover - exercised in integration
    IMPORT_ERROR = repr(exc)

_MODEL_CACHE: dict[str, Any] = {}


@dataclass(frozen=True)
class MlModelSpec:
    model_id: str
    label: str
    file: str
    placeholder: bool = False
    input_size: int = 256
    threshold: float = 0.5
    architecture: str | None = None
    encoder: str | None = None
    in_channels: int = 1
    classes: int = 1


class MlUnavailableError(RuntimeError):
    """Raised when optional ML dependencies are missing."""


class MlModelError(RuntimeError):
    """Raised when model weights cannot be loaded."""


def ml_available() -> bool:
    return TORCH_AVAILABLE


def ml_import_error() -> str | None:
    return IMPORT_ERROR


def _load_model(weights_path: Path, spec: MlModelSpec) -> "torch.nn.Module":
    if not TORCH_AVAILABLE:
        raise MlUnavailableError("Torch is not available")

    obj = torch.load(weights_path, map_location="cpu")
    if isinstance(obj, torch.nn.Module):
        model = obj
    elif isinstance(obj, dict):
        arch = (spec.architecture or "unet").lower()
        if arch != "unet":
            raise MlModelError(f"Unsupported architecture '{arch}'")
        encoder = spec.encoder or "resnet18"
        model = smp.Unet(
            encoder_name=encoder,
            encoder_weights=None,
            in_channels=spec.in_channels,
            classes=spec.classes,
        )
        model.load_state_dict(obj)
    else:
        raise MlModelError("Unsupported model serialization format")

    model.eval()
    model.to("cpu")
    return model


def get_model(weights_path: Path, spec: MlModelSpec) -> "torch.nn.Module":
    key = str(weights_path)
    model = _MODEL_CACHE.get(key)
    if model is None:
        model = _load_model(weights_path, spec)
        _MODEL_CACHE[key] = model
    return model


def _prepare_input(image: np.ndarray, input_size: int) -> tuple[np.ndarray, Image.Image]:
    if input_size <= 0:
        raise ValueError("input_size must be a positive integer")
    pil = Image.fromarray(image)
    if input_size and (pil.width != input_size or pil.height != input_size):
        resized = pil.resize((input_size, input_size), Image.BILINEAR)
    else:
        resized = pil
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    arr = np.clip(arr, 0.0, 1.0)
    return arr, resized


def segment_ml(
    image: np.ndarray, spec: MlModelSpec, *, weights_path: Path
) -> SegmentationOutput:
    if not TORCH_AVAILABLE:
        raise MlUnavailableError("Torch is not available")

    model = get_model(weights_path, spec)
    image = np.asarray(image)
    if image.ndim != 2:
        raise ValueError("ML pipeline expects a grayscale image")

    input_arr, resized = _prepare_input(image, spec.input_size)
    tensor = torch.from_numpy(input_arr).unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        logits = model(tensor)
        if isinstance(logits, (list, tuple)):
            logits = logits[0]
        if logits.ndim == 4:
            logits = logits[:, 0, :, :]
        probs = torch.sigmoid(logits).squeeze(0).cpu().numpy()

    mask = (probs > spec.threshold).astype(np.uint8) * 255

    if mask.shape != image.shape:
        mask = np.array(
            Image.fromarray(mask).resize((image.shape[1], image.shape[0]), Image.NEAREST)
        ).astype(np.uint8)

    overlay = np.stack([image] * 3, axis=-1)
    edges = morphology.binary_dilation(mask > 0) ^ (mask > 0)
    overlay[edges] = [255, 0, 0]

    logs = [
        f"ML model: {spec.label}",
        f"Original size: {image.shape[1]}x{image.shape[0]}",
        f"Input resized to {resized.width}x{resized.height}",
        f"Threshold: {spec.threshold}",
    ]
    return SegmentationOutput(
        mask=mask,
        overlay=overlay,
        input_image=image,
        logs=logs,
    )


__all__ = [
    "MlModelSpec",
    "MlUnavailableError",
    "MlModelError",
    "ml_available",
    "ml_import_error",
    "segment_ml",
]
