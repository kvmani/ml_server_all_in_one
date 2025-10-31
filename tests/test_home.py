import json
import re

from app import create_app


def test_home_lists_plugins():
    app = create_app("TestingConfig")
    client = app.test_client()
    response = client.get("/")
    assert response.status_code == 200
    body = response.get_data(as_text=True)
    match = re.search(
        r'<script id="app-state" type="application/json">(.+?)</script>', body, re.S
    )
    assert match is not None
    state = json.loads(match.group(1))
    titles = [item["title"] for item in state.get("manifests", [])]
    assert "Hydride Segmentation" in titles
    assert "PDF Tools" in titles
    assert state.get("page") == "home"
    assert response.headers.get("Content-Security-Policy")
