"""Blueprint registration helpers."""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Iterable

from flask import Flask


def _iter_blueprints(package: str = "plugins") -> Iterable:
    module_path = Path(__file__).resolve().parent.parent / package
    if not module_path.exists():
        return []
    blueprints = []
    for module_info in pkgutil.iter_modules([str(module_path)]):
        if not module_info.ispkg:
            continue
        dotted = f"{package}.{module_info.name}.api"
        module = importlib.import_module(dotted)
        module_blueprints = getattr(module, "blueprints", None)
        if module_blueprints:
            blueprints.extend(module_blueprints)
            continue
        blueprint = getattr(module, "bp", None)
        if blueprint is not None:
            blueprints.append(blueprint)
    return blueprints


def register_plugin_blueprints(app: Flask) -> None:
    for bp in _iter_blueprints():
        app.register_blueprint(bp)


__all__ = ["register_plugin_blueprints"]
