from common.forms import get_bool, get_float, get_int
from common.validate import ValidationError


def test_get_float_with_defaults_and_bounds():
    assert get_float({}, "value", 1.5) == 1.5
    assert get_float({"value": "2.25"}, "value", 1.5) == 2.25

    try:
        get_float({"value": "bad"}, "value", 1.5)
    except ValidationError as exc:
        assert "Invalid value" in str(exc)
    else:  # pragma: no cover - defensive guard
        raise AssertionError("Expected ValidationError for non-numeric input")

    try:
        get_float({"value": "0.1"}, "value", 1.5, minimum=0.5)
    except ValidationError as exc:
        assert "must be ≥" in str(exc)
    else:  # pragma: no cover - defensive guard
        raise AssertionError("Expected ValidationError for values below minimum")


def test_get_int_rounds_and_clamps():
    assert get_int({}, "count", 3) == 3
    assert get_int({"count": "4.2"}, "count", 3) == 4

    try:
        get_int({"count": "-1"}, "count", 3, minimum=0)
    except ValidationError as exc:
        assert "must be ≥" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected minimum guard")

    try:
        get_int({"count": "10"}, "count", 3, maximum=5)
    except ValidationError as exc:
        assert "must be ≤" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected maximum guard")


def test_get_bool_handles_various_types():
    assert get_bool({}, "flag", default=True) is True
    assert get_bool({"flag": "on"}, "flag", default=False) is True
    assert get_bool({"flag": "OFF"}, "flag", default=True) is False
    assert get_bool({"flag": 0}, "flag", default=True) is False
