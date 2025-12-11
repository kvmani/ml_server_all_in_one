"""TEM SAED pattern simulation utilities."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Iterable, Mapping, Sequence

import numpy as np
from common.validation import ValidationError
from pymatgen.analysis.diffraction.tem import TEMCalculator
from pymatgen.core import Structure
from math import gcd
from .calculations import (
    direction_four_to_three,
    direction_three_to_four,
    is_hexagonal_lattice,
    plane_four_to_three,
    plane_three_to_four,
)


def _coerce_axis(axis: Sequence[float], label: str, *, converter=None) -> tuple[int, int, int]:
    if converter and len(axis) == 4:
        axis = converter(axis)  # type: ignore[assignment]
    if len(axis) != 3:
        raise ValidationError(f"{label} must have three components")
    try:
        values = tuple(int(round(v)) for v in axis)
    except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
        raise ValidationError(f"{label} must be integers") from exc
    if all(v == 0 for v in values):
        raise ValidationError(f"{label} cannot be all zeros")
    return values


@dataclass
class SaedConfig:
    structure: Structure
    zone_axis: tuple[int, int, int]
    voltage_kv: float = 200.0
    camera_length_cm: float = 16.0
    x_axis_hkl: tuple[int, int, int] | None = None
    inplane_rotation_deg: float = 0.0
    min_d_angstrom: float | None = 0.5
    max_index: int = 8
    laue_zone: int = 0
    intensity_min_relative: float = 0.01
    normalize_position: bool = True
    normalize_intensity: bool = True
    phase_name: str | None = None

    @classmethod
    def from_payload(cls, structure: Structure, payload: Mapping[str, object]) -> "SaedConfig":
        zone_axis = _coerce_axis(
            payload.get("zone_axis", (0, 0, 1)), "Zone axis", converter=direction_four_to_three
        )
        x_axis_raw = payload.get("x_axis_hkl")
        x_axis_hkl = _coerce_axis(
            x_axis_raw, "x_axis_hkl", converter=plane_four_to_three
        ) if x_axis_raw else None

        try:
            voltage_kv = float(payload.get("voltage_kv", 200.0))
            camera_length_cm = float(payload.get("camera_length_cm", payload.get("camera_length_mm", 160.0) / 10))
            inplane_rotation_deg = float(payload.get("inplane_rotation_deg", payload.get("rotation_deg", 0.0)))
            min_d_angstrom_raw = payload.get("min_d_angstrom", None)
            min_d_angstrom = float(min_d_angstrom_raw) if min_d_angstrom_raw is not None else 0.5
            max_index = int(payload.get("max_index", 8))
            laue_zone = int(payload.get("laue_zone", 0))
            intensity_min_relative = float(payload.get("intensity_min_relative", 0.01))
            normalize_position = bool(payload.get("normalize_position", True))
            normalize_intensity = bool(payload.get("normalize_intensity", True))
        except (TypeError, ValueError) as exc:
            raise ValidationError("Invalid numeric TEM parameters") from exc

        if voltage_kv <= 0:
            raise ValidationError("Accelerating voltage must be positive")
        if camera_length_cm <= 0:
            raise ValidationError("Camera length must be positive")
        if max_index <= 0:
            raise ValidationError("max_index must be positive")
        if intensity_min_relative < 0:
            raise ValidationError("intensity_min_relative cannot be negative")

        g_max = payload.get("g_max")
        if g_max:
            try:
                g_max_val = float(g_max)
                if g_max_val > 0:
                    min_d_angstrom = min_d_angstrom or (2 * math.pi / g_max_val)
            except (TypeError, ValueError):
                pass

        phase_name = payload.get("phase_name") if isinstance(payload.get("phase_name"), str) else None

        return cls(
            structure=structure,
            zone_axis=zone_axis,
            voltage_kv=voltage_kv,
            camera_length_cm=camera_length_cm,
            x_axis_hkl=x_axis_hkl,
            inplane_rotation_deg=inplane_rotation_deg,
            min_d_angstrom=min_d_angstrom,
            max_index=max_index,
            laue_zone=laue_zone,
            intensity_min_relative=intensity_min_relative,
            normalize_position=normalize_position,
            normalize_intensity=normalize_intensity,
            phase_name=phase_name,
        )


@dataclass
class SaedSpot:
    hkl: tuple[int, int, int]
    zone: int
    d_angstrom: float
    s2: float | None
    intensity_raw: float
    intensity_rel: float
    x_cm: float
    y_cm: float
    x_rot_cm: float
    y_rot_cm: float
    x_norm: float
    y_norm: float
    r_cm: float
    two_theta_deg: float
    label: str
    hkil: tuple[int, int, int, int] | None = None


def _rotation_angle_for_x_axis(
    positions: Mapping[tuple[int, int, int], np.ndarray],
    x_axis_hkl: tuple[int, int, int] | None,
) -> float:
    if not x_axis_hkl:
        return 0.0
    coords = positions.get(tuple(x_axis_hkl))
    if coords is None:
        return 0.0
    x_val, y_val = float(coords[0]), float(coords[1])
    return -math.degrees(math.atan2(y_val, x_val))


def _normalize_four_index(values: Sequence[float]) -> tuple[int, int, int, int]:
    """Return normalized Miller–Bravais indices using smallest integers."""

    for factor in (1, 3):
        scaled = [round(v * factor) for v in values]
        if all(abs(v * factor - s) < 1e-5 for v, s in zip(values, scaled)):
            values = scaled
            break
    else:
        values = [round(v) for v in values]

    non_zero = [abs(int(v)) for v in values if v]
    divisor = gcd(*non_zero) if non_zero else 1
    divisor = divisor or 1
    return tuple(int(v / divisor) for v in values)


def _plane_three_to_four_normalized(hkl: Sequence[float]) -> tuple[int, int, int, int]:
    raw = plane_three_to_four(hkl)
    return _normalize_four_index(raw)


def compute_saed_pattern(structure: Structure, *, config: SaedConfig | None = None, **kwargs) -> dict:
    cfg = config or SaedConfig.from_payload(structure, kwargs)

    calculator = TEMCalculator(
        voltage=cfg.voltage_kv,
        beam_direction=cfg.zone_axis,
        camera_length=cfg.camera_length_cm,
    )
    wavelength = calculator.wavelength_rel()

    points = calculator.generate_points(coord_left=-cfg.max_index, coord_right=cfg.max_index)
    points = [tuple(map(int, p)) for p in points if max(abs(int(v)) for v in p) <= cfg.max_index]
    points = [p for p in points if any(p)]
    zone_filtered = calculator.zone_axis_filter(points, laue_zone=cfg.laue_zone)

    d_map = calculator.get_interplanar_spacings(structure, zone_filtered)
    if cfg.min_d_angstrom:
        d_map = {hkl: d for hkl, d in d_map.items() if d >= cfg.min_d_angstrom}
    if not d_map:
        raise ValidationError("No reflections remain after d-spacing filtering")

    bragg_map = calculator.bragg_angles(d_map)
    intensity_raw = calculator.cell_intensity(structure, bragg_map)
    intensity_norm = calculator.normalized_cell_intensity(structure, bragg_map)
    positions = calculator.get_positions(structure, list(bragg_map.keys()))
    s2_map = calculator.get_s2(bragg_map)

    spots: list[SaedSpot] = []
    x_values: list[float] = []
    y_values: list[float] = []
    r_values: list[float] = []
    intensity_values: list[float] = []

    base_rotation_deg = _rotation_angle_for_x_axis(positions, cfg.x_axis_hkl)
    total_rotation_rad = math.radians(base_rotation_deg + cfg.inplane_rotation_deg)

    for hkl, theta in bragg_map.items():
        i_rel = float(intensity_norm.get(hkl, 0.0))
        if i_rel < cfg.intensity_min_relative:
            continue

        pos = positions[hkl]
        x_cm, y_cm = float(pos[0]), float(pos[1])
        cos_r, sin_r = math.cos(total_rotation_rad), math.sin(total_rotation_rad)
        x_rot = cos_r * x_cm - sin_r * y_cm
        y_rot = sin_r * x_cm + cos_r * y_cm
        r_cm = math.sqrt(x_rot**2 + y_rot**2)

        x_values.append(x_rot)
        y_values.append(y_rot)
        r_values.append(r_cm)
        intensity_values.append(i_rel)

        two_theta = math.degrees(2 * theta)
        s2_val = s2_map.get(hkl)
        hkil_norm = _plane_three_to_four_normalized(hkl)

        spots.append(
            SaedSpot(
                hkl=tuple(int(v) for v in hkl),
                zone=cfg.laue_zone,
                d_angstrom=float(d_map[hkl]),
                s2=float(s2_val) if s2_val is not None else None,
                intensity_raw=float(intensity_raw.get(hkl, 0.0)),
                intensity_rel=i_rel if cfg.normalize_intensity else float(intensity_raw.get(hkl, 0.0)),
                x_cm=x_cm,
                y_cm=y_cm,
                x_rot_cm=x_rot,
                y_rot_cm=y_rot,
                x_norm=0.0,
                y_norm=0.0,
                r_cm=r_cm,
                two_theta_deg=two_theta,
                label="".join(str(int(v)) for v in hkl),
                hkil=hkil_norm,
            )
        )

    if not spots:
        raise ValidationError("No reflections meet the intensity threshold")

    origin_intensity = max(intensity_values) if intensity_values else 1.0
    spots.append(
        SaedSpot(
            hkl=(0, 0, 0),
            zone=0,
            d_angstrom=0.0,
            s2=None,
            intensity_raw=origin_intensity,
            intensity_rel=origin_intensity,
            x_cm=0.0,
            y_cm=0.0,
            x_rot_cm=0.0,
            y_rot_cm=0.0,
            x_norm=0.0,
            y_norm=0.0,
            r_cm=0.0,
            two_theta_deg=0.0,
            label="000",
        )
    )
    x_values.append(0.0)
    y_values.append(0.0)
    r_values.append(0.0)
    intensity_values.append(origin_intensity)

    x_min, x_max = min(x_values), max(x_values)
    y_min, y_max = min(y_values), max(y_values)
    r_max = max(r_values) if r_values else 0.0
    i_max = max(intensity_values) if intensity_values else 0.0

    norm_scale = max(
        max((abs(x) for x in x_values), default=0.0),
        max((abs(y) for y in y_values), default=0.0),
        1e-9,
    )
    if cfg.normalize_position:
        for spot in spots:
            spot.x_norm = spot.x_rot_cm / norm_scale
            spot.y_norm = spot.y_rot_cm / norm_scale

    metadata = {
        "phase_name": cfg.phase_name or structure.composition.reduced_formula,
        "formula": structure.formula,
        "spacegroup": structure.get_space_group_info()[0],
        "zone_axis": list(cfg.zone_axis),
        "x_axis_hkl": list(cfg.x_axis_hkl) if cfg.x_axis_hkl else None,
        "inplane_rotation_deg": cfg.inplane_rotation_deg,
        "voltage_kv": cfg.voltage_kv,
        "lambda_angstrom": wavelength,
        "camera_length_cm": cfg.camera_length_cm,
        "laue_zone": cfg.laue_zone,
        "min_d_angstrom": cfg.min_d_angstrom,
        "max_index": cfg.max_index,
        "intensity_min_relative": cfg.intensity_min_relative,
    }
    if is_hexagonal_lattice(structure.lattice):
        metadata["zone_axis_four_index"] = direction_three_to_four(cfg.zone_axis)
        metadata["x_axis_hkl_four_index"] = plane_three_to_four(cfg.x_axis_hkl) if cfg.x_axis_hkl else None

    limits = {
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "r_max": r_max,
        "i_max": i_max,
        "norm_scale": norm_scale,
    }

    payload = {
        "metadata": metadata,
        "limits": limits,
        "spots": [asdict(spot) for spot in sorted(spots, key=lambda s: s.intensity_rel, reverse=True)],
    }

    return payload


__all__ = ["SaedConfig", "SaedSpot", "compute_saed_pattern"]
