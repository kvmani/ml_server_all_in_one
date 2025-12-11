import base64
import json
import zipfile
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
    data_payload = payload["data"]
    assert data_payload["page_count"] == 2
    assert len(data_payload["files"]) == 2
    assert data_payload["files"][0]["name"].endswith(".pdf")
    assert len(data_payload["pages"]) == 2


def test_split_accepts_custom_plan_and_names():
    client = _make_client()
    plan = [
        {"name": "split-1.pdf", "pages": "1-2"},
        {"name": "tail.pdf", "pages": "3"},
    ]
    data = {
        "file": (BytesIO(_dummy_pdf(3)), "sample.pdf"),
        "plan": json.dumps(plan),
    }
    response = client.post(
        "/api/pdf_tools/split", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["page_count"] == 3
    assert [item["name"] for item in payload["files"]] == ["split-1.pdf", "tail.pdf"]
    assert all(item["pdf_base64"] for item in payload["files"])


def test_split_rejects_out_of_range_plan():
    client = _make_client()
    plan = [{"name": "broken.pdf", "pages": "5-6"}]
    data = {
        "file": (BytesIO(_dummy_pdf(2)), "sample.pdf"),
        "plan": json.dumps(plan),
    }
    response = client.post(
        "/api/pdf_tools/split", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert payload["error"]["code"] == "pdf.invalid_page_range"


def test_split_download_zip_uses_custom_names():
    client = _make_client()
    plan = [
        {"name": "alpha.pdf", "pages": "1"},
        {"name": "beta.pdf", "pages": "2"},
    ]
    data = {
        "file": (BytesIO(_dummy_pdf(2)), "sample.pdf"),
        "plan": json.dumps(plan),
    }
    response = client.post(
        "/api/pdf_tools/split?download=1",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    buffer = BytesIO(response.data)
    with zipfile.ZipFile(buffer, "r") as zf:
        names = set(zf.namelist())
    assert "alpha.pdf" in names
    assert "beta.pdf" in names


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


def test_merge_allows_attachment_download():
    client = _make_client()
    manifest = [
        {"field": "file-0", "filename": "a.pdf", "pages": "all"},
    ]
    data = {
        "manifest": json.dumps(manifest),
        "file-0": (BytesIO(_dummy_pdf()), "a.pdf"),
    }
    response = client.post(
        "/api/pdf_tools/merge?download=1", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition", "").startswith("attachment;")
    assert response.data.startswith(b"%PDF")


def test_split_allows_zip_download():
    client = _make_client()
    data = {
        "file": (BytesIO(_dummy_pdf(2)), "sample.pdf"),
    }
    response = client.post(
        "/api/pdf_tools/split?download=1", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition", "").endswith(".zip")
    assert response.headers.get("Content-Type") == "application/zip"
