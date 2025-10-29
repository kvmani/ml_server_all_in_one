# Tabular ML

Train small-scale models on CSV datasets directly in the browser. All computation runs via scikit-learn inside the server process—nothing leaves memory.

## Dataset requirements

* CSV with headers in the first row.
* Numeric and categorical columns supported; categorical features are one-hot encoded automatically.
* Default upload limit: 2 MB (tune via `config.yml`).
* Remove rows with missing target values for best results.

## Training flow

1. Upload the dataset via drag-and-drop or the browse button.
2. Enter the target column name.
3. Submit the form. The backend detects the task type:
   * Classification → `RandomForestClassifier`
   * Regression → `RandomForestRegressor`
4. Results panel displays primary metrics (accuracy/F1 for classification, R²/MAE for regression) and the top five feature importances.

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

* Feature importance scores are normalised (sum to 1.0).
* All preprocessing happens in memory. Refreshing the page clears the workspace.
* Extend the estimator set by editing `plugins/tabular_ml/core/train.py` and updating tests accordingly.
