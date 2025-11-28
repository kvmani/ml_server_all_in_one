"""Hydride segmentation API with uniform responses."""

from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, Response, current_app, request
from PIL import Image

from common.errors import ValidationAppError
from common.forms import get_bool, get_float, get_int
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits, validate_mime

from ..core import (
    ConventionalParams,
    SegmentationOutput,
    analyze_mask,
    combined_panel,
    compute_metrics,
    decode_image,
    segment_conventional,
)
from ..core.image_io import MAX_IMAGE_PIXELS, image_to_png_base64

ALLOWED_MIMES = {"image/png", "image/jpeg", "image/tiff"}


def _plugin_limits() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get(
        "hydride_segmentation", {}
    )
    upload = settings.get("upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=5)


def _max_pixels() -> int:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get(
        "hydride_segmentation", {}
    )
    try:
        return int(settings.get("max_pixels", MAX_IMAGE_PIXELS))
    except (TypeError, ValueError):
        return MAX_IMAGE_PIXELS


def _parse_conventional_params(form) -> ConventionalParams:
    defaults = ConventionalParams()
    clahe_clip = get_float(
        form,
        "clahe_clip_limit",
        defaults.clahe_clip_limit,
        field_name="CLAHE clip limit",
        minimum=0.01,
    )
    clahe_x = get_int(
        form,
        "clahe_grid_x",
        defaults.clahe_tile_grid[0],
        field_name="CLAHE tile width",
        minimum=1,
    )
    clahe_y = get_int(
        form,
        "clahe_grid_y",
        defaults.clahe_tile_grid[1],
        field_name="CLAHE tile height",
        minimum=1,
    )
    adaptive_window = get_int(
        form,
        "adaptive_window",
        defaults.adaptive_window,
        field_name="Adaptive window",
        minimum=3,
    )
    adaptive_offset = get_int(
        form,
        "adaptive_offset",
        defaults.adaptive_offset,
        field_name="Adaptive C",
    )
    morph_x = get_int(
        form,
        "morph_kernel_x",
        defaults.morph_kernel[0],
        field_name="Morph kernel width",
        minimum=1,
    )
    morph_y = get_int(
        form,
        "morph_kernel_y",
        defaults.morph_kernel[1],
        field_name="Morph kernel height",
        minimum=1,
    )
    morph_iters = get_int(
        form,
        "morph_iterations",
        defaults.morph_iters,
        field_name="Morph iterations",
        minimum=0,
    )
    area_threshold = get_int(
        form,
        "area_threshold",
        defaults.area_threshold,
        field_name="Area threshold",
        minimum=1,
    )
    crop_percent = get_int(
        form,
        "crop_percent",
        defaults.crop_percent,
        field_name="Crop percent",
        minimum=0,
    )
    crop_enabled = get_bool(form, "crop_enabled", default=False)

    return ConventionalParams(
        clahe_clip_limit=clahe_clip,
        clahe_tile_grid=(clahe_x, clahe_y),
        adaptive_window=adaptive_window,
        adaptive_offset=adaptive_offset,
        morph_kernel=(morph_x, morph_y),
        morph_iters=morph_iters,
        area_threshold=area_threshold,
        crop=crop_enabled,
        crop_percent=crop_percent,
    )


def _serialize_output(result: SegmentationOutput, model: str) -> dict:
    input_img = Image.fromarray(result.input_image)
    mask_img = Image.fromarray(result.mask)
    overlay_img = Image.fromarray(result.overlay)

    analysis_payload, analysis_images = analyze_mask(result.mask, return_images=True)
    combined = combined_panel(
        input_img.convert("RGB"),
        mask_img,
        overlay_img,
        *analysis_images,
    )
    analysis_payload["combined_panel_png_b64"] = image_to_png_base64(combined)

    logs = list(result.logs)
    if model == "ml":
        logs.insert(0, "ML backend routed to conventional pipeline for offline parity")

    return {
        "input_png_b64": image_to_png_base64(input_img.convert("RGB")),
        "mask_png_b64": image_to_png_base64(mask_img),
        "overlay_png_b64": image_to_png_base64(overlay_img),
        "analysis": analysis_payload,
        "logs": logs,
    }


api_bp = Blueprint(
    "hydride_segmentation_api", __name__, url_prefix="/api/hydride_segmentation"
)


@api_bp.post("/segment")
def segment() -> Response:
    files = request.files.getlist("image")
    try:
        enforce_limits(files, _plugin_limits())
        validate_mime(files, ALLOWED_MIMES)
        params = _parse_conventional_params(request.form)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="hydride.invalid_request",
                details=getattr(exc, "details", None),
            )
        )

    if not files:
        return fail(
            ValidationAppError(
                message="No image uploaded", code="hydride.image_missing"
            )
        )

    file = files[0]
    image_bytes = file.read()
    try:
        image = decode_image(image_bytes, max_pixels=_max_pixels())
    except ValueError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="hydride.invalid_image",
            )
        )
    model = (request.form.get("model") or "conventional").lower()
    if model not in {"conventional", "ml"}:
        return fail(
            ValidationAppError(
                message="Unsupported model selected", code="hydride.invalid_model"
            )
        )

    result = segment_conventional(image, params)
    metrics = compute_metrics(result.mask)
    payload = _serialize_output(result, model)
    payload["metrics"] = {
        **metrics,
        "mask_area_fraction_percent": metrics["mask_area_fraction"] * 100,
    }
    payload["parameters"] = {
        "model": model,
        "conventional": asdict(params),
    }
    return ok(payload)


@api_bp.get("/warmup")
def warmup() -> Response:
    return ok({"status": "ready"})


blueprints = [api_bp]


__all__ = ["blueprints", "segment", "warmup"]
