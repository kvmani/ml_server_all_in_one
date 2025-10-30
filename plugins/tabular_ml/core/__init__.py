"""Utilities for managing in-memory tabular datasets and lightweight models."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from io import BytesIO, StringIO
import csv
import math
import threading
import uuid
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


class TabularError(ValueError):
    """Raised when the dataset or parameters are invalid."""


class ModelNotReadyError(TabularError):
    """Raised when inference is requested before a model has been trained."""


@dataclass
class TrainingResult:
    task: str
    algorithm: str
    algorithm_label: str
    metrics: Dict[str, float]
    feature_importance: Dict[str, float]
    evaluation: List[Dict[str, object]]
    evaluation_columns: List[str]
    estimator: Any
    scaler: Optional[StandardScaler]
    feature_columns: List[str]
    target_column: str


@dataclass
class BatchPredictionResult:
    columns: List[str]
    preview: List[Dict[str, object]]
    row_count: int
    csv_bytes: bytes


@dataclass
class DatasetProfile:
    dataset_id: str
    columns: List[Dict[str, object]]
    preview: List[Dict[str, object]]
    shape: Tuple[int, int]
    stats: Dict[str, Dict[str, float]]
    numeric_columns: List[str]


class DatasetStore:
    """Keep uploaded datasets in memory for the duration of the request cycle."""

    def __init__(self, max_items: int = 8) -> None:
        self.max_items = max_items
        self._items: "OrderedDict[str, pd.DataFrame]" = OrderedDict()
        self._lock = threading.Lock()

    def add(self, df: pd.DataFrame) -> str:
        token = uuid.uuid4().hex
        with self._lock:
            self._items[token] = df
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)
        return token

    def get(self, token: str) -> pd.DataFrame:
        with self._lock:
            try:
                df = self._items[token]
            except KeyError as exc:  # pragma: no cover - defensive
                raise TabularError("Dataset reference expired. Upload again.") from exc
            # Move key to end to mark as recently used
            self._items.move_to_end(token)
            return df.copy()

    def remove(self, token: str) -> None:
        with self._lock:
            self._items.pop(token, None)


_STORE = DatasetStore()
_LATEST_RESULTS: "OrderedDict[str, TrainingResult]" = OrderedDict()
_BATCH_PREDICTIONS: "OrderedDict[str, BatchPredictionResult]" = OrderedDict()


def _row_identifier(index: object) -> object:
    if isinstance(index, (int, np.integer)):
        return int(index)
    return str(index)


def _to_python(value: object) -> object:
    return value.item() if hasattr(value, "item") else value


def load_dataset(data: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(BytesIO(data))
    except Exception as exc:  # pragma: no cover - pandas errors vary
        raise TabularError("Invalid CSV file") from exc


def register_dataset(data: bytes) -> DatasetProfile:
    df = load_dataset(data)
    dataset_id = _STORE.add(df)
    return build_profile(dataset_id, df)


def build_profile(dataset_id: str, df: pd.DataFrame) -> DatasetProfile:
    if df.empty:
        raise TabularError("Dataset must contain rows")
    columns_info: List[Dict[str, object]] = []
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    preview_df = df.head(5).copy()
    preview = preview_df.where(preview_df.notna(), None).to_dict(orient="records")
    stats: Dict[str, Dict[str, float]] = {}
    for column in df.columns:
        series = df[column]
        entry = {
            "name": column,
            "dtype": str(series.dtype),
            "missing": int(series.isna().sum()),
            "is_numeric": column in numeric_cols,
        }
        columns_info.append(entry)
        if column in numeric_cols:
            numeric_series = series.dropna().astype(float)
            if numeric_series.empty:
                stats[column] = {"mean": math.nan, "std": math.nan, "min": math.nan, "max": math.nan}
            else:
                stats[column] = {
                    "mean": float(numeric_series.mean()),
                    "std": float(numeric_series.std(ddof=0)),
                    "min": float(numeric_series.min()),
                    "max": float(numeric_series.max()),
                }
    return DatasetProfile(
        dataset_id=dataset_id,
        columns=columns_info,
        preview=preview,
        shape=(int(df.shape[0]), int(df.shape[1])),
        stats=stats,
        numeric_columns=numeric_cols,
    )


def get_dataset(dataset_id: str) -> pd.DataFrame:
    return _STORE.get(dataset_id)


def drop_dataset(dataset_id: str) -> None:
    _STORE.remove(dataset_id)
    _LATEST_RESULTS.pop(dataset_id, None)
    _BATCH_PREDICTIONS.pop(dataset_id, None)


def scatter_points(dataset_id: str, x: str, y: str, color: Optional[str] = None, *, max_points: int = 400) -> Dict[str, object]:
    df = get_dataset(dataset_id)
    for column in (x, y):
        if column not in df.columns:
            raise TabularError(f"Column '{column}' not found")
    numeric = df[[x, y]].dropna()
    if numeric.empty:
        raise TabularError("Selected columns must contain numeric values")
    if color and color not in df.columns:
        raise TabularError(f"Colour column '{color}' not found")
    if len(numeric) > max_points:
        numeric = numeric.sample(n=max_points, random_state=42)
    result: Dict[str, object] = {
        "x": numeric[x].astype(float).tolist(),
        "y": numeric[y].astype(float).tolist(),
        "x_label": x,
        "y_label": y,
    }
    if color:
        colour_series = df.loc[numeric.index, color]
        if colour_series.dtype.kind in "biufc":
            result["color"] = colour_series.astype(float).tolist()
            result["color_mode"] = "numeric"
        else:
            result["color"] = colour_series.fillna("(missing)").astype(str).tolist()
            result["color_mode"] = "category"
        result["color_label"] = color
    return result


def _prepare(df: pd.DataFrame, target: str) -> Tuple[pd.DataFrame, pd.Series]:
    if target not in df.columns:
        raise TabularError("Target column not found")
    X = df.drop(columns=[target])
    y = df[target]
    if X.empty:
        raise TabularError("Dataset must contain feature columns")
    X = X.select_dtypes(include=["number"])
    if X.empty:
        raise TabularError("Only numeric features are supported")
    y = y.squeeze()
    return X, y


def _is_classification(y: pd.Series) -> bool:
    return y.nunique() <= max(10, int(len(y) * 0.05))


def _resolve_algorithm(task: str, requested: str) -> Tuple[object, bool, str, str]:
    """Select an estimator for the detected task."""

    normalized = (requested or "auto").strip().lower()
    if not normalized or normalized == "auto":
        normalized = "linear_model"

    if normalized == "linear_model":
        if task == "classification":
            model = LogisticRegression(max_iter=1000)
            label = "Logistic regression"
        else:
            model = Ridge(alpha=1.0)
            label = "Ridge regression"
        return model, True, "linear_model", label

    if normalized == "random_forest":
        if task == "classification":
            model = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
            label = "Random forest classifier"
        else:
            model = RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1)
            label = "Random forest regressor"
        return model, False, "random_forest", label

    if normalized == "gradient_boosting":
        if task == "classification":
            model = GradientBoostingClassifier(random_state=42)
            label = "Gradient boosting classifier"
        else:
            model = GradientBoostingRegressor(random_state=42)
            label = "Gradient boosting regressor"
        return model, False, "gradient_boosting", label

    raise TabularError("Unsupported algorithm selected")


def train_on_dataset(dataset_id: str, target: str, *, algorithm: str = "auto") -> TrainingResult:
    df = get_dataset(dataset_id)
    result = train_model(df, target, algorithm=algorithm)
    _LATEST_RESULTS[dataset_id] = result
    # Keep only a small number of cached results
    while len(_LATEST_RESULTS) > _STORE.max_items:
        _LATEST_RESULTS.popitem(last=False)
    return result


def train_model(df: pd.DataFrame, target: str, *, algorithm: str = "auto") -> TrainingResult:
    X, y = _prepare(df, target)
    task = "classification" if _is_classification(y) else "regression"

    holdout = len(X) >= 8 and (task != "classification" or y.value_counts().min() >= 2)
    if holdout:
        test_size = 0.2
        stratify_target = y if task == "classification" else None
        if task == "classification":
            class_counts = y.value_counts()
            if len(y) * test_size < len(class_counts) or class_counts.min() < 2:
                stratify_target = None
                test_size = max(test_size, min(0.5, len(class_counts) / len(y) + 0.1))
        if len(X) < 5:
            test_size = max(test_size, 0.5)
        test_size = min(test_size, 0.5)
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=42,
            stratify=stratify_target,
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    estimator, use_scaler, resolved_algorithm, algorithm_label = _resolve_algorithm(task, algorithm)

    scaler: Optional[StandardScaler] = None
    if use_scaler:
        scaler = StandardScaler()
        X_train_data = scaler.fit_transform(X_train)
        X_test_data = scaler.transform(X_test)
    else:
        X_train_data = X_train.values
        X_test_data = X_test.values

    evaluation: List[Dict[str, object]] = []
    evaluation_columns: List[str] = ["row_index", "actual", "predicted", "residual"]

    if task == "classification":
        estimator.fit(X_train_data, y_train)
        preds = estimator.predict(X_test_data)
        metrics = {"accuracy": float(accuracy_score(y_test, preds))}
        if hasattr(estimator, "coef_"):
            coef = np.abs(np.asarray(estimator.coef_))
            importance_values = coef.mean(axis=0) if coef.ndim > 1 else coef
        else:
            importance_values = getattr(estimator, "feature_importances_", np.zeros(len(X.columns)))
        proba_values: Optional[np.ndarray] = None
        if hasattr(estimator, "predict_proba"):
            proba_values = estimator.predict_proba(X_test_data)
            if proba_values.size:
                evaluation_columns.append("confidence")
        classes: Optional[List[object]] = list(estimator.classes_) if proba_values is not None else None
        for position, (idx, predicted) in enumerate(zip(y_test.index, preds)):
            actual_value = y_test.iloc[position]
            row: Dict[str, object] = {
                "row_index": _row_identifier(idx),
                "actual": _to_python(actual_value),
                "predicted": _to_python(predicted),
                "residual": float(predicted != actual_value),
            }
            if proba_values is not None and classes:
                try:
                    class_index = classes.index(row["predicted"])
                except ValueError:  # pragma: no cover - defensive
                    class_index = None
                if class_index is not None:
                    row["confidence"] = float(proba_values[position][class_index])
            evaluation.append(row)
    else:
        estimator.fit(X_train_data, y_train)
        preds = estimator.predict(X_test_data)
        metrics = {"rmse": float(np.sqrt(mean_squared_error(y_test, preds)))}
        if hasattr(estimator, "coef_"):
            coef = np.abs(np.asarray(estimator.coef_))
            importance_values = coef
        else:
            importance_values = getattr(estimator, "feature_importances_", np.zeros(len(X.columns)))
        for idx, predicted, actual_value in zip(y_test.index, preds, y_test):
            predicted_value = float(predicted)
            actual_scalar = float(actual_value)
            row = {
                "row_index": _row_identifier(idx),
                "actual": actual_scalar,
                "predicted": predicted_value,
                "residual": float(predicted_value - actual_scalar),
            }
            evaluation.append(row)

    importance_array = np.asarray(importance_values)
    if importance_array.ndim > 1:
        importance_array = importance_array.flatten()
    if importance_array.shape[0] != len(X.columns):
        importance_array = np.resize(importance_array, len(X.columns))
    importance = {column: float(importance_array[idx]) for idx, column in enumerate(X.columns)}
    # Sort by magnitude descending
    importance = dict(sorted(importance.items(), key=lambda item: item[1], reverse=True))
    return TrainingResult(
        task=task,
        algorithm=resolved_algorithm,
        algorithm_label=algorithm_label,
        metrics=metrics,
        feature_importance=importance,
        evaluation=evaluation,
        evaluation_columns=evaluation_columns,
        estimator=estimator,
        scaler=scaler,
        feature_columns=list(X.columns),
        target_column=target,
    )


def latest_result(dataset_id: str) -> Optional[TrainingResult]:
    return _LATEST_RESULTS.get(dataset_id)


def export_predictions_csv(result: TrainingResult) -> bytes:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=result.evaluation_columns)
    writer.writeheader()
    for record in result.evaluation:
        writer.writerow({column: record.get(column, "") for column in result.evaluation_columns})
    return buffer.getvalue().encode("utf-8")


def _normalise_feature_value(value: object, column: str) -> float:
    if isinstance(value, (int, float, np.integer, np.floating)):
        numeric = float(value)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            raise TabularError(f"Feature '{column}' is required for inference")
        try:
            numeric = float(stripped)
        except ValueError as exc:  # pragma: no cover - defensive
            raise TabularError(f"Feature '{column}' must be numeric") from exc
    else:
        raise TabularError(f"Feature '{column}' must be numeric")
    if not math.isfinite(numeric):
        raise TabularError(f"Feature '{column}' must be a finite number")
    return numeric


def _build_feature_matrix(result: TrainingResult, rows: Iterable[Mapping[str, object]]) -> np.ndarray:
    if not result.feature_columns:
        raise TabularError("Model does not expose numeric features for inference")
    matrix: List[List[float]] = []
    for row in rows:
        values: List[float] = []
        for column in result.feature_columns:
            if column not in row:
                raise TabularError(f"Missing feature '{column}' for inference")
            values.append(_normalise_feature_value(row[column], column))
        matrix.append(values)
    feature_array = np.asarray(matrix, dtype=float)
    if result.scaler is not None:
        feature_array = result.scaler.transform(feature_array)
    return feature_array


def predict_single(dataset_id: str, features: Mapping[str, object]) -> Dict[str, object]:
    result = latest_result(dataset_id)
    if result is None:
        raise ModelNotReadyError("Train a model before running inference")
    feature_matrix = _build_feature_matrix(result, [features])
    prediction = result.estimator.predict(feature_matrix)[0]
    payload: Dict[str, object] = {
        "task": result.task,
        "target": result.target_column,
        "feature_columns": result.feature_columns,
        "prediction": _to_python(prediction),
    }
    if result.task == "classification" and hasattr(result.estimator, "predict_proba"):
        proba = result.estimator.predict_proba(feature_matrix)
        if proba.size:
            classes = getattr(result.estimator, "classes_", None)
            if classes is not None:
                probabilities = {
                    str(_to_python(cls)): float(prob)
                    for cls, prob in zip(classes, proba[0])
                }
                payload["probabilities"] = probabilities
                payload["confidence"] = float(max(probabilities.values()))
    return payload


def predict_batch(dataset_id: str, data: bytes) -> BatchPredictionResult:
    result = latest_result(dataset_id)
    if result is None:
        raise ModelNotReadyError("Train a model before running inference")

    frame = load_dataset(data)
    if frame.empty:
        raise TabularError("Batch CSV must contain at least one row")

    missing = [column for column in result.feature_columns if column not in frame.columns]
    if missing:
        raise TabularError(
            "Batch CSV is missing required feature columns: " + ", ".join(missing)
        )

    features = frame[result.feature_columns].copy()
    for column in result.feature_columns:
        features[column] = pd.to_numeric(features[column], errors="coerce")
    if features.isna().any().any():
        raise TabularError("Batch CSV contains non-numeric or missing feature values")

    feature_matrix = features.to_numpy(dtype=float)
    if result.scaler is not None:
        feature_matrix = result.scaler.transform(feature_matrix)

    predictions = result.estimator.predict(feature_matrix)
    output = features.copy()
    prediction_column = result.target_column or "prediction"
    output[prediction_column] = [_to_python(value) for value in predictions]

    if result.task == "classification" and hasattr(result.estimator, "predict_proba"):
        proba = result.estimator.predict_proba(feature_matrix)
        if proba.size:
            confidence = np.max(proba, axis=1)
            output["confidence"] = [float(value) for value in confidence]

    preview_df = output.head(5).copy()
    preview_records: List[Dict[str, object]] = []
    for record in preview_df.to_dict(orient="records"):
        clean_record: Dict[str, object] = {}
        for key, value in record.items():
            if isinstance(value, float) and not math.isfinite(value):
                clean_record[key] = None
            else:
                clean_record[key] = _to_python(value)
        preview_records.append(clean_record)

    buffer = StringIO()
    output.to_csv(buffer, index=False)
    csv_bytes = buffer.getvalue().encode("utf-8")

    batch_result = BatchPredictionResult(
        columns=[str(column) for column in output.columns],
        preview=preview_records,
        row_count=int(len(output)),
        csv_bytes=csv_bytes,
    )

    _BATCH_PREDICTIONS[dataset_id] = batch_result
    while len(_BATCH_PREDICTIONS) > _STORE.max_items:
        _BATCH_PREDICTIONS.popitem(last=False)

    return batch_result


def latest_batch_prediction(dataset_id: str) -> Optional[BatchPredictionResult]:
    return _BATCH_PREDICTIONS.get(dataset_id)


def export_batch_predictions_csv(dataset_id: str) -> bytes:
    batch = latest_batch_prediction(dataset_id)
    if batch is None:
        raise ModelNotReadyError("Run batch predictions before downloading results")
    return batch.csv_bytes


__all__ = [
    "DatasetProfile",
    "BatchPredictionResult",
    "ModelNotReadyError",
    "TabularError",
    "TrainingResult",
    "build_profile",
    "drop_dataset",
    "get_dataset",
    "load_dataset",
    "register_dataset",
    "latest_result",
    "latest_batch_prediction",
    "scatter_points",
    "export_predictions_csv",
    "export_batch_predictions_csv",
    "predict_batch",
    "predict_single",
    "train_model",
    "train_on_dataset",
]
