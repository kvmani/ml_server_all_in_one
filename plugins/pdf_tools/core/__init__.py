from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, List

from PyPDF2 import PdfReader, PdfWriter

from .page_ranges import PageRangeError, parse_page_range


@dataclass(frozen=True)
class MergeSpec:
    """Specification for merging a single PDF input."""

    data: bytes
    page_range: str = "all"
    filename: str = "document.pdf"


@dataclass(frozen=True)
class PdfMetadata:
    """Metadata extracted from a PDF document."""

    pages: int
    size_bytes: int


def merge_pdfs(specs: Iterable[MergeSpec]) -> bytes:
    writer = PdfWriter()
    for spec in specs:
        reader = PdfReader(BytesIO(spec.data))
        pages = parse_page_range(spec.page_range, len(reader.pages))
        for page_num in pages:
            writer.add_page(reader.pages[page_num - 1])
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def split_pdf(stream: bytes) -> List[bytes]:
    reader = PdfReader(BytesIO(stream))
    outputs: List[bytes] = []
    for page in reader.pages:
        writer = PdfWriter()
        writer.add_page(page)
        buf = BytesIO()
        writer.write(buf)
        outputs.append(buf.getvalue())
    return outputs


def pdf_metadata(data: bytes) -> PdfMetadata:
    reader = PdfReader(BytesIO(data))
    return PdfMetadata(pages=len(reader.pages), size_bytes=len(data))


__all__ = [
    "MergeSpec",
    "PdfMetadata",
    "merge_pdfs",
    "split_pdf",
    "pdf_metadata",
    "PageRangeError",
    "parse_page_range",
]
