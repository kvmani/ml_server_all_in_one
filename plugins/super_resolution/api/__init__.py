"""Super resolution API blueprint."""

from __future__ import annotations

import base64

from flask import Blueprint, Response, current_app, request

from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits, validate_mime

from ..core import SuperResolutionError, enhance_image

api_bp = Blueprint("super_resolution_api", __name__, url_prefix="/api/super_resolution")


def _upload_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("super_resolution", {})
    upload = settings.get("upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=8)


@api_bp.post("/enhance")
def enhance() -> Response:
    file = request.files.get("image")
    if not file:
        return fail(
            ValidationAppError(message="Image file is required", code="super_resolution.missing_image")
        )
    try:
        enforce_limits([file], _upload_limit())
        validate_mime([file], {"image/png", "image/jpeg", "image/tiff"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="super_resolution.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    scale_value = request.form.get("scale", "2")
    mode_value = request.form.get("mode", "bicubic")
    try:
        scale = float(scale_value)
    except (TypeError, ValueError):
        return fail(
            ValidationAppError(message="Scale must be numeric", code="super_resolution.invalid_scale")
        )

    try:
        result = enhance_image(file.read(), scale=scale, mode=mode_value)
    except SuperResolutionError as exc:
        return fail(
            ValidationAppError(message=str(exc), code="super_resolution.invalid_parameters")
        )

    payload = {
        "scale": result.scale,
        "width": result.width,
        "height": result.height,
        "image_base64": base64.b64encode(result.image_bytes).decode("ascii"),
    }
    return ok(payload)


blueprints = [api_bp]


__all__ = ["blueprints", "enhance"]
