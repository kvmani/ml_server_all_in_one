from pathlib import Path

from plugins.crystallographic_tools.core import structure, tem


TEST_DATA = Path(__file__).parent / "data"


def test_saed_pattern(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    pattern = tem.compute_saed_pattern(
        s,
        config=tem.SaedConfig.from_payload(
            s,
            {
                "zone_axis": [1, 0, 0],
                "voltage_kv": 200,
                "camera_length_mm": 100,
                "max_index": 2,
                "min_d_angstrom": 0.5,
            },
        ),
    )

    assert pattern["spots"]
    assert pattern["metadata"]["lambda_angstrom"] > 0
    assert pattern["limits"]["r_max"] > 0
    assert all("x_rot_cm" in spot for spot in pattern["spots"])


def test_bcc_zone_axis_selection():
    fe_path = TEST_DATA / "fe_bcc.cif"
    s = structure.parse_cif_bytes(fe_path.read_bytes())
    zone_axis = (0, 0, 1)
    pattern = tem.compute_saed_pattern(
        s,
        config=tem.SaedConfig.from_payload(
            s,
            {
                "zone_axis": list(zone_axis),
                "max_index": 3,
                "camera_length_cm": 10,
                "intensity_min_relative": 1e-4,
                "min_d_angstrom": 0.9,
            },
        ),
    )

    hkls = {tuple(spot["hkl"]) for spot in pattern["spots"]}
    assert (1, 0, 0) not in hkls  # bcc extinction rule
    assert (1, 1, 0) in hkls
    assert all(sum(hkl[i] * zone_axis[i] for i in range(3)) == 0 for hkl in hkls)
    assert all(tuple(spot["hkl"])[2] == 0 for spot in pattern["spots"])
    assert pattern["limits"]["i_max"] <= 1.0


def test_bcc_zone_axis_dot_rule_111():
    fe_path = TEST_DATA / "fe_bcc.cif"
    s = structure.parse_cif_bytes(fe_path.read_bytes())
    zone_axis = (1, 1, 1)
    pattern = tem.compute_saed_pattern(
        s,
        config=tem.SaedConfig.from_payload(
            s,
            {
                "zone_axis": list(zone_axis),
                "max_index": 4,
                "camera_length_cm": 10,
                "intensity_min_relative": 1e-4,
                "min_d_angstrom": 0.9,
            },
        ),
    )

    hkls = {tuple(spot["hkl"]) for spot in pattern["spots"]}
    assert all(sum(hkl[i] * zone_axis[i] for i in range(3)) == 0 for hkl in hkls)
    assert any(sorted(map(abs, hkl)) == [0, 1, 1] for hkl in hkls if hkl != (0, 0, 0))
