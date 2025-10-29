"""Facade for the unit converter core utilities."""

from __future__ import annotations

from functools import lru_cache
from typing import Dict, List, Optional

from .converter import (
    BadInputError,
    ConversionError,
    Converter,
    DimensionMismatchError,
    InvalidUnitError,
    UNIT_FAMILIES,
    format_value,
)


@lru_cache(maxsize=1)
def _converter() -> Converter:
    return Converter()


def list_families() -> List[str]:
    """Return the supported unit families."""

    return _converter().list_families()


def list_units(family: str) -> List[Dict[str, object]]:
    """Return metadata for the units belonging to ``family``."""

    return _converter().list_units(family)


def convert(
    value: float | str,
    from_unit: str,
    to_unit: str,
    *,
    mode: str = "absolute",
    sig_figs: Optional[int] = None,
    decimals: Optional[int] = None,
    notation: str = "auto",
) -> Dict[str, object]:
    """Convert ``value`` between units and format the result."""

    result = _converter().convert(value, from_unit, to_unit, mode=mode)
    formatted = format_value(
        result["result"], sig_figs=sig_figs, decimals=decimals, notation=notation
    )
    return {
        "value": result["result"],
        "unit": result["unit"],
        "formatted": formatted,
        "base": result["base"],
    }


def convert_expression(
    expression: str,
    *,
    target: Optional[str] = None,
    sig_figs: Optional[int] = None,
    decimals: Optional[int] = None,
    notation: str = "auto",
) -> Dict[str, object]:
    """Evaluate an arbitrary unit expression and format the result."""

    result = _converter().convert_expression(expression, target=target)
    formatted = format_value(
        result["result"], sig_figs=sig_figs, decimals=decimals, notation=notation
    )
    return {"value": result["result"], "unit": result["unit"], "formatted": formatted}


__all__ = [
    "BadInputError",
    "ConversionError",
    "DimensionMismatchError",
    "InvalidUnitError",
    "list_families",
    "list_units",
    "convert",
    "convert_expression",
]
