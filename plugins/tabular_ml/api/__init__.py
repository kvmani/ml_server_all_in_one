from __future__ import annotations

from io import BytesIO

from flask import Blueprint, Response, current_app, jsonify, render_template, request, send_file, url_for

from app.security import validate_mime
from common.validate import FileLimit, ValidationError, enforce_limits

from ..core import (
    BatchPredictionResult,
    DatasetProfile,
    ModelNotReadyError,
    TabularError,
    algorithm_metadata,
    build_profile,
    detect_outliers,
    drop_dataset,
    export_batch_predictions_csv,
    export_predictions_csv,
    filter_rows,
    get_dataset,
    histogram_points,
    latest_result,
    predict_batch,
    predict_single,
    register_dataset,
    remove_outliers,
    scatter_points,
    train_on_dataset,
)


bp = Blueprint(
    "tabular_ml",
    __name__,
    url_prefix="/tabular_ml",
    template_folder="../ui/templates",
    static_folder="../ui/static/tabular_ml",
    static_url_path="/static",
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
    renderer = current_app.extensions.get("render_react")
    # Allow forcing the server-rendered interface even when the React renderer is
    # registered. This keeps the richer HTML/JS experience accessible in
    # environments where the React bundle is unavailable or when documentation
    # explicitly references the classic UI.
    force_classic = request.args.get("ui") == "classic"
    if not renderer or force_classic:
        return render_template("tabular_ml/index.html", plugin_settings=settings)

    theme_state = current_app.extensions.get("theme_state")
    apply_theme = current_app.extensions.get("theme_url")
    _, _, current_theme = theme_state() if callable(theme_state) else ({}, "midnight", "midnight")
    theme_apply = apply_theme if callable(apply_theme) else (lambda value, _theme: value)

    docs_url = settings.get("docs")
    if docs_url:
        help_href = theme_apply(docs_url, current_theme)
    else:
        help_href = theme_apply(url_for("help_page", slug="tabular_ml"), current_theme)

    props = {
        "helpHref": help_href,
        "upload": settings.get("upload", {}),
    }
    return renderer("tabular_ml", props)


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
    max_points = payload.get("max_points", 400)
    if not x or not y:
        return jsonify({"error": "Scatter plot requires x and y columns"}), 400
    try:
        result = scatter_points(dataset_id, x, y, color=color, max_points=int(max_points))
    except (TabularError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@bp.post("/api/v1/datasets/<dataset_id>/histogram")
def histogram(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    column = payload.get("column")
    if not column:
        return jsonify({"error": "Histogram column is required"}), 400
    bins = payload.get("bins", 30)
    density = bool(payload.get("density", False))
    range_payload = payload.get("range")
    value_range = None
    if range_payload is not None:
        if not isinstance(range_payload, (list, tuple)) or len(range_payload) != 2:
            return jsonify({"error": "Histogram range must contain [min, max]"}), 400
        try:
            value_range = (float(range_payload[0]), float(range_payload[1]))
        except (TypeError, ValueError):
            return jsonify({"error": "Histogram range must contain numeric values"}), 400
    try:
        result = histogram_points(
            dataset_id,
            column,
            bins=int(bins),
            density=density,
            value_range=value_range,
        )
    except (TabularError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@bp.post("/api/v1/datasets/<dataset_id>/train")
def train(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    target = payload.get("target")
    if not target:
        return jsonify({"error": "Target column is required"}), 400
    algorithm = payload.get("algorithm", "auto")
    if not isinstance(algorithm, str):
        return jsonify({"error": "Algorithm must be a string"}), 400
    hyperparameters = payload.get("hyperparameters")
    if hyperparameters is not None and not isinstance(hyperparameters, dict):
        return jsonify({"error": "Hyperparameters must be provided as an object"}), 400
    try:
        result = train_on_dataset(
            dataset_id,
            target,
            algorithm=algorithm,
            hyperparameters=hyperparameters,
        )
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {
            "task": result.task,
            "algorithm": result.algorithm,
            "algorithm_label": result.algorithm_label,
            "metrics": result.metrics,
            "feature_importance": result.feature_importance,
            "columns": result.evaluation_columns,
            "preview": result.evaluation[:5],
            "rows": len(result.evaluation),
            "feature_columns": result.feature_columns,
            "target": result.target_column,
        }
    )


@bp.post("/api/v1/datasets/<dataset_id>/preprocess/outliers/detect")
def detect_outliers_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    columns = payload.get("columns")
    if columns is not None and not isinstance(columns, list):
        return jsonify({"error": "Columns must be provided as a list"}), 400
    threshold = payload.get("threshold", 3.0)
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return jsonify({"error": "Threshold must be numeric"}), 400
    try:
        report = detect_outliers(dataset_id, columns=columns, threshold=threshold_value)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {
            "method": report.method,
            "threshold": report.threshold,
            "total_outliers": report.total_outliers,
            "inspected_columns": report.inspected_columns,
            "sample_indices": report.sample_indices,
        }
    )


@bp.post("/api/v1/datasets/<dataset_id>/preprocess/outliers/remove")
def remove_outliers_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    columns = payload.get("columns")
    if columns is not None and not isinstance(columns, list):
        return jsonify({"error": "Columns must be provided as a list"}), 400
    threshold = payload.get("threshold", 3.0)
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return jsonify({"error": "Threshold must be numeric"}), 400
    try:
        profile = remove_outliers(dataset_id, columns=columns, threshold=threshold_value)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({**_profile_payload(profile), "threshold": threshold_value})


@bp.post("/api/v1/datasets/<dataset_id>/preprocess/filter")
def apply_filters_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return jsonify({"error": "Rules must be provided as a list"}), 400
    try:
        profile, removed = filter_rows(dataset_id, rules)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({**_profile_payload(profile), "rows_removed": removed})


@bp.post("/api/v1/datasets/<dataset_id>/predict")
def predict(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    features = payload.get("features")
    if not isinstance(features, dict):
        return jsonify({"error": "Features must be provided as an object"}), 400
    try:
        result = predict_single(dataset_id, features)
    except ModelNotReadyError as exc:
        return jsonify({"error": str(exc)}), 404
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@bp.post("/api/v1/datasets/<dataset_id>/predict/batch")
def predict_batch_endpoint(dataset_id: str) -> Response:
    file = request.files.get("dataset")
    if not file:
        return jsonify({"error": "Batch CSV file is required"}), 400
    try:
        enforce_limits([file], _upload_limits())
        validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    try:
        batch_result = predict_batch(dataset_id, file.read())
    except ModelNotReadyError as exc:
        return jsonify({"error": str(exc)}), 404
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_batch_payload(batch_result))


@bp.get("/api/v1/datasets/<dataset_id>/predict/batch")
def download_batch_predictions(dataset_id: str) -> Response:
    fmt = (request.args.get("format") or "csv").lower()
    if fmt != "csv":
        return jsonify({"error": "Only CSV export is supported"}), 400
    try:
        csv_bytes = export_batch_predictions_csv(dataset_id)
    except ModelNotReadyError as exc:
        return jsonify({"error": str(exc)}), 404
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    buffer = BytesIO(csv_bytes)
    buffer.seek(0)
    filename = f"{dataset_id[:8]}_batch_predictions.csv"
    return send_file(
        buffer,
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename,
        max_age=0,
    )


@bp.get("/api/v1/datasets/<dataset_id>/predictions")
def predictions(dataset_id: str) -> Response:
    result = latest_result(dataset_id)
    if not result:
        return jsonify({"error": "Train a model before exporting predictions"}), 404

    fmt = (request.args.get("format") or "json").lower()
    if fmt == "csv":
        csv_bytes = export_predictions_csv(result)
        buffer = BytesIO(csv_bytes)
        buffer.seek(0)
        filename = f"{dataset_id[:8]}_predictions.csv"
        return send_file(
            buffer,
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename,
            max_age=0,
        )

    return jsonify({"columns": result.evaluation_columns, "rows": result.evaluation})


@bp.get("/api/v1/datasets/<dataset_id>/profile")
def profile(dataset_id: str) -> Response:
    try:
        df = get_dataset(dataset_id)
        profile = build_profile(dataset_id, df)
    except TabularError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_profile_payload(profile))


@bp.get("/api/v1/algorithms")
def algorithms() -> Response:
    return jsonify({"algorithms": algorithm_metadata()})


def _profile_payload(profile: DatasetProfile) -> dict:
    return {
        "dataset_id": profile.dataset_id,
        "columns": profile.columns,
        "preview": profile.preview,
        "shape": profile.shape,
        "stats": profile.stats,
        "numeric_columns": profile.numeric_columns,
    }


def _batch_payload(result: BatchPredictionResult) -> dict:
    return {
        "columns": result.columns,
        "preview": result.preview,
        "rows": result.row_count,
    }
