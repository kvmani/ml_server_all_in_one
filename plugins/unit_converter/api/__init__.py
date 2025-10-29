"""Flask blueprint for unit conversions."""

from __future__ import annotations

from flask import Blueprint, Response, jsonify, render_template, request

from ..core import ConversionError, available_units, convert


bp = Blueprint(
    "unit_converter",
    __name__,
    url_prefix="/unit_converter",
    template_folder="../ui/templates",
    static_folder="../ui/static",
    static_url_path="/static/unit_converter",
)


@bp.get("/")
def index() -> str:
    return render_template("unit_converter/index.html", units=available_units())


@bp.post("/api/v1/convert")
def convert_endpoint() -> Response:
    payload = request.get_json() or {}
    try:
        value = float(payload.get("value"))
        category = payload.get("category", "")
        from_unit = payload.get("from_unit", "")
        to_unit = payload.get("to_unit", "")
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid value"}), 400

    try:
        result = convert(value, category, from_unit, to_unit)
    except ConversionError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"result": result})


@bp.get("/api/v1/units")
def units() -> Response:
    return jsonify(available_units())
