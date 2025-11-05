"""Flask routes for the Tabular ML plugin."""

from __future__ import annotations

from typing import Any, Callable

from flask import Blueprint, Response, current_app, request

from common.errors import ValidationAppError, ensure_app_error
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits, parse_model, validate_mime

from .schemas import (
    BoxRequest,
    CorrRequest,
    HistogramRequest,
    OutlierApplyRequest,
    OutlierComputeRequest,
    PreprocessRequest,
    TrainRequest,
)
from .services import (
    box,
    corr,
    dataset_list,
    dataset_load_from_bytes,
    dataset_load_from_key,
    histogram,
    run_evaluate,
    run_outlier_apply,
    run_outlier_compute,
    run_preprocess,
    run_train,
    session_config,
)

bp = Blueprint("tabular_ml", __name__, url_prefix="/api/tabular_ml")


def _upload_limits() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
    upload = settings.get("upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=5)


def _handle(callable_: Callable[[], Response | tuple[Any, int]]) -> Response:
    try:
        result = callable_()
        if isinstance(result, tuple):
            payload, status = result
            return ok(payload, status=status)
        if isinstance(result, Response):
            return result
        return ok(result)
    except ValidationAppError as exc:
        return fail(exc)
    except (ValueError, KeyError) as exc:
        error = ValidationAppError(message=str(exc), code="tabular_ml.invalid_request")
        return fail(error)
    except Exception as exc:  # pragma: no cover - defensive path
        error = ensure_app_error(exc, fallback_code="tabular_ml.internal")
        return fail(error, status=error.status_code)


@bp.get("/datasets/list")
def datasets_list() -> Response:
    return _handle(dataset_list)


@bp.post("/datasets/load")
def datasets_load() -> Response:
    def _load() -> dict[str, Any]:
        json_payload = request.get_json(silent=True) or {}
        key = json_payload.get("key")
        if isinstance(key, str):
            return dataset_load_from_key(key)
        file = request.files.get("csv")
        if not file:
            raise ValidationAppError(message="Dataset key or CSV upload required", code="tabular_ml.dataset.missing")
        try:
            enforce_limits([file], _upload_limits())
            validate_mime([file], {"text/csv", "application/vnd.ms-excel"})
        except ValidationError as exc:
            raise ValidationAppError(message=str(exc), code="tabular_ml.upload.invalid", details=exc.details)
        return dataset_load_from_bytes(file.read())

    return _handle(_load)


@bp.post("/preprocess/fit_apply")
def preprocess_fit_apply() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(PreprocessRequest, request.get_json(silent=True))
        return run_preprocess(payload)

    return _handle(_call)


@bp.post("/outliers/compute")
def outliers_compute() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(OutlierComputeRequest, request.get_json(silent=True))
        return run_outlier_compute(payload)

    return _handle(_call)


@bp.post("/outliers/apply")
def outliers_apply() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(OutlierApplyRequest, request.get_json(silent=True))
        return run_outlier_apply(payload)

    return _handle(_call)


@bp.post("/viz/histogram")
def viz_histogram() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(HistogramRequest, request.get_json(silent=True))
        return histogram(payload)

    return _handle(_call)


@bp.post("/viz/box")
def viz_box() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(BoxRequest, request.get_json(silent=True))
        return box(payload)

    return _handle(_call)


@bp.post("/viz/corr")
def viz_corr() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(CorrRequest, request.get_json(silent=True))
        return corr(payload)

    return _handle(_call)


@bp.post("/model/train")
def model_train() -> Response:
    def _call() -> dict[str, Any]:
        payload = parse_model(TrainRequest, request.get_json(silent=True))
        return run_train(payload)

    return _handle(_call)


@bp.get("/model/evaluate")
def model_evaluate() -> Response:
    def _call() -> dict[str, Any]:
        run_id = request.args.get("run_id")
        if not run_id:
            raise ValidationAppError(message="run_id is required", code="tabular_ml.run_id.missing")
        return run_evaluate(run_id)

    return _handle(_call)


@bp.get("/system/config")
def system_config() -> Response:
    def _call() -> dict[str, Any]:
        return session_config(current_app.config)

    return _handle(_call)


__all__ = ["bp"]
