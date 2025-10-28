"""Core conversion logic for the unit converter."""

from __future__ import annotations

from dataclasses import dataclass


class ConversionError(ValueError):
    """Raised when a conversion request is invalid."""


@dataclass(frozen=True)
class UnitCategory:
    name: str
    factors: dict[str, float]


_CATEGORIES = {
    "length": UnitCategory(
        "length",
        {
            "meter": 1.0,
            "centimeter": 0.01,
            "millimeter": 0.001,
            "kilometer": 1000.0,
            "inch": 0.0254,
            "foot": 0.3048,
        },
    ),
    "mass": UnitCategory(
        "mass",
        {
            "gram": 0.001,
            "kilogram": 1.0,
            "pound": 0.45359237,
            "ounce": 0.0283495,
        },
    ),
}


def temperature_convert(value: float, from_unit: str, to_unit: str) -> float:
    if from_unit == to_unit:
        return value
    if from_unit == "celsius":
        kelvin = value + 273.15
    elif from_unit == "fahrenheit":
        kelvin = (value + 459.67) * 5 / 9
    elif from_unit == "kelvin":
        kelvin = value
    else:
        raise ConversionError("Unsupported temperature unit")

    if to_unit == "celsius":
        return kelvin - 273.15
    if to_unit == "fahrenheit":
        return kelvin * 9 / 5 - 459.67
    if to_unit == "kelvin":
        return kelvin
    raise ConversionError("Unsupported temperature unit")


def convert(value: float, category: str, from_unit: str, to_unit: str) -> float:
    if category == "temperature":
        return temperature_convert(value, from_unit, to_unit)
    try:
        info = _CATEGORIES[category]
    except KeyError as exc:  # pragma: no cover - defensive
        raise ConversionError("Unknown category") from exc
    try:
        base = value * info.factors[from_unit]
        return base / info.factors[to_unit]
    except KeyError as exc:
        raise ConversionError("Unsupported unit") from exc


def available_units() -> dict[str, list[str]]:
    units = {category: sorted(info.factors) for category, info in _CATEGORIES.items()}
    units["temperature"] = ["celsius", "fahrenheit", "kelvin"]
    return units


__all__ = ["convert", "available_units", "ConversionError"]
