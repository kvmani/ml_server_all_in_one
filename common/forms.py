"""Form value parsing helpers shared across plugins."""

from __future__ import annotations

from typing import Mapping, Any

from .validate import ValidationError


FormDataLike = Mapping[str, Any] | Any


def _lookup(data: FormDataLike, key: str) -> Any:
    if data is None:
        return None
    getter = getattr(data, "get", None)
    if callable(getter):
        return getter(key)
    return data[key] if isinstance(data, Mapping) and key in data else None


def get_float(
    data: FormDataLike,
    key: str,
    default: float,
    *,
    field_name: str | None = None,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    """Extract a float from *data* with validation.

    Missing or blank values fall back to ``default``. ``minimum`` and
    ``maximum`` bounds are optional and inclusive.
    """

    field_label = field_name or key
    raw = _lookup(data, key)
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        value = default
    else:
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"Invalid value for {field_label}") from exc

    if minimum is not None and value < minimum:
        raise ValidationError(f"{field_label} must be ≥ {minimum}")
    if maximum is not None and value > maximum:
        raise ValidationError(f"{field_label} must be ≤ {maximum}")

    return value


def get_int(
    data: FormDataLike,
    key: str,
    default: int,
    *,
    field_name: str | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    """Extract an integer from *data* with validation."""

    value = int(
        round(
            get_float(
                data,
                key,
                float(default),
                field_name=field_name,
                minimum=float(minimum) if minimum is not None else None,
                maximum=float(maximum) if maximum is not None else None,
            )
        )
    )

    if minimum is not None and value < minimum:
        raise ValidationError(f"{field_name or key} must be ≥ {minimum}")
    if maximum is not None and value > maximum:
        raise ValidationError(f"{field_name or key} must be ≤ {maximum}")

    return value


def get_bool(
    data: FormDataLike,
    key: str,
    default: bool = False,
    *,
    truthy: tuple[str, ...] = ("1", "true", "on", "yes"),
) -> bool:
    """Extract a boolean flag from *data*."""

    raw = _lookup(data, key)
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        return raw.strip().lower() in truthy
    return default


__all__ = ["get_float", "get_int", "get_bool"]
