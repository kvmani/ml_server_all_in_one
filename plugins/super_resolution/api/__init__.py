"""Super resolution API blueprint."""

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, Response, current_app, request, send_file

from common.errors import AppError, ValidationAppError
from common.io import buffer_from_bytes
from common.responses import fail, ok
from common.validation import ValidationError, validate_mime

from ..core import (
    SuperResolutionInputError,
    SuperResolutionModelError,
    SuperResolutionUnavailableError,
    UpscaleResult,
    load_settings,
    model_cached,
    select_device,
    upscale_image,
)

api_bp = Blueprint(
    "super_resolution_api", __name__, url_prefix="/api/v1/super_resolution"
)


def _repo_root() -> Path:
    return Path(current_app.root_path).resolve().parent


def _settings():
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("super_resolution", {})
    return load_settings(settings, root=_repo_root())


def _file_size(file) -> int:
    stream = file.stream
    try:
        current = stream.tell()
    except (AttributeError, OSError):
        current = None
    try:
        stream.seek(0, 2)
        size = stream.tell()
    finally:
        try:
            stream.seek(current or 0)
        except (AttributeError, OSError):
            pass
    return size


def _parse_scale(value: str | None, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        scale = int(float(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError("Scale must be 2 or 4") from exc
    if scale not in {2, 4}:
        raise ValidationError("Scale must be 2 or 4")
    return scale


def _parse_output_format(value: str | None) -> str:
    if not value:
        return "png"
    normalized = value.lower()
    if normalized in {"png", "jpg", "jpeg"}:
        return "jpg" if normalized != "png" else "png"
    raise ValidationError("Output format must be png or jpg")


def _select_model_name(models: dict[str, object], requested: str | None, scale: int, default: str) -> str:
    if requested:
        if requested not in models:
            raise ValidationError("Unknown model selection")
        return requested
    for name, spec in models.items():
        if getattr(spec, "scale", None) == scale:
            return name
    if default in models:
        return default
    return next(iter(models.keys()))


@api_bp.get("/health")
def health() -> Response:
    settings = _settings()
    device = select_device(settings.device)
    default_spec = settings.models.get(settings.default_model)
    model_name = default_spec.name if default_spec else settings.default_model
    loaded = False
    if default_spec:
        loaded = model_cached(default_spec, device)
    payload = {
        "status": "ok",
        "model_loaded": loaded,
        "model_name": model_name,
        "device": device,
    }
    return ok(payload)


@api_bp.post("/predict")
def predict() -> Response:
    settings = _settings()
    if not settings.enabled:
        return fail(
            ValidationAppError(
                message="Super-resolution is disabled in config.yml",
                code="super_resolution.disabled",
            ),
            status=404,
        )

    file = request.files.get("image")
    if not file:
        return fail(
            ValidationAppError(
                message="Image file is required",
                code="super_resolution.missing_image",
            )
        )

    max_bytes = max(1, settings.max_upload_mb) * 1024 * 1024
    size = _file_size(file)
    if size > max_bytes:
        return fail(
            ValidationAppError(
                message=f"File exceeds {settings.max_upload_mb} MB limit",
                code="super_resolution.too_large",
            ),
            status=413,
        )

    try:
        validate_mime([file], {"image/png", "image/jpeg", "image/webp"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="super_resolution.invalid_upload",
            )
        )

    try:
        scale = _parse_scale(request.form.get("scale"), settings.default_scale)
        output_format = _parse_output_format(request.form.get("output_format"))
        model_name = _select_model_name(
            settings.models,
            request.form.get("model"),
            scale,
            settings.default_model,
        )
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="super_resolution.invalid_parameters",
            )
        )

    spec = settings.models.get(model_name)
    if not spec:
        return fail(
            ValidationAppError(
                message="Unknown model selection",
                code="super_resolution.invalid_model",
            )
        )
    if spec.scale != scale:
        return fail(
            ValidationAppError(
                message="Selected model does not match requested scale",
                code="super_resolution.scale_mismatch",
            )
        )

    device = select_device(settings.device)
    try:
        try:
            file.stream.seek(0)
        except (AttributeError, OSError):
            pass
        result: UpscaleResult = upscale_image(
            file.read(),
            spec=spec,
            device=device,
            output_format=output_format,
            outscale=scale,
        )
    except SuperResolutionUnavailableError as exc:
        return fail(
            AppError(
                message=str(exc),
                code="super_resolution.unavailable",
                status_code=503,
            )
        )
    except SuperResolutionModelError as exc:
        return fail(
            AppError(
                message=str(exc),
                code="super_resolution.missing_weights",
                status_code=500,
            )
        )
    except SuperResolutionInputError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="super_resolution.invalid_input",
            )
        )

    filename = f"upscaled.{result.output_format}"
    return send_file(
        buffer_from_bytes(result.image_bytes),
        mimetype="image/png" if result.output_format == "png" else "image/jpeg",
        as_attachment=True,
        download_name=filename,
        max_age=0,
    )


blueprints = [api_bp]


__all__ = ["blueprints", "health", "predict"]
