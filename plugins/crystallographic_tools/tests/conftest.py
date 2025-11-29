import pytest

@pytest.fixture
def simple_cif_bytes() -> bytes:
    path = Path(__file__).parent / "data" / "si.cif"
    return path.read_bytes()
