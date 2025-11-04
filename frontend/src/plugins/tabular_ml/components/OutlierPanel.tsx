import { FormEvent, useState } from "react";

import type { OutlierParams } from "../api";

export type OutlierPanelProps = {
  sessionId?: string;
  stats?: { total: number; removed: number; kept: number };
  loading?: boolean;
  onCompute: (method: "iqr" | "zscore" | "iforest", params: OutlierParams) => void;
  onApply: (action: "mask" | "drop" | "winsorize" | "reset", params: OutlierParams) => void;
};

export function OutlierPanel({ sessionId, stats, loading, onCompute, onApply }: OutlierPanelProps) {
  const [method, setMethod] = useState<"iqr" | "zscore" | "iforest">("iqr");
  const [k, setK] = useState(1.5);
  const [z, setZ] = useState(3);
  const [contamination, setContamination] = useState(0.05);

  const handleCompute = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId) {
      return;
    }
    const params: OutlierParams = { k, z, contamination };
    onCompute(method, params);
  };

  const handleAction = (action: "mask" | "drop" | "winsorize" | "reset") => {
    onApply(action, { k, z, contamination });
  };

  return (
    <section className="tabular-section" aria-labelledby="tabular-outliers-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-outliers-heading">Outliers</h2>
          <p className="tabular-section__description">Detect and optionally remove anomalous rows.</p>
        </div>
      </header>
      <form className="tabular-form" onSubmit={handleCompute}>
        <fieldset className="tabular-fieldset">
          <legend className="tabular-fieldset__legend">Method</legend>
          <label className="tabular-radio">
            <input type="radio" name="outlier-method" value="iqr" checked={method === "iqr"} onChange={() => setMethod("iqr")} disabled={loading} />
            <span>IQR</span>
          </label>
          <label className="tabular-radio">
            <input type="radio" name="outlier-method" value="zscore" checked={method === "zscore"} onChange={() => setMethod("zscore")} disabled={loading} />
            <span>Z-score</span>
          </label>
          <label className="tabular-radio">
            <input type="radio" name="outlier-method" value="iforest" checked={method === "iforest"} onChange={() => setMethod("iforest")} disabled={loading} />
            <span>Isolation Forest</span>
          </label>
        </fieldset>
        <div className="tabular-form__grid">
          <label className="tabular-field">
            <span className="tabular-field__label">IQR k</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={k}
              onChange={(event) => setK(Number(event.target.value))}
              disabled={loading || method !== "iqr"}
            />
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Z-score threshold</span>
            <input type="number" step={0.1} min={1} value={z} onChange={(event) => setZ(Number(event.target.value))} disabled={loading || method !== "zscore"} />
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Contamination</span>
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={0.3}
              value={contamination}
              onChange={(event) => setContamination(Number(event.target.value))}
              disabled={loading || method !== "iforest"}
            />
          </label>
        </div>
        <button type="submit" className="button" disabled={loading || !sessionId}>
          {loading ? "Computing..." : "Compute mask"}
        </button>
      </form>
      <div className="tabular-actions">
        <button type="button" className="button button--secondary" onClick={() => handleAction("mask")} disabled={!stats}>
          Preview mask
        </button>
        <button type="button" className="button button--secondary" onClick={() => handleAction("drop")} disabled={!stats}>
          Drop rows
        </button>
        <button type="button" className="button button--secondary" onClick={() => handleAction("winsorize")} disabled={!stats}>
          Winsorize
        </button>
        <button type="button" className="button button--ghost" onClick={() => handleAction("reset")}>
          Reset
        </button>
      </div>
      {stats ? (
        <dl className="tabular-summary" aria-live="polite">
          <div>
            <dt>Total rows</dt>
            <dd>{stats.total}</dd>
          </div>
          <div>
            <dt>Outliers</dt>
            <dd>{stats.removed}</dd>
          </div>
          <div>
            <dt>Kept</dt>
            <dd>{stats.kept}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
