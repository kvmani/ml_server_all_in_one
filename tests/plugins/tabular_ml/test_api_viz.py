"""Visualization API tests."""

from __future__ import annotations

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def _session_id(client) -> str:
    response = client.post("/api/tabular_ml/datasets/load", json={"key": "titanic"})
    return response.get_json()["data"]["session_id"]


def test_histogram_payload_structure():
    client = _client()
    session_id = _session_id(client)
    response = client.post(
        "/api/tabular_ml/viz/histogram",
        json={"session_id": session_id, "column": "Age", "bins": 5, "kde": True},
    )
    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["column"] == "Age"
    assert len(payload["counts"]) == 5
    assert "kde" in payload


def test_corr_payload_contains_labels():
    client = _client()
    session_id = _session_id(client)
    response = client.post(
        "/api/tabular_ml/viz/corr",
        json={"session_id": session_id, "columns": ["Age", "Fare"]},
    )
    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["labels"] == ["Age", "Fare"]
    assert len(payload["matrix"]) == 2
