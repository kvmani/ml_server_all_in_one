"""Powder XRD calculations using pymatgen following the design doc."""

from __future__ import annotations

from dataclasses import dataclass
from math import cos, radians, sin, sqrt, tan
from typing import Iterable, List

import numpy as np
from pymatgen.analysis.diffraction.xrd import XRDCalculator
from pymatgen.core import Structure


@dataclass(slots=True)
class XrdInstrumentConfig:
    """Instrument settings for the forward XRD model."""

    radiation: str = "CuKa"
    wavelength_angstrom: float | None = None
    geometry: str = "bragg_brentano"
    polarization_ratio: float | None = 0.5

    @classmethod
    def from_payload(cls, payload: dict | None) -> "XrdInstrumentConfig":
        payload = payload or {}
        geometry = (payload.get("geometry") or "bragg_brentano").lower()
        return cls(
            radiation=payload.get("radiation") or "CuKa",
            wavelength_angstrom=float(payload["wavelength_angstrom"])
            if payload.get("wavelength_angstrom")
            else None,
            geometry=geometry if geometry in {"bragg_brentano", "transmission"} else "bragg_brentano",
            polarization_ratio=float(payload["polarization_ratio"])
            if payload.get("polarization_ratio") is not None
            else 0.5,
        )

    @property
    def wavelength(self) -> float | str:
        return self.wavelength_angstrom if self.wavelength_angstrom else self.radiation


@dataclass(slots=True)
class XrdRangeConfig:
    two_theta_min: float = 10.0
    two_theta_max: float = 80.0
    two_theta_step: float = 0.02

    @classmethod
    def from_payload(cls, payload: dict | None) -> "XrdRangeConfig":
        payload = payload or {}
        return cls(
            two_theta_min=float(payload.get("min", 10.0)),
            two_theta_max=float(payload.get("max", 80.0)),
            two_theta_step=float(payload.get("step", 0.02)),
        )


@dataclass(slots=True)
class PeakProfile:
    """Gaussian/pseudo-Voigt width parameterization using the Caglioti model."""

    u: float = 0.02
    v: float = 0.0
    w: float = 0.1
    profile: str = "gaussian"

    @classmethod
    def from_payload(cls, payload: dict | None) -> "PeakProfile":
        payload = payload or {}
        profile = (payload.get("profile") or "gaussian").lower()
        return cls(
            u=float(payload.get("u", 0.02)),
            v=float(payload.get("v", 0.0)),
            w=float(payload.get("w", 0.1)),
            profile=profile if profile in {"gaussian", "pseudo_voigt"} else "gaussian",
        )

    def fwhm(self, theta_rad: float) -> float:
        return sqrt(max(self.u * tan(theta_rad) ** 2 + self.v * tan(theta_rad) + self.w, 1e-6))


def _lorentz_polarization_factor(theta_rad: float, polarization_ratio: float | None, geometry: str) -> float:
    lorentz = 1 / max(sin(theta_rad) ** 2 * cos(theta_rad), 1e-9)
    ratio = polarization_ratio if polarization_ratio is not None else 0.5
    polarization = (1 + ratio * cos(2 * theta_rad) ** 2) / (1 + ratio)
    if geometry == "transmission":
        lorentz = 1 / max(sin(theta_rad) ** 2, 1e-9)
    return lorentz * polarization


def _gaussian_profile(xs: Iterable[float], center: float, amplitude: float, fwhm_deg: float) -> np.ndarray:
    sigma = fwhm_deg / (2 * sqrt(2 * np.log(2)))
    return amplitude * np.exp(-0.5 * ((np.asarray(xs) - center) / sigma) ** 2)


def compute_xrd_peaks(
    structure: Structure,
    *,
    radiation: str = "CuKa",
    tth_min: float = 10.0,
    tth_max: float = 80.0,
    tth_step: float = 0.02,
) -> dict:
    """Backward-compatible wrapper for legacy callers."""

    return compute_xrd_pattern(
        structure,
        instrument_config=XrdInstrumentConfig(radiation=radiation),
        range_config=XrdRangeConfig(two_theta_min=tth_min, two_theta_max=tth_max, two_theta_step=tth_step),
    )


def compute_xrd_pattern(
    structure: Structure,
    *,
    instrument_config: XrdInstrumentConfig | None = None,
    range_config: XrdRangeConfig | None = None,
    profile_config: PeakProfile | None = None,
) -> dict:
    """Compute powder XRD peaks, Lorentz-polarization factors, and a broadened spectrum."""

    instrument = instrument_config or XrdInstrumentConfig()
    tth_range = range_config or XrdRangeConfig()
    profile = profile_config or PeakProfile()

    calculator = XRDCalculator(wavelength=instrument.wavelength)
    pattern = calculator.get_pattern(
        structure,
        two_theta_range=(tth_range.two_theta_min, tth_range.two_theta_max),
    )
    peaks: List[dict] = []
    scaled_intensities: list[float] = []

    for i, two_theta in enumerate(pattern.x):
        theta_rad = radians(two_theta / 2)
        lp_factor = _lorentz_polarization_factor(theta_rad, instrument.polarization_ratio, instrument.geometry)
        base_intensity = float(pattern.y[i])
        scaled_intensity = base_intensity * lp_factor
        scaled_intensities.append(scaled_intensity)
        peaks.append(
            {
                "two_theta": float(two_theta),
                "intensity": base_intensity,
                "intensity_lp": scaled_intensity,
                "d_spacing": float(pattern.d_hkls[i]),
                "hkl": pattern.hkls[i][0]["hkl"] if pattern.hkls[i] else [],
                "lorentz_polarization": lp_factor,
            }
        )

    xs = np.arange(tth_range.two_theta_min, tth_range.two_theta_max + tth_range.two_theta_step, tth_range.two_theta_step)
    ys = np.zeros_like(xs, dtype=float)
    for peak, scaled_intensity in zip(peaks, scaled_intensities):
        theta_rad = radians(peak["two_theta"] / 2)
        fwhm_deg = profile.fwhm(theta_rad)
        ys += _gaussian_profile(xs, peak["two_theta"], scaled_intensity, fwhm_deg)

    max_int = float(np.max(ys)) if np.any(ys) else 1.0
    curve = [
        {"two_theta": float(x), "intensity": float((y / max_int) * 100.0)}
        for x, y in zip(xs, ys)
    ]

    for peak, scaled_intensity in zip(peaks, scaled_intensities):
        peak["intensity_normalized"] = (scaled_intensity / max_int) * 100.0 if max_int else 0.0

    return {
        "peaks": peaks,
        "curve": curve,
        "range": {
            "min": tth_range.two_theta_min,
            "max": tth_range.two_theta_max,
            "step": tth_range.two_theta_step,
        },
        "instrument": {
            "radiation": instrument.radiation,
            "wavelength_angstrom": instrument.wavelength_angstrom,
            "geometry": instrument.geometry,
            "polarization_ratio": instrument.polarization_ratio,
        },
        "profile": {
            "u": profile.u,
            "v": profile.v,
            "w": profile.w,
            "model": profile.profile,
        },
        "summary": {
            "peak_count": len(peaks),
            "max_intensity": max(scaled_intensities) if scaled_intensities else 0.0,
        },
    }


__all__ = [
    "compute_xrd_pattern",
    "compute_xrd_peaks",
    "PeakProfile",
    "XrdInstrumentConfig",
    "XrdRangeConfig",
]
