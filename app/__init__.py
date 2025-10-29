"""Application factory for the ML Server All-In-One platform."""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Iterable

import yaml
from flask import Flask, render_template, request

from . import config as config_module
from .blueprints import register_plugin_blueprints

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yml"


def _load_yaml_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _discover_plugins(package: str = "plugins") -> Iterable[str]:
    """Yield import paths for all plugin packages."""

    package_path = Path(__file__).resolve().parent.parent / package
    if not package_path.exists():
        return []
    for module_info in pkgutil.iter_modules([str(package_path)]):
        if module_info.ispkg:
            yield f"{package}.{module_info.name}"


def _load_manifests() -> list[dict[str, str]]:
    manifests: list[dict[str, str]] = []
    for dotted in _discover_plugins():
        module = importlib.import_module(dotted)
        manifest = getattr(module, "manifest", None)
        if manifest:
            manifests.append(manifest)
    manifests.sort(key=lambda item: item["title"].lower())
    return manifests


def create_app(config_name: str | None = None) -> Flask:
    """Create and configure the Flask application instance."""

    app = Flask(__name__, static_folder="ui/static", template_folder="ui/templates")
    app.config.from_object(config_module.BaseConfig)

    yaml_config = _load_yaml_config()
    site_settings = yaml_config.get("site", {})
    plugin_settings = yaml_config.get("plugins", {})

    if site_settings:
        app.config["SITE_SETTINGS"] = site_settings
        if "max_content_length_mb" in site_settings:
            try:
                max_bytes = int(float(site_settings["max_content_length_mb"]) * 1024 * 1024)
                app.config["MAX_CONTENT_LENGTH"] = max_bytes
            except (TypeError, ValueError):
                pass
    else:
        app.config["SITE_SETTINGS"] = {}

    app.config["PLUGIN_SETTINGS"] = plugin_settings

    if config_name:
        config_obj = getattr(config_module, config_name, None)
        if config_obj:
            app.config.from_object(config_obj)

    register_plugin_blueprints(app)

    @app.after_request
    def apply_response_headers(response):
        """Attach strict security headers to every outgoing response."""

        configured = app.config.get("RESPONSE_HEADERS", {})
        for header, value in configured.items():
            if header not in response.headers:
                response.headers[header] = value
        return response

    manifests = _load_manifests()
    for manifest in manifests:
        blueprint = manifest.get("blueprint")
        plugin_config = plugin_settings.get(blueprint, {}) if blueprint else {}
        if plugin_config.get("docs"):
            manifest["docs"] = plugin_config["docs"]
        if plugin_config.get("summary"):
            manifest["summary"] = plugin_config["summary"]
    app.config["PLUGIN_MANIFESTS"] = manifests

    @app.context_processor
    def inject_navigation():
        site_config = app.config.get("SITE_SETTINGS", {})
        themes = site_config.get("themes", {})
        default_theme = site_config.get("default_theme") or next(iter(themes.keys()), "midnight")
        requested = request.args.get("theme")
        current_theme = requested if requested in themes else default_theme
        help_overview = site_config.get("help_overview")
        return {
            "nav_plugins": app.config.get("PLUGIN_MANIFESTS", []),
            "site_settings": site_config,
            "theme_options": themes,
            "current_theme": current_theme,
            "default_theme": default_theme,
            "help_overview": help_overview,
            "plugin_settings_map": app.config.get("PLUGIN_SETTINGS", {}),
        }

    @app.route("/")
    def home() -> str:
        return render_template("home.html", plugins=app.config["PLUGIN_MANIFESTS"])

    @app.route("/help/<slug>")
    def help_page(slug: str) -> str:
        template_name = f"help/{slug}.html"
        template_root = Path(app.root_path) / (app.template_folder or "")
        template_path = template_root / template_name
        if not template_path.exists():
            return render_template("errors/400.html"), 404
        plugin_config = app.config.get("PLUGIN_SETTINGS", {}).get(slug, {})
        return render_template(template_name, plugin_settings=plugin_config)

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
