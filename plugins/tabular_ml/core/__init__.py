"""Utilities for managing in-memory tabular datasets and lightweight models."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from io import BytesIO
import math
import threading
import uuid
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


class TabularError(ValueError):
    """Raised when the dataset or parameters are invalid."""


@dataclass
class TrainingResult:
    task: str
    metrics: Dict[str, float]
    feature_importance: Dict[str, float]


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


def train_on_dataset(dataset_id: str, target: str) -> TrainingResult:
    df = get_dataset(dataset_id)
    return train_model(df, target)


def train_model(df: pd.DataFrame, target: str) -> TrainingResult:
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

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    if task == "classification":
        model = LogisticRegression(max_iter=1000)
        model.fit(X_train_scaled, y_train)
        preds = model.predict(X_test_scaled)
        metrics = {"accuracy": float(accuracy_score(y_test, preds))}
        importance_values = np.abs(model.coef_).mean(axis=0)
    else:
        model = Ridge(alpha=1.0)
        model.fit(X_train_scaled, y_train)
        preds = model.predict(X_test_scaled)
        metrics = {"rmse": float(np.sqrt(mean_squared_error(y_test, preds)))}
        importance_values = np.abs(model.coef_)

    importance = dict(zip(X.columns, importance_values))
    # Sort by magnitude descending
    importance = dict(sorted(importance.items(), key=lambda item: item[1], reverse=True))
    return TrainingResult(task=task, metrics=metrics, feature_importance=importance)


__all__ = [
    "DatasetProfile",
    "TabularError",
    "TrainingResult",
    "build_profile",
    "drop_dataset",
    "get_dataset",
    "load_dataset",
    "register_dataset",
    "scatter_points",
    "train_model",
    "train_on_dataset",
]
