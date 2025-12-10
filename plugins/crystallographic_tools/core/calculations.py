"""Crystallographic calculators (angles, symmetry equivalents, index helpers)."""

from __future__ import annotations

import math
from typing import Sequence, Tuple

import numpy as np
from common.validation import ValidationError
from pymatgen.core import Lattice, Structure
from pymatgen.core.operations import SymmOp
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer


def _ensure_vector(vec: Sequence[float], *, expected_len: int | None = None) -> np.ndarray:
    arr = np.array(vec, dtype=float)
    if expected_len and len(arr) != expected_len:
        raise ValidationError(f"Expected {expected_len} components, got {len(arr)}")
    if np.allclose(arr, 0):
        raise ValidationError("Vector cannot be all zeros")
    return arr


def _normalize_three_index(values: Sequence[float]) -> list[float]:
    """Reduce a Miller-like vector to the smallest integer ratio when possible."""

    vec = np.array(values, dtype=float)
    if np.allclose(vec, 0):
        raise ValidationError("Vector cannot be all zeros")

    rounded = [round(x) for x in vec]
    if np.allclose(vec, rounded, atol=1e-6):
        ints = [int(x) for x in rounded]
        non_zero = [abs(x) for x in ints if x != 0]
        if non_zero:
            gcd = math.gcd(*non_zero)
            ints = [int(x / gcd) for x in ints]
        return ints

    return [float(x) for x in vec]


def is_hexagonal_lattice(lattice: Lattice) -> bool:
    """Return True when the lattice parameters align with hexagonal constraints."""

    a, b = lattice.a, lattice.b
    return (
        abs(a - b) <= 1e-2 * max(a, b, 1.0)
        and abs(lattice.alpha - 90.0) <= 1e-2
        and abs(lattice.beta - 90.0) <= 1e-2
        and abs(lattice.gamma - 120.0) <= 1e-2
    )


def direction_four_to_three(direction: Sequence[float]) -> list[float]:
    """Convert a four-index direction [u, v, t, w] to a three-index [U, V, W]."""

    if len(direction) == 3:
        return _normalize_three_index(direction)
    if len(direction) != 4:
        raise ValidationError("Directions must have 3 or 4 components")
    u, v, t, w = [float(x) for x in direction]
    if not math.isclose(t, -(u + v), abs_tol=1e-6):
        t = -(u + v)
    U = 2 * u + v
    V = u + 2 * v
    return _normalize_three_index([U, V, w])


def direction_three_to_four(direction: Sequence[float]) -> list[float]:
    """Convert a three-index direction [U, V, W] to four-index [u, v, t, w]."""

    vec = _ensure_vector(direction, expected_len=3)
    U, V, W = vec
    u = (2 * U - V) / 3
    v = (2 * V - U) / 3
    t = -(u + v)
    return [float(u), float(v), float(t), float(W)]


def plane_four_to_three(plane: Sequence[float]) -> list[float]:
    """Convert a four-index plane (h, k, i, l) to a three-index equivalent."""

    if len(plane) == 3:
        return _normalize_three_index(plane)
    if len(plane) != 4:
        raise ValidationError("Planes must have 3 or 4 components")
    h, k, i, l = [float(x) for x in plane]
    if not math.isclose(i, -(h + k), abs_tol=1e-6):
        i = -(h + k)
    H = 2 * h + k
    K = h + 2 * k
    return _normalize_three_index([H, K, l])


def plane_three_to_four(plane: Sequence[float]) -> list[float]:
    """Convert a three-index plane (H, K, L) to four-index (h, k, i, l)."""

    vec = _ensure_vector(plane, expected_len=3)
    H, K, L = vec
    h = (2 * H - K) / 3
    k = (2 * K - H) / 3
    i = -(h + k)
    return [float(h), float(k), float(i), float(L)]


def _cart_direction(lattice: Lattice, direction: Sequence[float]) -> np.ndarray:
    vec = _ensure_vector(direction)
    cart = lattice.get_cartesian_coords(vec)
    return np.array(cart, dtype=float)


def _cart_plane_normal(lattice: Lattice, plane: Sequence[float]) -> np.ndarray:
    normal = lattice.reciprocal_lattice.get_cartesian_coords(plane)
    return np.array(normal, dtype=float)


