import { FormEvent, useEffect, useMemo, useState } from "react";

import type { AlgorithmOption, PreprocessResponse, TrainResponse } from "../api";

export type TrainPanelProps = {
  sessionId?: string;
  preprocess?: PreprocessResponse;
  result?: TrainResponse;
  loading?: boolean;
  algorithms?: AlgorithmOption[];
  onTrain: (payload: { session_id: string; algo: string; cv: number }) => void;
};

const FALLBACK_ALGOS: AlgorithmOption[] = [
  { id: "logreg", label: "Logistic Regression", tasks: ["classification", "regression"], provider: "sklearn", available: true },
  { id: "rf", label: "Random Forest", tasks: ["classification", "regression"], provider: "sklearn", available: true },
  { id: "mlp", label: "Neural Network", tasks: ["classification", "regression"], provider: "sklearn", available: true },
];

export function TrainPanel({ sessionId, preprocess, result, loading, algorithms, onTrain }: TrainPanelProps) {
  const task = preprocess?.summary.task;
  const filtered = useMemo(() => {
    const source = algorithms && algorithms.length ? algorithms : FALLBACK_ALGOS;
    return source.filter((algo) => algo.available && (!task || algo.tasks.includes(task)));
  }, [algorithms, task]);

  const [algo, setAlgo] = useState<string>(() => filtered[0]?.id ?? "rf");
  const [cv, setCv] = useState(3);

  // Keep selection in sync with available options
  useEffect(() => {
    if (!filtered.find((option) => option.id === algo) && filtered[0]) {
      setAlgo(filtered[0].id);
    }
  }, [filtered, algo]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId) {
      return;
    }
    onTrain({ session_id: sessionId, algo, cv });
  };

  return (
    <section className="tabular-section" aria-labelledby="tabular-train-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-train-heading">Train</h2>
          <p className="tabular-section__description">
            Select a CPU-friendly algorithm (optional Torch MLP appears only if <code>torch</code> is installed).
          </p>
        </div>
      </header>
      <form className="tabular-form" onSubmit={handleSubmit}>
        <div className="tabular-form__grid">
          <label className="tabular-field">
            <span className="tabular-field__label">Algorithm</span>
            <select value={algo} onChange={(event) => setAlgo(event.target.value as typeof algo)}>
              {filtered.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.provider})
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Cross-validation folds</span>
            <input type="number" min={2} max={10} value={cv} onChange={(event) => setCv(Number(event.target.value))} />
          </label>
        </div>
        <button type="submit" className="button" disabled={loading || !sessionId || !preprocess}>
          {loading ? "Training..." : "Train model"}
        </button>
      </form>
      <p className="form-field__hint">
        Algorithms are sourced from server config; unavailable/optional ones are hidden automatically.
      </p>
      {result ? (
        <div className="tabular-results" aria-live="polite">
          <div className="tabular-results__header">
            <h3>Model summary</h3>
            <div className="tabular-results__badges">
              <span className="badge">{result.model_summary.algorithm}</span>
              <span className="badge">Target: {result.model_summary.target}</span>
            </div>
          </div>
          <dl className="tabular-metrics">
            {Object.entries(result.model_summary.metrics).map(([metric, value]) => (
              <div key={metric}>
                <dt>{metric}</dt>
                <dd>{value.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
          {result.feature_importances ? (
            <section className="tabular-importance" aria-label="Feature importances">
              <h4>Feature importances</h4>
              <ul>
                {Object.entries(result.feature_importances)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 10)
                  .map(([feature, value]) => (
                    <li key={feature}>
                      {feature}: {value.toFixed(3)}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
