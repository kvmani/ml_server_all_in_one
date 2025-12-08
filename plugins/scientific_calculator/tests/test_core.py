import math

import pytest

from plugins.scientific_calculator.core import ExpressionError, VariableSpec, evaluate_expression, plot_expression


def test_evaluate_basic_expression():
    result = evaluate_expression("3*4+5")
    assert result["result"] == 17
    assert result["canonical"] == "((3 * 4) + 5)"


def test_evaluate_trig_degrees():
    result = evaluate_expression("sin(90)", angle_unit="degree")
    assert result["result"] == pytest.approx(1.0)
    assert result["angle_unit"] == "degree"


def test_caret_is_power():
    result = evaluate_expression("2^3")
    assert result["result"] == 8.0
    assert result["canonical"] == "(2 ^ 3)"


def test_plot_one_dimension():
    payload = plot_expression(
        "x^2 + 1",
        variables=[VariableSpec(name="x", start=0, stop=2, step=1)],
    )
    ys = [point["y"] for point in payload["series"]]
    assert ys == [1.0, 2.0, 5.0]
    assert payload["points"] == 3
    assert payload["mode"] == "1d"


def test_plot_two_dimensions_with_constants():
    payload = plot_expression(
        "a*x + b*y",
        variables=[
            VariableSpec(name="x", start=0, stop=1, step=1),
            VariableSpec(name="y", start=0, stop=1, step=1),
        ],
        constants={"a": 2, "b": 1},
    )
    assert payload["mode"] == "2d"
    assert payload["grid"]["z"] == [[0.0, 2.0], [1.0, 3.0]]
    assert payload["points"] == 4


def test_invalid_expression_rejected():
    with pytest.raises(ExpressionError):
        evaluate_expression("__import__('os').system('echo')")  # disallowed syntax

