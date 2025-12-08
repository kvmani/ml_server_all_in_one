"""Pure evaluation and plotting logic for the Scientific Calculator plugin."""

from __future__ import annotations

import ast
import math
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping, MutableMapping, Sequence


class ExpressionError(ValueError):
    """Raised when an expression cannot be parsed or evaluated."""


AngleUnit = str

_ALLOWED_ANGLE_UNITS = {"radian", "degree"}
_MAX_EXPR_LENGTH = 1024
_MAX_POINTS = 5000


@dataclass(frozen=True, slots=True)
class VariableSpec:
    """Range specification for plotting."""

    name: str
    start: float
    stop: float
    step: float


def _validate_angle_unit(angle_unit: AngleUnit) -> AngleUnit:
    if angle_unit not in _ALLOWED_ANGLE_UNITS:
        raise ExpressionError("angle_unit must be 'radian' or 'degree'")
    return angle_unit


def _normalize_expression(expression: str) -> str:
    if not expression or not isinstance(expression, str):
        raise ExpressionError("Expression is required")
    expression = expression.strip()
    if len(expression) > _MAX_EXPR_LENGTH:
        raise ExpressionError("Expression is too long")
    # Interpret caret as exponent for user convenience.
    return expression.replace("^", "**")


def _format_number(value: float | int) -> str:
    if isinstance(value, bool):  # pragma: no cover - defensive
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    return f"{value:.12g}"


def _canonicalize(node: ast.AST) -> str:
    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (int, float)):
            raise ExpressionError("Only numeric literals are allowed")
        return _format_number(node.value)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.UnaryOp):
        op = "+" if isinstance(node.op, ast.UAdd) else "-"
        return f"({op}{_canonicalize(node.operand)})"
    if isinstance(node, ast.BinOp):
        op_map = {
            ast.Add: "+",
            ast.Sub: "-",
            ast.Mult: "*",
            ast.Div: "/",
            ast.Mod: "%",
            ast.Pow: "^",
        }
        symbol = op_map.get(type(node.op))
        if symbol is None:
            raise ExpressionError("Unsupported operator")
        return f"({_canonicalize(node.left)} {symbol} {_canonicalize(node.right)})"
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ExpressionError("Only simple function calls are allowed")
        args = ", ".join(_canonicalize(arg) for arg in node.args)
        return f"{node.func.id}({args})"
    raise ExpressionError("Unsupported expression element")


def _validate_ast(node: ast.AST) -> None:
    if isinstance(node, ast.Expression):
        _validate_ast(node.body)
        return
    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)):
            raise ExpressionError("Operator not permitted")
        _validate_ast(node.left)
        _validate_ast(node.right)
        return
    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, (ast.UAdd, ast.USub)):
            raise ExpressionError("Unary operator not permitted")
        _validate_ast(node.operand)
        return
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ExpressionError("Only named functions are permitted")
        if node.keywords:
            raise ExpressionError("Keyword arguments are not supported")
        for arg in node.args:
            _validate_ast(arg)
        return
    if isinstance(node, ast.Name):
        return
    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (int, float)):
            raise ExpressionError("Only numeric literals are allowed")
        return
    raise ExpressionError("Unsupported syntax")


def _wrap_trig(fn: Callable[[float], float], *, use_degrees: bool) -> Callable[[float], float]:
    def wrapped(value: float) -> float:
        rad = math.radians(value) if use_degrees else value
        return fn(rad)

    return wrapped


def _wrap_inverse_trig(fn: Callable[[float], float], *, use_degrees: bool) -> Callable[[float], float]:
    def wrapped(value: float) -> float:
        angle = fn(value)
        return math.degrees(angle) if use_degrees else angle

    return wrapped


def _sinc(value: float) -> float:
    return 1.0 if value == 0 else math.sin(value) / value


