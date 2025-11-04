# Tabular ML (Enhanced)

The Tabular ML workspace lets you explore tabular datasets, prepare features, detect outliers, visualise distributions, and train classical ML models — entirely offline.

## Built-in datasets

The plugin ships with two curated datasets available under **Dataset** → **Built-in**:

- **Titanic (full)** – survival outcomes for Titanic passengers (classification).
- **Adult Income (full)** – income bracket prediction from the UCI Adult dataset (classification).

You can also upload CSV files (respecting the upload limits shown in the Config drawer) to start a new session.

## Workflow overview

1. **Load a dataset** – choose a built-in dataset or upload a CSV. A preview of the first rows and column data types appears automatically.
2. **Preprocess** – pick a target column, choose imputers/scalers/encoders, and define the train/test split. The server fits preprocessing pipelines with deterministic seeds.
3. **Outliers** – experiment with IQR, Z-score, or Isolation Forest detectors. Review counts before applying masks, dropping rows, or winsorising values. Reset at any time to revert.
4. **Visualise** – render histograms, box plots, and correlation matrices directly in the browser using server-produced arrays. Histogram controls support log scaling, KDE overlays, and numeric ranges.
5. **Train** – select an algorithm (Logistic Regression, Random Forest, or MLP), configure cross-validation folds, and run training. Feature importances (when available) are returned.
6. **Evaluate** – inspect metrics, ROC/PR curves (for binary classification), and download results as CSV exports.

All processing happens in-memory. Sessions expire after 30 minutes of inactivity and can be cleared via the “Reset session” control in the UI.

## CLI

A matching CLI is available for smoke testing:

```bash
python plugins/tabular_ml/cli.py datasets list
python plugins/tabular_ml/cli.py train --key titanic --target Survived --algo rf
python plugins/tabular_ml/cli.py evaluate --run-id <id>
```
