from io import BytesIO

from PyPDF2 import PdfWriter

from plugins.pdf_stitch.core.stitch import (
    PageSequenceError,
    StitchItem,
    parse_page_sequence,
    stitch_pdfs,
)


def _pdf_with_pages(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_parse_page_sequence_supports_end_keyword():
    pages = parse_page_sequence("1-3, 5, end", total_pages=6)
    assert pages == [1, 2, 3, 5, 6]


def test_parse_page_sequence_rejects_invalid_numbers():
    try:
        parse_page_sequence("0,2", total_pages=2)
    except PageSequenceError as exc:
        assert "must be >=" in str(exc)
    else:
        raise AssertionError("Expected PageSequenceError")


def test_stitch_pdfs_respects_plan_order():
    doc_a = _pdf_with_pages(3)
    doc_b = _pdf_with_pages(2)
    result = stitch_pdfs(
        [
            StitchItem(alias="pdf-1", data=doc_a, pages="2"),
            StitchItem(alias="pdf-2", data=doc_b, pages="all"),
            StitchItem(alias="pdf-1", data=doc_a, pages="3"),
        ]
    )
    from PyPDF2 import PdfReader

    reader = PdfReader(BytesIO(result))
    assert len(reader.pages) == 4
