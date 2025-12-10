from pathlib import Path

import pytest

@pytest.fixture
def simple_cif_bytes() -> bytes:
    path = Path(__file__).parent / "data" / "si.cif"
    return path.read_bytes()


@pytest.fixture
def fe_poscar_bytes() -> bytes:
    path = Path(__file__).parent / "data" / "fe_poscar.vasp"
    return path.read_bytes()
