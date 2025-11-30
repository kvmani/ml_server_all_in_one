"""Transmission electron diffraction (SAED) helpers."""

from __future__ import annotations

import math
from typing import List, Sequence

import numpy as np
from common.validation import ValidationError
from pymatgen.core import Structure


def _electron_wavelength_angstrom(voltage_kv: float) -> float:
    """Relativistic electron wavelength in angstroms."""

    if voltage_kv <= 0:
        raise ValidationError("Accelerating voltage must be positive")
    return 12.398 / math.sqrt(voltage_kv * (2 * 511 + voltage_kv))


def _build_screen_basis(zone_axis_cart: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return an orthonormal basis spanning the diffraction plane."""

    zone_unit = zone_axis_cart / np.linalg.norm(zone_axis_cart)
    trial = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(zone_unit, trial)) > 0.9:
        trial = np.array([0.0, 1.0, 0.0])
    basis_x = np.cross(zone_unit, trial)
    basis_x /= np.linalg.norm(basis_x)
    basis_y = np.cross(zone_unit, basis_x)
    basis_y /= np.linalg.norm(basis_y)
    return zone_unit, basis_x, basis_y


def compute_saed_pattern(
    structure: Structure,
    *,
    zone_axis: Sequence[float],
    voltage_kv: float = 200.0,
    camera_length_mm: float = 100.0,
    max_index: int = 3,
    g_max: float = 6.0,
    zone_tolerance_deg: float = 2.5,
    rotation_deg: float = 0.0,
) -> dict:
    """Compute a kinematic SAED spot list for a given zone axis."""

    lattice = structure.lattice
    zone = np.array(zone_axis, dtype=float)
    if zone.shape != (3,):
        raise ValidationError("Zone axis must have three components")
    if np.allclose(zone, 0):
        raise ValidationError("Zone axis cannot be zero")

    recip = lattice.reciprocal_lattice
    zone_cart = np.array(lattice.get_cartesian_coords(zone), dtype=float)
    zone_unit, basis_x, basis_y = _build_screen_basis(zone_cart)
    wavelength = _electron_wavelength_angstrom(voltage_kv)
    zone_tol_rad = math.radians(zone_tolerance_deg)
    rotation_rad = math.radians(rotation_deg)

    spots: List[dict] = []
    for h in range(-max_index, max_index + 1):
        for k in range(-max_index, max_index + 1):
            for l in range(-max_index, max_index + 1):
                if h == k == l == 0:
                    continue
                hkl = [h, k, l]
                g_cart = np.array(recip.get_cartesian_coords(hkl), dtype=float)
                g_len = float(np.linalg.norm(g_cart))
                if g_len <= 0 or g_len > g_max:
                    continue
                cos_zone = float(np.dot(g_cart, zone_unit) / g_len)
                cos_zone = min(1.0, max(-1.0, cos_zone))
                if abs(math.acos(cos_zone)) > zone_tol_rad:
                    continue
                d_spacing = float(lattice.d_hkl(hkl))
                intensity = 1.0 / (1.0 + g_len**2)
                x = float(np.dot(g_cart, basis_x))
                y = float(np.dot(g_cart, basis_y))
                if rotation_rad:
                    cos_r, sin_r = math.cos(rotation_rad), math.sin(rotation_rad)
                    rot_x = x * cos_r - y * sin_r
                    rot_y = x * sin_r + y * cos_r
                    x, y = rot_x, rot_y
                radius_mm = camera_length_mm * wavelength * g_len / 10.0
                two_theta = math.degrees(math.asin(min(1.0, 0.5 * wavelength * g_len)))
                spots.append(
                    {
                        "hkl": hkl,
                        "x": x * radius_mm,
                        "y": y * radius_mm,
                        "g_magnitude": g_len,
                        "d_spacing": d_spacing,
                        "intensity": intensity,
                        "two_theta": two_theta,
                    }
                )

    spots.sort(key=lambda item: item["intensity"], reverse=True)
    return {
        "spots": spots,
        "calibration": {
            "wavelength_angstrom": wavelength,
            "camera_length_mm": camera_length_mm,
            "zone_axis": list(zone_axis),
            "max_index": max_index,
            "g_max": g_max,
        },
        "basis": {
            "zone": zone_unit.tolist(),
            "x": basis_x.tolist(),
            "y": basis_y.tolist(),
        },
    }


__all__ = ["compute_saed_pattern"]
