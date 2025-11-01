import base64
from io import BytesIO

from PIL import Image

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def _sample_png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (10, 10), color=(40, 120, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_enhance_endpoint_returns_upscaled_image():
    client = _make_client()
    data = {
        "scale": "1.5",
        "mode": "bicubic",
        "image": (BytesIO(_sample_png()), "sample.png"),
    }
    response = client.post(
        "/api/super_resolution/enhance", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    result = payload["data"]
    assert result["scale"] == 1.5
    assert result["width"] == 15
    assert result["height"] == 15
    image_bytes = base64.b64decode(result["image_base64"])
    assert image_bytes.startswith(b"\x89PNG")


def test_enhance_endpoint_rejects_invalid_scale():
    client = _make_client()
    data = {
        "scale": "not-a-number",
        "image": (BytesIO(_sample_png()), "sample.png"),
    }
    response = client.post(
        "/api/super_resolution/enhance", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert "scale" in payload["error"]["message"].lower()


def test_enhance_endpoint_validates_mime():
    client = _make_client()
    data = {
        "image": (BytesIO(b"not an image"), "sample.txt"),
    }
    response = client.post(
        "/api/super_resolution/enhance", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert "upload" in payload["error"]["code"]
