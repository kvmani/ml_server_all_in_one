"""Compatibility wrapper around :mod:`common.io`."""

from __future__ import annotations

from .io import TempDir, buffer_from_bytes, in_memory_file, new_tmpfs_dir

__all__ = ["TempDir", "new_tmpfs_dir", "buffer_from_bytes", "in_memory_file"]
