import pytest

from common.validation import ValidationError
from plugins.crystallographic_tools.core import viewer


def test_structure_to_viewer_payload_contains_basis(simple_cif_bytes):
    structure = viewer.parse_structure_bytes(simple_cif_bytes, filename="si.cif")
    payload = viewer.structure_to_viewer_payload(structure, supercell=(3, 3, 3))
    assert payload["basis"]
    assert payload["space_group"]["symbol"]
    assert payload["viewer_limits"]["atom_count_supercell"] == payload["viewer_limits"]["atom_count"] * 27
    assert len(payload["lattice_matrix"]) == 3


def test_parse_poscar_and_supercell_limit(fe_poscar_bytes):
    structure = viewer.parse_structure_bytes(fe_poscar_bytes, filename="POSCAR")
    payload = viewer.structure_to_viewer_payload(structure, supercell=(2, 2, 2))
    assert payload["basis"][0]["element"] == "Fe"
    assert payload["viewer_limits"]["atom_count_supercell"] == 16


def test_supercell_limit_enforced(simple_cif_bytes):
    structure = viewer.parse_structure_bytes(simple_cif_bytes)
    with pytest.raises(ValidationError):
        viewer.structure_to_viewer_payload(structure, supercell=(10, 10, 10))
