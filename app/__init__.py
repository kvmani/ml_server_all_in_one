"""Application factory for the ML Server All-In-One platform."""

from __future__ import annotations

import importlib
import pkgutil
import json
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import yaml
from flask import Flask, render_template, request, url_for

from . import config as config_module
from .blueprints import register_plugin_blueprints

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yml"
MANIFEST_PATH = Path(__file__).resolve().parent / "ui" / "static" / "react" / "manifest.json"


def _append_theme_param(url: str, theme: str, host: str | None = None) -> str:
    if not url or not theme:
        return url
    try:
        parsed = urlsplit(url)
    except ValueError:
        return url
    if parsed.scheme and parsed.netloc and host and parsed.netloc != host:
        return url
    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    query = dict(query_pairs)
    query["theme"] = theme
    new_query = urlencode(query, doseq=True)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))


def _load_vite_manifest() -> dict:
    manifest_path = MANIFEST_PATH
    if not manifest_path.exists():
        alt_path = MANIFEST_PATH.parent / ".vite" / "manifest.json"
        if alt_path.exists():
            manifest_path = alt_path
        else:
            return {}
    try:
        with manifest_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return {}


def _resolve_assets(manifest: dict) -> dict:
    if not manifest:
        return {"scripts": [], "styles": [], "preload": []}
    entry = None
    for item in manifest.values():
        if isinstance(item, dict) and item.get("isEntry"):
            entry = item
            break
    if not entry:
        return {"scripts": [], "styles": [], "preload": []}
    base = "/static/react/"
    styles = [base + path for path in entry.get("css", [])]
    scripts = [base + entry["file"]]
    preload: list[str] = []
    for imported in entry.get("imports", []):
        chunk = manifest.get(imported)
        if not chunk:
            continue
        preload.append(base + chunk.get("file", ""))
        for css_path in chunk.get("css", []):
            styles.append(base + css_path)
    return {"scripts": scripts, "styles": styles, "preload": preload}


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

    manifest_data = _load_vite_manifest()
    assets = _resolve_assets(manifest_data)
    app.extensions["react_assets"] = assets

    def _theme_state() -> tuple[dict, str, str]:
        site_config = app.config.get("SITE_SETTINGS", {})
        themes = dict(site_config.get("themes", {}) or {})
        if not themes:
            themes = {"midnight": {"label": "Midnight"}}
        default_theme = site_config.get("default_theme")
        if not default_theme or default_theme not in themes:
            default_theme = next(iter(themes.keys()))
        requested = request.args.get("theme")
        current_theme = requested if requested in themes else default_theme
        return themes, default_theme, current_theme

    def _apply_theme(url: str, theme: str) -> str:
        return _append_theme_param(url, theme, request.host)

    def _prepare_manifests(theme: str) -> list[dict]:
        manifests: list[dict] = []
        for manifest in app.config.get("PLUGIN_MANIFESTS", []):
            entry = dict(manifest)
            blueprint = entry.get("blueprint")
            if blueprint:
                entry["href"] = _apply_theme(url_for(f"{blueprint}.index"), theme)
            docs = entry.get("docs")
            if docs:
                entry["docs"] = _apply_theme(docs, theme)
            manifests.append(entry)
        return manifests

    def _render_react_page(page: str, props: dict | None = None, status: int = 200):
        themes, default_theme, current_theme = _theme_state()
        manifests = _prepare_manifests(current_theme)
        site_config = app.config.get("SITE_SETTINGS", {})
        state = {
            "page": page,
            "currentTheme": current_theme,
            "defaultTheme": default_theme,
            "themeOptions": themes,
            "siteSettings": site_config,
            "manifests": manifests,
            "props": props or {},
        }
        assets_map = app.extensions.get("react_assets", {"scripts": [], "styles": [], "preload": []})
        return (
            render_template(
                "react_app.html",
                assets=assets_map,
                initial_state=state,
                current_theme=current_theme,
                theme_options=themes,
                site_settings=site_config,
                assets_built=bool(assets_map.get("scripts")),
            ),
            status,
        )

    app.extensions["theme_state"] = _theme_state
    app.extensions["theme_url"] = _apply_theme
    app.extensions["render_react"] = _render_react_page

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
        themes, default_theme, current_theme = _theme_state()
        help_overview = site_config.get("help_overview")
        nav_plugins = _prepare_manifests(current_theme)
        return {
            "nav_plugins": nav_plugins,
            "site_settings": site_config,
            "theme_options": themes,
            "current_theme": current_theme,
            "default_theme": default_theme,
            "help_overview": help_overview,
            "plugin_settings_map": app.config.get("PLUGIN_SETTINGS", {}),
        }

    @app.route("/")
    def home() -> str:
        _, _, current_theme = _theme_state()
        manifests = _prepare_manifests(current_theme)
        return _render_react_page("home", {"plugins": manifests})

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
