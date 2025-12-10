"""Atomic radius helpers for crystal viewer payloads."""

from __future__ import annotations

from functools import lru_cache
from typing import Dict

from pymatgen.core.periodic_table import Element


@lru_cache(maxsize=1)
def covalent_radii_map() -> Dict[str, float]:
    """
    Return a mapping of element symbol to a representative atomic radius (Å).

    The values are sourced from :mod:`pymatgen` element metadata. We prefer
    covalent radii when available, falling back to atomic radii to maximise
    coverage without introducing new external dependencies or disk I/O.
    """

    radii: Dict[str, float] = {}
    for atomic_number in range(1, 96):  # cover the common periodic table set
        element = Element.from_Z(atomic_number)
        radius = (
            getattr(element, "covalent_radius", None)
            or getattr(element, "atomic_radius", None)
            or getattr(element, "atomic_radius_calculated", None)
        )
        if radius:
            radii[element.symbol] = float(radius)
    return radii


__all__ = ["covalent_radii_map"]
