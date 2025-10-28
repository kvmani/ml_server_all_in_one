"""Pure utilities for training lightweight tabular ML models."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, Tuple

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


def load_dataset(data: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(BytesIO(data))
    except Exception as exc:  # pragma: no cover - pandas errors vary
        raise TabularError("Invalid CSV file") from exc


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


def train_model(df: pd.DataFrame, target: str) -> TrainingResult:
    X, y = _prepare(df, target)
    task = "classification" if _is_classification(y) else "regression"

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if task == "classification" else None
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    if task == "classification":
        model = LogisticRegression(max_iter=1000)
        model.fit(X_train_scaled, y_train)
        preds = model.predict(X_test_scaled)
        metrics = {"accuracy": float(accuracy_score(y_test, preds))}
        importance = dict(zip(X.columns, np.abs(model.coef_).mean(axis=0)))
    else:
        model = Ridge(alpha=1.0)
        model.fit(X_train_scaled, y_train)
        preds = model.predict(X_test_scaled)
        metrics = {"rmse": float(np.sqrt(mean_squared_error(y_test, preds)))}
        importance = dict(zip(X.columns, np.abs(model.coef_)))

    return TrainingResult(task=task, metrics=metrics, feature_importance=importance)


__all__ = ["TabularError", "TrainingResult", "load_dataset", "train_model"]
