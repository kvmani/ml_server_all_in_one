from io import BytesIO

import pytest

from app import create_app


def _client():
    app = create_app("TestingConfig")
    return app.test_client()


SIMPLE_CIF = b"""data_Si
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

HEX_CIF = b"""data_Mg
_symmetry_space_group_name_H-M   'P 6 3/m m c'
_symmetry_Int_Tables_number      194
_cell_length_a   3.209
_cell_length_b   3.209
_cell_length_c   5.211
_cell_angle_alpha   90
_cell_angle_beta    90
_cell_angle_gamma   120

loop_
 _symmetry_equiv_pos_as_xyz
  x,y,z
  -y,x-y,z
  -x,-y,z
  -x+y,x,z
  y,-x+y,z
  x,x-y,z
  x,y,-z+1/2
  -y,x-y,-z+1/2
  -x,-y,-z+1/2
  -x+y,x,-z+1/2
  y,-x+y,-z+1/2
  x,x-y,-z+1/2

loop_
 _atom_site_label
 _atom_site_type_symbol
 _atom_site_fract_x
 _atom_site_fract_y
 _atom_site_fract_z
Mg1 Mg 0 0 0
Mg2 Mg 0 0 0.5
"""


def test_load_cif_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/load_cif",
        data={"file": (BytesIO(SIMPLE_CIF), "si.cif")},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["data"]["lattice"]["a"] == 5.431


def test_edit_cif_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/edit_cif",
        json={"cif": SIMPLE_CIF.decode(), "lattice": {"a": 6.0, "b": 6.0, "c": 6.0}},
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["lattice"]["a"] == 6.0


def test_xrd_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/xrd",
        json={"cif": SIMPLE_CIF.decode(), "two_theta": {"min": 20, "max": 80, "step": 0.1}},
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["peaks"]
    assert payload["curve"]


def test_tem_saed_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/tem_saed",
        json={
            "cif": SIMPLE_CIF.decode(),
            "zone_axis": [1, 0, 0],
            "max_index": 2,
            "camera_length_cm": 12,
            "intensity_min_relative": 1e-4,
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["spots"]
    assert payload["metadata"]["camera_length_cm"] == 12.0
    assert payload["limits"]["i_max"] <= 1.0
    assert payload["limits"]["norm_scale"] > 0


def test_tem_saed_accepts_four_index_inputs():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/tem_saed",
        json={
            "cif": HEX_CIF.decode(),
            "zone_axis": [1, -1, 0, 0],
            "x_axis_hkl": [1, 0, -1, 0],
            "max_index": 2,
            "camera_length_cm": 10,
            "intensity_min_relative": 1e-4,
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["metadata"]["zone_axis"] == [1, -1, 0]
    assert payload["metadata"]["zone_axis_four_index"] == [1.0, -1.0, 0.0, 0.0]
    assert payload["metadata"]["x_axis_hkl_four_index"] == [1.0, 0.0, -1.0, 0.0]
    assert payload["spots"]
    assert any(spot["hkl"] == [0, 0, 0] for spot in payload["spots"])


def test_calculator_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/calculator",
        json={
            "cif": SIMPLE_CIF.decode(),
            "direction_a": [1, 0, 0],
            "direction_b": [0, 1, 0],
            "plane": [1, 0, 0],
            "include_equivalents": True,
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["direction_angle_deg"] == pytest.approx(90.0)
    assert payload["equivalents"]["direction"]["three_index"]


def test_crystal_viewer_parse_accepts_poscar(fe_poscar_bytes):
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/crystal_viewer/parse",
        data={"file": (BytesIO(fe_poscar_bytes), "POSCAR")},
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["basis"]
    expected_atoms = payload["viewer_limits"]["atom_count"]
    sc = payload["viewer_limits"]["supercell_requested"]
    assert payload["viewer_limits"]["atom_count_supercell"] == expected_atoms * sc[0] * sc[1] * sc[2]


def test_crystal_viewer_element_radii():
    client = _client()
    resp = client.get("/api/crystallographic_tools/crystal_viewer/element_radii")
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["Fe"] > 0


def test_crystal_viewer_export_structure_respects_limits(simple_cif_bytes):
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/crystal_viewer/export_structure",
        json={"cif": simple_cif_bytes.decode(), "supercell": [10, 10, 10]},
    )
    assert resp.status_code == 400
