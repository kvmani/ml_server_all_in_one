#!/usr/bin/env python3
"""Prepare Real-ESRGAN weights for the super-resolution plugin."""

from __future__ import annotations

import argparse
import shutil
import sys
import urllib.request
from pathlib import Path
from typing import Mapping

import yaml

DEFAULT_URLS = {
    "RealESRGAN_x4plus": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.3.0/RealESRGAN_x4plus.pth",
    "RealESRGAN_x2plus": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.3.0/RealESRGAN_x2plus.pth",
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_config(path: Path) -> Mapping[str, object]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _resolve_path(root: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (root / path).resolve()


def _model_map(config: Mapping[str, object], root: Path) -> dict[str, Path]:
    plugins = config.get("plugins", {}) if isinstance(config, Mapping) else {}
    super_res = plugins.get("super_resolution", {}) if isinstance(plugins, Mapping) else {}
    models = super_res.get("models") if isinstance(super_res, Mapping) else {}
    weights_dir = super_res.get(
        "weights_dir", "models/super_resolution/weights"
    ) if isinstance(super_res, Mapping) else "models/super_resolution/weights"
    weights_dir = _resolve_path(root, str(weights_dir))

    model_map: dict[str, Path] = {}
    if isinstance(models, Mapping) and models:
        for name, entry in models.items():
            if not isinstance(entry, Mapping):
                continue
            weights_path = entry.get("weights_path")
            if not weights_path:
                weights_path = str(weights_dir / f"{name}.pth")
            model_map[str(name)] = _resolve_path(root, str(weights_path))
    else:
        model_map = {
            "RealESRGAN_x4plus": weights_dir / "RealESRGAN_x4plus.pth",
            "RealESRGAN_x2plus": weights_dir / "RealESRGAN_x2plus.pth",
        }
    return model_map


def _copy_weights(source: Path, target: Path, *, force: bool) -> None:
    if target.exists() and not force:
        raise FileExistsError(f"{target} already exists (use --force to overwrite)")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _download_weights(url: str, target: Path, *, force: bool) -> None:
    if target.exists() and not force:
        raise FileExistsError(f"{target} already exists (use --force to overwrite)")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(target.suffix + ".download")
    try:
        urllib.request.urlretrieve(url, tmp_path)
        tmp_path.replace(target)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=_repo_root() / "config.yml",
        help="Path to config.yml",
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="Local file or directory containing weight files to copy.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download official weights from the Real-ESRGAN release page.",
    )
    parser.add_argument(
        "--model",
        help="Limit to a specific model name (must exist in config).",
    )
    parser.add_argument(
        "--url",
        help="Override download URL for the selected model.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing weights if present.",
    )
    args = parser.parse_args()

    config = _load_config(args.config)
    root = _repo_root()
    model_map = _model_map(config, root)

    if args.model:
        if args.model not in model_map:
            raise SystemExit(f"Unknown model '{args.model}' in config.")
        model_map = {args.model: model_map[args.model]}

    if not args.source and not args.download:
        raise SystemExit("Provide --source or --download to populate weights.")

    if args.source:
        source = args.source
        if source.is_file():
            if len(model_map) != 1:
                raise SystemExit("Use --model when copying from a single file source.")
            target = next(iter(model_map.values()))
            _copy_weights(source, target, force=args.force)
            print(f"Copied {source} -> {target}")
        else:
            if not source.is_dir():
                raise SystemExit(f"Source path not found: {source}")
            for name, target in model_map.items():
                candidate = source / target.name
                if not candidate.exists():
                    raise SystemExit(f"Missing {candidate} for model {name}")
                _copy_weights(candidate, target, force=args.force)
                print(f"Copied {candidate} -> {target}")

    if args.download:
        for name, target in model_map.items():
            url = args.url if args.url and len(model_map) == 1 else DEFAULT_URLS.get(name)
            if not url:
                raise SystemExit(f"No default URL available for model {name}")
            _download_weights(url, target, force=args.force)
            print(f"Downloaded {name} -> {target}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
