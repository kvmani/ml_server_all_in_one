"""Service layer orchestrating Tabular ML operations."""

from __future__ import annotations

import uuid
from typing import Any, Callable, Mapping

import numpy as np
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesClassifier, ExtraTreesRegressor, GradientBoostingClassifier, GradientBoostingRegressor
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

try:  # Optional PyTorch (CPU) support
    import torch
    from torch import nn

    TORCH_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    TORCH_AVAILABLE = False

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
    configure_session_store,
    dataframe_preview,
    describe_columns,
    enforce_dataframe_limits,
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


def _torch_seed_everything(seed: int = 42) -> None:
    if not TORCH_AVAILABLE:
        return
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(False)


class TorchMLPClassifier:  # pragma: no cover - exercised in integration, optional dep
    def __init__(
        self,
        hidden_sizes: tuple[int, ...] = (64, 32),
        epochs: int = 20,
        lr: float = 0.01,
        batch_size: int = 64,
        random_state: int = 42,
    ):
        self.hidden_sizes = hidden_sizes
        self.epochs = epochs
        self.lr = lr
        self.batch_size = batch_size
        self.random_state = random_state
        self.classes_: np.ndarray | None = None
        self.model: nn.Module | None = None

    def get_params(self, deep: bool = True) -> dict:
        return {
            "hidden_sizes": self.hidden_sizes,
            "epochs": self.epochs,
            "lr": self.lr,
            "batch_size": self.batch_size,
            "random_state": self.random_state,
        }

    def set_params(self, **params):
        for key, value in params.items():
            setattr(self, key, value)
        return self

    def _build_model(self, input_dim: int, num_classes: int) -> nn.Module:
        layers: list[nn.Module] = []
        in_dim = input_dim
        for hidden in self.hidden_sizes:
            layers.extend([nn.Linear(in_dim, hidden), nn.ReLU()])
            in_dim = hidden
        layers.append(nn.Linear(in_dim, num_classes))
        return nn.Sequential(*layers)

    def fit(self, X: np.ndarray, y: np.ndarray):
        if not TORCH_AVAILABLE:
            raise RuntimeError("Torch is not available")
        _torch_seed_everything(self.random_state)
        X_tensor = torch.tensor(X, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.long)
        num_classes = int(y_tensor.max().item()) + 1
        self.classes_ = np.arange(num_classes)
        self.model = self._build_model(X_tensor.shape[1], num_classes)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        criterion = nn.CrossEntropyLoss()

        dataset = torch.utils.data.TensorDataset(X_tensor, y_tensor)
        loader = torch.utils.data.DataLoader(dataset, batch_size=self.batch_size, shuffle=True)

        self.model.train()
        for _ in range(self.epochs):
            for batch_X, batch_y in loader:
                optimizer.zero_grad()
                logits = self.model(batch_X)
                loss = criterion(logits, batch_y)
                loss.backward()
                optimizer.step()
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if not self.model or self.classes_ is None:
            raise RuntimeError("Model not trained")
        self.model.eval()
        with torch.no_grad():
            logits = self.model(torch.tensor(X, dtype=torch.float32))
            preds = torch.argmax(logits, dim=1).cpu().numpy()
        return preds

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if not self.model or self.classes_ is None:
            raise RuntimeError("Model not trained")
        self.model.eval()
        with torch.no_grad():
            logits = self.model(torch.tensor(X, dtype=torch.float32))
            probs = torch.softmax(logits, dim=1).cpu().numpy()
        return probs


class TorchMLPRegressor:  # pragma: no cover - optional dep
    def __init__(
        self,
        hidden_sizes: tuple[int, ...] = (64, 32),
        epochs: int = 20,
        lr: float = 0.01,
        batch_size: int = 64,
        random_state: int = 42,
    ):
        self.hidden_sizes = hidden_sizes
        self.epochs = epochs
        self.lr = lr
        self.batch_size = batch_size
        self.random_state = random_state
        self.model: nn.Module | None = None

    def get_params(self, deep: bool = True) -> dict:
        return {
            "hidden_sizes": self.hidden_sizes,
            "epochs": self.epochs,
            "lr": self.lr,
            "batch_size": self.batch_size,
            "random_state": self.random_state,
        }

    def set_params(self, **params):
        for key, value in params.items():
            setattr(self, key, value)
        return self

    def _build_model(self, input_dim: int) -> nn.Module:
        layers: list[nn.Module] = []
        in_dim = input_dim
        for hidden in self.hidden_sizes:
            layers.extend([nn.Linear(in_dim, hidden), nn.ReLU()])
            in_dim = hidden
        layers.append(nn.Linear(in_dim, 1))
        return nn.Sequential(*layers)

    def fit(self, X: np.ndarray, y: np.ndarray):
        if not TORCH_AVAILABLE:
            raise RuntimeError("Torch is not available")
        _torch_seed_everything(self.random_state)
        X_tensor = torch.tensor(X, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.float32).view(-1, 1)

        self.model = self._build_model(X_tensor.shape[1])
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        criterion = nn.MSELoss()

        dataset = torch.utils.data.TensorDataset(X_tensor, y_tensor)
        loader = torch.utils.data.DataLoader(dataset, batch_size=self.batch_size, shuffle=True)

        self.model.train()
        for _ in range(self.epochs):
            for batch_X, batch_y in loader:
                optimizer.zero_grad()
                preds = self.model(batch_X)
                loss = criterion(preds, batch_y)
                loss.backward()
                optimizer.step()
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if not self.model:
            raise RuntimeError("Model not trained")
        self.model.eval()
        with torch.no_grad():
            preds = self.model(torch.tensor(X, dtype=torch.float32)).cpu().numpy()
        return preds.ravel()


