"""In-memory IO helpers."""

from __future__ import annotations

import shutil
import tempfile
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Iterator

from app import config


class TempDir:
    """Temporary directory rooted in tmpfs that cleans up eagerly."""

    def __init__(self, path: Path):
        self.path = path

    def cleanup(self) -> None:
        shutil.rmtree(self.path, ignore_errors=True)

    def __enter__(self) -> "TempDir":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.cleanup()


def new_tmpfs_dir(prefix: str = "aio-") -> TempDir:
    tmp_root = config.BaseConfig.UPLOAD_TMPFS_ROOT
    tmp_root.mkdir(parents=True, exist_ok=True)
    path = Path(tempfile.mkdtemp(prefix=prefix, dir=tmp_root))
    return TempDir(path)


def buffer_from_bytes(data: bytes) -> BytesIO:
    buf = BytesIO()
    buf.write(data)
    buf.seek(0)
    return buf


@contextmanager
def in_memory_file(data: bytes) -> Iterator[BytesIO]:
    buf = buffer_from_bytes(data)
    try:
        yield buf
    finally:
        buf.close()


__all__ = ["TempDir", "new_tmpfs_dir", "buffer_from_bytes", "in_memory_file"]
