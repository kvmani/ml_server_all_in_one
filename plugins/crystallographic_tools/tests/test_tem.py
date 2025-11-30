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
    # Includes origin and mirrored quadrants
    assert any(spot["hkl"] == [0, 0, 0] for spot in result["spots"])
    assert any(spot["x"] < 0 for spot in result["spots"])
    assert any(spot["x"] > 0 for spot in result["spots"])
    assert result["calibration"]["wavelength_angstrom"] > 0
