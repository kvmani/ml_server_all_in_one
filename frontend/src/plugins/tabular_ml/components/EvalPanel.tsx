import { useMemo } from "react";

import { ChartPanel } from "../../../components/ChartPanel";
import type { EvaluateResponse } from "../api";

export type EvalPanelProps = {
  runId?: string;
  evaluation?: EvaluateResponse;
  loading?: boolean;
  onEvaluate: (runId: string) => void;
};

export function EvalPanel({ runId, evaluation, loading, onEvaluate }: EvalPanelProps) {
  const rocData = useMemo(() => {
    if (!evaluation?.curves?.roc) {
      return null;
    }
    return {
      x: evaluation.curves.roc.fpr,
      y: evaluation.curves.roc.tpr,
      meta: { chartType: "line" },
    };
  }, [evaluation]);

  const prData = useMemo(() => {
    if (!evaluation?.curves?.pr) {
      return null;
    }
    return {
      x: evaluation.curves.pr.recall,
      y: evaluation.curves.pr.precision,
      meta: { chartType: "line" },
    };
  }, [evaluation]);

  return (
    <section className="tabular-section" aria-labelledby="tabular-eval-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-eval-heading">Evaluate</h2>
          <p className="tabular-section__description">Inspect metrics and curves for the last training run.</p>
        </div>
        <button type="button" className="button" onClick={() => runId && onEvaluate(runId)} disabled={!runId || loading}>
          {loading ? "Fetching..." : "Refresh metrics"}
        </button>
      </header>
      {evaluation ? (
        <div className="tabular-results" aria-live="polite">
          <dl className="tabular-metrics">
            {Object.entries(evaluation.metrics).map(([metric, value]) => (
              <div key={metric}>
                <dt>{metric}</dt>
                <dd>{value.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
          {rocData ? <ChartPanel title="ROC curve" data={rocData} variant="line" /> : null}
          {prData ? <ChartPanel title="Precision/Recall" data={prData} variant="line" /> : null}
        </div>
      ) : (
        <p className="tabular-empty">Train a model to unlock evaluation metrics.</p>
      )}
    </section>
  );
}
