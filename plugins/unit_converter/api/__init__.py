"""Flask blueprint for unit conversions."""

from __future__ import annotations

from flask import Blueprint, Response, current_app, jsonify, render_template, request

from ..core import (
    BadInputError,
    DimensionMismatchError,
    InvalidUnitError,
    convert,
    convert_expression,
    list_families,
    list_units,
)


bp = Blueprint(
    "unit_converter",
    __name__,
    url_prefix="/unit_converter",
    template_folder="../ui/templates",
    static_folder="../ui/static",
    static_url_path="/static/unit_converter",
)


def _format_error(message: str, status: int = 400) -> Response:
    return jsonify({"error": message}), status


@bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("unit_converter", {})
    families = list_families()
    units = {family: list_units(family) for family in families}
    return render_template(
        "unit_converter/index.html",
        families=families,
        units=units,
        plugin_settings=settings,
    )


@bp.get("/api/v1/families")
def families() -> Response:
    payload = {family: list_units(family) for family in list_families()}
    return jsonify({"families": list(payload.keys()), "units": payload})


@bp.get("/api/v1/units/<family>")
def units_endpoint(family: str) -> Response:
    try:
        units = list_units(family)
    except BadInputError as exc:
        return _format_error(str(exc), 400)
    return jsonify({"family": family, "units": units})


def _parse_precision(payload: dict) -> dict:
    sig_figs = payload.get("sig_figs")
    decimals = payload.get("decimals")
    notation = payload.get("notation", "auto")
    return {"sig_figs": sig_figs, "decimals": decimals, "notation": notation}


@bp.post("/api/v1/convert")
def convert_endpoint() -> Response:
    payload = request.get_json(silent=True) or {}
    value = payload.get("value")
    from_unit = payload.get("from_unit")
    to_unit = payload.get("to_unit")
    mode = payload.get("mode", "absolute")
    try:
        result = convert(value, from_unit, to_unit, mode=mode, **_parse_precision(payload))
    except (BadInputError, InvalidUnitError) as exc:
        return _format_error(str(exc), 400)
    except DimensionMismatchError as exc:
        return _format_error(str(exc), 422)
    return jsonify(result)


@bp.post("/api/v1/expressions")
def expression_endpoint() -> Response:
    payload = request.get_json(silent=True) or {}
    expression = payload.get("expression")
    target = payload.get("target")
    try:
        result = convert_expression(
            expression,
            target=target,
            **_parse_precision(payload),
        )
    except (BadInputError, InvalidUnitError) as exc:
        return _format_error(str(exc), 400)
    except DimensionMismatchError as exc:
        return _format_error(str(exc), 422)
    return jsonify(result)