def angle_between_directions(lattice: Lattice, dir_a: Sequence[float], dir_b: Sequence[float]) -> float:
    """Return the angle (deg) between two directions."""

    a = _cart_direction(lattice, dir_a)
    b = _cart_direction(lattice, dir_b)
    cos_theta = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    cos_theta = min(1.0, max(-1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def plane_vector_angle(lattice: Lattice, plane: Sequence[float], direction: Sequence[float]) -> float:
    """Return the angle (deg) between a plane normal and a direction."""

    n = _cart_plane_normal(lattice, plane)
    d = _cart_direction(lattice, direction)
    cos_theta = float(np.dot(n, d) / (np.linalg.norm(n) * np.linalg.norm(d)))
    cos_theta = min(1.0, max(-1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def plane_plane_angle(lattice: Lattice, plane_a: Sequence[float], plane_b: Sequence[float]) -> float:
    """Return the angle (deg) between two planes via their normals."""

    n_a = _cart_plane_normal(lattice, plane_a)
    n_b = _cart_plane_normal(lattice, plane_b)
    cos_theta = float(np.dot(n_a, n_b) / (np.linalg.norm(n_a) * np.linalg.norm(n_b)))
    cos_theta = min(1.0, max(-1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def symmetry_equivalents(structure: Structure, miller: Sequence[float], *, kind: str) -> list[list[float]]:
    """Return symmetry-equivalent directions or planes using space group ops."""

    base = direction_four_to_three if kind == "direction" else plane_four_to_three
    primary = np.array(base(miller), dtype=float)
    try:
        analyzer = SpacegroupAnalyzer(structure, symprec=1e-3, angle_tolerance=0.5)
        operations = analyzer.get_symmetry_operations(cartesian=False)
    except Exception:
        operations = [SymmOp.from_rotation_and_translation(np.eye(3), [0, 0, 0])]

    equivalents: set[Tuple[float, float, float]] = set()
    for op in operations:
        rotated = op.rotation_matrix @ primary
        equivalents.add(tuple(_normalize_three_index(rotated)))
        equivalents.add(tuple(_normalize_three_index(-rotated)))

    return [list(vec) for vec in sorted(equivalents)]


def run_calculations(
    structure: Structure,
    *,
    direction_a: Sequence[float] | None,
    direction_b: Sequence[float] | None,
    plane: Sequence[float] | None,
    plane_b: Sequence[float] | None = None,
    include_equivalents: bool = True,
) -> dict:
    """Aggregate calculator outputs for the API."""

    lattice = structure.lattice
    hex_lattice = is_hexagonal_lattice(lattice)

    dir_a = direction_four_to_three(direction_a) if direction_a is not None else None  # type: ignore[arg-type]
    dir_b = direction_four_to_three(direction_b) if direction_b is not None else None  # type: ignore[arg-type]
    plane_vals = plane_four_to_three(plane) if plane is not None else None  # type: ignore[arg-type]
    plane_b_vals = plane_four_to_three(plane_b) if plane_b is not None else None  # type: ignore[arg-type]

    direction_angle = angle_between_directions(lattice, dir_a, dir_b) if dir_a is not None and dir_b is not None else None
    plane_angle = plane_vector_angle(lattice, plane_vals, dir_a) if plane_vals is not None and dir_a is not None else None
    plane_plane_angle_deg = (
        plane_plane_angle(lattice, plane_vals, plane_b_vals) if plane_vals is not None and plane_b_vals is not None else None
    )

    equivalents: dict[str, dict[str, list[list[float]]]] = {"direction": {"three_index": []}, "plane": {"three_index": []}}
    if include_equivalents:
        if dir_a is not None:
            equivalents["direction"]["three_index"] = symmetry_equivalents(structure, dir_a, kind="direction")
        if plane_vals is not None:
            equivalents["plane"]["three_index"] = symmetry_equivalents(structure, plane_vals, kind="plane")

    if hex_lattice:
        if dir_a is not None:
            equivalents["direction"]["four_index"] = [direction_three_to_four(vec) for vec in equivalents["direction"]["three_index"]]
        if plane_vals is not None:
            equivalents["plane"]["four_index"] = [plane_three_to_four(vec) for vec in equivalents["plane"]["three_index"]]
    else:
        equivalents["direction"]["four_index"] = []
        equivalents["plane"]["four_index"] = []

    response: dict = {
        "is_hexagonal": hex_lattice,
        "direction_angle_deg": direction_angle,
        "plane_vector_angle_deg": plane_angle,
        "direction_a": {
            "three_index": dir_a,
            "four_index": direction_three_to_four(dir_a) if dir_a is not None and hex_lattice else None,
        },
        "direction_b": {
            "three_index": dir_b,
            "four_index": direction_three_to_four(dir_b) if dir_b is not None and hex_lattice else None,
        },
        "plane": {
            "three_index": plane_vals,
            "four_index": plane_three_to_four(plane_vals) if plane_vals is not None and hex_lattice else None,
        },
        "plane_b": {
            "three_index": plane_b_vals,
            "four_index": plane_three_to_four(plane_b_vals) if plane_b_vals is not None and hex_lattice else None,
        },
        "plane_plane_angle_deg": plane_plane_angle_deg,
        "equivalents": equivalents,
    }
    return response


__all__ = [
    "angle_between_directions",
    "plane_vector_angle",
    "plane_plane_angle",
    "direction_four_to_three",
    "direction_three_to_four",
    "plane_four_to_three",
    "plane_three_to_four",
    "symmetry_equivalents",
    "run_calculations",
    "is_hexagonal_lattice",
]
