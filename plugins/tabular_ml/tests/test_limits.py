import io

from app import create_app
from plugins.tabular_ml.backend import utils


def _client_with_limits():
    utils.reset_session_store()
    app = create_app("TestingConfig")
    app.config["PLUGIN_SETTINGS"]["tabular_ml"] = {
        "upload": {"max_mb": 1, "max_files": 1},
        "max_rows": 3,
        "max_columns": 3,
        "max_sessions": 1,
    }
    return app.test_client()


def test_dataset_load_rejects_large_table():
    client = _client_with_limits()
    csv = "a,b,c,d\n" + "\n".join(["1,2,3,4"] * 2)
    response = client.post(
        "/api/tabular_ml/datasets/load",
        data={"csv": (io.BytesIO(csv.encode()), "data.csv")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
    assert "columns" in payload["error"]["message"].lower()


def test_session_store_cap_enforced():
    client = _client_with_limits()
    csv_small = "a,b,c\n1,2,3\n2,3,4"
    first = client.post(
        "/api/tabular_ml/datasets/load",
        data={"csv": (io.BytesIO(csv_small.encode()), "data.csv")},
        content_type="multipart/form-data",
    )
    assert first.status_code == 200

    second = client.post(
        "/api/tabular_ml/datasets/load",
        data={"csv": (io.BytesIO(csv_small.encode()), "data2.csv")},
        content_type="multipart/form-data",
    )
    assert second.status_code == 400
    payload = second.get_json()
    assert payload["success"] is False
    assert "too many active sessions" in payload["error"]["message"].lower()
