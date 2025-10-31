"""Shared Pint registry helpers for the unit converter core."""

from __future__ import annotations

from functools import lru_cache
from typing import Iterable

from pint import UnitRegistry

_CUSTOM_DEFINITIONS: tuple[str, ...] = (
    "angstrom = 1e-10 * meter = Å = angstrom = angstroem",
    "micron = 1e-6 * meter = micrometer = µm",
    "ksi = 1000 * psi",
    "MPa = megapascal",
    "GPa = gigapascal",
    "N_per_mm2 = newton / millimeter ** 2 = N/mm^2",
    "millimeter_of_meter = 1e-3 * meter = mm",
    "microohm = 1e-6 * ohm",
    "microohm_centimeter = microohm * centimeter = μΩ·cm",
    "kilojoule_per_mole = kilojoule / mole = kJ/mol",
    "watt_per_meter_kelvin = watt / meter / kelvin = W/m·K = W/m/K = W/m*K",
    "poiseuille = pascal * second = Pa·s",
    "centipoise = poise / 100 = cP",
)

_INTERVAL_UNIT_MAP: dict[str, str] = {
    "degC": "delta_degC",
    "°C": "delta_degC",
    "celsius": "delta_degC",
    "degF": "delta_degF",
    "°F": "delta_degF",
    "fahrenheit": "delta_degF",
    "kelvin": "kelvin",
    "K": "kelvin",
}


def _build_registry() -> UnitRegistry:
    registry = UnitRegistry(autoconvert_offset_to_baseunit=True)
    registry.default_format = "P"  # compact pretty printer
    for definition in _CUSTOM_DEFINITIONS:
        registry.define(definition)
    try:  # pragma: no cover - Pint contexts vary between releases
        registry.enable_contexts("chemistry")
    except Exception:  # pragma: no cover
        pass
    return registry


@lru_cache(maxsize=1)
def get_registry() -> UnitRegistry:
    """Return a singleton :class:`~pint.UnitRegistry` instance."""

    return _build_registry()


def interval_unit(symbol: str) -> str:
    """Return the interval variant of ``symbol`` when the user selects interval mode."""

    return _INTERVAL_UNIT_MAP.get(symbol, symbol)


def iter_custom_units() -> Iterable[str]:
    """Yield the custom unit definitions injected into the registry."""

    return tuple(_CUSTOM_DEFINITIONS)


__all__ = ["get_registry", "interval_unit", "iter_custom_units"]
