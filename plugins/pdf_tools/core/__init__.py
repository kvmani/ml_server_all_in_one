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


__all__ = ["MergeSpec", "merge_pdfs", "split_pdf", "PageRangeError", "parse_page_range"]
