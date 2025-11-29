import pytest

from plugins.crystallographic_tools.core import structure


def test_parse_and_payload(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    payload = structure.structure_to_payload(s)
    assert payload["lattice"]["a"] == pytest.approx(5.431)
    assert payload["num_sites"] == 2
    assert "Si" in payload["formula"]


def test_edit_lattice(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    updated = structure.edit_structure(s, lattice_params={"a": 6.0, "b": 6.0, "c": 6.0})
    assert updated.lattice.a == pytest.approx(6.0)
    assert updated.num_sites == 2


def test_edit_sites(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    sites = [
        {"species": "Si", "frac_coords": [0.0, 0.0, 0.0]},
        {"species": "Si", "frac_coords": [0.3, 0.3, 0.3]},
    ]
    updated = structure.edit_structure(s, sites=sites)
    assert updated[1].frac_coords[0] == pytest.approx(0.3)


def test_supercell(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    updated = structure.edit_structure(s, supercell=[2, 1, 1])
    assert updated.num_sites == 4
