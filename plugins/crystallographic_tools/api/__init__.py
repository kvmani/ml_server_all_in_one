"""API routes for the Crystallographic Tools plugin."""

from __future__ import annotations

from flask import Blueprint, Response, request
from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import FileLimit, ValidationError, enforce_limits

from ..core import calculations as calc_core
from ..core import structure as structure_core
from ..core import viewer as viewer_core
from ..core import tem as tem_core
from ..core import xrd as xrd_core
from ..core.atomic_radii import covalent_radii_map

bp = Blueprint(
    "crystallographic_tools",
    __name__,
    url_prefix="/api/crystallographic_tools",
)


CRYSTAL_FILE_LIMIT = FileLimit(max_files=1, max_size=5 * 1024 * 1024)


def _parse_structure_from_payload(data: dict) -> Response | object:
    cif_string = data.get("cif")
    if not cif_string:
        return fail(ValidationAppError(message="CIF content is required", code="crystallography.missing_cif"))
    try:
        return structure_core.parse_cif_bytes(cif_string.encode())
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.invalid_cif"))


def _parse_supercell(raw) -> tuple[int, int, int] | None:
    try:
        return viewer_core.parse_supercell_param(raw)
    except ValidationError as exc:
        raise ValidationAppError(message=str(exc), code="crystallography.invalid_supercell", details=getattr(exc, "details", None))


@bp.post("/crystal_viewer/parse")
def crystal_viewer_parse() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(ValidationAppError(message="Structure file is required", code="crystallography.missing_file"))
    try:
        enforce_limits([file], CRYSTAL_FILE_LIMIT)
        supercell = _parse_supercell(request.form.get("supercell"))
        structure = viewer_core.parse_structure_bytes(file.read(), filename=file.filename)
        payload = viewer_core.structure_to_viewer_payload(structure, supercell=supercell)
    except ValidationAppError as exc:
        return fail(exc)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="crystallography.viewer_invalid",
                details=getattr(exc, "details", None),
            )
        )
    return ok(payload)


@bp.get("/crystal_viewer/element_radii")
def crystal_viewer_element_radii() -> Response:
    return ok(covalent_radii_map())


@bp.post("/crystal_viewer/export_structure")
def crystal_viewer_export_structure() -> Response:
    data = request.get_json(silent=True) or {}
    cif_string = data.get("cif") or data.get("poscar")
    if not cif_string:
        return fail(ValidationAppError(message="CIF or POSCAR content is required", code="crystallography.missing_cif"))
    supercell = None
    try:
        supercell = _parse_supercell(data.get("supercell"))
        structure = viewer_core.parse_structure_bytes(cif_string.encode(), filename=data.get("filename"))
        payload = viewer_core.structure_to_viewer_payload(structure, supercell=supercell)
    except ValidationAppError as exc:
        return fail(exc)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="crystallography.viewer_invalid",
                details=getattr(exc, "details", None),
            )
        )
    return ok(payload)


@bp.post("/load_cif")
def load_cif() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(ValidationAppError(message="CIF file is required", code="crystallography.missing_file"))
    try:
        enforce_limits([file], CRYSTAL_FILE_LIMIT)
        structure = viewer_core.parse_structure_bytes(file.read(), filename=file.filename)
        payload = viewer_core.structure_to_viewer_payload(structure)
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.invalid_cif"))

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
        structure = viewer_core.parse_structure_bytes(cif_string.encode(), filename=data.get("filename"))
        updated = structure_core.edit_structure(
            structure,
            lattice_params=lattice or None,
            sites=sites or None,
            supercell=supercell,
        )
        payload = viewer_core.structure_to_viewer_payload(updated, supercell=viewer_core.parse_supercell_param(supercell))
    except (ValueError, ValidationError) as exc:
        return fail(ValidationAppError(message=str(exc), code="crystallography.edit_error"))
    return ok(payload)


@bp.post("/xrd")
def xrd() -> Response:
    data = request.get_json(silent=True) or {}
    structure = _parse_structure_from_payload(data)
    if isinstance(structure, Response):
        return structure

    try:
        instrument = xrd_core.XrdInstrumentConfig.from_payload(data.get("instrument") or {"radiation": data.get("radiation")})
        range_config = xrd_core.XrdRangeConfig.from_payload(data.get("two_theta"))
        profile_config = xrd_core.PeakProfile.from_payload(data.get("profile"))
        pattern = xrd_core.compute_xrd_pattern(
            structure,
            instrument_config=instrument,
            range_config=range_config,
            profile_config=profile_config,
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

    try:
        pattern = tem_core.compute_saed_pattern(
            structure,
            config=tem_core.SaedConfig.from_payload(structure, data),
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

__all__ = [
    "blueprints",
    "bp",
    "load_cif",
    "edit_cif",
    "xrd",
    "tem_saed",
    "calculator",
    "crystal_viewer_parse",
    "crystal_viewer_element_radii",
    "crystal_viewer_export_structure",
]
