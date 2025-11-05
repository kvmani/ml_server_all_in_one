"""Smoke tests for the Tabular ML CLI."""

from __future__ import annotations

import json
from contextlib import redirect_stdout
from io import StringIO

from plugins.tabular_ml import cli


def _run_cli(args: list[str]) -> dict[str, object]:
    buffer = StringIO()
    with redirect_stdout(buffer):
        cli.main(args)
    output = buffer.getvalue().strip()
    return json.loads(output)


def test_cli_end_to_end_train_and_evaluate():
    listing = _run_cli(["datasets", "list"])
    assert "datasets" in listing

    preview = _run_cli(["datasets", "preview", "--key", "titanic"])
    assert preview["preview"]

    train_result = _run_cli(["train", "--key", "titanic", "--target", "Survived", "--algo", "rf", "--cv", "2"])
    run_id = train_result["run_id"]
    assert train_result["model_summary"]["metrics"]

    evaluate_result = _run_cli(["evaluate", "--run-id", run_id])
    assert evaluate_result["metrics"]
    assert evaluate_result["model"]["algorithm"] == "rf"
