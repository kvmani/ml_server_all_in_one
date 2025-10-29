"""Validation helpers shared across plugins."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from werkzeug.datastructures import FileStorage


class ValidationError(ValueError):
    """Raised when validation fails."""


@dataclass
class FileLimit:
    max_files: int
    max_size: int


def enforce_limits(files: Iterable[FileStorage], limit: FileLimit) -> None:
    files = list(files)
    if len(files) == 0:
        raise ValidationError("At least one file is required")
    if len(files) > limit.max_files:
        raise ValidationError("Too many files uploaded")
    for file in files:
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > limit.max_size:
            raise ValidationError("File exceeds allowed size")


__all__ = ["ValidationError", "FileLimit", "enforce_limits"]
