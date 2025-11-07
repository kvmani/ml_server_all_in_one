from plugins.unit_converter.core import (
    BadInputError,
    DimensionMismatchError,
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


def test_decimal_precision_formatting():
    result = convert(1, "meter", "inch", decimals=2)
    assert result["formatted"] == "39.37"


def test_zero_decimal_formatting():
    result = convert(1, "meter", "inch", decimals=0)
    assert result["formatted"] == "39"


def test_expression_with_decimals():
    result = convert_expression("5 kg + 200 g", target="lb", decimals=3)
    assert result["unit"] == "lb"
    assert result["formatted"] == "11.464"


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
