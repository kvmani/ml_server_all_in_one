import base64
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
    response = client.post(
        "/api/pdf_tools/merge", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data_payload = payload["data"]
    assert data_payload["filename"].endswith(".pdf")
    merged_bytes = base64.b64decode(data_payload["pdf_base64"])
    assert merged_bytes.startswith(b"%PDF")


def test_merge_rejects_bad_manifest():
    client = _make_client()
    data = {
        "file-0": (BytesIO(_dummy_pdf()), "a.pdf"),
    }
    response = client.post(
        "/api/pdf_tools/merge", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_split_endpoint_returns_pages():
    client = _make_client()
    data = {
        "file": (BytesIO(_dummy_pdf(2)), "sample.pdf"),
    }
    response = client.post(
        "/api/pdf_tools/split", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert len(payload["data"]["pages"]) == 2


def test_merge_respects_file_limit():
    client = _make_client()
    manifest = []
    data: dict[str, object] = {"output_name": "merged.pdf"}
    for index in range(21):
        field = f"file-{index}"
        manifest.append(
            {"field": field, "filename": f"doc-{index}.pdf", "pages": "all"}
        )
        data[field] = (BytesIO(_dummy_pdf()), f"doc-{index}.pdf")
    data["manifest"] = json.dumps(manifest)

    response = client.post(
        "/api/pdf_tools/merge", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False


def test_metadata_endpoint_reports_pages_and_size():
    client = _make_client()
    data = {"file": (BytesIO(_dummy_pdf(3)), "meta.pdf")}
    response = client.post(
        "/api/pdf_tools/metadata", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["pages"] == 3
    assert payload["data"]["size_bytes"] > 0


def test_metadata_rejects_fake_pdf_signature():
    client = _make_client()
    data = {"file": (BytesIO(b"not really a pdf"), "fake.pdf")}
    response = client.post(
        "/api/pdf_tools/metadata", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert "signature" in payload["error"]["message"].lower()
