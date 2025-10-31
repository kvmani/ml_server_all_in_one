"""Utilities for managing in-memory tabular datasets and lightweight models."""

from __future__ import annotations

import csv
import math
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from io import BytesIO, StringIO
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

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

NumericSeries = pd.Series


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


@dataclass
class OutlierReport:
    method: str
    inspected_columns: List[str]
    threshold: float
    total_outliers: int
    sample_indices: List[int]


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

    def update(self, token: str, df: pd.DataFrame) -> None:
        with self._lock:
            if token not in self._items:
                raise TabularError("Dataset reference expired. Upload again.")
            self._items[token] = df
            self._items.move_to_end(token)


_STORE = DatasetStore()
_LATEST_RESULTS: "OrderedDict[str, TrainingResult]" = OrderedDict()
_BATCH_PREDICTIONS: "OrderedDict[str, BatchPredictionResult]" = OrderedDict()


def _row_identifier(index: object) -> object:
    if isinstance(index, (int, np.integer)):
        return int(index)
    return str(index)


def _to_python(value: object) -> object:
    return value.item() if hasattr(value, "item") else value


def _to_numeric_series(series: pd.Series) -> NumericSeries:
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.isna().all():
        raise TabularError(f"Column '{series.name}' does not contain numeric values")
    return numeric.astype(float)


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
                stats[column] = {
                    "mean": math.nan,
                    "std": math.nan,
                    "min": math.nan,
                    "max": math.nan,
                }
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


def scatter_points(
    dataset_id: str,
    x: str,
    y: str,
    color: Optional[str] = None,
    *,
    max_points: int = 400,
) -> Dict[str, object]:
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


def histogram_points(
    dataset_id: str,
    column: str,
    *,
    bins: int = 30,
    density: bool = False,
    value_range: Optional[Tuple[float, float]] = None,
) -> Dict[str, object]:
    df = get_dataset(dataset_id)
    if column not in df.columns:
        raise TabularError(f"Column '{column}' not found")
    series = _to_numeric_series(df[column]).dropna()
    if series.empty:
        raise TabularError(f"Column '{column}' does not contain numeric values")

    bins = int(bins)
    if bins < 2 or bins > 200:
        raise TabularError("Histogram bins must be between 2 and 200")

    range_tuple: Optional[Tuple[float, float]] = None
    if value_range:
        start, end = value_range
        if not math.isfinite(start) or not math.isfinite(end):
            raise TabularError("Histogram range must be finite numbers")
        if start >= end:
            raise TabularError("Histogram range minimum must be less than maximum")
        range_tuple = (float(start), float(end))

    counts, edges = np.histogram(
        series.to_numpy(), bins=bins, density=bool(density), range=range_tuple
    )
    centres = (edges[:-1] + edges[1:]) / 2
    return {
        "column": column,
        "bins": bins,
        "density": bool(density),
        "edges": [float(edge) for edge in edges],
        "centres": [float(value) for value in centres],
        "counts": [float(count) for count in counts],
    }


def _numeric_columns(
    df: pd.DataFrame, columns: Optional[Sequence[str]] = None
) -> List[str]:
    if columns:
        missing = [column for column in columns if column not in df.columns]
        if missing:
            raise TabularError("Columns not found: " + ", ".join(missing))
        numeric_columns = [
            column for column in columns if pd.api.types.is_numeric_dtype(df[column])
        ]
        if not numeric_columns:
            raise TabularError("Selected columns do not contain numeric values")
        return numeric_columns
    detected = df.select_dtypes(include=["number"]).columns.tolist()
    if not detected:
        raise TabularError("Dataset has no numeric columns available")
    return detected


def detect_outliers(
    dataset_id: str,
    *,
    columns: Optional[Sequence[str]] = None,
    threshold: float = 3.0,
) -> OutlierReport:
    df = get_dataset(dataset_id)
    if threshold <= 0 or not math.isfinite(threshold):
        raise TabularError("Outlier threshold must be a positive number")

    numeric_columns = _numeric_columns(df, columns)
    z_scores = pd.DataFrame(index=df.index)
    for column in numeric_columns:
        numeric_series = _to_numeric_series(df[column])
        std = float(numeric_series.std(ddof=0))
        if std == 0 or math.isnan(std):
            z_scores[column] = 0.0
            continue
        z_scores[column] = (numeric_series - float(numeric_series.mean())) / std

    mask = (z_scores.abs() > threshold).any(axis=1)
    indices = [int(_row_identifier(idx)) for idx in df.index[mask]]
    return OutlierReport(
        method="zscore",
        inspected_columns=list(numeric_columns),
        threshold=float(threshold),
        total_outliers=len(indices),
        sample_indices=indices[:20],
    )


