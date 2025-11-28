from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_families_endpoint_lists_units():
    client = _client()
    response = client.get("/api/unit_converter/families")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "length" in payload["data"]["families"]


def test_convert_endpoint_success():
    client = _client()
    response = client.post(
        "/api/unit_converter/convert",
        json={"value": 1, "from_unit": "m", "to_unit": "cm"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["value"] == 100


def test_convert_endpoint_rejects_bad_unit():
    client = _client()
    response = client.post(
        "/api/unit_converter/convert",
        json={"value": 1, "from_unit": "m", "to_unit": "bogus"},
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False


def test_expression_endpoint():
    client = _client()
    response = client.post(
        "/api/unit_converter/expressions",
        json={"expression": "2 kg * 9.81 m/s^2", "target": "N"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["unit"] == "N"
