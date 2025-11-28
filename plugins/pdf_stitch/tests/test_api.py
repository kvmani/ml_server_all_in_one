import json
from io import BytesIO

from PyPDF2 import PdfWriter

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def _dummy_pdf(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_stitch_endpoint_merges_plan():
    client = _make_client()
    manifest = [
        {"field": "file-a", "alias": "pdf-1", "pages": "1"},
        {"field": "file-b", "alias": "pdf-2", "pages": "all"},
        {"field": "file-a", "alias": "pdf-1", "pages": "2-3"},
    ]
    data = {
        "manifest": json.dumps(manifest),
        "output_name": "custom.pdf",
        "file-a": (BytesIO(_dummy_pdf(3)), "a.pdf"),
        "file-b": (BytesIO(_dummy_pdf(2)), "b.pdf"),
    }
    response = client.post(
        "/api/pdf_stitch/stitch",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["filename"].endswith(".pdf")
    assert payload["data"]["parts"][0]["alias"] == "pdf-1"


def test_stitch_endpoint_with_download():
    client = _make_client()
    manifest = [{"field": "file-a", "alias": "pdf-1", "pages": "all"}]
    data = {
        "manifest": json.dumps(manifest),
        "file-a": (BytesIO(_dummy_pdf(1)), "a.pdf"),
    }
    response = client.post(
        "/api/pdf_stitch/stitch?download=1",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition", "").startswith("attachment;")


def test_stitch_rejects_invalid_sequence():
    client = _make_client()
    manifest = [{"field": "file-a", "alias": "pdf-1", "pages": "0"}]
    data = {
        "manifest": json.dumps(manifest),
        "file-a": (BytesIO(_dummy_pdf(1)), "a.pdf"),
    }
    response = client.post(
        "/api/pdf_stitch/stitch",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False


def test_metadata_reports_pages():
    client = _make_client()
    data = {"file": (BytesIO(_dummy_pdf(2)), "meta.pdf")}
    response = client.post(
        "/api/pdf_stitch/metadata", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["pages"] == 2
