"""Tabular ML plugin API with standardized responses."""

from __future__ import annotations

import base64
from typing import Any

from flask import Blueprint, Response, current_app, request

from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits, validate_mime

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

def _upload_limits() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
    upload = settings.get("upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=2)


api_bp = Blueprint("tabular_ml_api", __name__, url_prefix="/api/tabular_ml")


def _profile_payload(profile: DatasetProfile) -> dict[str, Any]:
    return {
        "dataset_id": profile.dataset_id,
        "columns": profile.columns,
        "preview": profile.preview,
        "shape": profile.shape,
        "stats": profile.stats,
        "numeric_columns": profile.numeric_columns,
    }


def _batch_payload(result: BatchPredictionResult) -> dict[str, Any]:
    return {
        "columns": result.columns,
        "preview": result.preview,
        "rows": result.row_count,
    }


def _ok_or_error(callable_, *, code: str, status: int | None = None):
    try:
        return callable_()
    except ModelNotReadyError as exc:
        return fail(
            ValidationAppError(
                message=str(exc), code=f"{code}.not_ready", status_code=status or 404
            )
        )
    except TabularError as exc:
        return fail(
            ValidationAppError(
                message=str(exc), code=f"{code}.invalid", status_code=status or 400
            )
        )


@api_bp.post("/datasets")
def create_dataset() -> Response:
    file = request.files.get("dataset")
    if not file:
        return fail(
            ValidationAppError(
                message="Dataset file is required", code="tabular.dataset_missing"
            )
        )
    try:
        enforce_limits([file], _upload_limits())
        validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="tabular.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    def _register():
        profile = register_dataset(file.read())
        return ok(_profile_payload(profile))

    return _ok_or_error(_register, code="tabular.dataset")


@api_bp.delete("/datasets/<dataset_id>")
def delete_dataset(dataset_id: str) -> Response:
    drop_dataset(dataset_id)
    return ok({"status": "deleted"})


@api_bp.post("/datasets/<dataset_id>/scatter")
def scatter(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    x = payload.get("x")
    y = payload.get("y")
    color = payload.get("color")
    max_points = payload.get("max_points", 400)
    if not x or not y:
        return fail(
            ValidationAppError(
                message="Scatter plot requires x and y columns",
                code="tabular.scatter.invalid",
            )
        )

    def _scatter():
        result = scatter_points(
            dataset_id, x, y, color=color, max_points=int(max_points)
        )
        return ok(result)

    return _ok_or_error(_scatter, code="tabular.scatter")


@api_bp.post("/datasets/<dataset_id>/histogram")
def histogram(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    column = payload.get("column")
    if not column:
        return fail(
            ValidationAppError(
                message="Histogram column is required", code="tabular.histogram.invalid"
            )
        )
    bins = payload.get("bins", 30)
    density = bool(payload.get("density", False))
    range_payload = payload.get("range")
    value_range = None
    if range_payload is not None:
        if not isinstance(range_payload, (list, tuple)) or len(range_payload) != 2:
            return fail(
                ValidationAppError(
                    message="Histogram range must contain [min, max]",
                    code="tabular.histogram.range",
                )
            )
        try:
            value_range = (float(range_payload[0]), float(range_payload[1]))
        except (TypeError, ValueError):
            return fail(
                ValidationAppError(
                    message="Histogram range must contain numeric values",
                    code="tabular.histogram.range",
                )
            )

    def _histogram():
        result = histogram_points(
            dataset_id,
            column,
            bins=int(bins),
            density=density,
            value_range=value_range,
        )
        return ok(result)

    return _ok_or_error(_histogram, code="tabular.histogram")


@api_bp.post("/datasets/<dataset_id>/train")
def train(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    target = payload.get("target")
    if not target:
        return fail(
            ValidationAppError(
                message="Target column is required", code="tabular.train.target"
            )
        )
    algorithm = payload.get("algorithm", "auto")
    if not isinstance(algorithm, str):
        return fail(
            ValidationAppError(
                message="Algorithm must be a string", code="tabular.train.algorithm"
            )
        )
    hyperparameters = payload.get("hyperparameters")
    if hyperparameters is not None and not isinstance(hyperparameters, dict):
        return fail(
            ValidationAppError(
                message="Hyperparameters must be provided as an object",
                code="tabular.train.hyperparameters",
            )
        )

    def _train():
        result = train_on_dataset(
            dataset_id,
            target,
            algorithm=algorithm,
            hyperparameters=hyperparameters,
        )
        payload = {
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
        return ok(payload)

    return _ok_or_error(_train, code="tabular.train")


@api_bp.post("/datasets/<dataset_id>/preprocess/outliers/detect")
def detect_outliers_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    columns = payload.get("columns")
    if columns is not None and not isinstance(columns, list):
        return fail(
            ValidationAppError(
                message="Columns must be provided as a list",
                code="tabular.outliers.columns",
            )
        )
    threshold = payload.get("threshold", 3.0)
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return fail(
            ValidationAppError(
                message="Threshold must be numeric", code="tabular.outliers.threshold"
            )
        )

    def _detect():
        report = detect_outliers(dataset_id, columns=columns, threshold=threshold_value)
        payload = {
            "method": report.method,
            "threshold": report.threshold,
            "total_outliers": report.total_outliers,
            "inspected_columns": report.inspected_columns,
            "sample_indices": report.sample_indices,
        }
        return ok(payload)

    return _ok_or_error(_detect, code="tabular.outliers")


@api_bp.post("/datasets/<dataset_id>/preprocess/outliers/remove")
def remove_outliers_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    columns = payload.get("columns")
    if columns is not None and not isinstance(columns, list):
        return fail(
            ValidationAppError(
                message="Columns must be provided as a list",
                code="tabular.outliers.columns",
            )
        )
    threshold = payload.get("threshold", 3.0)
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return fail(
            ValidationAppError(
                message="Threshold must be numeric", code="tabular.outliers.threshold"
            )
        )

    def _remove():
        profile = remove_outliers(
            dataset_id, columns=columns, threshold=threshold_value
        )
        data = {**_profile_payload(profile), "threshold": threshold_value}
        return ok(data)

    return _ok_or_error(_remove, code="tabular.outliers")


@api_bp.post("/datasets/<dataset_id>/preprocess/filter")
def apply_filters_endpoint(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    rules = payload.get("rules")
    if not isinstance(rules, list):
        return fail(
            ValidationAppError(
                message="Rules must be provided as a list", code="tabular.filter.rules"
            )
        )

    def _apply():
        profile, removed = filter_rows(dataset_id, rules)
        return ok({**_profile_payload(profile), "rows_removed": removed})

    return _ok_or_error(_apply, code="tabular.filter")


@api_bp.post("/datasets/<dataset_id>/predict")
def predict(dataset_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    features = payload.get("features")
    if not isinstance(features, dict):
        return fail(
            ValidationAppError(
                message="Features must be provided as an object",
                code="tabular.predict.features",
            )
        )

    def _predict():
        result = predict_single(dataset_id, features)
        return ok(result)

    return _ok_or_error(_predict, code="tabular.predict")


@api_bp.post("/datasets/<dataset_id>/predict/batch")
def predict_batch_endpoint(dataset_id: str) -> Response:
    file = request.files.get("dataset")
    if not file:
        return fail(
            ValidationAppError(
                message="Batch CSV file is required", code="tabular.batch.missing"
            )
        )
    try:
        enforce_limits([file], _upload_limits())
        validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="tabular.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    def _predict_batch():
        batch_result = predict_batch(dataset_id, file.read())
        return ok(_batch_payload(batch_result))

    return _ok_or_error(_predict_batch, code="tabular.batch")


def _file_response(filename: str, content: bytes) -> Response:
    payload = {
        "filename": filename,
        "content_base64": base64.b64encode(content).decode("ascii"),
        "size_bytes": len(content),
    }
    return ok(payload)


@api_bp.get("/datasets/<dataset_id>/predict/batch")
def download_batch_predictions(dataset_id: str) -> Response:
    fmt = (request.args.get("format") or "csv").lower()
    if fmt != "csv":
        return fail(
            ValidationAppError(
                message="Only CSV export is supported", code="tabular.batch.export"
            )
        )

    def _download():
        csv_bytes = export_batch_predictions_csv(dataset_id)
        filename = f"{dataset_id[:8]}_batch_predictions.csv"
        return _file_response(filename, csv_bytes)

    return _ok_or_error(_download, code="tabular.batch")


@api_bp.get("/datasets/<dataset_id>/predictions")
def predictions(dataset_id: str) -> Response:
    result = latest_result(dataset_id)
    if not result:
        return fail(
            ValidationAppError(
                message="Train a model before exporting predictions",
                code="tabular.predict.not_ready",
                status_code=404,
            )
        )

    fmt = (request.args.get("format") or "json").lower()
    if fmt == "csv":
        csv_bytes = export_predictions_csv(result)
        filename = f"{dataset_id[:8]}_predictions.csv"
        return _file_response(filename, csv_bytes)

    data = {"columns": result.evaluation_columns, "rows": result.evaluation}
    return ok(data)


@api_bp.get("/datasets/<dataset_id>/profile")
def profile(dataset_id: str) -> Response:
    def _profile():
        df = get_dataset(dataset_id)
        profile = build_profile(dataset_id, df)
        return ok(_profile_payload(profile))

    return _ok_or_error(_profile, code="tabular.profile")


@api_bp.get("/algorithms")
def algorithms() -> Response:
    return ok({"algorithms": algorithm_metadata()})


blueprints = [api_bp]


__all__ = [
    "blueprints",
    "create_dataset",
    "delete_dataset",
    "scatter",
    "histogram",
    "train",
    "predict",
    "predict_batch_endpoint",
    "download_batch_predictions",
    "predictions",
    "profile",
    "algorithms",
]
