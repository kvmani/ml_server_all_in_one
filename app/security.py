"""Security helpers used across the application."""

from __future__ import annotations

from pathlib import Path

from common.io import ensure_tmpfs_root, secure_filename
from common.validation import validate_mime


def ensure_tmpfs(path: Path) -> Path:
    base = ensure_tmpfs_root()
    full_path = base / path
    full_path.mkdir(parents=True, exist_ok=True)
    return full_path


__all__ = ["secure_filename", "validate_mime", "ensure_tmpfs"]
