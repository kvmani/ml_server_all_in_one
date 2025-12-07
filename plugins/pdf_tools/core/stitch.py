"""Core stitching utilities for combining PDFs with custom page plans."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, List

from PyPDF2 import PdfReader, PdfWriter


class StitchError(ValueError):
    """Raised when a stitch operation cannot be completed."""


class PageSequenceError(StitchError):
    """Raised when a page sequence string is invalid."""


@dataclass(frozen=True)
class StitchItem:
    """Specification for stitching a PDF source."""

    alias: str
    data: bytes
    pages: str = "all"


def _parse_token(token: str, total_pages: int) -> List[int]:
    token = token.strip()
    if not token:
        raise PageSequenceError("Empty page token")
    if token.lower() == "all":
        return list(range(1, total_pages + 1))

    def _to_int(value: str) -> int:
        value = value.strip()
        if value.lower() == "end":
            return total_pages
        page = int(value)
        if page < 1:
            raise PageSequenceError("Page numbers must be >= 1")
        if page > total_pages:
            raise PageSequenceError("Page number exceeds document length")
        return page

    if "-" in token:
        start_str, end_str = token.split("-", 1)
        start = _to_int(start_str)
        end = _to_int(end_str)
        if start > end:
            raise PageSequenceError("Range start must be <= end")
        return list(range(start, end + 1))

    return [_to_int(token)]


def parse_page_sequence(sequence: str | None, total_pages: int) -> List[int]:
    """Parse a human-friendly page sequence into a list of 1-indexed pages."""

    if not sequence or str(sequence).strip().lower() == "all":
        return list(range(1, total_pages + 1))
    tokens = [token.strip().rstrip(";") for token in str(sequence).replace("\n", ",").split(",")]
    pages: List[int] = []
    for token in tokens:
        if not token:
            continue
        pages.extend(_parse_token(token, total_pages))
    if not pages:
        raise PageSequenceError("No pages specified")
    return pages


def stitch_pdfs(items: Iterable[StitchItem]) -> bytes:
    """Return a stitched PDF according to the provided page plan."""

    writer = PdfWriter()
    for item in items:
        reader = PdfReader(BytesIO(item.data))
        sequence = parse_page_sequence(item.pages, len(reader.pages))
        for page_number in sequence:
            writer.add_page(reader.pages[page_number - 1])
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


__all__ = ["StitchItem", "StitchError", "PageSequenceError", "parse_page_sequence", "stitch_pdfs"]
