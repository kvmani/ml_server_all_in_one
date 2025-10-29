"""Security helpers used across the application."""

from __future__ import annotations

import io
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
    # Basic check for delimiter presence
    return any(delim in text for delim in (",", ";", "\t")) and "\n" in text


def _matches_signature(sample: bytes, allowed: set[str]) -> bool:
    for mime in allowed:
        signatures = _SIGNATURES.get(mime)
        if signatures:
            for signature in signatures:
                if sample.startswith(signature):
                    return True
        elif mime in {"text/csv", "application/vnd.ms-excel"}:
            if _looks_like_csv(sample):
                return True
    return False


def validate_mime(files: Iterable[FileStorage], allowed: set[str]) -> None:
    """Validate that uploaded files match the allowed MIME types."""

    for file in files:
        mime, _ = mimetypes.guess_type(file.filename or "")
        if mime and mime not in allowed:
            raise ValueError(f"Unsupported MIME type: {mime}")

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
                if isinstance(stream, io.BytesIO):
                    stream.seek(0)

        if not _matches_signature(sample, allowed):
            raise ValueError("Unsupported or invalid file signature")


def ensure_tmpfs(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


__all__ = ["secure_filename", "validate_mime", "ensure_tmpfs"]
