"""Validation primitives for plugin APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, TypeVar

import pydantic
from pydantic import BaseModel
from werkzeug.datastructures import FileStorage


class ValidationError(ValueError):
    """Raised when validation fails."""

    def __init__(self, message: str, *, details: Any | None = None):
        super().__init__(message)
        self.details = details


class SchemaModel(BaseModel):
    """Strict base model for request/response validation."""

    model_config = pydantic.ConfigDict(extra="forbid", str_strip_whitespace=True)


TModel = TypeVar("TModel", bound=SchemaModel)


def parse_model(model: type[TModel], payload: Mapping[str, Any] | None) -> TModel:
    payload = payload or {}
    try:
        return model.model_validate(payload)
    except pydantic.ValidationError as exc:  # pragma: no cover - exercised in tests
        raise ValidationError("Invalid request payload", details=exc.errors()) from exc


@dataclass(slots=True)
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
    if not files:
        raise ValidationError("At least one file is required")
    if len(files) > limit.max_files:
        raise ValidationError("Too many files uploaded")
    for file in files:
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > limit.max_size:
            raise ValidationError("File exceeds allowed size")


_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/tiff": (b"II*\x00", b"MM\x00*"),
}


def _looks_like_csv(sample: bytes) -> bool:
    if not sample:
        return False
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = sample.decode("latin-1")
        except UnicodeDecodeError:
            return False
    return any(delim in text for delim in (",", ";", "\t")) and "\n" in text


def _matches_signature(sample: bytes, allowed: set[str]) -> bool:
    for mime in allowed:
        signatures = _SIGNATURES.get(mime)
        if signatures:
            if any(sample.startswith(signature) for signature in signatures):
                return True
        elif mime in {"text/csv", "application/vnd.ms-excel"}:
            if _looks_like_csv(sample):
                return True
    return False


def validate_mime(files: Iterable[FileStorage], allowed: set[str]) -> None:
    for file in files:
        stream = file.stream
        try:
            current = stream.tell()
        except (AttributeError, OSError):
            current = None

        try:
            stream.seek(0)
        except (AttributeError, OSError):
            pass

        sample = stream.read(1024)
        if isinstance(sample, str):  # pragma: no cover - defensive
            sample = sample.encode("utf-8", "ignore")

        if current is not None:
            stream.seek(current)
        else:
            try:
                stream.seek(0)
            except (AttributeError, OSError):
                pass

        if not _matches_signature(sample or b"", allowed):
            raise ValidationError("Unsupported or invalid file signature")


__all__ = [
    "ValidationError",
    "SchemaModel",
    "parse_model",
    "FileLimit",
    "enforce_limits",
    "validate_mime",
]
