"""Helpers for resolving model weight paths."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping


def resolve_models_root(
    app_config: Mapping[str, object],
    plugin_settings: Mapping[str, object] | None,
    *,
    base_dir: Path,
) -> Path:
    model_store = app_config.get("MODEL_STORE", {}) if isinstance(app_config, Mapping) else {}
    model_store = model_store or {}
    plugin_settings = plugin_settings or {}

    env_var = (
        plugin_settings.get("models_root_env")
        or model_store.get("env")
        or "ML_SERVER_MODEL_STORE"
    )
    env_root = os.getenv(env_var) if env_var else None
    root = (
        env_root
        or plugin_settings.get("models_root")
        or model_store.get("root")
        or "model_store"
    )

    root_path = Path(str(root)).expanduser()
    if not root_path.is_absolute():
        root_path = base_dir / root_path
    return root_path


def resolve_model_path(root: Path, model_file: str) -> Path:
    path = Path(model_file)
    if path.is_absolute():
        return path
    return root / path


__all__ = ["resolve_models_root", "resolve_model_path"]
