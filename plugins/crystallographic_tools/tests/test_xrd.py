import pytest

from plugins.crystallographic_tools.core import structure, xrd


def test_xrd_peaks(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    pattern = xrd.compute_xrd_peaks(s, tth_min=20, tth_max=80)
    peaks = pattern["peaks"]
    curve = pattern["curve"]
    assert peaks
    assert curve
    top_peak = max(peaks, key=lambda p: p["intensity"])
    assert 20 <= top_peak["two_theta"] <= 80
    assert "hkl" in top_peak
