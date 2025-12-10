"""Crystal viewer specific parsing and payload helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from common.validation import ValidationError
from pymatgen.core import Structure
from pymatgen.io.cif import CifParser
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

from .atomic_radii import covalent_radii_map
from . import structure as structure_core

MAX_ATOMS_IN_VIEW = 500
DEFAULT_SUPERCELL = (3, 3, 3)
MAX_SUPERCELL = (4, 4, 4)


def _guess_format(filename: str | None, text: str) -> str:
    if filename:
        suffix = Path(filename).suffix.lower()
        if suffix == ".cif":
            return "cif"
        if suffix in {".vasp", ".poscar", ".contcar"}:
            return "poscar"

    normalized = text.lstrip()
    if normalized.lower().startswith("data_") or "_cell_length_a" in normalized:
        return "cif"
    lines = normalized.splitlines()
    if len(lines) >= 6 and lines[5].strip().lower() in {"direct", "cartesian"}:
        return "poscar"
    return "unknown"


def _parse_cif(text: str) -> Structure:
    return structure_core.parse_cif_bytes(text.encode())


def _parse_poscar(text: str) -> Structure:
    try:
        return Structure.from_str(text, fmt="poscar")
    except Exception as exc:  # pragma: no cover - delegated to pymatgen
        raise ValidationError("Unable to parse POSCAR content") from exc


def _sanitize_text(data: bytes) -> str:
    if not data:
        raise ValidationError("Empty structure payload")
    text = data.decode(errors="ignore").strip()
    if not text:
        raise ValidationError("Empty structure payload")
    return text


def parse_structure_bytes(data: bytes, *, filename: str | None = None) -> Structure:
    """Parse CIF or POSCAR bytes into a :class:`Structure`."""

    text = _sanitize_text(data)
    hint = _guess_format(filename, text)
    parsers = []
    if hint == "cif":
        parsers = [_parse_cif, _parse_poscar]
    elif hint == "poscar":
        parsers = [_parse_poscar, _parse_cif]
    else:
        parsers = [_parse_cif, _parse_poscar]

    last_error: Exception | None = None
    for parser in parsers:
        try:
            return parser(text)
        except Exception as exc:  # pragma: no cover - handled below
            last_error = exc
    raise ValidationError("Unable to parse structure as CIF or POSCAR") from last_error


def _wrap_frac(frac_coords: Sequence[float]) -> list[float]:
    return [float(coord % 1.0) for coord in frac_coords]


def _validate_supercell(supercell: Iterable[int] | None) -> tuple[int, int, int]:
    if supercell is None:
        return DEFAULT_SUPERCELL
    try:
        values = tuple(int(v) for v in supercell)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Supercell multipliers must be integers") from exc
    if len(values) != 3:
        raise ValidationError("Supercell must have three components")
    if any(v <= 0 for v in values):
        raise ValidationError("Supercell multipliers must be positive")
    if any(v > max_val for v, max_val in zip(values, MAX_SUPERCELL, strict=False)):
        raise ValidationError(f"Supercell exceeds allowed maximum of {MAX_SUPERCELL}")
    return values  # type: ignore[return-value]


def _space_group_info(structure: Structure) -> Mapping[str, object]:
    try:
        analyzer = SpacegroupAnalyzer(structure, symprec=1e-3, angle_tolerance=0.5)
        symbol, number = analyzer.get_space_group_symbol(), analyzer.get_space_group_number()
    except Exception:  # pragma: no cover - spglib edge cases
        symbol, number = "P1", 1
    return {"symbol": symbol, "number": int(number) if number else None}


def _basis_sites(structure: Structure) -> list[Mapping[str, object]]:
    radii = covalent_radii_map()
    basis = []
    for site in structure.sites:
        species = sorted(site.species.items(), key=lambda item: item[1], reverse=True)
        if not species:
            continue
        primary, occupancy = species[0]
        element = str(primary)
        atomic_number = getattr(primary, "Z", None) or getattr(primary, "z", None)
        basis.append(
            {
                "element": element,
                "frac_position": _wrap_frac(site.frac_coords),
                "cart_position": [float(x) for x in site.coords],
                "occupancy": float(occupancy),
                "atomic_number": int(atomic_number) if atomic_number else None,
                "atomic_radius": radii.get(element),
            }
        )
    return basis


def structure_to_viewer_payload(structure: Structure, *, supercell: Iterable[int] | None = None) -> dict:
    """Normalize a :class:`Structure` to a JSON-ready viewer payload."""

    requested_supercell = _validate_supercell(supercell)
    base_payload = structure_core.structure_to_payload(structure)
    basis = _basis_sites(structure)
    atom_count = len(basis)
    supercell_atoms = atom_count * requested_supercell[0] * requested_supercell[1] * requested_supercell[2]
    if supercell_atoms > MAX_ATOMS_IN_VIEW:
        raise ValidationError(
            f"Supercell would contain {supercell_atoms} atoms which exceeds the limit of {MAX_ATOMS_IN_VIEW}",
            details={"atom_count": atom_count, "supercell": requested_supercell},
        )

    payload = {
        **base_payload,
        "lattice_matrix": [[float(x) for x in row] for row in structure.lattice.matrix],
        "space_group": _space_group_info(structure),
        "basis": basis,
        "viewer_limits": {
            "max_atoms": MAX_ATOMS_IN_VIEW,
            "supercell_default": list(DEFAULT_SUPERCELL),
            "supercell_max": list(MAX_SUPERCELL),
            "supercell_requested": list(requested_supercell),
            "atom_count": atom_count,
            "atom_count_supercell": supercell_atoms,
        },
    }
    return payload


def parse_supercell_param(raw: str | Sequence[int] | None) -> tuple[int, int, int] | None:
    """Robustly parse a supercell parameter from JSON or form values."""

    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = [v for v in raw.replace(" ", "").split(",") if v]
        return _validate_supercell(parsed)
    return _validate_supercell(raw)


__all__ = [
    "DEFAULT_SUPERCELL",
    "MAX_ATOMS_IN_VIEW",
    "MAX_SUPERCELL",
    "parse_structure_bytes",
    "parse_supercell_param",
    "structure_to_viewer_payload",
]
