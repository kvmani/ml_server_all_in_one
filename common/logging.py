"""Logging helpers with request correlation."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from flask import Flask, g, request

DEFAULT_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def get_logger(name: str = "ml_server_aio") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(DEFAULT_FORMAT))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


def _request_context() -> dict[str, Any]:
    return {
        "request_id": getattr(g, "request_id", "-"),
        "path": request.path,
        "method": request.method,
    }


def install_request_logging(app: Flask) -> None:
    logger = get_logger()

    @app.before_request
    def _begin_request() -> None:  # pragma: no cover - flask hooks
        g.request_id = uuid.uuid4().hex
        g.request_started = time.perf_counter()

    @app.after_request
    def _after_request(response):  # pragma: no cover - flask hooks
        duration_ms = 0.0
        if hasattr(g, "request_started"):
            duration_ms = (time.perf_counter() - g.request_started) * 1000
        logger.info(
            "handled request",
            extra={
                **_request_context(),
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        response.headers.setdefault("X-Request-ID", getattr(g, "request_id", ""))
        return response

    @app.teardown_request
    def _teardown_request(exc):  # pragma: no cover - flask hooks
        if exc is not None:
            logger.exception("request error", extra=_request_context())


__all__ = ["get_logger", "install_request_logging"]
