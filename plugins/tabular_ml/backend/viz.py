"""Visualization helpers for Tabular ML."""

from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd

from .schemas import BoxRequest, CorrRequest, HistogramRequest
from .utils import ensure_column_exists, ensure_columns_exist


def _kde(series: pd.Series, grid: np.ndarray) -> np.ndarray:
    values = series.to_numpy(dtype=float)
    if values.size < 2:
        return np.zeros_like(grid)
    bandwidth = values.std(ddof=1)
    if not math.isfinite(bandwidth) or bandwidth == 0:
        bandwidth = 1.0
    bandwidth *= values.size ** (-1 / 5)
    if bandwidth <= 0:
        bandwidth = 1.0
    norm = 1 / (values.size * bandwidth * math.sqrt(2 * math.pi))
    diffs = (grid[:, None] - values[None, :]) / bandwidth
    densities = norm * np.exp(-0.5 * diffs**2)
    return densities.sum(axis=1)


def histogram_payload(dataframe: pd.DataFrame, request: HistogramRequest) -> dict[str, object]:
    ensure_column_exists(dataframe, request.column)
    series = dataframe[request.column].dropna()
    if series.empty:
        raise ValueError("Column has no numeric data")
    series = pd.to_numeric(series, errors="coerce").dropna()
    if series.empty:
        raise ValueError("Column has no numeric data")

    value_range = request.range
    if isinstance(value_range, tuple):
        lo, hi = value_range
        series = series[(series >= lo) & (series <= hi)]

    if request.log:
        series = np.log1p(series.clip(min=0))

    bins = request.bins
    if bins == "auto":
        bins = min(40, max(10, int(math.sqrt(series.size))))
    counts, edges = np.histogram(series, bins=int(bins))
    centres = edges[:-1] + np.diff(edges) / 2

    payload: dict[str, object] = {
        "column": request.column,
        "bins": int(bins),
        "counts": counts.tolist(),
        "bin_edges": edges.tolist(),
        "centres": centres.tolist(),
    }

    if request.kde:
        grid = np.linspace(edges[0], edges[-1], num=min(200, int(bins) * 3))
        payload["kde"] = {"x": grid.tolist(), "y": _kde(series, grid).tolist()}
    return payload


def box_payload(dataframe: pd.DataFrame, request: BoxRequest) -> dict[str, object]:
    ensure_column_exists(dataframe, request.column)
    series = pd.to_numeric(dataframe[request.column], errors="coerce").dropna()
    if series.empty:
        raise ValueError("Column has no numeric data")

    def _stats(values: pd.Series) -> dict[str, float]:
        return {
            "min": float(values.min()),
            "q1": float(values.quantile(0.25)),
            "median": float(values.median()),
            "q3": float(values.quantile(0.75)),
            "max": float(values.max()),
        }

    if request.by:
        ensure_column_exists(dataframe, request.by)
        grouped = dataframe[[request.column, request.by]].dropna(subset=[request.by])
        stats = {
            str(level): _stats(pd.to_numeric(group[column], errors="coerce").dropna())
            for level, group in grouped.groupby(request.by)
            if not group.empty
        }
    else:
        stats = {"overall": _stats(series)}
    return {"column": request.column, "group_stats": stats}


def corr_payload(dataframe: pd.DataFrame, request: CorrRequest) -> dict[str, object]:
    if request.columns:
        ensure_columns_exist(dataframe, request.columns)
        columns: Iterable[str] = request.columns
    else:
        columns = dataframe.select_dtypes(include=["number"]).columns.tolist()
    if not columns:
        raise ValueError("No numeric columns available for correlation")
    numeric = dataframe[list(columns)].apply(pd.to_numeric, errors="coerce")
    corr = numeric.corr().fillna(0)
    return {"labels": list(columns), "matrix": corr.to_numpy().tolist()}


__all__ = ["histogram_payload", "box_payload", "corr_payload"]
