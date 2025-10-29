from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, Response, current_app, jsonify, render_template, request
from PIL import Image

from app.security import validate_mime
from common.validate import FileLimit, ValidationError, enforce_limits

from ..core import (
    ConventionalParams,
    SegmentationOutput,
    analyze_mask,
    combined_panel,
    compute_metrics,
    decode_image,
    segment_conventional,
)
from ..core.image_io import image_to_png_base64

ALLOWED_MIMES = {"image/png", "image/jpeg", "image/tiff"}


bp = Blueprint(
    "hydride_segmentation",
    __name__,
    url_prefix="/hydride_segmentation",
    template_folder="../ui/templates",
    static_folder="../ui/static/hydride_segmentation",
    static_url_path="/static/hydride_segmentation",
)


def _parse_float(value: str | None, *, field: str, default: float) -> float:
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ValidationError(f"Invalid value for {field}") from exc


def _parse_int(value: str | None, *, field: str, default: int, minimum: int | None = None) -> int:
    if value is None or value.strip() == "":
        result = default
    else:
        try:
            result = int(float(value))
        except ValueError as exc:
            raise ValidationError(f"Invalid value for {field}") from exc
    if minimum is not None and result < minimum:
        raise ValidationError(f"{field} must be ≥ {minimum}")
    return result


def _parse_conventional_params(form) -> ConventionalParams:
    defaults = ConventionalParams()
    clahe_clip = _parse_float(
        form.get("clahe_clip_limit"), field="CLAHE clip limit", default=defaults.clahe_clip_limit
    )
    clahe_x = _parse_int(
        form.get("clahe_grid_x"), field="CLAHE tile width", default=defaults.clahe_tile_grid[0], minimum=1
    )
    clahe_y = _parse_int(
        form.get("clahe_grid_y"), field="CLAHE tile height", default=defaults.clahe_tile_grid[1], minimum=1
    )
    adaptive_window = _parse_int(
        form.get("adaptive_window"),
        field="Adaptive window",
        default=defaults.adaptive_window,
        minimum=3,
    )
    adaptive_offset = _parse_int(
        form.get("adaptive_offset"), field="Adaptive C", default=defaults.adaptive_offset
    )
    morph_x = _parse_int(
        form.get("morph_kernel_x"),
        field="Morph kernel width",
        default=defaults.morph_kernel[0],
        minimum=1,
    )
    morph_y = _parse_int(
        form.get("morph_kernel_y"),
        field="Morph kernel height",
        default=defaults.morph_kernel[1],
        minimum=1,
    )
    morph_iters = _parse_int(
        form.get("morph_iterations"),
        field="Morph iterations",
        default=defaults.morph_iters,
        minimum=0,
    )
    area_threshold = _parse_int(
        form.get("area_threshold"),
        field="Area threshold",
        default=defaults.area_threshold,
        minimum=1,
    )
    crop_percent = _parse_int(
        form.get("crop_percent"),
        field="Crop percent",
        default=defaults.crop_percent,
        minimum=0,
    )
    crop_enabled = form.get("crop_enabled") in {"1", "true", "on", "yes"}

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


def _plugin_limits() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("hydride_segmentation", {})
    upload = settings.get("upload", {})
    max_files = upload.get("max_files", 1)
    max_mb = upload.get("max_mb", 5)
    try:
        max_files_int = int(max_files)
    except (TypeError, ValueError):
        max_files_int = 1
    try:
        max_bytes = int(float(max_mb) * 1024 * 1024)
    except (TypeError, ValueError):
        max_bytes = 5 * 1024 * 1024
    return FileLimit(max_files=max_files_int, max_size=max_bytes)


@bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("hydride_segmentation", {})
    return render_template("hydride_segmentation/index.html", plugin_settings=settings)


@bp.post("/api/v1/segment")
def segment() -> Response:
    files = request.files.getlist("image")
    try:
        enforce_limits(files, _plugin_limits())
        validate_mime(files, ALLOWED_MIMES)
        params = _parse_conventional_params(request.form)
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    file = files[0]
    image_bytes = file.read()
    image = decode_image(image_bytes)
    model = (request.form.get("model") or "conventional").lower()
    if model not in {"conventional", "ml"}:
        return jsonify({"error": "Unsupported model selected"}), 400

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
    return jsonify(payload)


@bp.get("/api/v1/warmup")
def warmup() -> Response:
    return jsonify({"status": "ok"})
