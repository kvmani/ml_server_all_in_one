"""Composition conversion logic for the Scientific Calculator plugin."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal


class CompositionConversionError(ValueError):
    """Raised when composition conversion input is invalid."""


ElementRole = Literal["normal", "balance"]
ConversionMode = Literal["mass_to_atomic", "atomic_to_mass"]


_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "atomic_weights.json"


def _normalize_symbol(symbol: str) -> str:
    symbol = symbol.strip()
    if not symbol:
        raise CompositionConversionError("Element symbol is required")
    if len(symbol) == 1:
        return symbol.upper()
    return symbol[0].upper() + symbol[1:].lower()


@dataclass(frozen=True)
class ElementSpec:
    """User supplied element entry."""

    symbol: str
    role: ElementRole = "normal"
    input_percent: float | None = None


@dataclass(frozen=True)
class ElementResult:
    """Normalized composition output for a single element."""

    symbol: str
    role: ElementRole
    input_percent: float
    output_percent: float
    atomic_weight: float


class _AtomicData:
    def __init__(self) -> None:
        try:
            data = json.loads(_DATA_PATH.read_text())
        except FileNotFoundError as exc:  # pragma: no cover - defensive
            raise CompositionConversionError("Atomic weight table is missing") from exc
        self._weights: dict[str, float] = {}
        self._records: list[dict[str, object]] = []
        for record in data:
            symbol = str(record.get("symbol", "")).strip()
            weight = record.get("atomic_weight")
            if not symbol or not isinstance(weight, (int, float)):
                continue
            canonical_symbol = _normalize_symbol(symbol)
            self._weights[canonical_symbol] = float(weight)
            self._records.append(
                {
                    "symbol": canonical_symbol,
                    "name": record.get("name", ""),
                    "atomic_number": record.get("atomic_number"),
                    "atomic_weight": float(weight),
                }
            )

    @property
    def weights(self) -> dict[str, float]:
        return self._weights

    @property
    def records(self) -> list[dict[str, object]]:
        return list(self._records)


_atomic_data = _AtomicData()


def list_elements() -> list[dict[str, object]]:
    """Return the available element metadata for UI clients."""

    return _atomic_data.records


def _resolve_inputs(elements: Iterable[ElementSpec]) -> list[ElementSpec]:
    normalized: list[ElementSpec] = []
    balance_entries = 0
    for item in elements:
        symbol = _normalize_symbol(item.symbol)
        role: ElementRole = item.role if item.role in ("normal", "balance") else "normal"
        percent = item.input_percent
        if percent is not None and not isinstance(percent, (int, float)):
            raise CompositionConversionError("input_percent must be numeric")
        if percent is not None and percent < 0:
            raise CompositionConversionError("Percent values must be non-negative")
        if role == "balance":
            balance_entries += 1
        normalized.append(ElementSpec(symbol=symbol, role=role, input_percent=percent))
    if not normalized:
        raise CompositionConversionError("At least one element is required")
    if balance_entries > 1:
        raise CompositionConversionError("Only one balance element is allowed")
    return normalized


def _resolve_balance(elements: list[ElementSpec]) -> list[ElementSpec]:
    total = 0.0
    balance_index = None
    for idx, item in enumerate(elements):
        if item.role == "balance":
            balance_index = idx
        elif item.input_percent is None:
            raise CompositionConversionError("All non-balance rows require an input percent")
        else:
            total += float(item.input_percent)
    if balance_index is None:
        return elements
    remaining = 100.0 - total
    if remaining < 0:
        raise CompositionConversionError("Input percentages exceed 100% before balance")
    balanced = list(elements)
    balanced[balance_index] = ElementSpec(
        symbol=elements[balance_index].symbol,
        role="balance",
        input_percent=remaining,
    )
    return balanced


def convert_composition(mode: ConversionMode, elements: Iterable[ElementSpec]):
    normalized = _resolve_inputs(elements)
    resolved = _resolve_balance(normalized)

    weights = _atomic_data.weights

    input_values: list[tuple[ElementSpec, float, float]] = []  # (spec, percent, weight)
    for item in resolved:
        weight = weights.get(item.symbol)
        if weight is None:
            raise CompositionConversionError(f"Unknown element symbol '{item.symbol}'")
        if item.input_percent is None:
            raise CompositionConversionError("input_percent is required")
        input_values.append((item, float(item.input_percent), weight))

    input_sum = sum(percent for _, percent, _ in input_values)
    warnings: list[str] = []
    if abs(input_sum - 100.0) > 1e-6:
        warnings.append("Input does not sum to 100%; results are normalized.")

    results: list[ElementResult] = []
    if mode == "mass_to_atomic":
        moles = [percent / weight for _, percent, weight in input_values]
        total_moles = sum(moles)
        if total_moles <= 0:
            raise CompositionConversionError("Total moles must be positive")
        for (spec, percent, weight), mol in zip(input_values, moles):
            output_percent = (mol / total_moles) * 100.0
            results.append(
                ElementResult(
                    symbol=spec.symbol,
                    role=spec.role,
                    input_percent=percent,
                    output_percent=output_percent,
                    atomic_weight=weight,
                )
            )
    elif mode == "atomic_to_mass":
        fractions = [percent / 100.0 for _, percent, _ in input_values]
        mass_terms = [frac * weight for frac, (_, _, weight) in zip(fractions, input_values)]
        total_mass = sum(mass_terms)
        if total_mass <= 0:
            raise CompositionConversionError("Total mass must be positive")
        for (spec, percent, weight), mass in zip(input_values, mass_terms):
            output_percent = (mass / total_mass) * 100.0
            results.append(
                ElementResult(
                    symbol=spec.symbol,
                    role=spec.role,
                    input_percent=percent,
                    output_percent=output_percent,
                    atomic_weight=weight,
                )
            )
    else:
        raise CompositionConversionError("mode must be 'mass_to_atomic' or 'atomic_to_mass'")

    output_sum = sum(item.output_percent for item in results)

    return {
        "mode": mode,
        "elements": [
            {
                "symbol": item.symbol,
                "role": item.role,
                "input_percent": item.input_percent,
                "output_percent": item.output_percent,
                "atomic_weight": item.atomic_weight,
            }
            for item in results
        ],
        "input_sum": input_sum,
        "output_sum": output_sum,
        "warnings": warnings,
    }


__all__ = [
    "CompositionConversionError",
    "ElementRole",
    "ConversionMode",
    "ElementSpec",
    "ElementResult",
    "list_elements",
    "convert_composition",
]
