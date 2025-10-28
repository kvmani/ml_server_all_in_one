"""Configuration classes for the Flask application."""

from __future__ import annotations

import os
from pathlib import Path


class BaseConfig:
    SECRET_KEY = os.environ.get("ML_SERVER_SECRET", "offline-secret")
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25 MiB
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Strict"
    UPLOAD_TMPFS_ROOT = Path("/dev/shm/ml_server_aio")
    RESPONSE_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
    }


class TestingConfig(BaseConfig):
    TESTING = True


__all__ = ["BaseConfig", "TestingConfig"]
