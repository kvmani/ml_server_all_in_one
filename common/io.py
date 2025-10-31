"""Common IO helpers for plugins."""

from __future__ import annotations

import os
import shutil
import tempfile
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Iterator

from app import config

SAFE_FILENAME_CHARS = {"-", "_", "."}


class TempDir:
    """Temporary directory rooted in tmpfs that cleans up eagerly."""

    def __init__(self, path: Path):
        self.path = path

    def cleanup(self) -> None:
        shutil.rmtree(self.path, ignore_errors=True)

    def __enter__(self) -> "TempDir":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - defensive
        self.cleanup()


def ensure_tmpfs_root() -> Path:
    root = config.BaseConfig.UPLOAD_TMPFS_ROOT
    root.mkdir(parents=True, exist_ok=True)
    return root


def new_tmpfs_dir(prefix: str = "aio-") -> TempDir:
    root = ensure_tmpfs_root()
    path = Path(tempfile.mkdtemp(prefix=prefix, dir=root))
    return TempDir(path)


def buffer_from_bytes(data: bytes) -> BytesIO:
    buffer = BytesIO()
    buffer.write(data)
    buffer.seek(0)
    return buffer


@contextmanager
def in_memory_file(data: bytes) -> Iterator[BytesIO]:
    buffer = buffer_from_bytes(data)
    try:
        yield buffer
    finally:
        buffer.close()


def secure_filename(filename: str, *, fallback: str = "upload") -> str:
    """Sanitize filenames without relying on Werkzeug internals."""

    if not filename:
        return fallback
    name, ext = os.path.splitext(filename)
    safe_name = "".join(
        ch if ch.isalnum() or ch in SAFE_FILENAME_CHARS else "_" for ch in name
    )
    safe_ext = "".join(ch for ch in ext if ch.isalnum() or ch in SAFE_FILENAME_CHARS)
    safe_name = safe_name.strip("._") or fallback
    safe_ext = safe_ext.strip("._")
    return f"{safe_name}{f'.{safe_ext}' if safe_ext else ''}"


__all__ = [
    "TempDir",
    "ensure_tmpfs_root",
    "new_tmpfs_dir",
    "buffer_from_bytes",
    "in_memory_file",
    "secure_filename",
]
