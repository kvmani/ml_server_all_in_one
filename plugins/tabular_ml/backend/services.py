"""Service layer orchestrating Tabular ML operations."""

from __future__ import annotations

import uuid
from typing import Any, Callable

import numpy as np
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_curve,
    r2_score,
    roc_curve,
)
from sklearn.model_selection import cross_val_score
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline

from .outliers import apply_outliers, compute_outliers
from .preprocess import PreprocessArtifacts, fit_preprocess
from .schemas import (
    BoxRequest,
    CorrRequest,
    HistogramRequest,
    OutlierApplyRequest,
    OutlierComputeRequest,
    PreprocessRequest,
    TrainRequest,
)
from .utils import (
    dataframe_preview,
    describe_columns,
    get_session,
    list_builtin_datasets,
    load_builtin_dataset,
    load_csv_bytes,
    locate_run,
    new_session,
    session_config,
    store_run,
)
from .viz import box_payload, corr_payload, histogram_payload


def dataset_list() -> dict[str, Any]:
    return {"datasets": list_builtin_datasets()}


def dataset_load_from_key(key: str) -> dict[str, Any]:
    dataframe = load_builtin_dataset(key)
    session_id, session = new_session(dataframe)
    preview = dataframe_preview(session.dataframe)
    meta = describe_columns(session.dataframe)
    meta.update(preview)
    meta["session_id"] = session_id
    return meta


def dataset_load_from_bytes(data: bytes) -> dict[str, Any]:
    dataframe = load_csv_bytes(data)
    session_id, session = new_session(dataframe)
    preview = dataframe_preview(session.dataframe)
    meta = describe_columns(session.dataframe)
    meta.update(preview)
    meta["session_id"] = session_id
    return meta


def run_preprocess(request: PreprocessRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    summary, artifacts = fit_preprocess(session.dataframe, request)
    session.target = request.target
    session.preprocess_summary = summary
    session.preprocess_artifacts = {"artifacts": artifacts}
    columns = artifacts.feature_names
    return {"summary": summary, "columns": columns}


def run_outlier_compute(request: OutlierComputeRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    computation = compute_outliers(session, request)
    return {
        "mask_stats": computation.mask_stats,
        "indices_removed": computation.indices_removed,
    }


def run_outlier_apply(request: OutlierApplyRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    return apply_outliers(session, request)


def histogram(request: HistogramRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    return histogram_payload(session.dataframe, request)


def box(request: BoxRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    return box_payload(session.dataframe, request)


def corr(request: CorrRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    return corr_payload(session.dataframe, request)


def _estimator_factory(artifacts: PreprocessArtifacts, algo: str) -> Callable[[], Any]:
    if artifacts.task == "classification":
        if algo == "logreg":
            return lambda: LogisticRegression(max_iter=500, class_weight="balanced")
        if algo == "rf":
            return lambda: RandomForestClassifier(n_estimators=200, random_state=42)
        if algo == "mlp":
            return lambda: MLPClassifier(hidden_layer_sizes=(64,), max_iter=400, random_state=42)
    else:
        if algo == "logreg":
            return lambda: Ridge(alpha=1.0)
        if algo == "rf":
            return lambda: RandomForestRegressor(n_estimators=200, random_state=42)
        if algo == "mlp":
            return lambda: MLPRegressor(hidden_layer_sizes=(64,), max_iter=400, random_state=42)
    raise ValueError(f"Unsupported algorithm '{algo}' for task {artifacts.task}")


def _feature_importances(model: Any, feature_names: list[str]) -> dict[str, float]:
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        return {name: float(value) for name, value in zip(feature_names, importances)}
    if hasattr(model, "coef_"):
        coef = np.ravel(model.coef_)
        return {name: float(value) for name, value in zip(feature_names, coef)}
    return {}


def run_train(request: TrainRequest) -> dict[str, Any]:
    session = get_session(request.session_id)
    container = session.preprocess_artifacts.get("artifacts") if session.preprocess_artifacts else None
    if not isinstance(container, PreprocessArtifacts):
        raise ValueError("Preprocessing must be executed before training")
    artifacts = container

    factory = _estimator_factory(artifacts, request.algo)
    estimator = factory()

    preprocess_for_training = clone(artifacts.transformer)
    model_pipeline = Pipeline([("preprocess", preprocess_for_training), ("model", estimator)])

    X_train = artifacts.X_train
    y_train = artifacts.y_train.to_numpy()
    X_test = artifacts.X_test
    y_test = artifacts.y_test.to_numpy()

    scores = cross_val_score(model_pipeline, X_train, y_train, cv=request.cv)
    model_pipeline.fit(X_train, y_train)

    preprocess_step = model_pipeline.named_steps["preprocess"]
    feature_names = artifacts.feature_names
    if hasattr(preprocess_step, "get_feature_names_out"):
        feature_names = preprocess_step.get_feature_names_out().tolist()

    if artifacts.task == "classification":
        predictions = model_pipeline.predict(X_test)
        metrics = {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "f1": float(f1_score(y_test, predictions, average="weighted")),
            "cv_accuracy": float(scores.mean()),
        }
        roc_data = None
        pr_data = None
        if hasattr(model_pipeline, "predict_proba"):
            probs = model_pipeline.predict_proba(X_test)
            if probs.shape[1] >= 2:
                positive_class = model_pipeline.named_steps["model"].classes_[1]
                fpr, tpr, _ = roc_curve(y_test, probs[:, 1], pos_label=positive_class)
                prec, rec, _ = precision_recall_curve(y_test, probs[:, 1], pos_label=positive_class)
                roc_data = {"fpr": fpr.tolist(), "tpr": tpr.tolist()}
                pr_data = {"precision": prec.tolist(), "recall": rec.tolist()}
        curves = {"roc": roc_data, "pr": pr_data}
    else:
        predictions = model_pipeline.predict(X_test)
        metrics = {
            "rmse": float(np.sqrt(mean_squared_error(y_test, predictions))),
            "mae": float(mean_absolute_error(y_test, predictions)),
            "r2": float(r2_score(y_test, predictions)),
            "cv_r2": float(scores.mean()),
        }
        curves = {}

    feature_importances = _feature_importances(model_pipeline.named_steps["model"], feature_names)
    run_id = uuid.uuid4().hex
    payload = {
        "run_id": run_id,
        "model_summary": {
            "task": artifacts.task,
            "target": artifacts.target,
            "algorithm": request.algo,
            "metrics": metrics,
            "feature_importances": feature_importances,
        },
        "feature_names": feature_names,
        "curves": curves,
        "pipeline": model_pipeline,
    }
    store_run(session, run_id, payload)
    return {
        "run_id": run_id,
        "model_summary": payload["model_summary"],
        "feature_importances": feature_importances or None,
    }


def run_evaluate(run_id: str) -> dict[str, Any]:
    _, payload = locate_run(run_id)
    model_summary = payload.get("model_summary", {})
    curves = payload.get("curves", {})
    response = {
        "metrics": model_summary.get("metrics", {}),
        "model": {
            "task": model_summary.get("task"),
            "target": model_summary.get("target"),
            "algorithm": model_summary.get("algorithm"),
        },
    }
    if curves:
        response["curves"] = curves
    if model_summary.get("feature_importances"):
        response["feature_importances"] = model_summary["feature_importances"]
    return response


__all__ = [
    "dataset_list",
    "dataset_load_from_key",
    "dataset_load_from_bytes",
    "run_preprocess",
    "run_outlier_compute",
    "run_outlier_apply",
    "histogram",
    "box",
    "corr",
    "run_train",
    "run_evaluate",
    "session_config",
]
