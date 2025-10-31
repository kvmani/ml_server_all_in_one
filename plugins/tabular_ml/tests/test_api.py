import base64
import io

import pandas as pd

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def _upload_dataset(client, df):
    data = {"dataset": (io.BytesIO(df.to_csv(index=False).encode()), "data.csv")}
    response = client.post(
        "/api/tabular_ml/datasets", data=data, content_type="multipart/form-data"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    return payload["data"]["dataset_id"]


def test_train_endpoint_success():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["task"] == "classification"
    assert data["algorithm"] == "linear_model"
    assert "Logistic" in data["algorithm_label"]
    assert data["columns"]
    assert data["preview"]
    assert data["rows"] >= 1
    assert data["feature_columns"] == ["feat1", "feat2"]
    assert data["target"] == "target"


def test_train_endpoint_accepts_algorithm_choice():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": "gradient_boosting"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["algorithm"] == "gradient_boosting"
    assert "Gradient boosting" in payload["data"]["algorithm_label"]


def test_scatter_endpoint():
    df = pd.DataFrame(
        {
            "x": [1, 2, 3, 4],
            "y": [0.5, 0.1, 1.2, 0.4],
            "label": ["a", "b", "a", "b"],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/scatter",
        json={"x": "x", "y": "y", "color": "label"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["color_label"] == "label"


def test_train_requires_target():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={},
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_train_endpoint_validates_algorithm_type():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": 123},
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": "unknown"},
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_predictions_export_csv_and_json():
    df = pd.DataFrame(
        {
            "feat1": [1, 2, 3, 4, 5, 6, 7, 8],
            "feat2": [2, 3, 4, 5, 6, 7, 8, 9],
            "target": [1, 2, 1, 2, 1, 2, 1, 2],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target"},
    )

    csv_response = client.get(
        f"/api/tabular_ml/datasets/{dataset_id}/predictions?format=csv"
    )
    assert csv_response.status_code == 200
    csv_payload = csv_response.get_json()
    assert csv_payload["success"] is True
    csv_bytes = base64.b64decode(csv_payload["data"]["content_base64"])
    assert csv_payload["data"]["filename"].endswith(".csv")
    assert len(csv_bytes) > 0

    json_response = client.get(
        f"/api/tabular_ml/datasets/{dataset_id}/predictions?format=json"
    )
    assert json_response.status_code == 200
    json_payload = json_response.get_json()
    assert json_payload["success"] is True
    assert json_payload["data"]["columns"]
    assert json_payload["data"]["rows"]


def test_predict_endpoint_single():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/predict",
        json={"features": {"feat1": 0.4, "feat2": 0.6}},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["target"] == "target"
    assert data["feature_columns"] == ["feat1", "feat2"]
    assert "prediction" in data
    assert "confidence" in data


def test_predict_endpoint_requires_training():
    df = pd.DataFrame({"feat1": [1, 2, 3], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/predict",
        json={"features": {"feat1": 1}},
    )
    assert response.status_code == 404
    assert response.get_json()["success"] is False


def test_predict_batch_endpoint_and_download():
    df = pd.DataFrame(
        {
            "feat1": [1, 2, 3, 4],
            "feat2": [2, 3, 4, 5],
            "target": [1, 2, 1, 2],
        }
    )
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    batch_data = df.drop(columns=["target"]).to_csv(index=False).encode()
    response = client.post(
        f"/api/tabular_ml/datasets/{dataset_id}/predict/batch",
        data={"dataset": (io.BytesIO(batch_data), "batch.csv")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["columns"]
    assert data["preview"]
    assert data["rows"] == len(df)

    download = client.get(
        f"/api/tabular_ml/datasets/{dataset_id}/predict/batch?format=csv"
    )
    assert download.status_code == 200
    download_payload = download.get_json()
    assert download_payload["success"] is True
    assert download_payload["data"]["filename"].endswith(".csv")
    assert base64.b64decode(download_payload["data"]["content_base64"])
