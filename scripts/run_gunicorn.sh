#!/usr/bin/env bash
set -euo pipefail

export FLASK_APP=app:create_app
gunicorn "app:create_app()" --bind 0.0.0.0:5000 --workers 2 --timeout 60