def remove_outliers(
    dataset_id: str,
    *,
    columns: Optional[Sequence[str]] = None,
    threshold: float = 3.0,
) -> DatasetProfile:
    df = get_dataset(dataset_id)
    report = detect_outliers(dataset_id, columns=columns, threshold=threshold)
    if not report.inspected_columns:
        return build_profile(dataset_id, df)

    numeric_df = df[list(report.inspected_columns)].apply(
        pd.to_numeric, errors="coerce"
    )
    z_scores = pd.DataFrame(index=df.index)
    for column in report.inspected_columns:
        series = numeric_df[column]
        std = float(series.std(ddof=0))
        if std == 0 or math.isnan(std):
            z_scores[column] = 0.0
            continue
        z_scores[column] = (series - float(series.mean())) / std
    mask = (z_scores.abs() > report.threshold).any(axis=1)
    cleaned = df.loc[~mask].reset_index(drop=True)
    _STORE.update(dataset_id, cleaned)
    return build_profile(dataset_id, cleaned)


SUPPORTED_FILTER_OPERATORS = {
    "eq": lambda series, value: series == value,
    "ne": lambda series, value: series != value,
    "gt": lambda series, value: series > value,
    "gte": lambda series, value: series >= value,
    "lt": lambda series, value: series < value,
    "lte": lambda series, value: series <= value,
    "contains": lambda series, value: series.astype(str).str.contains(
        str(value), na=False
    ),
    "in": lambda series, value: series.isin(
        value
        if isinstance(value, Iterable) and not isinstance(value, (str, bytes))
        else [value]
    ),
}


def filter_rows(
    dataset_id: str, rules: Sequence[Mapping[str, object]]
) -> Tuple[DatasetProfile, int]:
    df = get_dataset(dataset_id)
    if not rules:
        raise TabularError("Provide at least one filter rule")

    mask = pd.Series(True, index=df.index)
    for rule in rules:
        column = rule.get("column")
        operator = rule.get("operator", "eq")
        value = rule.get("value")
        if not isinstance(column, str) or column not in df.columns:
            raise TabularError(f"Column '{column}' not found in dataset")
        if operator not in SUPPORTED_FILTER_OPERATORS:
            raise TabularError(f"Unsupported operator '{operator}'")

        series = df[column]
        comparator = SUPPORTED_FILTER_OPERATORS[operator]
        if operator != "contains" and pd.api.types.is_numeric_dtype(series):
            try:
                value = float(value) if value is not None else value
            except (TypeError, ValueError):  # pragma: no cover - defensive fallback
                pass
        mask &= comparator(series, value)

    filtered = df.loc[mask]
    if filtered.empty:
        raise TabularError("Filters removed all rows. Adjust the criteria.")

    filtered = filtered.reset_index(drop=True)
    removed = int(len(df) - len(filtered))
    _STORE.update(dataset_id, filtered)
    profile = build_profile(dataset_id, filtered)
    return profile, removed


AlgorithmParameter = Dict[str, object]


