import pandas as pd
import pytest

from plugins.tabular_ml.core import (
    ModelNotReadyError,
    TabularError,
    drop_dataset,
    export_batch_predictions_csv,
    load_dataset,
    predict_batch,
    predict_single,
    register_dataset,
    scatter_points,
    train_model,
    train_on_dataset,
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
    assert result.algorithm == "linear_model"
    assert "Logistic" in result.algorithm_label
    assert "accuracy" in result.metrics
    assert result.evaluation
    assert "residual" in result.evaluation_columns
    assert all(record["residual"] in (0.0, 1.0) for record in result.evaluation)
    assert result.feature_columns == ["feat1", "feat2"]
    assert result.target_column == "target"


def test_register_dataset_builds_profile():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6], "target": [0, 1, 0]})
    profile = register_dataset(df.to_csv(index=False).encode())
    assert profile.dataset_id
    assert len(profile.columns) == 3
    assert profile.numeric_columns


def test_train_model_produces_residuals_for_regression():
    df = pd.DataFrame(
        {
            "feat": [value / 10 for value in range(1, 31)],
            "target": [value / 5 for value in range(1, 31)],
        }
    )
    result = train_model(df, "target")
    assert result.task == "regression"
    assert result.algorithm == "linear_model"
    assert "Ridge" in result.algorithm_label
    assert "rmse" in result.metrics
    assert result.evaluation
    assert any(abs(record["residual"]) > 0 for record in result.evaluation)


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


def test_train_model_supports_random_forest_classifier():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    result = train_model(df, "target", algorithm="random_forest")
    assert result.task == "classification"
    assert result.algorithm == "random_forest"
    assert "Random forest" in result.algorithm_label
    assert "accuracy" in result.metrics


def test_train_model_rejects_unknown_algorithm():
    df = pd.DataFrame(
        {
            "x": [1, 2, 3, 4],
            "target": [2, 3, 4, 5],
        }
    )
    with pytest.raises(TabularError):
        train_model(df, "target", algorithm="unsupported")


def test_predict_single_requires_training():
    df = pd.DataFrame({"feat": [1, 2, 3], "target": [0, 1, 0]})
    profile = register_dataset(df.to_csv(index=False).encode())
    with pytest.raises(ModelNotReadyError):
        predict_single(profile.dataset_id, {"feat": 1})
    drop_dataset(profile.dataset_id)


def test_predict_single_returns_confidence():
    df = pd.DataFrame(
        {
            "feat1": [0, 1, 0, 1, 0, 1, 0, 1],
            "feat2": [1, 0, 1, 0, 1, 0, 1, 0],
            "target": [0, 1, 0, 1, 0, 1, 0, 1],
        }
    )
    profile = register_dataset(df.to_csv(index=False).encode())
    train_on_dataset(profile.dataset_id, "target")
    output = predict_single(profile.dataset_id, {"feat1": 0.5, "feat2": 0.5})
    assert output["target"] == "target"
    assert output["feature_columns"] == ["feat1", "feat2"]
    assert "prediction" in output
    assert "confidence" in output
    assert 0 <= output["confidence"] <= 1
    assert set(output.get("probabilities", {}).keys())
    drop_dataset(profile.dataset_id)


def test_predict_batch_exports_csv():
    df = pd.DataFrame(
        {
            "feat1": [1, 2, 3, 4, 5, 6],
            "feat2": [2, 3, 4, 5, 6, 7],
            "target": [1, 1, 2, 2, 3, 3],
        }
    )
    profile = register_dataset(df.to_csv(index=False).encode())
    train_on_dataset(profile.dataset_id, "target")
    batch_csv = df.drop(columns=["target"]).to_csv(index=False).encode()
    result = predict_batch(profile.dataset_id, batch_csv)
    assert result.row_count == len(df)
    assert "target" in result.columns
    assert result.preview
    csv_bytes = export_batch_predictions_csv(profile.dataset_id)
    assert csv_bytes.startswith(b"feat1")
    drop_dataset(profile.dataset_id)
    with pytest.raises(ModelNotReadyError):
        export_batch_predictions_csv(profile.dataset_id)
