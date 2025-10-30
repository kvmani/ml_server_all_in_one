"""Playwright smoke tests for the offline UI flows."""

from __future__ import annotations

import io
import threading
import time
from pathlib import Path

import pytest
from PyPDF2 import PdfWriter
from werkzeug.serving import make_server

from app import create_app

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import Browser, Page, sync_playwright  # noqa: E402  (import after skip)

pytestmark = pytest.mark.playwright


@pytest.fixture(scope="session")
def live_server() -> str:
    app = create_app("TestingConfig")
    server = make_server("127.0.0.1", 0, app)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    # Give the server a brief moment to start accepting connections
    time.sleep(0.1)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join()


@pytest.fixture(scope="session")
def browser() -> Browser:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            yield browser
        finally:
            browser.close()


@pytest.fixture()
def page(browser: Browser) -> Page:
    context = browser.new_context()
    page = context.new_page()
    try:
        yield page
    finally:
        context.close()


def _create_pdf(path: Path, pages: int = 1) -> Path:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    with path.open("wb") as handle:
        writer.write(handle)
    return path


def test_home_cards_have_gradient_icons(page: Page, live_server: str) -> None:
    page.goto(f"{live_server}/", wait_until="networkidle")
    cards = page.locator("[data-tool-card]")
    assert cards.count() > 0
    icon_style = cards.first.locator(".tool-card__icon").get_attribute("style") or ""
    assert "--icon-hue" in icon_style
    background_image = cards.first.locator(".tool-card__icon").evaluate(
        "el => getComputedStyle(el).backgroundImage"
    )
    assert "linear-gradient" in background_image.lower()


def test_pdf_tool_shows_first_page_thumbnail(page: Page, live_server: str, tmp_path: Path) -> None:
    pdf_path = _create_pdf(tmp_path / "sample.pdf")
    page.goto(f"{live_server}/pdf_tools/", wait_until="networkidle")
    page.set_input_files("#merge-picker", str(pdf_path))
    thumbnail = page.locator(".merge-entry__thumbnail iframe")
    thumbnail.wait_for()
    src = thumbnail.get_attribute("src") or ""
    assert "#page=1" in src
    preview_button = page.locator("[data-action='preview']").first
    preview_button.click()
    page.locator(".merge-entry__preview:not([hidden])").wait_for()
    assert "Hide" in preview_button.inner_text()


def test_tabular_training_supports_algorithm_selection(page: Page, live_server: str) -> None:
    csv_buffer = io.StringIO()
    csv_buffer.write("feat1,feat2,target\n")
    for value in range(1, 9):
        csv_buffer.write(f"{value},{value + 1},{value % 2}\n")
    csv_bytes = csv_buffer.getvalue().encode("utf-8")

    page.goto(f"{live_server}/tabular_ml/", wait_until="networkidle")
    page.set_input_files(
        "#dataset",
        {
            "name": "data.csv",
            "mimeType": "text/csv",
            "buffer": csv_bytes,
        },
    )
    page.click("#dataset-form button[type='submit']")
    page.locator("#dataset-overview").wait_for(state="visible")
    page.select_option("#algorithm", "random_forest")
    page.fill("#target", "target")
    page.click("#train-form button[type='submit']")
    page.locator("#train-results").wait_for(state="visible")
    badge_text = page.locator("#algorithm-used").inner_text()
    assert "Random forest" in badge_text
