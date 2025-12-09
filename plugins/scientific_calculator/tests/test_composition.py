import pytest

from plugins.scientific_calculator.core import (
    CompositionConversionError,
    ElementSpec,
    convert_composition,
    list_elements,
)


def test_list_elements_contains_common_symbols():
    symbols = {record["symbol"] for record in list_elements()}
    assert {"Al", "Fe", "B"}.issubset(symbols)


def test_mass_to_atomic_with_balance():
    result = convert_composition(
        "mass_to_atomic",
        [
            ElementSpec(symbol="Al", role="normal", input_percent=10),
            ElementSpec(symbol="B", role="normal", input_percent=20),
            ElementSpec(symbol="Fe", role="balance"),
        ],
    )
    assert pytest.approx(result["input_sum"], rel=1e-6) == 100
    outputs = {item["symbol"]: item["output_percent"] for item in result["elements"]}
    assert pytest.approx(outputs["B"], rel=1e-3) == 53.25
    assert pytest.approx(outputs["Al"], rel=1e-3) == 10.66
    assert pytest.approx(outputs["Fe"], rel=1e-3) == 36.09
    assert not result["warnings"]


def test_atomic_to_mass_round_trips():
    result = convert_composition(
        "atomic_to_mass",
        [
            ElementSpec(symbol="Al", input_percent=10.66),
            ElementSpec(symbol="B", input_percent=53.25),
            ElementSpec(symbol="Fe", input_percent=36.09),
        ],
    )
    weights = {item["symbol"]: item["output_percent"] for item in result["elements"]}
    assert pytest.approx(sum(weights.values()), rel=1e-6) == 100
    assert weights["Fe"] > weights["B"] > weights["Al"]


def test_invalid_symbol_rejected():
    with pytest.raises(CompositionConversionError):
        convert_composition("mass_to_atomic", [ElementSpec(symbol="Xx", input_percent=50)])


def test_multiple_balances_rejected():
    with pytest.raises(CompositionConversionError):
        convert_composition(
            "mass_to_atomic",
            [
                ElementSpec(symbol="Al", role="balance"),
                ElementSpec(symbol="Fe", role="balance"),
            ],
        )
