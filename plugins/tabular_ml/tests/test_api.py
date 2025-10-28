import io

import pandas as pd

from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_train_endpoint_success():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    data = {
        "dataset": (io.BytesIO(df.to_csv(index=False).encode()), "data.csv"),
        "target": "target",
    }
    client = _make_client()
    response = client.post("/tabular_ml/api/v1/train", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["task"] == "classification"


def test_train_endpoint_validation_error():
    client = _make_client()
    response = client.post("/tabular_ml/api/v1/train", data={}, content_type="multipart/form-data")
    assert response.status_code == 400
