"""Unit converter API with standardized responses."""

from __future__ import annotations

from typing import Literal

from flask import Blueprint, Response, current_app, render_template, request, url_for

from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import SchemaModel, ValidationError, parse_model

from ..core import (
    BadInputError,
    DimensionMismatchError,
    InvalidUnitError,
    convert,
    convert_expression,
    list_families,
    list_units,
)


class PrecisionPayload(SchemaModel):
    sig_figs: int | None = None
    decimals: int | None = None
    notation: Literal["auto", "fixed", "scientific", "engineering"] = "auto"


class ConvertPayload(PrecisionPayload):
    value: float | int | str
    from_unit: str
    to_unit: str
    mode: Literal["absolute", "relative"] = "absolute"


class ExpressionPayload(PrecisionPayload):
    expression: str
    target: str | None = None


ui_bp = Blueprint(
    "unit_converter",
    __name__,
    url_prefix="/unit_converter",
    template_folder="../ui/templates",
    static_folder="../ui/static",
    static_url_path="/static",
)


@ui_bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("unit_converter", {})
    families = list_families()
    units = {family: list_units(family) for family in families}
    renderer = current_app.extensions.get("render_react")
    if not renderer:
        return render_template(
            "unit_converter/index.html",
            families=families,
            units=units,
            plugin_settings=settings,
        )

    theme_state = current_app.extensions.get("theme_state")
    apply_theme = current_app.extensions.get("theme_url")
    _, _, current_theme = (
        theme_state() if callable(theme_state) else ({}, "midnight", "midnight")
    )
    theme_apply = (
        apply_theme if callable(apply_theme) else (lambda value, _theme: value)
    )
    docs_url = settings.get("docs")
    if docs_url:
        help_href = theme_apply(docs_url, current_theme)
    else:
        help_href = theme_apply(
            url_for("help_page", slug="unit_converter"), current_theme
        )

    props = {
        "families": families,
        "units": units,
        "helpHref": help_href,
    }
    return renderer("unit_converter", props)


api_bp = Blueprint("unit_converter_api", __name__, url_prefix="/api/unit_converter")
legacy_bp = Blueprint(
    "unit_converter_legacy", __name__, url_prefix="/unit_converter/api/v1"
)


@api_bp.get("/families")
def families() -> Response:
    payload = {family: list_units(family) for family in list_families()}
    data = {"families": list(payload.keys()), "units": payload}
    return ok(data)


@api_bp.get("/units/<family>")
def units_endpoint(family: str) -> Response:
    try:
        units = list_units(family)
    except BadInputError as exc:
        return fail(ValidationAppError(message=str(exc), code="unit.invalid_family"))
    return ok({"family": family, "units": units})


def _parse_precision(payload: PrecisionPayload) -> dict:
    return {
        "sig_figs": payload.sig_figs,
        "decimals": payload.decimals,
        "notation": payload.notation,
    }


@api_bp.post("/convert")
def convert_endpoint() -> Response:
    raw_payload = request.get_json(silent=True) or {}
    try:
        payload = parse_model(ConvertPayload, raw_payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="unit.invalid_request",
                details=getattr(exc, "details", None),
            )
        )
    try:
        result = convert(
            payload.value,
            payload.from_unit,
            payload.to_unit,
            mode=payload.mode,
            **_parse_precision(payload),
        )
    except (BadInputError, InvalidUnitError) as exc:
        return fail(ValidationAppError(message=str(exc), code="unit.invalid_unit"))
    except DimensionMismatchError as exc:
        return fail(
            ValidationAppError(
                message=str(exc), code="unit.dimension_mismatch", status_code=422
            )
        )
    return ok(result)


@api_bp.post("/expressions")
def expression_endpoint() -> Response:
    raw_payload = request.get_json(silent=True) or {}
    try:
        payload = parse_model(ExpressionPayload, raw_payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="unit.invalid_request",
                details=getattr(exc, "details", None),
            )
        )
    try:
        result = convert_expression(
            payload.expression,
            target=payload.target,
            **_parse_precision(payload),
        )
    except (BadInputError, InvalidUnitError) as exc:
        return fail(
            ValidationAppError(message=str(exc), code="unit.invalid_expression")
        )
    except DimensionMismatchError as exc:
        return fail(
            ValidationAppError(
                message=str(exc), code="unit.dimension_mismatch", status_code=422
            )
        )
    return ok(result)


@legacy_bp.get("/families")
def legacy_families() -> Response:
    return families()


@legacy_bp.get("/units/<family>")
def legacy_units(family: str) -> Response:
    return units_endpoint(family)


@legacy_bp.post("/convert")
def legacy_convert() -> Response:
    return convert_endpoint()


@legacy_bp.post("/expressions")
def legacy_expressions() -> Response:
    return expression_endpoint()


blueprints = [ui_bp, api_bp, legacy_bp]


__all__ = [
    "blueprints",
    "families",
    "units_endpoint",
    "convert_endpoint",
    "expression_endpoint",
    "index",
]
