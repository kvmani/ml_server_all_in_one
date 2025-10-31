# Tabular ML

Train and explore small-scale tabular datasets entirely in memory. Upload CSV files, generate quick visualisations, detect potential outliers, and fit lightweight scikit-learn models without leaving the browser session.

## Dataset requirements

* CSV with headers in the first row.
* Numeric and categorical columns supported; categorical features are one-hot encoded automatically.
* Default upload limit: 2 MB (tune via `config.yml`).
* Remove rows with missing target values for best results.

## Capabilities at a glance

* **Dataset preview** – Inspect the first rows, field types, and summary statistics for each column.
* **Scatter plots** – Choose any pair of numeric columns (with optional colour encoding) and fine-tune sample size and marker size via the section settings gear.
* **Histograms** – Visualise value distributions with adjustable bin count, range, and density mode.
* **Outlier detection** – Run a z-score heuristic across selected columns, review flagged indices, and remove the rows in-place.
* **Filtering** – Apply simple comparison rules (`=`, `>`, `contains`, `in`, …) to create a refined dataset without re-uploading.
* **Training** – Select an algorithm (linear model, random forest, gradient boosting) and override exposed hyperparameters per estimator from the gear menu.
* **Inference** – Run single-row predictions or upload a batch CSV to score multiple records; download results as CSV or JSON.

## Training flow

1. Upload the dataset via drag-and-drop or the browse button.
2. Optionally use the Preprocess panel to remove outliers or filter rows.
3. Select the target column and algorithm. Use the training settings gear to adjust hyperparameters (`max_iter`, `n_estimators`, `learning_rate`, etc.).
4. Submit the training form. The backend auto-detects the task type:
   * Classification → `LogisticRegression`, `RandomForestClassifier`, or `GradientBoostingClassifier`
   * Regression → `Ridge`, `RandomForestRegressor`, or `GradientBoostingRegressor`
5. Review metrics, top feature importances, residual previews, and run inference/batch scoring from the results panel.

## Configuration

Update `config.yml`:

```yaml
plugins:
  tabular_ml:
    upload:
      max_files: 1
      max_mb: 2
```

Increase `max_mb` for larger datasets if resources permit. The UI automatically adjusts the help text.

## Notes

* All preprocessing and modelling happen in RAM. Refreshing the page or removing the dataset clears the workspace.
* Scatter plot sampling defaults to 400 points; adjust in the settings menu when analysing larger datasets.
* Histogram bin counts are validated between 2 and 200 to keep SVG rendering responsive.
* Extend the estimator catalogue or tuning metadata in `plugins/tabular_ml/core/__init__.py` and keep accompanying tests in `plugins/tabular_ml/tests` up to date.