def dataset_list() -> dict[str, Any]:
    return {"datasets": list_builtin_datasets()}


def _limits_from_settings(settings: Mapping[str, Any] | None) -> dict[str, int]:
    settings = settings or {}
    try:
        max_rows = int(settings.get("max_rows", 100_000))
    except (TypeError, ValueError):
        max_rows = 100_000
    try:
        max_columns = int(settings.get("max_columns", 200))
    except (TypeError, ValueError):
        max_columns = 200
    try:
        max_sessions = int(settings.get("max_sessions", 64))
    except (TypeError, ValueError):
        max_sessions = 64
    return {
        "max_rows": max_rows,
        "max_columns": max_columns,
        "max_sessions": max_sessions,
    }


def dataset_load_from_key(key: str, settings: Mapping[str, Any] | None = None) -> dict[str, Any]:
    limits = _limits_from_settings(settings)
    configure_session_store(limits["max_sessions"])
    dataframe = load_builtin_dataset(key)
    enforce_dataframe_limits(
        dataframe,
        max_rows=limits["max_rows"],
        max_columns=limits["max_columns"],
    )
    session_id, session = new_session(dataframe)
    preview = dataframe_preview(session.dataframe)
    meta = describe_columns(session.dataframe)
    meta.update(preview)
    meta["session_id"] = session_id
    return meta


def dataset_load_from_bytes(data: bytes, settings: Mapping[str, Any] | None = None) -> dict[str, Any]:
    limits = _limits_from_settings(settings)
    configure_session_store(limits["max_sessions"])
    dataframe = load_csv_bytes(data)
    enforce_dataframe_limits(
        dataframe,
        max_rows=limits["max_rows"],
        max_columns=limits["max_columns"],
    )
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


def available_algorithms() -> list[dict[str, object]]:
    base = [
        {"id": "logreg", "label": "Logistic/Ridge Regression", "tasks": ["classification", "regression"], "provider": "sklearn", "available": True, "optional": False},
        {"id": "rf", "label": "Random Forest", "tasks": ["classification", "regression"], "provider": "sklearn", "available": True, "optional": False},
        {"id": "mlp", "label": "Neural Network (sklearn)", "tasks": ["classification", "regression"], "provider": "sklearn", "available": True, "optional": False},
        {"id": "gb", "label": "Gradient Boosting", "tasks": ["classification", "regression"], "provider": "sklearn", "available": True, "optional": False},
        {"id": "svc", "label": "Support Vector Machine", "tasks": ["classification"], "provider": "sklearn", "available": True, "optional": False},
        {"id": "extra_trees", "label": "Extra Trees", "tasks": ["classification", "regression"], "provider": "sklearn", "available": True, "optional": False},
    ]
    if TORCH_AVAILABLE:
        base.append(
            {
                "id": "torch_mlp",
                "label": "Torch MLP (CPU)",
                "tasks": ["classification", "regression"],
                "provider": "pytorch",
                "available": True,
                "optional": True,
            }
        )
    else:
        base.append(
            {
                "id": "torch_mlp",
                "label": "Torch MLP (CPU)",
                "tasks": ["classification", "regression"],
                "provider": "pytorch",
                "available": False,
                "optional": True,
            }
        )
    return base


def _estimator_factory(artifacts: PreprocessArtifacts, algo: str) -> Callable[[], Any]:
    classification_map: dict[str, Callable[[], Any]] = {
        "logreg": lambda: LogisticRegression(max_iter=500, class_weight="balanced"),
        "rf": lambda: RandomForestClassifier(n_estimators=200, random_state=42),
        "mlp": lambda: MLPClassifier(hidden_layer_sizes=(64,), max_iter=400, random_state=42),
        "gb": lambda: GradientBoostingClassifier(random_state=42),
        "svc": lambda: _svc_classifier(),
        "extra_trees": lambda: ExtraTreesClassifier(n_estimators=300, random_state=42),
        "torch_mlp": lambda: TorchMLPClassifier(),
    }
    regression_map: dict[str, Callable[[], Any]] = {
        "logreg": lambda: Ridge(alpha=1.0),
        "rf": lambda: RandomForestRegressor(n_estimators=200, random_state=42),
        "mlp": lambda: MLPRegressor(hidden_layer_sizes=(64,), max_iter=400, random_state=42),
        "gb": lambda: GradientBoostingRegressor(random_state=42),
        "extra_trees": lambda: ExtraTreesRegressor(n_estimators=300, random_state=42),
        "torch_mlp": lambda: TorchMLPRegressor(),
    }
    if artifacts.task == "classification":
        factory = classification_map.get(algo)
    else:
        factory = regression_map.get(algo)
    if factory is None:
        raise ValueError(f"Unsupported algorithm '{algo}' for task {artifacts.task}")
    if algo.startswith("torch") and not TORCH_AVAILABLE:
        raise ValueError("Torch-based algorithms require torch (CPU) to be installed")
    return factory


def _svc_classifier():
    try:
        from sklearn.svm import SVC
    except Exception as exc:  # pragma: no cover - sklearn should be present
        raise ValueError("SVC unavailable") from exc
    return SVC(probability=True, kernel="rbf", gamma="scale", C=1.0, class_weight="balanced")


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