def _make_function_table(angle_unit: AngleUnit) -> dict[str, Callable[..., float]]:
    use_degrees = angle_unit == "degree"
    funcs: dict[str, Callable[..., float]] = {
        "sin": _wrap_trig(math.sin, use_degrees=use_degrees),
        "cos": _wrap_trig(math.cos, use_degrees=use_degrees),
        "tan": _wrap_trig(math.tan, use_degrees=use_degrees),
        "asin": _wrap_inverse_trig(math.asin, use_degrees=use_degrees),
        "acos": _wrap_inverse_trig(math.acos, use_degrees=use_degrees),
        "atan": _wrap_inverse_trig(math.atan, use_degrees=use_degrees),
        "sinh": math.sinh,
        "cosh": math.cosh,
        "tanh": math.tanh,
        "log": lambda x, base=math.e: math.log(x, base),
        "ln": lambda x: math.log(x),
        "log10": math.log10,
        "exp": math.exp,
        "sqrt": math.sqrt,
        "abs": abs,
        "floor": math.floor,
        "ceil": math.ceil,
        "sinc": lambda x: _sinc(math.radians(x)) if use_degrees else _sinc(x),
        "deg2rad": math.radians,
        "rad2deg": math.degrees,
        "min": min,
        "max": max,
    }
    return funcs


def _validate_identifier(name: str) -> None:
    if not name or not name.replace("_", "a").isidentifier():
        raise ExpressionError(f"Invalid name '{name}'")
    if name.startswith("__"):
        raise ExpressionError("Names starting with __ are not allowed")


def _eval_node(
    node: ast.AST,
    context: Mapping[str, float],
    functions: Mapping[str, Callable[..., float]],
) -> float:
    if isinstance(node, ast.Constant):
        value = node.value
    elif isinstance(node, ast.Name):
        if node.id in context:
            value = context[node.id]
        else:
            raise ExpressionError(f"Unknown variable '{node.id}'")
    elif isinstance(node, ast.UnaryOp):
        operand = _eval_node(node.operand, context, functions)
        value = +operand if isinstance(node.op, ast.UAdd) else -operand
    elif isinstance(node, ast.BinOp):
        left = _eval_node(node.left, context, functions)
        right = _eval_node(node.right, context, functions)
        op = node.op
        if isinstance(op, ast.Add):
            value = left + right
        elif isinstance(op, ast.Sub):
            value = left - right
        elif isinstance(op, ast.Mult):
            value = left * right
        elif isinstance(op, ast.Div):
            value = left / right
        elif isinstance(op, ast.Mod):
            value = left % right
        elif isinstance(op, ast.Pow):
            value = left ** right
        else:  # pragma: no cover - guarded by _validate_ast
            raise ExpressionError("Operator not permitted")
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ExpressionError("Only simple function calls are allowed")
        func_name = node.func.id
        func = functions.get(func_name)
        if func is None:
            raise ExpressionError(f"Function '{func_name}' is not allowed")
        args = [_eval_node(arg, context, functions) for arg in node.args]
        value = func(*args)
    else:  # pragma: no cover - guarded by _validate_ast
        raise ExpressionError("Unsupported syntax")

    if isinstance(value, complex):
        raise ExpressionError("Complex results are not supported")
    if not isinstance(value, (int, float)):
        raise ExpressionError("Expression returned a non-numeric value")
    if math.isnan(value) or math.isinf(value):
        raise ExpressionError("Result is not finite")
    return float(value)


def _collect_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Name):
            names.add(child.id)
    return names


def evaluate_expression(
    expression: str,
    *,
    angle_unit: AngleUnit = "radian",
    variables: Mapping[str, float] | None = None,
) -> dict[str, object]:
    """Evaluate a scalar expression and return its value plus a canonical form."""

    angle_unit = _validate_angle_unit(angle_unit)
    normalized = _normalize_expression(expression)
    try:
        parsed = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Could not parse expression: {exc.msg}") from exc
    _validate_ast(parsed)

    functions = _make_function_table(angle_unit)
    constants: dict[str, float] = {"pi": math.pi, "e": math.e, "tau": math.tau}

    variables = {**constants, **(variables or {})}
    used_names = sorted(name for name in _collect_names(parsed) if name not in functions and name not in constants)

    result = _eval_node(parsed.body, variables, functions)
    canonical = _canonicalize(parsed.body)
    return {
        "result": result,
        "canonical": canonical,
        "angle_unit": angle_unit,
        "used_variables": used_names,
    }


