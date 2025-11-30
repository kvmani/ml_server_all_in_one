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


def test_tem_saed_endpoint():
    client = _client()
    resp = client.post(
        "/api/crystallographic_tools/tem_saed",
        json={"cif": SIMPLE_CIF.decode(), "zone_axis": [1, 0, 0], "max_index": 2},
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["spots"]
    assert payload["calibration"]["camera_length_mm"] == 100.0


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
