"""Preprocessing utilities for Tabular ML."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, StandardScaler

from .schemas import EncodeConfig, ImputeConfig, PreprocessRequest, ScaleConfig


@dataclass(slots=True)
class PreprocessArtifacts:
    transformer: ColumnTransformer
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    feature_names: list[str]
    target: str
    task: Literal["classification", "regression"]
    missing_summary: dict[str, object]


def _target_task(series: pd.Series) -> Literal["classification", "regression"]:
    if pd.api.types.is_numeric_dtype(series) and series.nunique(dropna=True) > 20:
        return "regression"
    return "classification"


def _numeric_transformer(impute: ImputeConfig, scale: ScaleConfig) -> Pipeline:
    steps = [("impute", SimpleImputer(strategy=impute.numeric))]
    if scale.method == "standard":
        steps.append(("scale", StandardScaler()))
    elif scale.method == "minmax":
        steps.append(("scale", MinMaxScaler()))
    return Pipeline(steps)


def _categorical_transformer(impute: ImputeConfig, encode: EncodeConfig) -> Pipeline:
    fill_value = impute.fill_value if impute.categorical == "constant" else None
    imputer = SimpleImputer(strategy=impute.categorical, fill_value=fill_value or "__missing__")
    encoder = OneHotEncoder(handle_unknown="ignore", drop="first" if encode.drop_first else None)
    return Pipeline([("impute", imputer), ("encode", encoder)])


def fit_preprocess(
    dataframe: pd.DataFrame, request: PreprocessRequest
) -> tuple[dict[str, object], PreprocessArtifacts]:
    if request.target not in dataframe.columns:
        raise KeyError(f"Target column '{request.target}' not found")

    total_rows = int(dataframe.shape[0])
    working = dataframe.dropna(subset=[request.target]).copy()
    dropped_rows = total_rows - int(working.shape[0])
    target_series = working.pop(request.target)
    task = _target_task(target_series)

    numeric_columns = [
        column for column in working.columns if pd.api.types.is_numeric_dtype(working[column])
    ]
    categorical_columns = [column for column in working.columns if column not in numeric_columns]

    missing_per_column = working.isna().sum()
    total_missing = int(missing_per_column.sum())
    rows_with_missing = int(working.isna().any(axis=1).sum())
    missing_summary = {
        "target_rows_dropped": int(dropped_rows),
        "rows_with_missing_features": rows_with_missing,
        "imputed_cells": total_missing,
        "by_column": {column: int(count) for column, count in missing_per_column.items() if count > 0},
    }

    transformers = []
    if numeric_columns:
        transformers.append(("numeric", _numeric_transformer(request.impute, request.scale), numeric_columns))
    if categorical_columns and request.encode.one_hot:
        transformers.append(
            ("categorical", _categorical_transformer(request.impute, request.encode), categorical_columns)
        )
    elif categorical_columns:
        # Fall back to simple imputation without encoding
        transformers.append(
            (
                "categorical",
                Pipeline(
                    [
                        (
                            "impute",
                            SimpleImputer(
                                strategy=request.impute.categorical,
                                fill_value=request.impute.fill_value or "missing",
                            ),
                        ),
                    ]
                ),
                categorical_columns,
            )
        )

    transformer = ColumnTransformer(transformers, remainder="drop")

    X_train, X_test, y_train, y_test = train_test_split(
        working,
        target_series,
        train_size=request.split.train,
        random_state=request.split.seed,
        stratify=target_series if task == "classification" and target_series.nunique() > 1 else None,
    )

    transformer.fit(X_train)

    if hasattr(transformer, "get_feature_names_out"):
        feature_names = transformer.get_feature_names_out().tolist()
    else:  # pragma: no cover - sklearn < 1.0 compatibility
        feature_names = [f"f{i}" for i in range(transformer.transform(X_train).shape[1])]

    summary = {
        "target": request.target,
        "task": task,
        "rows": {"train": int(X_train.shape[0]), "test": int(X_test.shape[0])},
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "missing": missing_summary,
    }

    artifacts = PreprocessArtifacts(
        transformer=transformer,
        X_train=X_train.reset_index(drop=True),
        X_test=X_test.reset_index(drop=True),
        y_train=y_train.reset_index(drop=True),
        y_test=y_test.reset_index(drop=True),
        feature_names=feature_names,
        target=request.target,
        task=task,
        missing_summary=missing_summary,
    )

    return summary, artifacts


__all__ = ["PreprocessArtifacts", "fit_preprocess"]
