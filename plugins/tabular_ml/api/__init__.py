from __future__ import annotations

from flask import Blueprint, Response, current_app, jsonify, render_template, request

from app.security import validate_mime
from common.validate import FileLimit, ValidationError, enforce_limits

from ..core import (
    DatasetProfile,
    TabularError,
    build_profile,
    drop_dataset,
    get_dataset,
    register_dataset,
    scatter_points,
    train_on_dataset,
)


bp = Blueprint(
    "tabular_ml",
    __name__,
    url_prefix="/tabular_ml",
    template_folder="../ui/templates",
    static_folder="../ui/static/tabular_ml",
    static_url_path="/static/tabular_ml",
)


def _upload_limits() -> FileLimit:
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
    return FileLimit(max_files=max_files_int or 1, max_size=max_bytes)


@bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
    return render_template("tabular_ml/index.html", plugin_settings=settings)


@bp.post("/api/v1/datasets")
def create_dataset() -> Response:
    file = request.files.get("dataset")
    if not file:
        return jsonify({"error": "Dataset file is required"}), 400
    try:
        enforce_limits([file], _upload_limits())
        validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        profile = register_dataset(file.read())
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(_profile_payload(profile))


@bp.delete("/api/v1/datasets/<dataset_id>")
def delete_dataset(dataset_id: str) -> Response:
    drop_dataset(dataset_id)
    return jsonify({"status": "deleted"})


@bp.post("/api/v1/datasets/<dataset_id>/scatter")
def scatter(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    x = payload.get("x")
    y = payload.get("y")
    color = payload.get("color")
    if not x or not y:
        return jsonify({"error": "Scatter plot requires x and y columns"}), 400
    try:
        result = scatter_points(dataset_id, x, y, color=color)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@bp.post("/api/v1/datasets/<dataset_id>/train")
def train(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    target = payload.get("target")
    if not target:
        return jsonify({"error": "Target column is required"}), 400
    try:
        result = train_on_dataset(dataset_id, target)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {
            "task": result.task,
            "metrics": result.metrics,
            "feature_importance": result.feature_importance,
        }
    )


@bp.get("/api/v1/datasets/<dataset_id>/profile")
def profile(dataset_id: str) -> Response:
    try:
        df = get_dataset(dataset_id)
        profile = build_profile(dataset_id, df)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_profile_payload(profile))


def _profile_payload(profile: DatasetProfile) -> dict:
    return {
        "dataset_id": profile.dataset_id,
        "columns": profile.columns,
        "preview": profile.preview,
        "shape": profile.shape,
        "stats": profile.stats,
        "numeric_columns": profile.numeric_columns,
    }
