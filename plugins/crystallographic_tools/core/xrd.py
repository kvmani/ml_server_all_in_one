"""Powder XRD calculations using pymatgen."""

from __future__ import annotations

from typing import List

import numpy as np
from pymatgen.analysis.diffraction.xrd import XRDCalculator
from pymatgen.core import Structure


def compute_xrd_peaks(
    structure: Structure,
    *,
    radiation: str = "CuKa",
    tth_min: float = 10.0,
    tth_max: float = 80.0,
    tth_step: float = 0.02,
) -> dict:
    """Compute powder XRD peaks and a simple broadened spectrum."""

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

    # Build a lightly broadened curve for plotting as a spectrum.
    xs = np.arange(tth_min, tth_max + tth_step, tth_step)
    sigma = 0.2 / (2 * np.sqrt(2 * np.log(2)))  # approximate FWHM 0.2°
    ys = np.zeros_like(xs)
    for peak in peaks:
        center = peak["two_theta"]
        amp = peak["intensity"]
        ys += amp * np.exp(-0.5 * ((xs - center) / sigma) ** 2)

    # Normalise intensities for plotting
    max_int = float(np.max(ys)) if np.any(ys) else 1.0
    curve = [
        {"two_theta": float(x), "intensity": float((y / max_int) * 100.0)}
        for x, y in zip(xs, ys)
    ]

    # Scale peak intensities to the same 0-100 range for stem heights
    for peak in peaks:
        peak["intensity_normalized"] = (peak["intensity"] / max_int) * 100.0 if max_int else 0.0

    return {
        "peaks": peaks,
        "curve": curve,
        "range": {"min": tth_min, "max": tth_max},
    }


__all__ = ["compute_xrd_peaks"]
