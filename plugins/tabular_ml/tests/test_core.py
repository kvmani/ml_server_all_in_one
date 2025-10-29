import pandas as pd

from plugins.tabular_ml.core import TabularError, load_dataset, train_model


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


def test_train_model_requires_target():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [3, 4, 5]})
    try:
        train_model(df, "missing")
    except TabularError:
        pass
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected TabularError")
