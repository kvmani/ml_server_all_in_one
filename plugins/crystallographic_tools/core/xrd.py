"""Powder XRD calculations using pymatgen."""

from __future__ import annotations

from typing import List

from pymatgen.analysis.diffraction.xrd import XRDCalculator
from pymatgen.core import Structure


def compute_xrd_peaks(
    structure: Structure,
    *,
    radiation: str = "CuKa",
    tth_min: float = 10.0,
    tth_max: float = 80.0,
    tth_step: float = 0.02,
) -> List[dict]:
    """Compute powder XRD peaks for a structure."""

    calculator = XRDCalculator(wavelength=radiation or "CuKa")
    pattern = calculator.get_pattern(
        structure,
        two_theta_range=(tth_min, tth_max),
    )
    peaks: List[dict] = []
    for i, two_theta in enumerate(pattern.x):
        peaks.append(
            {
                "two_theta": float(two_theta),
                "intensity": float(pattern.y[i]),
                "d_spacing": float(pattern.d_hkls[i]),
                "hkl": pattern.hkls[i][0]["hkl"] if pattern.hkls[i] else [],
            }
        )
    return peaks


__all__ = ["compute_xrd_peaks"]