def _algorithm_specs() -> Dict[str, Dict[str, object]]:
    return {
        "linear_model": {
            "label": "Generalised linear model",
            "tasks": {
                "classification": {
                    "use_scaler": True,
                    "builder": lambda: LogisticRegression(
                        max_iter=1000, solver="lbfgs"
                    ),
                    "hyperparameters": {
                        "max_iter": {
                            "type": "int",
                            "default": 1000,
                            "min": 100,
                            "max": 5000,
                            "step": 50,
                        },
                        "C": {
                            "type": "float",
                            "default": 1.0,
                            "min": 0.01,
                            "max": 10.0,
                            "step": 0.01,
                        },
                        "penalty": {
                            "type": "select",
                            "default": "l2",
                            "choices": ["l2", "none"],
                        },
                        "solver": {
                            "type": "select",
                            "default": "lbfgs",
                            "choices": ["lbfgs", "saga"],
                        },
                    },
                },
                "regression": {
                    "use_scaler": True,
                    "builder": lambda: Ridge(alpha=1.0),
                    "hyperparameters": {
                        "alpha": {
                            "type": "float",
                            "default": 1.0,
                            "min": 0.0,
                            "max": 100.0,
                            "step": 0.1,
                        },
                        "fit_intercept": {
                            "type": "bool",
                            "default": True,
                        },
                    },
                },
            },
        },
        "random_forest": {
            "label": "Random forest ensemble",
            "tasks": {
                "classification": {
                    "use_scaler": False,
                    "builder": lambda: RandomForestClassifier(
                        n_estimators=200, random_state=42, n_jobs=-1
                    ),
                    "hyperparameters": {
                        "n_estimators": {
                            "type": "int",
                            "default": 200,
                            "min": 10,
                            "max": 1000,
                            "step": 10,
                        },
                        "max_depth": {
                            "type": "int",
                            "default": None,
                            "min": 1,
                            "max": 50,
                            "nullable": True,
                        },
                        "min_samples_split": {
                            "type": "int",
                            "default": 2,
                            "min": 2,
                            "max": 20,
                        },
                    },
                },
                "regression": {
                    "use_scaler": False,
                    "builder": lambda: RandomForestRegressor(
                        n_estimators=300, random_state=42, n_jobs=-1
                    ),
                    "hyperparameters": {
                        "n_estimators": {
                            "type": "int",
                            "default": 300,
                            "min": 10,
                            "max": 1000,
                            "step": 10,
                        },
                        "max_depth": {
                            "type": "int",
                            "default": None,
                            "min": 1,
                            "max": 50,
                            "nullable": True,
                        },
                        "min_samples_split": {
                            "type": "int",
                            "default": 2,
                            "min": 2,
                            "max": 20,
                        },
                    },
                },
            },
        },
        "gradient_boosting": {
            "label": "Gradient boosting ensemble",
            "tasks": {
                "classification": {
                    "use_scaler": False,
                    "builder": lambda: GradientBoostingClassifier(random_state=42),
                    "hyperparameters": {
                        "n_estimators": {
                            "type": "int",
                            "default": 100,
                            "min": 10,
                            "max": 500,
                            "step": 10,
                        },
                        "learning_rate": {
                            "type": "float",
                            "default": 0.1,
                            "min": 0.01,
                            "max": 1.0,
                            "step": 0.01,
                        },
                        "max_depth": {
                            "type": "int",
                            "default": 3,
                            "min": 1,
                            "max": 8,
                        },
                    },
                },
                "regression": {
                    "use_scaler": False,
                    "builder": lambda: GradientBoostingRegressor(random_state=42),
                    "hyperparameters": {
                        "n_estimators": {
                            "type": "int",
                            "default": 100,
                            "min": 10,
                            "max": 500,
                            "step": 10,
                        },
                        "learning_rate": {
                            "type": "float",
                            "default": 0.1,
                            "min": 0.01,
                            "max": 1.0,
                            "step": 0.01,
                        },
                        "max_depth": {
                            "type": "int",
                            "default": 3,
                            "min": 1,
                            "max": 8,
                        },
                    },
                },
            },
        },
    }


def algorithm_metadata() -> Dict[str, object]:
    metadata: Dict[str, object] = {}
    for algorithm, spec in _algorithm_specs().items():
        entries: List[AlgorithmParameter] = []
        for task, task_spec in spec["tasks"].items():
            for name, definition in task_spec["hyperparameters"].items():
                entry = {
                    "name": name,
                    "label": name.replace("_", " ").title(),
                    "type": definition.get("type", "text"),
                    "default": definition.get("default"),
                    "tasks": [task],
                }
                for key in ("min", "max", "step", "choices", "nullable"):
                    if key in definition:
                        entry[key] = definition[key]
                entries.append(entry)
        # Merge duplicate parameter definitions across tasks
        merged: Dict[str, AlgorithmParameter] = {}
        for entry in entries:
            name = entry["name"]
            if name in merged:
                merged[name]["tasks"] = sorted(
                    set(merged[name]["tasks"] + entry["tasks"])
                )
            else:
                merged[name] = entry
        metadata[algorithm] = {
            "label": spec["label"],
            "hyperparameters": list(merged.values()),
        }
    return metadata


