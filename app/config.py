"""Configuration classes for the Flask application."""

from __future__ import annotations

import os
import secrets
from pathlib import Path


def _load_secret() -> str:
    """Return the Flask secret key for the current process."""

    secret = os.environ.get("ML_SERVER_SECRET")
    if secret:
        return secret
    # Generate an unpredictable per-process key for local development.
    return secrets.token_urlsafe(64)


class BaseConfig:
    SECRET_KEY = _load_secret()
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25 MiB
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Strict"
    UPLOAD_TMPFS_ROOT = Path("/dev/shm/ml_server_aio")
    RESPONSE_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "img-src 'self' data: blob:; "
            "frame-src 'self' blob:; "
            "object-src 'none'; "
            "frame-ancestors 'none'"
        ),
        "Referrer-Policy": "no-referrer",
    }


class TestingConfig(BaseConfig):
    TESTING = True


__all__ = ["BaseConfig", "TestingConfig"]
