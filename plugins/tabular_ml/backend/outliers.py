"""Outlier detection helpers for Tabular ML."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .schemas import OutlierApplyRequest, OutlierComputeRequest
from .utils import SessionData, describe_columns


@dataclass(slots=True)
class OutlierComputation:
    mask: np.ndarray
    indices_removed: list[int]
    mask_stats: dict[str, int]


def _numeric_frame(dataframe: pd.DataFrame) -> pd.DataFrame:
    numeric = dataframe.select_dtypes(include=["number"]).copy()
    if numeric.empty:
        raise ValueError("Dataset does not contain numeric columns for outlier detection")
    return numeric


def _iqr_mask(dataframe: pd.DataFrame, k: float) -> np.ndarray:
    numeric = _numeric_frame(dataframe)
    q1 = numeric.quantile(0.25)
    q3 = numeric.quantile(0.75)
    iqr = q3 - q1
    lower = q1 - k * iqr
    upper = q3 + k * iqr
    within_bounds = (numeric >= lower) & (numeric <= upper)
    mask = within_bounds.fillna(True).all(axis=1).to_numpy()
    return mask


def _zscore_mask(dataframe: pd.DataFrame, threshold: float) -> np.ndarray:
    numeric = _numeric_frame(dataframe)
    mean = numeric.mean()
    std = numeric.std(ddof=0).replace(0, np.nan)
    zscores = (numeric - mean) / std
    within = zscores.abs() <= threshold
    mask = within.fillna(True).all(axis=1).to_numpy()
    return mask


def _iforest_mask(dataframe: pd.DataFrame, contamination: float) -> np.ndarray:
    numeric = _numeric_frame(dataframe)
    filled = numeric.fillna(numeric.mean())
    forest = IsolationForest(
        n_estimators=max(100, int(256)),
        contamination=float(contamination),
        random_state=42,
        bootstrap=False,
    )
    predictions = forest.fit_predict(filled.to_numpy())
    mask = predictions == 1
    return mask


def _compute_mask(dataframe: pd.DataFrame, request: OutlierComputeRequest) -> np.ndarray:
    if request.method == "iqr":
        k = request.params.k or 1.5
        return _iqr_mask(dataframe, float(k))
    if request.method == "zscore":
        z = request.params.z or 3.0
        return _zscore_mask(dataframe, float(z))
    contamination = request.params.contamination or 0.05
    return _iforest_mask(dataframe, float(contamination))


def compute_outliers(session: SessionData, request: OutlierComputeRequest) -> OutlierComputation:
    mask = _compute_mask(session.dataframe, request)
    numeric = session.dataframe.select_dtypes(include=["number"])
    outlier_indices = numeric.index[~mask].tolist()
    stats = {
        "total_rows": int(session.dataframe.shape[0]),
        "outlier_rows": int((~mask).sum()),
        "kept_rows": int(mask.sum()),
    }
    session.outlier_state = {
        "mask": mask.tolist(),
        "method": request.method,
        "params": request.params.model_dump(),
    }
    return OutlierComputation(mask=mask, indices_removed=[int(idx) for idx in outlier_indices], mask_stats=stats)


def apply_outliers(session: SessionData, request: OutlierApplyRequest) -> dict[str, object]:
    if request.action == "reset":
        session.outlier_state.clear()
        return {"rows": int(session.dataframe.shape[0]), "status": "reset"}

    state = session.outlier_state
    if not state or "mask" not in state:
        raise ValueError("Outlier mask has not been computed")

    mask_array = np.asarray(state["mask"], dtype=bool)
    dataframe = session.dataframe

    if request.action == "mask":
        stats = {
            "masked_rows": int((~mask_array).sum()),
            "unmasked_rows": int(mask_array.sum()),
        }
        return {"status": "mask", "mask_stats": stats}

    if request.action == "drop":
        kept = dataframe.loc[mask_array].reset_index(drop=True)
        session.dataframe = kept
        summary = describe_columns(session.dataframe)
        summary.update({"status": "drop"})
        return summary

    if request.action == "winsorize":
        numeric = dataframe.select_dtypes(include=["number"])
        capped = numeric.copy()
        q1 = numeric.quantile(0.25)
        q3 = numeric.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - (request.params.k or 1.5) * iqr
        upper = q3 + (request.params.k or 1.5) * iqr
        capped = capped.clip(lower=lower, upper=upper, axis=1)
        dataframe.loc[:, capped.columns] = capped
        session.dataframe = dataframe
        summary = describe_columns(session.dataframe)
        summary.update({"status": "winsorize"})
        return summary

    raise ValueError(f"Unsupported action: {request.action}")


__all__ = ["OutlierComputation", "compute_outliers", "apply_outliers"]
