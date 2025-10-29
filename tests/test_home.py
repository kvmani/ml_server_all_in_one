from app import create_app


def test_home_lists_plugins():
    app = create_app("TestingConfig")
    client = app.test_client()
    response = client.get("/")
    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert "Hydride Segmentation" in body
    assert "PDF Tools" in body
    assert "data-tool-search" in body
    assert response.headers.get("Content-Security-Policy")
