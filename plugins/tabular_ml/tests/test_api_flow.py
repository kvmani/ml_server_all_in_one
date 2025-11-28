import io

from app import create_app
from plugins.tabular_ml.backend import utils


def _make_client():
    utils.reset_session_store()
    app = create_app("TestingConfig")
    app.config["PLUGIN_SETTINGS"]["tabular_ml"] = {
        "upload": {"max_mb": 2, "max_files": 1},
        "max_rows": 200,
        "max_columns": 20,
        "max_sessions": 4,
    }
    return app.test_client()


def _csv_payload(rows: int = 12) -> bytes:
    lines = ["feat_num,feat_cat,target"]
    for i in range(rows):
        feat_num = i
        feat_cat = "A" if i % 2 == 0 else "B"
        target = "yes" if i % 3 else "no"
        lines.append(f"{feat_num},{feat_cat},{target}")
    return "\n".join(lines).encode()


def _load_session(client):
    data = {"csv": (io.BytesIO(_csv_payload()), "data.csv")}
    response = client.post(
        "/api/tabular_ml/datasets/load",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()["data"]
    return payload["session_id"]


def test_full_training_flow():
    client = _make_client()
    session_id = _load_session(client)

    preprocess = client.post(
        "/api/tabular_ml/preprocess/fit_apply",
        json={"session_id": session_id, "target": "target"},
    )
    assert preprocess.status_code == 200
    preprocess_payload = preprocess.get_json()["data"]
    assert preprocess_payload["summary"]["target"] == "target"

    train = client.post(
        "/api/tabular_ml/model/train",
        json={"session_id": session_id, "algo": "rf", "cv": 2},
    )
    assert train.status_code == 200
    train_payload = train.get_json()["data"]
    run_id = train_payload["run_id"]
    assert train_payload["model_summary"]["task"] == "classification"

    evaluate = client.get(f"/api/tabular_ml/model/evaluate?run_id={run_id}")
    assert evaluate.status_code == 200
    eval_payload = evaluate.get_json()["data"]
    assert "metrics" in eval_payload


def test_histogram_endpoint():
    client = _make_client()
    session_id = _load_session(client)
    _ = client.post(
        "/api/tabular_ml/preprocess/fit_apply",
        json={"session_id": session_id, "target": "target"},
    )

    response = client.post(
        "/api/tabular_ml/viz/histogram",
        json={"session_id": session_id, "column": "feat_num", "bins": 5},
    )
    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["column"] == "feat_num"
    assert len(payload["counts"]) == 5
