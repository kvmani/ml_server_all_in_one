"""Training and evaluation API tests for Tabular ML."""

from __future__ import annotations

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def _session_id(client) -> str:
    response = client.post("/api/tabular_ml/datasets/load", json={"key": "titanic"})
    return response.get_json()["data"]["session_id"]


def _preprocess(client, session_id: str) -> None:
    response = client.post(
        "/api/tabular_ml/preprocess/fit_apply",
        json={"session_id": session_id, "target": "Survived", "split": {"train": 0.7, "seed": 1}},
    )
    assert response.status_code == 200


def test_train_and_evaluate_cycle():
    client = _client()
    session_id = _session_id(client)
    _preprocess(client, session_id)
    response = client.post(
        "/api/tabular_ml/model/train",
        json={"session_id": session_id, "algo": "rf", "cv": 3},
    )
    assert response.status_code == 200
    payload = response.get_json()
    run_id = payload["data"]["run_id"]
    assert payload["data"]["model_summary"]["metrics"]

    eval_response = client.get(f"/api/tabular_ml/model/evaluate?run_id={run_id}")
    assert eval_response.status_code == 200
    eval_payload = eval_response.get_json()
    assert eval_payload["data"]["metrics"]
    assert eval_payload["data"]["model"]["algorithm"] == "rf"
