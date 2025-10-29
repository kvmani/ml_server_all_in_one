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
