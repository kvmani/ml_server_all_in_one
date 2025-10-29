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


def test_merge_endpoint_returns_pdf():
    client = _make_client()
    manifest = [
        {"field": "file-0", "filename": "a.pdf", "pages": "1"},
        {"field": "file-1", "filename": "b.pdf", "pages": "all"},
    ]
    data = {
        "manifest": json.dumps(manifest),
        "output_name": "merged.pdf",
        "file-0": (BytesIO(_dummy_pdf(2)), "a.pdf"),
        "file-1": (BytesIO(_dummy_pdf(1)), "b.pdf"),
    }
    response = client.post("/pdf_tools/api/v1/merge", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    disposition = response.headers.get("Content-Disposition", "")
    assert "merged.pdf" in disposition


def test_merge_rejects_bad_manifest():
    client = _make_client()
    data = {
        "file-0": (BytesIO(_dummy_pdf()), "a.pdf"),
    }
    response = client.post("/pdf_tools/api/v1/merge", data=data, content_type="multipart/form-data")
    assert response.status_code == 400


def test_split_endpoint_returns_pages():
    client = _make_client()
    data = {
        "file": (BytesIO(_dummy_pdf(2)), "sample.pdf"),
    }
    response = client.post("/pdf_tools/api/v1/split", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload["pages"]) == 2


def test_merge_respects_file_limit():
    client = _make_client()
    manifest = []
    data: dict[str, object] = {"output_name": "merged.pdf"}
    for index in range(21):
        field = f"file-{index}"
        manifest.append({"field": field, "filename": f"doc-{index}.pdf", "pages": "all"})
        data[field] = (BytesIO(_dummy_pdf()), f"doc-{index}.pdf")
    data["manifest"] = json.dumps(manifest)

    response = client.post("/pdf_tools/api/v1/merge", data=data, content_type="multipart/form-data")
    assert response.status_code == 400
    payload = response.get_json()
    assert "Too many files" in payload["error"]


def test_metadata_endpoint_reports_pages_and_size():
    client = _make_client()
    data = {"file": (BytesIO(_dummy_pdf(3)), "meta.pdf")}
    response = client.post("/pdf_tools/api/v1/metadata", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["pages"] == 3
    assert payload["size_bytes"] > 0


def test_metadata_rejects_fake_pdf_signature():
    client = _make_client()
    data = {"file": (BytesIO(b"not really a pdf"), "fake.pdf")}
    response = client.post("/pdf_tools/api/v1/metadata", data=data, content_type="multipart/form-data")
    assert response.status_code == 400
    payload = response.get_json()
    assert "signature" in payload["error"].lower()
