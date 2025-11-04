"""Utility helpers for the Tabular ML plugin backend."""

from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

import pandas as pd


_ASSETS_ROOT = Path(__file__).resolve().parent.parent / "assets" / "datasets"
_REGISTRY_PATH = _ASSETS_ROOT / "registry.json"
_SESSION_TTL = timedelta(minutes=30)


@dataclass(slots=True)
class SessionData:
    """In-memory representation for an active Tabular ML session."""

    dataframe: pd.DataFrame
    session_id: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_accessed: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    target: str | None = None
    preprocess_summary: dict[str, Any] = field(default_factory=dict)
    preprocess_artifacts: dict[str, Any] = field(default_factory=dict)
    outlier_state: dict[str, Any] = field(default_factory=dict)
    runs: dict[str, Dict[str, Any]] = field(default_factory=dict)

    def touch(self) -> None:
        self.last_accessed = datetime.now(timezone.utc)


class SessionStore:
    """Thread-safe in-memory session registry with TTL purging."""

    def __init__(self) -> None:
        self._items: dict[str, SessionData] = {}
        self._lock = threading.Lock()

    def _purge_locked(self) -> None:
        now = datetime.now(timezone.utc)
        expired = [
            session_id
            for session_id, session in self._items.items()
            if now - session.last_accessed > _SESSION_TTL
        ]
        for session_id in expired:
            self._items.pop(session_id, None)

    def create(self, dataframe: pd.DataFrame) -> tuple[str, SessionData]:
        session_id = uuid.uuid4().hex
        with self._lock:
            self._purge_locked()
            data = SessionData(dataframe=dataframe.copy(), session_id=session_id)
            self._items[session_id] = data
        return session_id, data

    def get(self, session_id: str) -> SessionData:
        with self._lock:
            self._purge_locked()
            try:
                data = self._items[session_id]
            except KeyError as exc:  # pragma: no cover - defensive
                raise KeyError("Session expired or not found") from exc
            data.touch()
            return data

    def delete(self, session_id: str) -> None:
        with self._lock:
            session = self._items.pop(session_id, None)
            if session is not None:
                for run_id in list(session.runs.keys()):
                    _RUN_INDEX.pop(run_id, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


_SESSION_STORE = SessionStore()
_RUN_INDEX: dict[str, str] = {}


def get_session(session_id: str) -> SessionData:
    return _SESSION_STORE.get(session_id)


def new_session(dataframe: pd.DataFrame) -> tuple[str, SessionData]:
    return _SESSION_STORE.create(dataframe)


def clear_session(session_id: str) -> None:
    _SESSION_STORE.delete(session_id)


def list_builtin_datasets() -> list[dict[str, Any]]:
    with _REGISTRY_PATH.open("r", encoding="utf-8") as handle:
        registry = json.load(handle)
    datasets: list[dict[str, Any]] = []
    for entry in registry:
        file_path = _ASSETS_ROOT / entry["file"]
        df = pd.read_csv(file_path)
        datasets.append(
            {
                "key": entry["key"],
                "name": entry.get("name", entry["key"].title()),
                "rows": int(df.shape[0]),
                "cols": int(df.shape[1]),
                "license": entry.get("license", ""),
            }
        )
    return datasets


def load_builtin_dataset(key: str) -> pd.DataFrame:
    with _REGISTRY_PATH.open("r", encoding="utf-8") as handle:
        registry = {entry["key"]: entry for entry in json.load(handle)}
    entry = registry.get(key)
    if not entry:
        raise KeyError(f"Unknown dataset key: {key}")
    file_path = _ASSETS_ROOT / entry["file"]
    return pd.read_csv(file_path)


def load_csv_bytes(data: bytes) -> pd.DataFrame:
    try:
        dataframe = pd.read_csv(BytesIO(data))
    except Exception as exc:  # pragma: no cover - pandas error messages vary
        raise ValueError("Invalid CSV data") from exc
    if dataframe.empty:
        raise ValueError("CSV file must contain at least one row")
    return dataframe


def dataframe_preview(dataframe: pd.DataFrame, *, head: int = 5) -> dict[str, Any]:
    preview_df = dataframe.head(head)
    preview = preview_df.where(preview_df.notna(), None).to_dict(orient="records")
    dtypes = {column: str(dtype) for column, dtype in dataframe.dtypes.items()}
    return {"head": preview, "dtypes": dtypes}


def describe_columns(dataframe: pd.DataFrame) -> dict[str, Any]:
    columns: list[dict[str, Any]] = []
    for column in dataframe.columns:
        series = dataframe[column]
        columns.append(
            {
                "name": column,
                "dtype": str(series.dtype),
                "missing": int(series.isna().sum()),
                "is_numeric": pd.api.types.is_numeric_dtype(series),
            }
        )
    return {"columns": columns, "shape": [int(dataframe.shape[0]), int(dataframe.shape[1])]}


def store_run(session: SessionData, run_id: str, payload: Mapping[str, Any]) -> None:
    session.runs[run_id] = dict(payload)
    if session.session_id:
        _RUN_INDEX[run_id] = session.session_id


def get_run(session: SessionData, run_id: str) -> Mapping[str, Any]:
    try:
        return session.runs[run_id]
    except KeyError as exc:
        raise KeyError("Run not found for session") from exc


def locate_run(run_id: str) -> tuple[str, Mapping[str, Any]]:
    session_id = _RUN_INDEX.get(run_id)
    if not session_id:
        raise KeyError("Run ID not found")
    session = get_session(session_id)
    return session_id, get_run(session, run_id)


def session_config(app_config: Mapping[str, Any]) -> dict[str, Any]:
    plugin_settings = app_config.get("PLUGIN_SETTINGS", {}).get("tabular_ml", {})
    upload = plugin_settings.get("upload", {})
    limits = {
        "max_mb": upload.get("max_mb", 10),
        "max_files": upload.get("max_files", 1),
        "max_columns": plugin_settings.get("max_columns", 200),
        "max_rows": plugin_settings.get("max_rows", 100000),
    }
    return {"upload": limits}


def to_serialisable_records(dataframe: pd.DataFrame, *, max_rows: int = 20) -> list[dict[str, Any]]:
    sample = dataframe.head(max_rows).copy()
    return sample.where(sample.notna(), None).to_dict(orient="records")


def ensure_column_exists(dataframe: pd.DataFrame, column: str) -> None:
    if column not in dataframe.columns:
        raise KeyError(f"Column '{column}' does not exist")


def ensure_columns_exist(dataframe: pd.DataFrame, columns: Iterable[str]) -> None:
    missing = [column for column in columns if column not in dataframe.columns]
    if missing:
        raise KeyError(f"Columns not found: {', '.join(missing)}")


__all__ = [
    "SessionData",
    "SessionStore",
    "clear_session",
    "dataframe_preview",
    "describe_columns",
    "ensure_column_exists",
    "ensure_columns_exist",
    "get_run",
    "get_session",
    "locate_run",
    "list_builtin_datasets",
    "load_builtin_dataset",
    "load_csv_bytes",
    "new_session",
    "session_config",
    "store_run",
    "to_serialisable_records",
]
