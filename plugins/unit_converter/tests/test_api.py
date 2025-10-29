from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_convert_endpoint_success():
    client = _make_client()
    response = client.post(
        "/unit_converter/api/v1/convert",
        json={"value": "100", "from_unit": "cm", "to_unit": "m"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["unit"] == "m"
    assert "formatted" in payload


def test_convert_endpoint_dimension_error():
    client = _make_client()
    response = client.post(
        "/unit_converter/api/v1/convert",
        json={"value": 1, "from_unit": "m", "to_unit": "second"},
    )
    assert response.status_code == 422


def test_expression_endpoint_success():
    client = _make_client()
    response = client.post(
        "/unit_converter/api/v1/expressions",
        json={"expression": "5 kJ/mol", "target": "eV", "notation": "scientific"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["unit"] == "eV"


def test_units_endpoint_missing_family():
    client = _make_client()
    response = client.get("/unit_converter/api/v1/units/unknown")
    assert response.status_code == 400
    assert response.get_json()["error"]
