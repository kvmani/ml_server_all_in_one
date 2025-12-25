from io import BytesIO

from PIL import Image

from app import create_app
from plugins.super_resolution.core import UpscaleResult
from plugins.super_resolution import api as api_module


def _make_client():
    app = create_app("TestingConfig")
    app.config["PLUGIN_SETTINGS"]["super_resolution"] = {
        "enabled": True,
        "device": "cpu",
        "max_upload_mb": 1,
        "default_scale": 2,
        "default_model": "RealESRGAN_x2plus",
        "models": {
            "RealESRGAN_x2plus": {
                "weights_path": "models/super_resolution/weights/RealESRGAN_x2plus.pth",
                "scale": 2,
            }
        },
    }
    return app.test_client()


def _sample_png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (10, 10), color=(40, 120, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_endpoint_reports_status():
    client = _make_client()
    response = client.get("/api/v1/super_resolution/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["status"] == "ok"
    assert data["model_name"] == "RealESRGAN_x2plus"
    assert data["device"] in {"cpu", "cuda"}


def test_predict_endpoint_returns_image(monkeypatch):
    client = _make_client()
    output_buffer = BytesIO()
    Image.new("RGB", (4, 4), color=(10, 20, 30)).save(output_buffer, format="PNG")
    output_bytes = output_buffer.getvalue()

    def _fake_upscale(*_args, **_kwargs):
        return UpscaleResult(
            image_bytes=output_bytes,
            width=4,
            height=4,
            scale=2,
            output_format="png",
        )

    monkeypatch.setattr(api_module, "upscale_image", _fake_upscale)
    data = {
        "scale": "2",
        "model": "RealESRGAN_x2plus",
        "output_format": "png",
        "image": (BytesIO(_sample_png()), "sample.png"),
    }
    response = client.post(
        "/api/v1/super_resolution/predict", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert response.data.startswith(b"\x89PNG")
