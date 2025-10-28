"""Application factory for the ML Server All-In-One platform."""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Iterable

from flask import Flask, render_template

from . import config as config_module
from .blueprints import register_plugin_blueprints


def _discover_plugins(package: str = "plugins") -> Iterable[str]:
    """Yield import paths for all plugin packages."""

    package_path = Path(__file__).resolve().parent.parent / package
    if not package_path.exists():
        return []
    for module_info in pkgutil.iter_modules([str(package_path)]):
        if module_info.ispkg:
            yield f"{package}.{module_info.name}"


def create_app(config_name: str | None = None) -> Flask:
    """Create and configure the Flask application instance."""

    app = Flask(__name__, static_folder="ui/static", template_folder="ui/templates")
    app.config.from_object(config_module.BaseConfig)

    if config_name:
        config_obj = getattr(config_module, config_name, None)
        if config_obj:
            app.config.from_object(config_obj)

    register_plugin_blueprints(app)

    @app.route("/")
    def home() -> str:
        plugins = []
        for dotted in _discover_plugins():
            module = importlib.import_module(dotted)
            manifest = getattr(module, "manifest", None)
            if manifest:
                plugins.append(manifest)
        plugins.sort(key=lambda item: item["title"].lower())
        return render_template("home.html", plugins=plugins)

    @app.errorhandler(400)
    def bad_request(error):  # pragma: no cover - simple template rendering
        return render_template("errors/400.html"), 400

    @app.errorhandler(413)
    def payload_too_large(error):  # pragma: no cover
        return render_template("errors/413.html"), 413

    @app.errorhandler(500)
    def server_error(error):  # pragma: no cover
        return render_template("errors/500.html"), 500

    return app


__all__ = ["create_app"]
