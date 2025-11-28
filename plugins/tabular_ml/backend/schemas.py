"""Request schema definitions for the Tabular ML backend."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from common.validation import SchemaModel


class SplitConfig(SchemaModel):
    train: float = Field(default=0.8, ge=0.1, lt=1)
    seed: int = Field(default=42, ge=0)


class ImputeConfig(SchemaModel):
    numeric: Literal["mean", "median", "most_frequent"] = "mean"
    categorical: Literal["most_frequent", "constant"] = "most_frequent"
    fill_value: str | None = None


class ScaleConfig(SchemaModel):
    method: Literal["none", "standard", "minmax"] = "standard"


class EncodeConfig(SchemaModel):
    one_hot: bool = True
    drop_first: bool = False


class PreprocessRequest(SchemaModel):
    session_id: str
    target: str
    split: SplitConfig = Field(default_factory=SplitConfig)
    impute: ImputeConfig = Field(default_factory=ImputeConfig)
    scale: ScaleConfig = Field(default_factory=ScaleConfig)
    encode: EncodeConfig = Field(default_factory=EncodeConfig)


class OutlierParams(SchemaModel):
    k: float | None = Field(default=1.5, ge=0)
    z: float | None = Field(default=3.0, ge=0)
    contamination: float | None = Field(default=0.05, ge=0, lt=0.5)


class OutlierComputeRequest(SchemaModel):
    session_id: str
    method: Literal["iqr", "zscore", "iforest"]
    params: OutlierParams = Field(default_factory=OutlierParams)


class OutlierApplyRequest(SchemaModel):
    session_id: str
    action: Literal["mask", "drop", "winsorize", "reset"]
    params: OutlierParams = Field(default_factory=OutlierParams)


class HistogramRequest(SchemaModel):
    session_id: str
    column: str
    bins: int | Literal["auto"] = Field(default="auto")
    log: bool = False
    kde: bool = False
    range: tuple[float, float] | None = None


class BoxRequest(SchemaModel):
    session_id: str
    column: str
    by: str | None = None


class CorrRequest(SchemaModel):
    session_id: str
    columns: list[str] | None = None


class TrainRequest(SchemaModel):
    session_id: str
    algo: str
    params: dict[str, object] = Field(default_factory=dict)
    cv: int = Field(default=3, ge=2, le=10)


class EvaluateQuery(SchemaModel):
    run_id: str
