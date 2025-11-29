"""Structure parsing and editing helpers using pymatgen."""

from __future__ import annotations

from typing import Iterable, Mapping, Sequence

from common.validation import ValidationError
from pymatgen.core import Lattice, Structure


def parse_cif_bytes(data: bytes) -> Structure:
    """Parse CIF bytes into a pymatgen Structure."""
    if not data:
        raise ValidationError("Empty CIF payload")
    try:
        return Structure.from_str(data.decode(), fmt="cif")
    except Exception as exc:  # pragma: no cover - pymatgen handles parsing
        raise ValidationError("Unable to parse CIF") from exc


def structure_to_payload(structure: Structure) -> dict:
    """Return a JSON-serialisable payload describing the structure."""

    lattice = structure.lattice
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
        updated.modify_lattice(Lattice.from_parameters(a, b, c, alpha, beta, gamma))

    if sites:
        if len(sites) != len(updated):
            raise ValidationError("Site count mismatch for edit")
        for idx, site in enumerate(sites):
            species = site.get("species", str(updated[idx].specie))
            coords = site.get("frac_coords")
            if coords is None:
                coords = updated[idx].frac_coords
            try:
                coords = [float(x) for x in coords]
            except (TypeError, ValueError) as exc:
                raise ValidationError("Invalid fractional coordinates") from exc
            updated.replace(idx, species, coords, coords_are_cartesian=False)

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
