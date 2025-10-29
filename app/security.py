"""Security helpers used across the application."""

from __future__ import annotations

import mimetypes
import os
import re
from pathlib import Path
from typing import Iterable

from werkzeug.datastructures import FileStorage

SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9_.-]")


def secure_filename(filename: str) -> str:
    """Return a sanitized filename that keeps the extension intact."""

    name, ext = os.path.splitext(filename)
    sanitized = SAFE_FILENAME_RE.sub("_", name)
    ext = SAFE_FILENAME_RE.sub("", ext)
    if not sanitized:
        sanitized = "upload"
    return f"{sanitized}{ext}".strip(".")


def validate_mime(files: Iterable[FileStorage], allowed: set[str]) -> None:
    """Validate that uploaded files match the allowed MIME types."""

    for file in files:
        mime, _ = mimetypes.guess_type(file.filename or "")
        if mime not in allowed:
            raise ValueError(f"Unsupported MIME type: {mime}")


def ensure_tmpfs(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


__all__ = ["secure_filename", "validate_mime", "ensure_tmpfs"]
