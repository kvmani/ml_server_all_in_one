"""Conversion utilities backed by :mod:`pint`."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from typing import Dict, List, Optional

from pint import Quantity
from pint.errors import DimensionalityError, UndefinedUnitError

from .registry import get_registry, interval_unit


class ConversionError(Exception):
    """Base exception for conversion failures."""


class InvalidUnitError(ConversionError):
    """Raised when a unit symbol or expression cannot be parsed."""


class DimensionMismatchError(ConversionError):
    """Raised when two units do not share the same dimensionality."""


class BadInputError(ConversionError):
    """Raised when user supplied values cannot be normalised."""


@dataclass(frozen=True)
class UnitDefinition:
    """Metadata describing a unit exposed to the UI."""

    symbol: str
    aliases: tuple[str, ...]
    dimension: str


UNIT_FAMILIES: Dict[str, List[UnitDefinition]] = {
    "length": [
        UnitDefinition("m", ("meter", "metre"), "length"),
        UnitDefinition("cm", ("centimeter",), "length"),
        UnitDefinition("mm", ("millimeter",), "length"),
        UnitDefinition("km", ("kilometer",), "length"),
        UnitDefinition("in", ("inch", "inches"), "length"),
        UnitDefinition("ft", ("foot", "feet"), "length"),
        UnitDefinition("yd", ("yard",), "length"),
        UnitDefinition("mile", ("mi",), "length"),
        UnitDefinition("Å", ("angstrom",), "length"),
        UnitDefinition("nm", ("nanometer",), "length"),
        UnitDefinition("micron", ("µm", "micrometer"), "length"),
    ],
    "area": [
        UnitDefinition("m^2", ("square_meter",), "area"),
        UnitDefinition("cm^2", ("square_centimeter",), "area"),
        UnitDefinition("mm^2", ("square_millimeter",), "area"),
        UnitDefinition("in^2", ("square_inch",), "area"),
        UnitDefinition("ft^2", ("square_foot",), "area"),
    ],
    "volume": [
        UnitDefinition("m^3", ("cubic_meter",), "volume"),
        UnitDefinition("cm^3", ("cubic_centimeter",), "volume"),
        UnitDefinition("mm^3", ("cubic_millimeter",), "volume"),
        UnitDefinition("L", ("liter", "litre"), "volume"),
        UnitDefinition("mL", ("milliliter",), "volume"),
    ],
    "mass": [
        UnitDefinition("kg", ("kilogram",), "mass"),
        UnitDefinition("g", ("gram",), "mass"),
        UnitDefinition("mg", ("milligram",), "mass"),
        UnitDefinition("tonne", ("t", "metric_ton"), "mass"),
        UnitDefinition("lb", ("pound", "lbm"), "mass"),
        UnitDefinition("oz", ("ounce",), "mass"),
    ],
    "density": [
        UnitDefinition("kg/m^3", (), "density"),
        UnitDefinition("g/cm^3", (), "density"),
        UnitDefinition("lb/ft^3", (), "density"),
    ],
    "time": [
        UnitDefinition("s", ("second",), "time"),
        UnitDefinition("ms", ("millisecond",), "time"),
        UnitDefinition("min", ("minute",), "time"),
        UnitDefinition("h", ("hour",), "time"),
        UnitDefinition("day", ("d",), "time"),
    ],
    "speed": [
        UnitDefinition("m/s", (), "speed"),
        UnitDefinition("km/h", (), "speed"),
        UnitDefinition("mph", (), "speed"),
        UnitDefinition("ft/s", (), "speed"),
    ],
    "acceleration": [
        UnitDefinition("m/s^2", (), "acceleration"),
        UnitDefinition("ft/s^2", (), "acceleration"),
        UnitDefinition("gal", ("Gal",), "acceleration"),
    ],
    "force": [
        UnitDefinition("N", ("newton",), "force"),
        UnitDefinition("kN", (), "force"),
        UnitDefinition("MN", (), "force"),
        UnitDefinition("lbf", (), "force"),
    ],
    "pressure": [
        UnitDefinition("Pa", ("pascal",), "pressure"),
        UnitDefinition("kPa", (), "pressure"),
        UnitDefinition("MPa", (), "pressure"),
        UnitDefinition("GPa", (), "pressure"),
        UnitDefinition("bar", (), "pressure"),
        UnitDefinition("psi", (), "pressure"),
        UnitDefinition("N/mm^2", (), "pressure"),
        UnitDefinition("ksi", (), "pressure"),
    ],
    "energy": [
        UnitDefinition("J", ("joule",), "energy"),
        UnitDefinition("kJ", (), "energy"),
        UnitDefinition("MJ", (), "energy"),
        UnitDefinition("Wh", (), "energy"),
        UnitDefinition("kWh", (), "energy"),
        UnitDefinition("kJ/mol", (), "molar_energy"),
        UnitDefinition("eV", (), "energy"),
    ],
    "power": [
        UnitDefinition("W", ("watt",), "power"),
        UnitDefinition("kW", (), "power"),
        UnitDefinition("MW", (), "power"),
        UnitDefinition("hp", ("horsepower",), "power"),
    ],
    "temperature": [
        UnitDefinition("K", ("kelvin",), "temperature"),
        UnitDefinition("degC", ("°C", "celsius"), "temperature"),
        UnitDefinition("degF", ("°F", "fahrenheit"), "temperature"),
    ],
    "electrical_resistivity": [
        UnitDefinition("Ω·m", ("ohm_meter",), "electrical_resistivity"),
        UnitDefinition("μΩ·cm", (), "electrical_resistivity"),
        UnitDefinition("S/m", ("siemens_per_meter",), "electrical_conductivity"),
    ],
    "thermal_conductivity": [
        UnitDefinition("W/m·K", ("W/m/K",), "thermal_conductivity"),
        UnitDefinition("BTU/(hr·ft·°F)", (), "thermal_conductivity"),
    ],
    "thermal_capacity": [
        UnitDefinition("J/kg/K", (), "specific_heat"),
        UnitDefinition("kJ/mol/K", (), "molar_heat_capacity"),
    ],
    "viscosity": [
        UnitDefinition("Pa·s", (), "dynamic_viscosity"),
        UnitDefinition("cP", ("centipoise",), "dynamic_viscosity"),
    ],
    "diffusion": [
        UnitDefinition("m^2/s", (), "diffusivity"),
        UnitDefinition("cm^2/s", (), "diffusivity"),
    ],
    "frequency": [
        UnitDefinition("Hz", ("hertz",), "frequency"),
        UnitDefinition("kHz", (), "frequency"),
        UnitDefinition("MHz", (), "frequency"),
    ],
    "angle": [
        UnitDefinition("rad", ("radian",), "angle"),
        UnitDefinition("deg", ("degree",), "angle"),
        UnitDefinition("grad", ("gon",), "angle"),
    ],
}

_SANITIZE_PATTERN = re.compile(r"\s+")
AVOGADRO = 6.022_140_76e23


class Converter:
    """High level conversion API used by the Flask blueprint."""

    def __init__(self) -> None:
        self.registry = get_registry()

    # ---- Listing helpers -------------------------------------------------
    def list_families(self) -> List[str]:
        return sorted(UNIT_FAMILIES.keys())

    def list_units(self, family: str) -> List[Dict[str, object]]:
        if family not in UNIT_FAMILIES:
            raise BadInputError(f"Unknown unit family '{family}'.")
        result: List[Dict[str, object]] = []
        for unit in UNIT_FAMILIES[family]:
            result.append(
                {
                    "symbol": unit.symbol,
                    "aliases": list(unit.aliases),
                    "dimension": unit.dimension,
                }
            )
        return result

    # ---- Conversion helpers ----------------------------------------------
    def convert(
        self,
        value: float | str,
        from_unit: str,
        to_unit: str,
        *,
        mode: str = "absolute",
    ) -> Dict[str, object]:
        numeric_value = self._coerce_value(value)
        source_unit = self._sanitize_unit(from_unit)
        target_unit = self._sanitize_unit(to_unit)
        quantity = self._create_quantity(numeric_value, source_unit, mode)
        try:
            converted = self._convert_quantity(
                quantity, self._adjust_for_mode(target_unit, mode)
            )
        except UndefinedUnitError as exc:  # pragma: no cover - defensive
            raise InvalidUnitError(str(exc)) from exc
        except DimensionalityError as exc:
            raise DimensionMismatchError(str(exc)) from exc
        base_quantity = quantity.to_base_units()
        return {
            "result": float(converted.magnitude),
            "unit": to_unit,
            "base": {
                "value": float(base_quantity.magnitude),
                "unit": f"{base_quantity.units}",
            },
        }

    def convert_expression(
        self, expression: str, target: Optional[str] = None
    ) -> Dict[str, object]:
        clean_expression, inferred_target = self._split_expression(expression)
        if target is None:
            target = inferred_target
        if not target:
            raise BadInputError(
                "Expression must include a 'to <unit>' clause or explicit target."
            )
        sanitized_target = self._sanitize_unit(target)
        try:
            quantity = self.registry.parse_expression(clean_expression)
        except UndefinedUnitError as exc:
            raise InvalidUnitError(str(exc)) from exc
        except DimensionalityError as exc:
            raise DimensionMismatchError(str(exc)) from exc
        try:
            converted = self._convert_quantity(quantity, sanitized_target)
        except UndefinedUnitError as exc:  # pragma: no cover - defensive
            raise InvalidUnitError(str(exc)) from exc
        except DimensionalityError as exc:
            raise DimensionMismatchError(str(exc)) from exc
        return {
            "result": float(converted.magnitude),
            "unit": target,
        }

    # ---- Internal utilities ----------------------------------------------
    def _coerce_value(self, value: float | str) -> float:
        if isinstance(value, (int, float)):
            if math.isnan(value) or math.isinf(value):
                raise BadInputError("Value must be a finite number.")
            return float(value)
        if not isinstance(value, str):
            raise BadInputError("Value must be a number or numeric string.")
        text = value.strip()
        if len(text) == 0 or len(text) > 64:
            raise BadInputError("Value string must be between 1 and 64 characters.")
        try:
            parsed = Decimal(text)
        except InvalidOperation as exc:
            raise BadInputError("Value is not a valid number.") from exc
        if parsed.is_nan() or parsed.is_infinite():
            raise BadInputError("Value must be a finite number.")
        return float(parsed)

    def _sanitize_unit(self, unit: str) -> str:
        if not isinstance(unit, str) or not unit.strip():
            raise InvalidUnitError("Unit symbol must be a non-empty string.")
        text = unit.strip()
        replacements = {
            "·": "*",
            "×": "*",
            "^": "**",
            "μ": "micro",
            "µ": "micro",
            "Ω": "ohm",
            "°": "deg",
        }
        for source, target in replacements.items():
            text = text.replace(source, target)
        text = _SANITIZE_PATTERN.sub("", text)
        return text

    def _create_quantity(self, value: float, unit: str, mode: str) -> Quantity:
        adjusted_unit = self._adjust_for_mode(unit, mode)
        try:
            unit_obj = self.registry.Unit(adjusted_unit)
        except UndefinedUnitError as exc:
            raise InvalidUnitError(str(exc)) from exc
        return value * unit_obj

    def _adjust_for_mode(self, unit: str, mode: str) -> str:
        if mode not in {"absolute", "interval"}:
            raise BadInputError("Mode must be 'absolute' or 'interval'.")
        if mode == "interval":
            return interval_unit(unit)
        return unit

    def _split_expression(self, expression: str) -> tuple[str, Optional[str]]:
        if not isinstance(expression, str) or not expression.strip():
            raise BadInputError("Expression must be a non-empty string.")
        text = expression.strip()
        text = text.replace("·", "*").replace("×", "*").replace("^", "**")
        lowered = text.lower()
        if " to " in lowered:
            idx = lowered.rfind(" to ")
            expr = text[:idx]
            target = text[idx + 4 :].strip()
            return expr, target
        return text, None

    def _convert_quantity(self, quantity: Quantity, target_unit: str) -> Quantity:
        try:
            return quantity.to(target_unit)
        except DimensionalityError:
            for context_name in ("chemistry",):
                try:
                    with self.registry.context(context_name):
                        return quantity.to(target_unit)
                except DimensionalityError:
                    continue
            custom = self._custom_conversion(quantity, target_unit)
            if custom is not None:
                return custom
            raise

    def _custom_conversion(
        self, quantity: Quantity, target_unit: str
    ) -> Optional[Quantity]:
        src_units = str(quantity.units)
        if "mole" in src_units and (
            "electron_volt" in target_unit or "eV" in target_unit
        ):
            base = quantity.to("joule / mole")
            joule_per_particle = base.magnitude / AVOGADRO
            electron_volt_joule = (
                self.registry.Quantity(1, "electron_volt").to("joule").magnitude
            )
            ev_value = joule_per_particle / electron_volt_joule
            return self.registry.Quantity(ev_value, "electron_volt").to(target_unit)
        if (
            "electron_volt" in src_units or "eV" in src_units
        ) and "mole" in target_unit:
            energy_ev = quantity.to("electron_volt")
            electron_volt_joule = (
                self.registry.Quantity(1, "electron_volt").to("joule").magnitude
            )
            joule_per_mole = energy_ev.magnitude * electron_volt_joule * AVOGADRO
            return self.registry.Quantity(joule_per_mole, "joule / mole").to(
                target_unit
            )
        return None


def format_value(
    value: float,
    *,
    sig_figs: Optional[int] = None,
    decimals: Optional[int] = None,
    notation: str = "auto",
) -> str:
    """Format a floating point number according to user preferences."""

    if decimals is not None:
        if decimals < 0:
            raise BadInputError("Decimal precision must be non-negative.")
        return f"{value:.{decimals}f}"
    if notation == "scientific":
        precision = sig_figs - 1 if sig_figs else 6
        precision = max(0, precision)
        return f"{value:.{precision}e}"
    if notation == "engineering":
        if value == 0:
            return "0"
        exponent = int(math.floor(math.log10(abs(value)) / 3) * 3)
        scaled = value / (10**exponent)
        precision = sig_figs - 1 if sig_figs else 6
        formatted = f"{scaled:.{max(0, precision)}f}"
        formatted = formatted.rstrip("0").rstrip(".")
        return f"{formatted}e{exponent:+}"
    if sig_figs is not None:
        if sig_figs <= 0:
            raise BadInputError("Significant figures must be positive.")
        return _format_sig_figs(value, sig_figs)
    return f"{value:.15g}"


def _format_sig_figs(value: float, sig_figs: int) -> str:
    if value == 0:
        return "0" if sig_figs == 1 else "0." + "0" * (sig_figs - 1)
    magnitude = int(math.floor(math.log10(abs(value))))
    digits = sig_figs - 1 - magnitude
    with localcontext() as ctx:
        ctx.rounding = ROUND_HALF_UP
        ctx.prec = sig_figs + 2
        decimal_value = Decimal(str(value))
        rounded = (
            decimal_value.scaleb(digits)
            .to_integral_value(rounding=ROUND_HALF_UP)
            .scaleb(-digits)
        )
    if -4 <= magnitude < sig_figs:
        fmt_digits = max(digits, 0)
        return (
            f"{float(rounded):.{fmt_digits}f}"
            if fmt_digits > 0
            else f"{float(rounded):.0f}"
        )
    return f"{float(rounded):.{sig_figs - 1}e}"


__all__ = [
    "Converter",
    "ConversionError",
    "InvalidUnitError",
    "DimensionMismatchError",
    "BadInputError",
    "UnitDefinition",
    "UNIT_FAMILIES",
    "format_value",
]
