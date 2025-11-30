"""API routes for the Crystallographic Tools plugin."""

from __future__ import annotations

from flask import Blueprint, Response, request
from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import ValidationError

from ..core import structure as structure_core
from ..core import xrd as xrd_core
from ..core import calculations as calc_core
from ..core import tem as tem_core

bp = Blueprint(
    "crystallographic_tools",
    __name__,
    url_prefix="/api/crystallographic_tools",
)


def _parse_structure_from_payload(data: dict) -> Response | object:
    cif_string = data.get("cif")
    if not cif_string:
        return fail(ValidationAppError(message="CIF content is required", code="crystallography.missing_cif"))
    try:
        return structure_core.parse_cif_bytes(cif_string.encode())
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.invalid_cif"))


@bp.post("/load_cif")
def load_cif() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(ValidationAppError(message="CIF file is required", code="crystallography.missing_file"))
    try:
        structure = structure_core.parse_cif_bytes(file.read())
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.invalid_cif"))

    payload = structure_core.structure_to_payload(structure)
    return ok(payload)


@bp.post("/edit_cif")
def edit_cif() -> Response:
    data = request.get_json(silent=True) or {}
    cif_string = data.get("cif")
    if not cif_string:
        return fail(ValidationAppError(message="CIF content is required", code="crystallography.missing_cif"))
    lattice = data.get("lattice") or {}
    sites = data.get("sites") or []
    supercell = data.get("supercell") or [1, 1, 1]
    try:
        structure = structure_core.parse_cif_bytes(cif_string.encode())
        updated = structure_core.edit_structure(
            structure,
            lattice_params=lattice or None,
            sites=sites or None,
            supercell=supercell,
        )
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.edit_error"))
    payload = structure_core.structure_to_payload(updated)
    return ok(payload)


@bp.post("/xrd")
def xrd() -> Response:
    data = request.get_json(silent=True) or {}
    structure = _parse_structure_from_payload(data)
    if isinstance(structure, Response):
        return structure

    radiation = data.get("radiation") or "CuKa"
    two_theta = data.get("two_theta") or {}
    try:
        pattern = xrd_core.compute_xrd_peaks(
            structure,
            radiation=radiation,
            tth_min=float(two_theta.get("min", 10.0)),
            tth_max=float(two_theta.get("max", 80.0)),
            tth_step=float(two_theta.get("step", 0.02)),
        )
    except Exception as exc:  # pragma: no cover - defensive
        return fail(ValidationAppError(message="XRD calculation failed", code="crystallography.xrd_error", details={"error": str(exc)}))

    return ok(pattern)


@bp.post("/tem_saed")
def tem_saed() -> Response:
    data = request.get_json(silent=True) or {}
    structure = _parse_structure_from_payload(data)
    if isinstance(structure, Response):
        return structure

    zone_axis = data.get("zone_axis")
    if not isinstance(zone_axis, (list, tuple)):
        return fail(ValidationAppError(message="Zone axis is required", code="crystallography.missing_zone"))

    try:
        pattern = tem_core.compute_saed_pattern(
            structure,
            zone_axis=zone_axis,
            voltage_kv=float(data.get("voltage_kv", 200.0)),
            camera_length_mm=float(data.get("camera_length_mm", 100.0)),
            max_index=int(data.get("max_index", 3)),
            g_max=float(data.get("g_max", 6.0)),
            zone_tolerance_deg=float(data.get("zone_tolerance_deg", 2.5)),
            rotation_deg=float(data.get("rotation_deg", 0.0)),
        )
    except (ValidationError, ValueError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.tem_invalid"))
    except Exception as exc:  # pragma: no cover - defensive
        return fail(
            ValidationAppError(
                message="TEM SAED calculation failed",
                code="crystallography.tem_error",
                details={"error": str(exc)},
            )
        )

    return ok(pattern)


@bp.post("/calculator")
def calculator() -> Response:
    data = request.get_json(silent=True) or {}
    structure = _parse_structure_from_payload(data)
    if isinstance(structure, Response):
        return structure

    def _extract_vector(key: str):
        raw = data.get(key)
        if raw is None:
            return None
        if isinstance(raw, dict):
            raw = raw.get("components")
        if not isinstance(raw, (list, tuple)):
            raise ValidationError(f"{key} must be a list of numbers")
        return [float(v) for v in raw]

    try:
        dir_a = _extract_vector("direction_a")
        dir_b = _extract_vector("direction_b")
        plane = _extract_vector("plane")
        include_equivalents = bool(data.get("include_equivalents", True))
        result = calc_core.run_calculations(
            structure,
            direction_a=dir_a,
            direction_b=dir_b,
            plane=plane,
            include_equivalents=include_equivalents,
        )
    except (ValidationError, ValueError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.calc_invalid"))
    except Exception as exc:  # pragma: no cover - defensive
        return fail(
            ValidationAppError(
                message="Crystallographic calculations failed",
                code="crystallography.calc_error",
                details={"error": str(exc)},
            )
        )

    return ok(result)


blueprints = [bp]

__all__ = ["blueprints", "bp", "load_cif", "edit_cif", "xrd", "tem_saed", "calculator"]
