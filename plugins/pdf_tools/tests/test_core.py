from io import BytesIO

import pytest
from PyPDF2 import PdfWriter

from plugins.pdf_tools.core import (
    MergeSpec,
    PageRangeError,
    SplitTask,
    merge_pdfs,
    parse_page_range,
    split_pdf,
    split_pdf_custom,
)


def _blank_pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_merge_respects_page_ranges():
    pdf1 = _blank_pdf(3)
    pdf2 = _blank_pdf(2)
    merged = merge_pdfs(
        [
            MergeSpec(data=pdf1, page_range="1-2", filename="a.pdf"),
            MergeSpec(data=pdf2, page_range="2", filename="b.pdf"),
        ]
    )
    pages = split_pdf(merged)
    assert len(pages) == 3


def test_parse_page_range_validation():
    assert parse_page_range("1,3-4", 5) == [1, 3, 4]
    with pytest.raises(PageRangeError):
        parse_page_range("0-2", 5)


def test_split_pdf_custom_uses_named_ranges():
    pdf = _blank_pdf(5)
    outputs = split_pdf_custom(
        pdf, [SplitTask(name="first.pdf", page_range="1-2"), SplitTask(name="rest.pdf", page_range="3-5")]
    )
    assert [name for name, _ in outputs] == ["first.pdf", "rest.pdf"]
    assert len(split_pdf(outputs[0][1])) == 2
    assert len(split_pdf(outputs[1][1])) == 3


def test_split_pdf_custom_rejects_out_of_range():
    pdf = _blank_pdf(2)
    with pytest.raises(PageRangeError):
        split_pdf_custom(pdf, [SplitTask(name="bad.pdf", page_range="3-4")])
