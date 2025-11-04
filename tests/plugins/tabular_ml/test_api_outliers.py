"""Outlier API smoke tests."""

from __future__ import annotations

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def _session_id(client) -> str:
    response = client.post("/api/tabular_ml/datasets/load", json={"key": "titanic"})
    return response.get_json()["data"]["session_id"]


def test_outlier_compute_and_mask():
    client = _client()
    session_id = _session_id(client)
    response = client.post(
        "/api/tabular_ml/outliers/compute",
        json={"session_id": session_id, "method": "iqr", "params": {"k": 1.5}},
    )
    assert response.status_code == 200
    payload = response.get_json()
    stats = payload["data"]["mask_stats"]
    assert stats["total_rows"] >= stats["kept_rows"]

    mask_response = client.post(
        "/api/tabular_ml/outliers/apply",
        json={"session_id": session_id, "action": "mask"},
    )
    assert mask_response.status_code == 200
    mask_payload = mask_response.get_json()
    assert mask_payload["data"]["mask_stats"]["unmasked_rows"] == stats["kept_rows"]
