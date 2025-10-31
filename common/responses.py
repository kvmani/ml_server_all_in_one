"""Standardized JSON response helpers."""

from __future__ import annotations

from typing import Any, Mapping

from flask import Response, jsonify

from .errors import AppError


def ok(data: Any, *, status: int = 200) -> Response:
    """Return a success envelope."""

    payload = {"success": True, "data": data}
    response = jsonify(payload)
    response.status_code = status
    return response


def fail(error: AppError | Mapping[str, Any], *, status: int | None = None) -> Response:
    """Return a standardized failure envelope."""

    if isinstance(error, AppError):
        payload = {"success": False, "error": error.to_dict()}
        response = jsonify(payload)
        response.status_code = status or error.status_code
        return response

    payload = {"success": False, "error": dict(error)}
    response = jsonify(payload)
    response.status_code = status or 400
    return response


__all__ = ["ok", "fail"]
