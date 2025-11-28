from plugins.unit_converter.core.converter import (
    BadInputError,
    DimensionMismatchError,
    InvalidUnitError,
    Converter,
    format_value,
)


def test_convert_handles_interval_mode():
    conv = Converter()
    result = conv.convert(10, "degC", "degF", mode="interval")
    assert result["unit"] == "degF"
    assert result["result"] == 18.0


def test_convert_rejects_mismatched_dimensions():
    conv = Converter()
    try:
        conv.convert(1, "m", "s")
    except DimensionMismatchError as exc:
        assert "cannot convert" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("Expected DimensionMismatchError")


def test_convert_expression_parses_to_clause():
    conv = Converter()
    result = conv.convert_expression("3 m to cm")
    assert result["result"] == 300
    assert result["unit"] == "cm"


def test_format_value_supports_sig_figs():
    assert format_value(1234.56, sig_figs=3) == "1.23e+03"
    try:
        format_value(1.0, sig_figs=0)
    except BadInputError:
        pass
    else:  # pragma: no cover
        raise AssertionError("Expected BadInputError")


def test_invalid_unit_raises():
    conv = Converter()
    try:
        conv.convert(1, "invalid", "m")
    except InvalidUnitError:
        pass
    else:  # pragma: no cover
        raise AssertionError("Expected InvalidUnitError")
