from pathlib import Path

from plugins.super_resolution.core import load_settings, select_device


def test_load_settings_uses_defaults(tmp_path: Path):
    settings = load_settings({}, root=tmp_path)
    assert settings.default_model in settings.models
    assert settings.weights_dir.is_absolute()


def test_load_settings_accepts_upload_limit(tmp_path: Path):
    settings = load_settings(
        {"upload": {"max_mb": 7}},
        root=tmp_path,
    )
    assert settings.max_upload_mb == 7


def test_select_device_cpu():
    assert select_device("cpu") == "cpu"
