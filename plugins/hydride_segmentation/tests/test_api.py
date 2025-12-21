import io

import numpy as np
from PIL import Image

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def _dummy_png() -> bytes:
    arr = np.zeros((16, 16, 3), dtype=np.uint8)
    arr[4:12, 4:12] = 255
    image = Image.fromarray(arr)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def test_segment_endpoint():
    client = _make_client()
    data = {
        "image": (io.BytesIO(_dummy_png()), "sample.png"),
    }
    response = client.post(
        "/api/hydride_segmentation/segment",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data_payload = payload["data"]
    assert "metrics" in data_payload
    assert "mask_png_b64" in data_payload
    assert data_payload["metrics"]["mask_area_fraction_percent"] >= 0
    assert "combined_panel_png_b64" in data_payload["analysis"]


def test_segment_endpoint_with_parameters():
    client = _make_client()
    data = {
        "image": (io.BytesIO(_dummy_png()), "sample.png"),
        "clahe_clip_limit": "1.2",
        "adaptive_window": "17",
        "morph_iterations": "2",
        "area_threshold": "50",
        "crop_enabled": "on",
        "crop_percent": "25",
        "model": "conventional",
    }
    response = client.post(
        "/api/hydride_segmentation/segment",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data_payload = payload["data"]
    assert data_payload["parameters"]["model"] == "conventional"
    assert data_payload["parameters"]["conventional"]["morph_iters"] == 2
    assert data_payload["logs"]


def test_segment_rejects_invalid_parameter():
    client = _make_client()
    data = {
        "image": (io.BytesIO(_dummy_png()), "sample.png"),
        "clahe_clip_limit": "not-a-number",
    }
    response = client.post(
        "/api/hydride_segmentation/segment",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_segment_rejects_oversized_image_pixels(monkeypatch):
    from plugins.hydride_segmentation import api as hydride_api

    monkeypatch.setattr(hydride_api, "_max_pixels", lambda: 10)
    client = _make_client()
    data = {"image": (io.BytesIO(_dummy_png()), "large.png")}
    response = client.post(
        "/api/hydride_segmentation/segment",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert "maximum" in payload["error"]["message"].lower()


def test_config_endpoint():
    client = _make_client()
    response = client.get("/api/hydride_segmentation/config")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data_payload = payload["data"]
    assert "ml_available" in data_payload
    assert "ml_models" in data_payload


def test_segment_ml_unavailable(monkeypatch):
    from plugins.hydride_segmentation import api as hydride_api

    monkeypatch.setattr(hydride_api, "ml_available", lambda: False)
    client = _make_client()
    data = {
        "image": (io.BytesIO(_dummy_png()), "sample.png"),
        "model": "ml",
    }
    response = client.post(
        "/api/hydride_segmentation/segment",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 503
    payload = response.get_json()
    assert payload["success"] is False
