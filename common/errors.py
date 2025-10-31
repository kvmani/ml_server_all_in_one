"""Common error types and helpers for API responses."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping


@dataclass(slots=True)
class AppError(Exception):
    """Base application error with a JSON friendly payload."""

    message: str
    code: str = "error"
    status_code: int = 400
    details: Mapping[str, Any] | None = None

    def to_dict(self) -> Mapping[str, Any]:
        payload: MutableMapping[str, Any] = {
            "code": self.code,
            "message": self.message,
            "details": dict(self.details or {}),
        }
        return payload


@dataclass(slots=True)
class ValidationAppError(AppError):
    """Error raised for invalid user input."""

    code: str = "validation_error"
    status_code: int = 400


@dataclass(slots=True)
class NotFoundAppError(AppError):
    """Error raised when a resource is missing."""

    code: str = "not_found"
    status_code: int = 404


@dataclass(slots=True)
class InternalAppError(AppError):
    """Generic internal error wrapper to avoid leaking implementation details."""

    code: str = "internal_error"
    status_code: int = 500


def ensure_app_error(error: AppError | Exception, *, fallback_code: str) -> AppError:
    """Coerce arbitrary exceptions into :class:`AppError` instances."""

    if isinstance(error, AppError):
        return error
    return InternalAppError(code=fallback_code, message=str(error))


__all__ = [
    "AppError",
    "ValidationAppError",
    "NotFoundAppError",
    "InternalAppError",
    "ensure_app_error",
]
