from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_evaluate_endpoint():
    client = _client()
    resp = client.post(
        "/api/scientific_calculator/evaluate",
        json={"expression": "3*4+5"},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["data"]["result"] == 17
    assert data["data"]["canonical"] == "((3 * 4) + 5)"


def test_plot_endpoint_one_variable():
    client = _client()
    resp = client.post(
        "/api/scientific_calculator/plot",
        json={
            "expression": "x^2",
            "variables": [{"name": "x", "start": 0, "stop": 2, "step": 1}],
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["mode"] == "1d"
    assert payload["points"] == 3
    assert [pt["y"] for pt in payload["series"]] == [0.0, 1.0, 4.0]


def test_plot_endpoint_two_variables():
    client = _client()
    resp = client.post(
        "/api/scientific_calculator/plot",
        json={
            "expression": "x + y",
            "variables": [
                {"name": "x", "start": 0, "stop": 1, "step": 1},
                {"name": "y", "start": 0, "stop": 1, "step": 1},
            ],
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["mode"] == "2d"
    assert payload["grid"]["z"] == [[0.0, 1.0], [1.0, 2.0]]


def test_invalid_request_returns_error():
    client = _client()
    resp = client.post(
        "/api/scientific_calculator/evaluate",
        json={"expression": ""},
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert data["success"] is False

