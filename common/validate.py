"""Validation helpers shared across plugins."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Any

from werkzeug.datastructures import FileStorage


class ValidationError(ValueError):
    """Raised when validation fails."""


@dataclass
class FileLimit:
    max_files: int
    max_size: int

    @classmethod
    def from_settings(
        cls,
        settings: Mapping[str, Any] | None,
        *,
        default_max_files: int,
        default_max_mb: int,
    ) -> "FileLimit":
        """Build a :class:`FileLimit` from user configuration.

        ``settings`` is expected to be a mapping (usually pulled from
        ``config.yml``). Missing or malformed values gracefully fall back to
        the supplied defaults so misconfiguration never raises at import time.
        """

        max_files = default_max_files
        max_mb = default_max_mb

        if settings:
            raw_max_files = settings.get("max_files")
            raw_max_mb = settings.get("max_mb")

            try:
                max_files = int(raw_max_files)
            except (TypeError, ValueError):
                max_files = default_max_files

            try:
                max_mb = int(float(raw_max_mb))
            except (TypeError, ValueError):
                max_mb = default_max_mb

        max_files = max(max_files, 1)
        max_mb = max(max_mb, 1)

        return cls(max_files=max_files, max_size=max_mb * 1024 * 1024)


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