def _frange(start: float, stop: float, step: float) -> list[float]:
    if step <= 0:
        raise ExpressionError("Step must be greater than zero")
    if stop < start:
        raise ExpressionError("Stop must be greater than or equal to start")
    values: list[float] = []
    current = start
    # Include stop when the increment lands within floating tolerance.
    while current <= stop + (abs(step) * 1e-9):
        values.append(float(current))
        if len(values) > _MAX_POINTS:
            raise ExpressionError("Range produces too many points")
        current += step
    return values


def _coerce_float(value: float | int) -> float:
    try:
        val = float(value)
    except (TypeError, ValueError) as exc:
        raise ExpressionError("Non-numeric value provided") from exc
    if math.isnan(val) or math.isinf(val):
        raise ExpressionError("Values must be finite")
    return val


def plot_expression(
    expression: str,
    *,
    variables: Sequence[VariableSpec],
    constants: Mapping[str, float] | None = None,
    angle_unit: AngleUnit = "radian",
) -> dict[str, object]:
    """Evaluate an expression over one or two variable ranges for plotting."""

    if not variables:
        raise ExpressionError("At least one variable range is required")
    if len(variables) not in (1, 2):
        raise ExpressionError("Only one or two variables are supported")

    angle_unit = _validate_angle_unit(angle_unit)
    normalized = _normalize_expression(expression)
    try:
        parsed = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Could not parse expression: {exc.msg}") from exc
    _validate_ast(parsed)

    functions = _make_function_table(angle_unit)
    base_context: MutableMapping[str, float] = {
        "pi": math.pi,
        "e": math.e,
        "tau": math.tau,
    }
    for name, value in (constants or {}).items():
        _validate_identifier(name)
        base_context[name] = _coerce_float(value)

    # Build ranges and enforce total point limits.
    ranges = {}
    total_points = 1
    for spec in variables:
        _validate_identifier(spec.name)
        start = _coerce_float(spec.start)
        stop = _coerce_float(spec.stop)
        step = _coerce_float(spec.step)
        values = _frange(start, stop, step)
        ranges[spec.name] = values
        total_points *= len(values)
    if total_points > _MAX_POINTS:
        raise ExpressionError("Requested grid exceeds point limit")

    canonical = _canonicalize(parsed.body)

    if len(variables) == 1:
        var_name = variables[0].name
        series = []
        for value in ranges[var_name]:
            context = dict(base_context)
            context[var_name] = value
            result = _eval_node(parsed.body, context, functions)
            series.append({"x": value, "y": result})
        return {
            "mode": "1d",
            "expression": canonical,
            "angle_unit": angle_unit,
            "variables": [
                {
                    "name": var_name,
                    "start": variables[0].start,
                    "stop": variables[0].stop,
                    "step": variables[0].step,
                }
            ],
            "points": len(series),
            "series": series,
        }

    # Two-dimensional grid
    x_name, y_name = variables[0].name, variables[1].name
    xs = ranges[x_name]
    ys = ranges[y_name]
    surface: list[list[float]] = []
    for y in ys:
        row: list[float] = []
        for x in xs:
            context = dict(base_context)
            context[x_name] = x
            context[y_name] = y
            result = _eval_node(parsed.body, context, functions)
            row.append(result)
        surface.append(row)
    return {
        "mode": "2d",
        "expression": canonical,
        "angle_unit": angle_unit,
        "variables": [
            {"name": x_name, "start": variables[0].start, "stop": variables[0].stop, "step": variables[0].step},
            {"name": y_name, "start": variables[1].start, "stop": variables[1].stop, "step": variables[1].step},
        ],
        "points": len(xs) * len(ys),
        "grid": {"x": xs, "y": ys, "z": surface},
    }


__all__ = ["ExpressionError", "VariableSpec", "evaluate_expression", "plot_expression"]
