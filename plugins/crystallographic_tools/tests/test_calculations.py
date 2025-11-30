import math

import pytest
from pymatgen.core import Lattice

from plugins.crystallographic_tools.core import calculations, structure


def test_hexagonal_detection():
    lattice = Lattice.from_parameters(3.0, 3.0, 5.0, 90, 90, 120)
    assert calculations.is_hexagonal_lattice(lattice) is True


def test_index_conversions_round_trip():
    three_dir = [1, 0, 0]
    four_dir = calculations.direction_three_to_four(three_dir)
    back_dir = calculations.direction_four_to_three(four_dir)
    assert back_dir == [1, 0, 0]

    three_plane = [1, 0, 0]
    four_plane = calculations.plane_three_to_four(three_plane)
    back_plane = calculations.plane_four_to_three(four_plane)
    assert back_plane == [1, 0, 0]


def test_angles_and_equivalents(simple_cif_bytes):
    s = structure.parse_cif_bytes(simple_cif_bytes)
    angle = calculations.angle_between_directions(s.lattice, [1, 0, 0], [0, 1, 0])
    assert angle == pytest.approx(90.0)

    plane_angle = calculations.plane_vector_angle(s.lattice, [1, 0, 0], [0, 0, 1])
    assert plane_angle == pytest.approx(90.0)

    equivalents = calculations.symmetry_equivalents(s, [1, 0, 0], kind="direction")
    assert [1, 0, 0] in equivalents
    assert [-1, 0, 0] in equivalents
