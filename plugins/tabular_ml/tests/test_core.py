import io

import pandas as pd

from plugins.tabular_ml.core import (
    TabularError,
    load_dataset,
    register_dataset,
    scatter_points,
    train_model,
)


def test_load_dataset_and_train_classification():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    csv_bytes = df.to_csv(index=False).encode()
    loaded = load_dataset(csv_bytes)
    result = train_model(loaded, "target")
    assert result.task == "classification"
    assert "accuracy" in result.metrics


def test_register_dataset_builds_profile():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6], "target": [0, 1, 0]})
    profile = register_dataset(df.to_csv(index=False).encode())
    assert profile.dataset_id
    assert len(profile.columns) == 3
    assert profile.numeric_columns


def test_scatter_points_requires_numeric_columns():
    df = pd.DataFrame({"x": [1, 2, 3], "y": [1, 4, 9], "label": ["a", "b", "a"]})
    profile = register_dataset(df.to_csv(index=False).encode())
    data = scatter_points(profile.dataset_id, "x", "y", color="label")
    assert data["x"] and data["y"]
    assert data["color_label"] == "label"


def test_train_model_requires_target():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5]})
    try:
        train_model(df, "missing")
    except TabularError:
        pass
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected TabularError")
