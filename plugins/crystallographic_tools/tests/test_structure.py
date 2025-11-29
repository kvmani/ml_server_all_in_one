import pytest

from plugins.crystallographic_tools.core import structure

_OCCUPANCY_CIF = b"""data_Si
_symmetry_space_group_name_H-M   'F d -3 m'
_cell_length_a   5.431
_cell_length_b   5.431
_cell_length_c   5.431
_cell_angle_alpha  90
_cell_angle_beta   90
_cell_angle_gamma  90

loop_
 _atom_site_label
 _atom_site_type_symbol
 _atom_site_fract_x
 _atom_site_fract_y
 _atom_site_fract_z
Si1  Si  0.00000  0.00000  0.00000
Si2  Si  0.25000  0.25000  0.25000
"""


def test_parse_and_payload(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    payload = structure.structure_to_payload(s)
    assert payload["lattice"]["a"] == pytest.approx(5.431)
    assert payload["num_sites"] >= 1
    assert "Si" in payload["formula"]


def test_edit_lattice(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    updated = structure.edit_structure(s, lattice_params={"a": 6.0, "b": 6.0, "c": 6.0})
    assert updated.lattice.a == pytest.approx(6.0)
    assert updated.num_sites == s.num_sites


def test_edit_sites(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    sites = [
        {"species": str(site.specie), "frac_coords": list(site.frac_coords)}
        for site in s
    ]
    sites[0]["frac_coords"] = [0.1, 0.1, 0.1]
    updated = structure.edit_structure(s, sites=sites)
    assert updated[0].frac_coords[0] == pytest.approx(0.1)


def test_supercell(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    updated = structure.edit_structure(s, supercell=[2, 1, 1])
    assert updated.num_sites == s.num_sites * 2


def test_parse_allows_high_occupancy_cif():
    parsed = structure.parse_cif_bytes(_OCCUPANCY_CIF)
    assert parsed.num_sites >= 2
    assert parsed.lattice.a == pytest.approx(5.431)
