from plugins.crystallographic_tools.core import structure, tem


def test_saed_pattern(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    result = tem.compute_saed_pattern(
        s,
        zone_axis=[1, 0, 0],
        voltage_kv=200,
        camera_length_mm=100,
        max_index=2,
        g_max=10.0,
    )
    assert result["spots"]
    top = result["spots"][0]
    assert {"hkl", "x", "y", "intensity"} <= set(top.keys())
    assert result["calibration"]["wavelength_angstrom"] > 0
