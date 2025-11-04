import { FormEvent, useEffect, useState } from "react";

import type { ColumnMeta, PreprocessPayload, PreprocessResponse } from "../api";

export type PreprocessPanelProps = {
  sessionId?: string;
  columns: ColumnMeta[];
  summary?: PreprocessResponse["summary"];
  loading?: boolean;
  onSubmit: (payload: PreprocessPayload) => void;
};

const NUMERIC_STRATEGIES: Array<PreprocessPayload["impute"]["numeric"]> = ["mean", "median", "most_frequent"];
const CATEGORICAL_STRATEGIES: Array<PreprocessPayload["impute"]["categorical"]> = [
  "most_frequent",
  "constant",
];
const SCALE_METHODS: Array<PreprocessPayload["scale"]["method"]> = ["standard", "minmax", "none"];

export function PreprocessPanel({ sessionId, columns, summary, loading, onSubmit }: PreprocessPanelProps) {
  const [target, setTarget] = useState<string>("");
  const [trainSplit, setTrainSplit] = useState(0.8);
  const [seed, setSeed] = useState(42);
  const [numericStrategy, setNumericStrategy] = useState<PreprocessPayload["impute"]["numeric"]>("mean");
  const [categoricalStrategy, setCategoricalStrategy] = useState<PreprocessPayload["impute"]["categorical"]>("most_frequent");
  const [fillValue, setFillValue] = useState<string>("missing");
  const [scaleMethod, setScaleMethod] = useState<PreprocessPayload["scale"]["method"]>("standard");
  const [oneHot, setOneHot] = useState(true);
  const [dropFirst, setDropFirst] = useState(false);

  useEffect(() => {
    if (!columns.length) {
      return;
    }
    if (!target || !columns.some((column) => column.name === target)) {
      const preferred = columns.find((column) => column.name.toLowerCase().includes("survived"))?.name;
      setTarget(preferred || columns[0].name);
    }
  }, [columns, target]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || !target) {
      return;
    }
    onSubmit({
      session_id: sessionId,
      target,
      split: { train: trainSplit, seed },
      impute: { numeric: numericStrategy, categorical: categoricalStrategy, fill_value: fillValue },
      scale: { method: scaleMethod },
      encode: { one_hot: oneHot, drop_first: dropFirst },
    });
  };

  return (
    <section className="tabular-section" aria-labelledby="tabular-preprocess-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-preprocess-heading">Preprocess</h2>
          <p className="tabular-section__description">
            Select the target column and preprocessing strategies before training a model.
          </p>
        </div>
      </header>
      <form className="tabular-form" onSubmit={handleSubmit}>
        <div className="tabular-form__grid">
          <label className="tabular-field">
            <span className="tabular-field__label">Target column</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={!columns.length || loading}>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Train split</span>
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={trainSplit}
              onChange={(event) => setTrainSplit(Number(event.target.value))}
              disabled={loading}
            />
            <span className="tabular-field__hint">{Math.round(trainSplit * 100)}% train · {100 - Math.round(trainSplit * 100)}% test</span>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Seed</span>
            <input
              type="number"
              min={0}
              step={1}
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
              disabled={loading}
            />
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Numeric imputer</span>
            <select value={numericStrategy} onChange={(event) => setNumericStrategy(event.target.value as typeof numericStrategy)} disabled={loading}>
              {NUMERIC_STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Categorical imputer</span>
            <select value={categoricalStrategy} onChange={(event) => setCategoricalStrategy(event.target.value as typeof categoricalStrategy)} disabled={loading}>
              {CATEGORICAL_STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          {categoricalStrategy === "constant" ? (
            <label className="tabular-field">
              <span className="tabular-field__label">Fill value</span>
              <input type="text" value={fillValue} onChange={(event) => setFillValue(event.target.value)} disabled={loading} />
            </label>
          ) : null}
          <label className="tabular-field">
            <span className="tabular-field__label">Scaling</span>
            <select value={scaleMethod} onChange={(event) => setScaleMethod(event.target.value as typeof scaleMethod)} disabled={loading}>
              {SCALE_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-checkbox">
            <input type="checkbox" checked={oneHot} onChange={(event) => setOneHot(event.target.checked)} disabled={loading} />
            <span>One-hot encode categoricals</span>
          </label>
          <label className="tabular-checkbox">
            <input type="checkbox" checked={dropFirst} onChange={(event) => setDropFirst(event.target.checked)} disabled={loading || !oneHot} />
            <span>Drop first dummy</span>
          </label>
        </div>
        <button type="submit" className="button" disabled={loading || !sessionId}>
          {loading ? "Fitting..." : "Fit preprocessing"}
        </button>
      </form>
      {summary ? (
        <dl className="tabular-summary" aria-live="polite">
          <div>
            <dt>Task</dt>
            <dd>{summary.task}</dd>
          </div>
          <div>
            <dt>Rows</dt>
            <dd>
              {summary.rows.train} train · {summary.rows.test} test
            </dd>
          </div>
          <div>
            <dt>Numeric columns</dt>
            <dd>{summary.numeric_columns.length}</dd>
          </div>
          <div>
            <dt>Categorical columns</dt>
            <dd>{summary.categorical_columns.length}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
