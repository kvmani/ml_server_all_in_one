# Tabular ML Backend

This package implements the Flask backend for the enhanced Tabular ML plugin. It exposes JSON endpoints under `/api/tabular_ml/...` and keeps all user artefacts in-memory.

## Key modules

- `backend/utils.py` – in-memory session store, dataset registry helpers, and response helpers.
- `backend/preprocess.py` – preprocessing pipelines (imputation, scaling, encoding, train/test split).
- `backend/outliers.py` – IQR, Z-score, and Isolation Forest detection plus mask/apply routines.
- `backend/viz.py` – histogram, box plot, and correlation matrix computations.
- `backend/services.py` – orchestration layer used by both HTTP routes and the CLI.
- `backend/routes.py` – Flask blueprint wiring request/response envelopes.

## Datasets

Bundled datasets live in `assets/datasets/` alongside a `registry.json`. The registry is used to expose metadata via `/datasets/list` and to hydrate the built-in dataset picker in the UI.

## CLI

`cli.py` mirrors the REST endpoints and is used for the smoke tests under `tests/plugins/tabular_ml/test_cli_smoke.py`.

## Testing

Pytest coverage lives in `tests/plugins/tabular_ml/`. All tests operate on the Flask application configured via `TestingConfig` and require no external resources.
