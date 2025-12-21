"""Hydride segmentation API with uniform responses."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from flask import Blueprint, Response, current_app, request
from PIL import Image

from common.errors import AppError, InternalAppError, NotFoundAppError, ValidationAppError
from common.forms import get_bool, get_float, get_int
from common.model_store import resolve_model_path, resolve_models_root
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits, validate_mime

from ..core import (
    ConventionalParams,
    MlModelError,
    MlModelSpec,
    MlUnavailableError,
    SegmentationOutput,
    analyze_mask,
    combined_panel,
    compute_metrics,
    decode_image,
    ml_available,
    ml_import_error,
    segment_conventional,
    segment_ml,
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


def _repo_root() -> Path:
    return Path(current_app.root_path).resolve().parent


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


def _load_ml_specs() -> tuple[list[MlModelSpec], list[str]]:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get(
        "hydride_segmentation", {}
    )
    specs: list[MlModelSpec] = []
    warnings: list[str] = []
    for entry in settings.get("models", []) or []:
        if not isinstance(entry, dict):
            warnings.append("Invalid ML model entry (expected mapping).")
            continue
        model_id = entry.get("id")
        model_file = entry.get("file")
        if not model_id or not model_file:
            warnings.append("ML model entries require 'id' and 'file'.")
            continue
        specs.append(
            MlModelSpec(
                model_id=str(model_id),
                label=str(entry.get("label") or model_id),
                file=str(model_file),
                placeholder=bool(entry.get("placeholder") or False),
                input_size=int(entry.get("input_size") or 256),
                threshold=float(entry.get("threshold") or 0.5),
                architecture=entry.get("architecture"),
                encoder=entry.get("encoder"),
                in_channels=int(entry.get("in_channels") or 1),
                classes=int(entry.get("classes") or 1),
            )
        )
    return specs, warnings


def _ml_status_payload() -> dict:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get(
        "hydride_segmentation", {}
    )
    specs, warnings = _load_ml_specs()
    deps_ok = ml_available()
    if not deps_ok:
        err = ml_import_error()
        msg = "Torch CPU + segmentation_models_pytorch are not installed."
        if err:
            msg = f"{msg} ({err})"
        warnings.append(msg)

    root = resolve_models_root(current_app.config, settings, base_dir=_repo_root())
    models_payload = []
    any_available = False
    for spec in specs:
        path = resolve_model_path(root, spec.file)
        exists = path.exists()
        available = deps_ok and exists and not spec.placeholder
        any_available = any_available or available
        models_payload.append(
            {
                "id": spec.model_id,
                "label": spec.label,
                "available": available,
                "input_size": spec.input_size,
                "threshold": spec.threshold,
                "missing": None
                if available
                else (
                    "placeholder"
                    if spec.placeholder
                    else ("weights" if not exists else "deps")
                ),
            }
        )

    if specs and deps_ok and not any_available:
        if any(spec.placeholder for spec in specs):
            warnings.append("Configured ML models are placeholders; replace with real weights.")
        else:
            warnings.append("No configured ML model weights were found on disk.")
    if not specs:
        warnings.append("No ML models configured.")

    default_id = settings.get("default_ml_model_id")
    if not default_id and specs:
        default_id = specs[0].model_id

    return {
        "ml_available": deps_ok and any_available,
        "ml_models": models_payload,
        "default_ml_model_id": default_id,
        "warnings": warnings,
    }


def _resolve_ml_model(model_id: str | None) -> tuple[MlModelSpec, Path]:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get(
        "hydride_segmentation", {}
    )
    specs, warnings = _load_ml_specs()
    if not ml_available():
        msg = "Torch CPU + segmentation_models_pytorch are required for ML segmentation."
        err = ml_import_error()
        if err:
            msg = f"{msg} ({err})"
        raise AppError(message=msg, code="hydride.ml_unavailable", status_code=503)
    if not specs:
        detail = warnings[0] if warnings else "No ML models configured."
        raise AppError(
            message=detail, code="hydride.ml_not_configured", status_code=503
        )

    default_id = settings.get("default_ml_model_id")
    if not default_id:
        default_id = specs[0].model_id
    selected_id = model_id or default_id
    spec = next((item for item in specs if item.model_id == selected_id), None)
    if spec is None:
        raise ValidationAppError(
            message="Unknown ML model selected",
            code="hydride.invalid_model_id",
            details={"model_id": selected_id},
        )
    if spec.placeholder:
        raise AppError(
            message="Selected ML model is a placeholder; replace with real weights.",
            code="hydride.model_placeholder",
            status_code=503,
        )

    root = resolve_models_root(current_app.config, settings, base_dir=_repo_root())
    weights_path = resolve_model_path(root, spec.file)
    if not weights_path.exists():
        raise NotFoundAppError(
            message="ML model weights not found",
            code="hydride.model_missing",
            details={"model_id": spec.model_id},
        )
    return spec, weights_path


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


@api_bp.get("/config")
def config() -> Response:
    return ok(_ml_status_payload())


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

    ml_spec: MlModelSpec | None = None
    if model == "ml":
        try:
            ml_spec, weights_path = _resolve_ml_model(request.form.get("ml_model_id"))
            result = segment_ml(image, ml_spec, weights_path=weights_path)
        except (MlUnavailableError, MlModelError) as exc:
            return fail(
                AppError(
                    message=str(exc),
                    code="hydride.ml_failed",
                    status_code=503,
                )
            )
        except AppError as exc:
            return fail(exc)
        except Exception as exc:
            return fail(
                InternalAppError(
                    message="ML segmentation failed to run",
                    code="hydride.ml_error",
                    details={"detail": repr(exc)},
                )
            )
    else:
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
    if model == "ml" and ml_spec is not None:
        payload["parameters"]["ml_model_id"] = ml_spec.model_id
        payload["parameters"]["ml_model_label"] = ml_spec.label
    return ok(payload)


@api_bp.get("/warmup")
def warmup() -> Response:
    return ok({"status": "ready"})


blueprints = [api_bp]


__all__ = ["blueprints", "segment", "warmup", "config"]
