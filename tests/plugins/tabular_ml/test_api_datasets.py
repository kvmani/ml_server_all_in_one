"""Dataset API smoke tests for Tabular ML."""

from __future__ import annotations

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_dataset_list_includes_builtin():
    client = _client()
    response = client.get("/api/tabular_ml/datasets/list")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    datasets = payload["data"]["datasets"]
    keys = {item["key"] for item in datasets}
    assert {"titanic", "adult"}.issubset(keys)


def test_dataset_load_returns_preview():
    client = _client()
    response = client.post("/api/tabular_ml/datasets/load", json={"key": "titanic"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert "session_id" in data
    assert len(data["head"]) > 0
    assert data["shape"][0] >= len(data["head"])
