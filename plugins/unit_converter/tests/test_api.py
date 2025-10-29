from app import create_app


def _make_client():
    app = create_app("TestingConfig")
    return app.test_client()


def test_convert_endpoint_success():
    client = _make_client()
    response = client.post(
        "/unit_converter/api/v1/convert",
        json={"value": 100, "category": "length", "from_unit": "centimeter", "to_unit": "meter"},
    )
    assert response.status_code == 200
    assert response.get_json()["result"] == 1.0


def test_convert_endpoint_validation_error():
    client = _make_client()
    response = client.post(
        "/unit_converter/api/v1/convert",
        json={"value": 1, "category": "length", "from_unit": "meter", "to_unit": "unknown"},
    )
    assert response.status_code == 400
