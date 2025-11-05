"""Preprocess API coverage for Tabular ML."""

from __future__ import annotations

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def _session_id(client) -> str:
    response = client.post("/api/tabular_ml/datasets/load", json={"key": "titanic"})
    payload = response.get_json()
    return payload["data"]["session_id"]


def test_preprocess_returns_feature_columns():
    client = _client()
    session_id = _session_id(client)
    response = client.post(
        "/api/tabular_ml/preprocess/fit_apply",
        json={"session_id": session_id, "target": "Survived"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    summary = payload["data"]["summary"]
    assert summary["target"] == "Survived"
    assert summary["rows"]["train"] > 0
    columns = payload["data"]["columns"]
    assert any(col.startswith("numeric") or "Sex" in col for col in columns)
