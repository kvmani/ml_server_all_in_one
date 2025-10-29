from plugins.unit_converter.core import (
    BadInputError,
    DimensionMismatchError,
    InvalidUnitError,
    convert,
    convert_expression,
    list_families,
    list_units,
)


def test_length_conversion():
    result = convert(100, "cm", "m")
    assert abs(result["value"] - 1.0) < 1e-9
    assert result["unit"] == "m"


def test_temperature_interval_mode():
    result = convert(10, "degC", "degF", mode="interval")
    assert abs(result["value"] - 18.0) < 1e-9


def test_expression_conversion():
    result = convert_expression("5 kJ/mol", target="eV")
    assert result["unit"] == "eV"
    assert result["value"] > 0


def test_invalid_family_raises():
    try:
        list_units("unknown")
    except BadInputError:
        pass
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected BadInputError")


def test_dimension_mismatch_error():
    try:
        convert(1, "m", "second")
    except DimensionMismatchError:
        pass
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected DimensionMismatchError")


def test_families_include_temperature():
    families = list_families()
    assert "temperature" in families
