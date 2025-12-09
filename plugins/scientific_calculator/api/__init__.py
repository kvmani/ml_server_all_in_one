"""API routes for the Scientific Calculator plugin."""

from __future__ import annotations

from typing import Literal

from flask import Blueprint, Response, request

from common.errors import ValidationAppError
from common.responses import fail, ok
from common.validation import SchemaModel, ValidationError, parse_model

from ..core import (
    CompositionConversionError,
    ElementSpec,
    ExpressionError,
    VariableSpec,
    evaluate_expression,
    convert_composition,
    list_elements,
    plot_expression,
)


class EvaluatePayload(SchemaModel):
    expression: str
    angle_unit: Literal["radian", "degree"] = "radian"
    variables: dict[str, float | int] | None = None


class ConstantPayload(SchemaModel):
    name: str
    value: float | int


class VariablePayload(SchemaModel):
    name: str
    start: float | int
    stop: float | int
    step: float | int


class PlotPayload(SchemaModel):
    expression: str
    angle_unit: Literal["radian", "degree"] = "radian"
    variables: list[VariablePayload]
    constants: list[ConstantPayload] | None = None


class CompositionElementPayload(SchemaModel):
    symbol: str
    role: Literal["normal", "balance"] = "normal"
    input_percent: float | int | None = None


class CompositionPayload(SchemaModel):
    mode: Literal["mass_to_atomic", "atomic_to_mass"]
    elements: list[CompositionElementPayload]


api_bp = Blueprint("scientific_calculator_api", __name__, url_prefix="/api/scientific_calculator")


@api_bp.post("/evaluate")
def evaluate() -> Response:
    raw_payload = request.get_json(silent=True) or {}
    try:
        payload = parse_model(EvaluatePayload, raw_payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="sci_calc.invalid_request",
                details=getattr(exc, "details", None),
            )
        )
    try:
        result = evaluate_expression(
            payload.expression,
            angle_unit=payload.angle_unit,
            variables=payload.variables or {},
        )
    except ExpressionError as exc:
        return fail(ValidationAppError(message=str(exc), code="sci_calc.invalid_expression"))
    return ok(result)


@api_bp.post("/plot")
def plot() -> Response:
    raw_payload = request.get_json(silent=True) or {}
    try:
        payload = parse_model(PlotPayload, raw_payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="sci_calc.invalid_request",
                details=getattr(exc, "details", None),
            )
        )

    if not payload.variables:
        return fail(ValidationAppError(message="At least one variable is required", code="sci_calc.invalid_variables"))
    if len(payload.variables) not in (1, 2):
        return fail(ValidationAppError(message="Only one or two variables are supported", code="sci_calc.invalid_variables"))

    variable_specs = [
        VariableSpec(
            name=item.name,
            start=float(item.start),
            stop=float(item.stop),
            step=float(item.step),
        )
        for item in payload.variables
    ]
    constants = {item.name: float(item.value) for item in payload.constants or []}

    try:
        result = plot_expression(
            payload.expression,
            variables=variable_specs,
            constants=constants,
            angle_unit=payload.angle_unit,
        )
    except ExpressionError as exc:
        return fail(ValidationAppError(message=str(exc), code="sci_calc.invalid_expression"))

    return ok(result)


@api_bp.get("/composition/elements")
def composition_elements() -> Response:
    return ok({"elements": list_elements()})


@api_bp.post("/composition/convert")
def composition_convert() -> Response:
    raw_payload = request.get_json(silent=True) or {}
    try:
        payload = parse_model(CompositionPayload, raw_payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="sci_calc.invalid_request",
                details=getattr(exc, "details", None),
            )
        )
    try:
        result = convert_composition(
            payload.mode,
            [
                ElementSpec(
                    symbol=item.symbol,
                    role=item.role,
                    input_percent=float(item.input_percent)
                    if item.input_percent is not None
                    else None,
                )
                for item in payload.elements
            ],
        )
    except CompositionConversionError as exc:
        return fail(ValidationAppError(message=str(exc), code="sci_calc.invalid_composition"))
    return ok(result)


blueprints = [api_bp]


__all__ = [
    "blueprints",
    "evaluate",
    "plot",
    "composition_convert",
    "composition_elements",
]
