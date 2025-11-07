from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_convert_endpoint_success():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/convert",
        json={"value": "100", "from_unit": "cm", "to_unit": "m"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["unit"] == "m"
    assert "formatted" in payload["data"]


def test_convert_endpoint_dimension_error():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/convert",
        json={"value": 1, "from_unit": "m", "to_unit": "second"},
    )
    assert response.status_code == 422
    assert response.get_json()["success"] is False


def test_convert_endpoint_relative_alias():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/convert",
        json={"value": 10, "from_unit": "degC", "to_unit": "degF", "mode": "relative"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert abs(payload["data"]["value"] - 18.0) < 1e-9


def test_convert_endpoint_decimal_precision():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/convert",
        json={
            "value": 1,
            "from_unit": "meter",
            "to_unit": "inch",
            "decimals": 2,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["formatted"] == "39.37"


def test_expression_endpoint_success():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/expressions",
        json={"expression": "5 kJ/mol", "target": "eV", "notation": "scientific"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["unit"] == "eV"


def test_expression_endpoint_with_decimals():
    client = _make_client()
    response = client.post(
        "/api/unit_converter/expressions",
        json={"expression": "5 kg + 200 g", "target": "lb", "decimals": 3},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["formatted"] == "11.464"


def test_units_endpoint_missing_family():
    client = _make_client()
    response = client.get("/api/unit_converter/units/unknown")
    assert response.status_code == 400
    payload = response.get_json()
    assert payload["success"] is False
