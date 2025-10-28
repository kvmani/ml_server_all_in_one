"""Flask blueprint for Tabular ML."""

from __future__ import annotations

from flask import Blueprint, Response, jsonify, render_template, request

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
    return render_template("tabular_ml/index.html")


@bp.post("/api/v1/train")
def train() -> Response:
    file = request.files.get("dataset")
    target = request.form.get("target") or ""
    if not file or not target:
        return jsonify({"error": "Dataset and target column are required"}), 400
    try:
        enforce_limits([file], FileLimit(max_files=1, max_size=2 * 1024 * 1024))
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
