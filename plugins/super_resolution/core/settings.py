"""Configuration helpers for super-resolution."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from .engine import ModelSpec


@dataclass(frozen=True)
class SuperResolutionSettings:
    enabled: bool
    device: str
    max_upload_mb: int
    default_scale: int
    default_model: str
    weights_dir: Path
    models: dict[str, ModelSpec]


def _resolve_path(root: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (root / path).resolve()


def _model_defaults(weights_dir: Path) -> dict[str, ModelSpec]:
    return {
        "RealESRGAN_x4plus": ModelSpec(
            name="RealESRGAN_x4plus",
            weights_path=weights_dir / "RealESRGAN_x4plus.pth",
            scale=4,
        ),
        "RealESRGAN_x2plus": ModelSpec(
            name="RealESRGAN_x2plus",
            weights_path=weights_dir / "RealESRGAN_x2plus.pth",
            scale=2,
        ),
    }


def load_settings(raw: Mapping[str, object] | None, *, root: Path) -> SuperResolutionSettings:
    raw = raw or {}
    enabled = bool(raw.get("enabled", True))
    device = str(raw.get("device", "auto"))
    max_upload_mb = raw.get("max_upload_mb")
    if max_upload_mb is None:
        upload = raw.get("upload")
        if isinstance(upload, Mapping):
            max_upload_mb = upload.get("max_mb", 20)
        else:
            max_upload_mb = 20
    max_upload_mb = max(1, int(float(max_upload_mb)))
    default_scale = int(float(raw.get("default_scale", 4)))
    weights_dir = _resolve_path(
        root, str(raw.get("weights_dir", "models/super_resolution/weights"))
    )

    models_raw = raw.get("models")
    models: dict[str, ModelSpec] = {}
    if isinstance(models_raw, Mapping):
        for name, data in models_raw.items():
            if not isinstance(data, Mapping):
                continue
            weights_path = data.get("weights_path")
            scale = data.get("scale", default_scale)
            num_block = data.get("num_block", 23)
            num_feat = data.get("num_feat", 64)
            num_grow = data.get("num_grow_ch", 32)
            if not weights_path:
                weights_path = str(weights_dir / f"{name}.pth")
            models[str(name)] = ModelSpec(
                name=str(name),
                weights_path=_resolve_path(root, str(weights_path)),
                scale=int(float(scale)),
                num_block=int(float(num_block)),
                num_feat=int(float(num_feat)),
                num_grow_ch=int(float(num_grow)),
            )

    if not models:
        models = _model_defaults(weights_dir)

    default_model = str(raw.get("default_model") or next(iter(models.keys())))
    if default_model not in models:
        default_model = next(iter(models.keys()))

    return SuperResolutionSettings(
        enabled=enabled,
        device=device,
        max_upload_mb=max_upload_mb,
        default_scale=default_scale,
        default_model=default_model,
        weights_dir=weights_dir,
        models=models,
    )


__all__ = ["SuperResolutionSettings", "load_settings"]
