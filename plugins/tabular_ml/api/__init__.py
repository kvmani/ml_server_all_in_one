"""Expose the Tabular ML blueprint to the application."""

from ..backend.routes import bp

blueprints = [bp]

__all__ = ["bp", "blueprints"]