def _apply_hyperparameters(
    estimator: Any,
    algorithm: str,
    task: str,
    overrides: Optional[Mapping[str, object]],
) -> None:
    if not overrides:
        return
    spec = _algorithm_specs()[algorithm]["tasks"][task]
    allowed = spec["hyperparameters"]
    resolved: Dict[str, object] = {}
    for key, value in overrides.items():
        if key not in allowed:
            continue
        definition = allowed[key]
        param_type = definition.get("type")
        if param_type == "int":
            try:
                value = int(float(value))
            except (TypeError, ValueError):
                raise TabularError(
                    f"Hyperparameter '{key}' must be an integer"
                ) from None
        elif param_type == "float":
            try:
                value = float(value)
            except (TypeError, ValueError):
                raise TabularError(f"Hyperparameter '{key}' must be numeric") from None
        elif param_type == "bool":
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"true", "1", "yes"}:
                    value = True
                elif lowered in {"false", "0", "no"}:
                    value = False
                else:
                    raise TabularError(f"Hyperparameter '{key}' must be true or false")
            else:
                value = bool(value)
        elif param_type == "select":
            choices = definition.get("choices", [])
            if value not in choices:
                choices_desc = ", ".join(map(str, choices))
                raise TabularError(
                    f"Hyperparameter '{key}' must be one of: {choices_desc}"
                )
        if definition.get("nullable") and value in ("", None):
            resolved[key] = None
        else:
            resolved[key] = value
    if resolved:
        estimator.set_params(**resolved)


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

    specs = _algorithm_specs()
    if normalized not in specs:
        raise TabularError("Unsupported algorithm selected")

    task_spec = specs[normalized]["tasks"].get(task)
    if task_spec is None:  # pragma: no cover - defensive
        raise TabularError("Algorithm not available for detected task")
    builder = task_spec["builder"]
    model = builder()
    label = specs[normalized]["label"]
    if normalized == "linear_model":
        label = (
            "Logistic regression" if task == "classification" else "Ridge regression"
        )
    return model, task_spec["use_scaler"], normalized, label


def train_on_dataset(
    dataset_id: str,
    target: str,
    *,
    algorithm: str = "auto",
    hyperparameters: Optional[Mapping[str, object]] = None,
) -> TrainingResult:
    df = get_dataset(dataset_id)
    result = train_model(
        df, target, algorithm=algorithm, hyperparameters=hyperparameters
    )
    _LATEST_RESULTS[dataset_id] = result
    # Keep only a small number of cached results
    while len(_LATEST_RESULTS) > _STORE.max_items:
        _LATEST_RESULTS.popitem(last=False)
    return result


def train_model(
    df: pd.DataFrame,
    target: str,
    *,
    algorithm: str = "auto",
    hyperparameters: Optional[Mapping[str, object]] = None,
) -> TrainingResult:
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

    estimator, use_scaler, resolved_algorithm, algorithm_label = _resolve_algorithm(
        task, algorithm
    )
    _apply_hyperparameters(estimator, resolved_algorithm, task, hyperparameters)

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
            importance_values = getattr(
                estimator, "feature_importances_", np.zeros(len(X.columns))
            )
        proba_values: Optional[np.ndarray] = None
        if hasattr(estimator, "predict_proba"):
            proba_values = estimator.predict_proba(X_test_data)
            if proba_values.size:
                evaluation_columns.append("confidence")
        classes: Optional[List[object]] = (
            list(estimator.classes_) if proba_values is not None else None
        )
        for position, (idx, predicted) in enumerate(
            zip(y_test.index, preds, strict=False)
        ):
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
            importance_values = getattr(
                estimator, "feature_importances_", np.zeros(len(X.columns))
            )
        for idx, predicted, actual_value in zip(
            y_test.index, preds, y_test, strict=False
        ):
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
    importance = {
        column: float(importance_array[idx]) for idx, column in enumerate(X.columns)
    }
    # Sort by magnitude descending
    importance = dict(
        sorted(importance.items(), key=lambda item: item[1], reverse=True)
    )
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
        writer.writerow(
            {column: record.get(column, "") for column in result.evaluation_columns}
        )
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


def _build_feature_matrix(
    result: TrainingResult, rows: Iterable[Mapping[str, object]]
) -> np.ndarray:
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


def predict_single(
    dataset_id: str, features: Mapping[str, object]
) -> Dict[str, object]:
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
                    for cls, prob in zip(classes, proba[0], strict=False)
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

    missing = [
        column for column in result.feature_columns if column not in frame.columns
    ]
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
    "algorithm_metadata",
    "detect_outliers",
    "filter_rows",
    "histogram_points",
    "scatter_points",
    "export_predictions_csv",
    "export_batch_predictions_csv",
    "remove_outliers",
    "predict_batch",
    "predict_single",
    "train_model",
    "train_on_dataset",
]
