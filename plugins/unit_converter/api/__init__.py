"""Unit converter API with standardized responses."""

from __future__ import annotations

from typing import Literal

from flask import Blueprint, Response, request

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
    mode: Literal["absolute", "interval", "relative"] = "absolute"


class ExpressionPayload(PrecisionPayload):
    expression: str
    target: str | None = None


api_bp = Blueprint("unit_converter_api", __name__, url_prefix="/api/unit_converter")


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
        effective_mode = "interval" if payload.mode == "relative" else payload.mode
        result = convert(
            payload.value,
            payload.from_unit,
            payload.to_unit,
            mode=effective_mode,
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


blueprints = [api_bp]


__all__ = [
    "blueprints",
    "families",
    "units_endpoint",
    "convert_endpoint",
    "expression_endpoint",
]
