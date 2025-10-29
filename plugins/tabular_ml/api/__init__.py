"""Flask blueprint for Tabular ML."""

from __future__ import annotations

from flask import Blueprint, Response, current_app, jsonify, render_template, request

from app.security import validate_mime
from common.validate import FileLimit, ValidationError, enforce_limits

from ..core import TabularError, load_dataset, train_model


bp = Blueprint(
    "tabular_ml",
    __name__,
    url_prefix="/tabular_ml",
    template_folder="../ui/templates",
    static_folder="../ui/static/tabular_ml",
    static_url_path="/static/tabular_ml",
)


@bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
    return render_template("tabular_ml/index.html", plugin_settings=settings)


@bp.post("/api/v1/train")
def train() -> Response:
    file = request.files.get("dataset")
    target = request.form.get("target") or ""
    if not file or not target:
        return jsonify({"error": "Dataset and target column are required"}), 400
    try:
        settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
        upload = settings.get("upload", {})
        max_mb = upload.get("max_mb", 2)
        try:
            max_bytes = int(float(max_mb) * 1024 * 1024)
        except (TypeError, ValueError):
            max_bytes = 2 * 1024 * 1024
        max_files = upload.get("max_files", 1)
        try:
            max_files_int = int(max_files)
        except (TypeError, ValueError):
            max_files_int = 1
        enforce_limits([file], FileLimit(max_files=max_files_int or 1, max_size=max_bytes))
        validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        df = load_dataset(file.read())
        result = train_model(df, target)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(
        {
            "task": result.task,
            "metrics": result.metrics,
            "feature_importance": result.feature_importance,
        }
    )
