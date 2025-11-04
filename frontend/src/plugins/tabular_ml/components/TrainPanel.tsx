import { FormEvent, useState } from "react";

import type { PreprocessResponse, TrainResponse } from "../api";

export type TrainPanelProps = {
  sessionId?: string;
  preprocess?: PreprocessResponse;
  result?: TrainResponse;
  loading?: boolean;
  onTrain: (payload: { session_id: string; algo: "logreg" | "rf" | "mlp"; cv: number }) => void;
};

const ALGORITHMS: Array<{ value: "logreg" | "rf" | "mlp"; label: string }> = [
  { value: "logreg", label: "Logistic Regression" },
  { value: "rf", label: "Random Forest" },
  { value: "mlp", label: "Neural Network" },
];

export function TrainPanel({ sessionId, preprocess, result, loading, onTrain }: TrainPanelProps) {
  const [algo, setAlgo] = useState<"logreg" | "rf" | "mlp">("rf");
  const [cv, setCv] = useState(3);

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
          <p className="tabular-section__description">Select an algorithm and run cross-validated training.</p>
        </div>
      </header>
      <form className="tabular-form" onSubmit={handleSubmit}>
        <div className="tabular-form__grid">
          <label className="tabular-field">
            <span className="tabular-field__label">Algorithm</span>
            <select value={algo} onChange={(event) => setAlgo(event.target.value as typeof algo)}>
              {ALGORITHMS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
