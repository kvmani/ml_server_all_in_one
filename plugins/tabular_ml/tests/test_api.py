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
    assert payload["feature_columns"] == ["feat1", "feat2"]
    assert payload["target"] == "target"


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/predict",
        json={"features": {"feat1": 0.4, "feat2": 0.6}},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["target"] == "target"
    assert payload["feature_columns"] == ["feat1", "feat2"]
    assert "prediction" in payload
    assert "confidence" in payload


def test_predict_endpoint_requires_training():
    df = pd.DataFrame({"feat1": [1, 2, 3], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/predict",
        json={"features": {"feat1": 1}},
    )
    assert response.status_code == 404


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
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target"},
    )
    batch_data = df.drop(columns=["target"]).to_csv(index=False).encode()
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/predict/batch",
        data={"dataset": (io.BytesIO(batch_data), "batch.csv")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["columns"]
    assert payload["preview"]
    assert payload["rows"] == len(df)

    download = client.get(f"/tabular_ml/api/v1/datasets/{dataset_id}/predict/batch?format=csv")
    assert download.status_code == 200
    assert download.mimetype == "text/csv"
    assert "attachment" in download.headers.get("Content-Disposition", "")


def test_histogram_endpoint_returns_counts():
    df = pd.DataFrame({"value": [1, 2, 3, 4, 5, 6], "label": list("ABCDEF")})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/histogram",
        json={"column": "value", "bins": 3},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["counts"]


def test_outlier_detection_and_removal_endpoints():
    df = pd.DataFrame({"value": [1] * 10 + [25], "label": list("ABCDEFGHIJK")})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    detect_response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/preprocess/outliers/detect",
        json={},
    )
    assert detect_response.status_code == 200
    report = detect_response.get_json()
    assert report["total_outliers"] == 1
    remove_response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/preprocess/outliers/remove",
        json={},
    )
    assert remove_response.status_code == 200
    cleaned = remove_response.get_json()
    assert cleaned["shape"][0] == len(df) - 1


def test_filter_endpoint_applies_rule():
    df = pd.DataFrame({"value": [1, 2, 3, 4], "label": ["a", "b", "c", "d"]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/preprocess/filter",
        json={"rules": [{"column": "value", "operator": "gt", "value": 2}]},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["shape"][0] == 2
    assert payload["rows_removed"] == 2


def test_algorithm_metadata_endpoint():
    client = _make_client()
    response = client.get("/tabular_ml/api/v1/algorithms")
    assert response.status_code == 200
    payload = response.get_json()
    assert "linear_model" in payload["algorithms"]


def test_train_endpoint_validates_hyperparameters():
    df = pd.DataFrame({"x": [1, 2, 3, 4], "target": [0, 1, 0, 1]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.post(
        f"/tabular_ml/api/v1/datasets/{dataset_id}/train",
        json={"target": "target", "algorithm": "linear_model", "hyperparameters": {"max_iter": "abc"}},
    )
    assert response.status_code == 400


def test_predictions_require_training_first():
    df = pd.DataFrame({"feat1": [1, 2, 3], "target": [0, 1, 0]})
    client = _make_client()
    dataset_id = _upload_dataset(client, df)
    response = client.get(f"/tabular_ml/api/v1/datasets/{dataset_id}/predictions")
    assert response.status_code == 404
