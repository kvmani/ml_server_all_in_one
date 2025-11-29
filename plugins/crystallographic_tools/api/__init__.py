"""API routes for the Crystallographic Tools plugin."""

from __future__ import annotations

import io
from flask import Blueprint, Response, request
from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import ValidationError

from ..core import structure as structure_core
from ..core import xrd as xrd_core

bp = Blueprint(
    "crystallographic_tools",
    __name__,
    url_prefix="/api/crystallographic_tools",
)


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
    cif_string = data.get("cif")
    if not cif_string:
        return fail(ValidationAppError(message="CIF content is required", code="crystallography.missing_cif"))
    try:
        structure = structure_core.parse_cif_bytes(cif_string.encode())
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.invalid_cif"))

    radiation = data.get("radiation") or "CuKa"
    two_theta = data.get("two_theta") or {}
    try:
        peaks = xrd_core.compute_xrd_peaks(
            structure,
            radiation=radiation,
            tth_min=float(two_theta.get("min", 10.0)),
            tth_max=float(two_theta.get("max", 80.0)),
            tth_step=float(two_theta.get("step", 0.02)),
        )
    except Exception as exc:  # pragma: no cover - defensive
        return fail(ValidationAppError(message="XRD calculation failed", code="crystallography.xrd_error", details={"error": str(exc)}))

    return ok({"peaks": peaks})


blueprints = [bp]

__all__ = ["blueprints", "bp", "load_cif", "edit_cif", "xrd"]
