from plugins.unit_converter.core import ConversionError, available_units, convert


def test_length_conversion():
    meters = convert(100, "length", "centimeter", "meter")
    assert meters == 1.0


def test_temperature_conversion():
    fahrenheit = convert(0, "temperature", "celsius", "fahrenheit")
    assert round(fahrenheit, 1) == 32.0


def test_invalid_unit():
    try:
        convert(1, "length", "meter", "invalid")
    except ConversionError:
        pass
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected ConversionError")


def test_available_units_contains_temperature():
    units = available_units()
    assert "temperature" in units
