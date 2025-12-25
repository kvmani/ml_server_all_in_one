"""Development entry point."""

import os

from app import create_app


def _resolve_port() -> int:
    value = os.getenv("ML_SERVER_AIO_PORT") or os.getenv("PORT") or "5001"
    try:
        return int(value)
    except ValueError as exc:
        raise SystemExit(
            f"Invalid port '{value}'. Set ML_SERVER_AIO_PORT to a number."
        ) from exc


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=_resolve_port(), debug=False)
