import io

import pandas as pd

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def _upload_dataset(client, df):
    data = {"dataset": (io.BytesIO(df.to_csv(index=False).encode()), "data.csv")}
    response = client.post("/tabular_ml/api/v1/datasets", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    return response.get_json()["dataset_id"]


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["task"] == "classification"
    assert payload["algorithm"] == "linear_model"
    assert "Logistic" in payload["algorithm_label"]
    assert payload["columns"]
    assert payload["preview"]
    assert payload["rows"] >= 1


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": "gradient_boosting"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["algorithm"] == "gradient_boosting"
    assert "Gradient boosting" in payload["algorithm_label"]


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/scatter",
        json={"x": "x", "y": "y", "color": "label"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["color_label"] == "label"


def test_train_requires_target():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={},
    )
    assert response.status_code == 400


def test_train_endpoint_validates_algorithm_type():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": 123},
    )
    assert response.status_code == 400
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": "unknown"},
    )
    assert response.status_code == 400


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target"},
    )

    csv_response = client.get(f"/tabular_ml/api/v1/datasets/{dataset_id}/predictions?format=csv")
    assert csv_response.status_code == 200
    assert csv_response.mimetype == "text/csv"
    assert "attachment" in csv_response.headers.get("Content-Disposition", "")

    json_response = client.get(f"/tabular_ml/api/v1/datasets/{dataset_id}/predictions?format=json")
    assert json_response.status_code == 200
    data = json_response.get_json()
    assert data["columns"]
    assert data["rows"]


def test_predictions_require_training_first():
    df = pd.DataFrame({"feat1": [1, 2, 3], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.get(f"/tabular_ml/api/v1/datasets/{dataset_id}/predictions")
    assert response.status_code == 404
