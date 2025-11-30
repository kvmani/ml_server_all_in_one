"""Structure parsing and editing helpers using pymatgen."""

from __future__ import annotations

from typing import Iterable, Mapping, Sequence

from common.validation import ValidationError
from pymatgen.core import Lattice, Structure
from pymatgen.io.cif import CifParser

_ANGLE_TOL = 1e-2
_LENGTH_TOL = 1e-2


def _is_close(val: float, target: float, tol: float) -> bool:
    return abs(val - target) <= tol


def _infer_crystal_system(lattice: Lattice) -> str:
    """Lightweight crystal system inference that does not rely on spglib."""

    a, b, c = lattice.a, lattice.b, lattice.c
    alpha, beta, gamma = lattice.alpha, lattice.beta, lattice.gamma

    ab_equal = _is_close(a, b, _LENGTH_TOL * max(a, b, 1.0))
    bc_equal = _is_close(b, c, _LENGTH_TOL * max(b, c, 1.0))

    if ab_equal and bc_equal and all(
        _is_close(angle, 90.0, _ANGLE_TOL) for angle in (alpha, beta, gamma)
    ):
        return "cubic"
    if ab_equal and all(_is_close(angle, 90.0, _ANGLE_TOL) for angle in (alpha, beta)) and _is_close(gamma, 120.0, _ANGLE_TOL):
        return "hexagonal"
    if ab_equal and all(_is_close(angle, 90.0, _ANGLE_TOL) for angle in (alpha, beta, gamma)):
        return "tetragonal"
    if all(_is_close(angle, 90.0, _ANGLE_TOL) for angle in (alpha, beta, gamma)):
        return "orthorhombic"
    if _is_close(alpha, 90.0, _ANGLE_TOL) and _is_close(beta, 90.0, _ANGLE_TOL):
        return "monoclinic"
    return "triclinic"


def parse_cif_bytes(data: bytes) -> Structure:
    """Parse CIF bytes into a pymatgen Structure."""
    if not data:
        raise ValidationError("Empty CIF payload")

    cif_text = data.decode(errors="ignore").strip()
    if not cif_text:
        raise ValidationError("Empty CIF payload")

    last_error: Exception | None = None
    # Try a strict parse first, then fall back to a lenient occupancy tolerance
    # for CIFs that omit occupancy columns or have summed occupancies > 1.
    for occupancy_tolerance in (1.0, 100.0):
        try:
            parser = CifParser.from_str(cif_text, occupancy_tolerance=occupancy_tolerance)
            structures = parser.parse_structures(primitive=False)
            if structures:
                return structures[0]
        except Exception as exc:  # pragma: no cover - pymatgen handles parsing
            last_error = exc
            continue

    raise ValidationError("Unable to parse CIF") from last_error


def structure_to_payload(structure: Structure) -> dict:
    """Return a JSON-serialisable payload describing the structure."""

    lattice = structure.lattice
    is_hexagonal = (
        _is_close(lattice.a, lattice.b, _LENGTH_TOL * max(lattice.a, lattice.b, 1.0))
        and _is_close(lattice.alpha, 90.0, _ANGLE_TOL)
        and _is_close(lattice.beta, 90.0, _ANGLE_TOL)
        and _is_close(lattice.gamma, 120.0, _ANGLE_TOL)
    )
    sites = [
        {
            "species": str(site.specie),
            "frac_coords": list(map(float, site.frac_coords)),
        }
        for site in structure.sites
    ]
    return {
        "lattice": {
            "a": lattice.a,
            "b": lattice.b,
            "c": lattice.c,
            "alpha": lattice.alpha,
            "beta": lattice.beta,
            "gamma": lattice.gamma,
        },
        "sites": sites,
        "cif": structure.to(fmt="cif"),
        "num_sites": len(structure.sites),
        "formula": structure.formula,
        "is_hexagonal": is_hexagonal,
        "crystal_system": _infer_crystal_system(lattice),
    }


def edit_structure(
    structure: Structure,
    lattice_params: Mapping[str, float] | None = None,
    sites: Sequence[Mapping[str, object]] | None = None,
    supercell: Iterable[int] | None = None,
) -> Structure:
    """Apply lattice/site edits and optional supercell replication."""

    updated = structure.copy()

    if lattice_params:
        try:
            a = float(lattice_params.get("a", updated.lattice.a))
            b = float(lattice_params.get("b", updated.lattice.b))
            c = float(lattice_params.get("c", updated.lattice.c))
            alpha = float(lattice_params.get("alpha", updated.lattice.alpha))
            beta = float(lattice_params.get("beta", updated.lattice.beta))
            gamma = float(lattice_params.get("gamma", updated.lattice.gamma))
        except (TypeError, ValueError) as exc:
            raise ValidationError("Invalid lattice parameters") from exc
        if min(a, b, c) <= 0:
            raise ValidationError("Lattice lengths must be positive")
        new_lattice = Lattice.from_parameters(a, b, c, alpha, beta, gamma)
    else:
        new_lattice = updated.lattice

    if sites:
        if len(sites) != len(updated):
            raise ValidationError("Site count mismatch for edit")
        new_species: list[str] = []
        new_coords: list[list[float]] = []
        for idx, site in enumerate(sites):
            species = site.get("species", str(updated[idx].specie))
            coords = site.get("frac_coords", updated[idx].frac_coords)
            try:
                coords = [float(x) for x in coords]
            except (TypeError, ValueError) as exc:
                raise ValidationError("Invalid fractional coordinates") from exc
            new_species.append(species)
            new_coords.append(coords)
        updated = Structure(
            updated.lattice,
            new_species,
            new_coords,
            site_properties=dict(updated.site_properties),
        )

    if lattice_params:
        updated = Structure(
            new_lattice,
            [site.specie for site in updated],
            [site.frac_coords for site in updated],
            site_properties=dict(updated.site_properties),
        )

    if supercell:
        try:
            scell = [int(x) for x in supercell]
        except (TypeError, ValueError) as exc:
            raise ValidationError("Invalid supercell multipliers") from exc
        if any(n <= 0 for n in scell):
            raise ValidationError("Supercell multipliers must be positive integers")
        updated = updated * scell

    return updated


__all__ = ["parse_cif_bytes", "structure_to_payload", "edit_structure"]
