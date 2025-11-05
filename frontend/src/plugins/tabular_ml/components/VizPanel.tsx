import { FormEvent, useEffect, useMemo, useState } from "react";

import { ChartPanel } from "../../../components/ChartPanel";
import type { BoxResponse, ColumnMeta, CorrResponse, HistogramResponse } from "../api";

export type VizPanelProps = {
  sessionId?: string;
  columns: ColumnMeta[];
  histogram?: HistogramResponse;
  box?: BoxResponse;
  corr?: CorrResponse;
  loading?: boolean;
  onHistogram: (params: { column: string; bins: number | "auto"; log: boolean; kde: boolean; range?: [number, number] | null }) => void;
  onBox: (params: { column: string; by?: string | null }) => void;
  onCorr: (columns?: string[]) => void;
};

export function VizPanel({ sessionId, columns, histogram, box, corr, loading, onHistogram, onBox, onCorr }: VizPanelProps) {
  const numericColumns = useMemo(() => columns.filter((column) => column.is_numeric), [columns]);
  const [histColumn, setHistColumn] = useState<string>("");
  const [bins, setBins] = useState<number | "auto">("auto");
  const [logScale, setLogScale] = useState(false);
  const [kde, setKde] = useState(false);
  const [rangeMin, setRangeMin] = useState<string>("");
  const [rangeMax, setRangeMax] = useState<string>("");
  const [boxColumn, setBoxColumn] = useState<string>("");
  const [boxBy, setBoxBy] = useState<string>("");
  const [corrSelection, setCorrSelection] = useState<string[]>([]);

  useEffect(() => {
    if (!histColumn && numericColumns.length) {
      setHistColumn(numericColumns[0].name);
    }
    if (!boxColumn && numericColumns.length) {
      setBoxColumn(numericColumns[0].name);
    }
    if (!corrSelection.length && numericColumns.length) {
      setCorrSelection(numericColumns.slice(0, Math.min(3, numericColumns.length)).map((col) => col.name));
    }
  }, [numericColumns, histColumn, boxColumn, corrSelection.length]);

  const handleHistogram = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || !histColumn) {
      return;
    }
    const range = rangeMin && rangeMax ? [Number(rangeMin), Number(rangeMax)] : undefined;
    onHistogram({ column: histColumn, bins, log: logScale, kde, range: range as [number, number] | undefined });
  };

  const histogramData = useMemo(() => {
    if (!histogram) {
      return null;
    }
    return {
      x: histogram.centres,
      y: histogram.counts,
      meta: { chartType: "bar", bins: histogram.bins },
    };
  }, [histogram]);

  const kdeData = useMemo(() => {
    if (!histogram?.kde) {
      return null;
    }
    return {
      x: histogram.kde.x,
      y: histogram.kde.y,
      meta: { chartType: "line" },
    };
  }, [histogram]);

  const handleBox = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || !boxColumn) {
      return;
    }
    onBox({ column: boxColumn, by: boxBy || undefined });
  };

  const handleCorr = () => {
    if (!sessionId) {
      return;
    }
    onCorr(corrSelection.length ? corrSelection : undefined);
  };

  const toggleCorrSelection = (column: string) => {
    setCorrSelection((prev) => {
      if (prev.includes(column)) {
        return prev.filter((item) => item !== column);
      }
      return [...prev, column];
    });
  };

  return (
    <section className="tabular-section" aria-labelledby="tabular-viz-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-viz-heading">Visualisations</h2>
          <p className="tabular-section__description">Generate histograms, box plots, and correlation matrices.</p>
        </div>
      </header>
      <div className="tabular-visuals__grid">
        <form className="tabular-form" onSubmit={handleHistogram} aria-labelledby="tabular-hist-heading">
          <h3 id="tabular-hist-heading">Histogram</h3>
          <label className="tabular-field">
            <span className="tabular-field__label">Column</span>
            <select value={histColumn} onChange={(event) => setHistColumn(event.target.value)} disabled={!numericColumns.length}>
              {numericColumns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Bins</span>
            <input
              type="number"
              min={5}
              max={60}
              step={1}
              value={typeof bins === "number" ? bins : 20}
              onChange={(event) => setBins(Number(event.target.value))}
            />
          </label>
          <label className="tabular-checkbox">
            <input type="checkbox" checked={logScale} onChange={(event) => setLogScale(event.target.checked)} />
            <span>Log scale</span>
          </label>
          <label className="tabular-checkbox">
            <input type="checkbox" checked={kde} onChange={(event) => setKde(event.target.checked)} />
            <span>KDE overlay</span>
          </label>
          <div className="tabular-form__grid">
            <label className="tabular-field">
              <span className="tabular-field__label">Range min</span>
              <input type="number" value={rangeMin} onChange={(event) => setRangeMin(event.target.value)} />
            </label>
            <label className="tabular-field">
              <span className="tabular-field__label">Range max</span>
              <input type="number" value={rangeMax} onChange={(event) => setRangeMax(event.target.value)} />
            </label>
          </div>
          <button type="submit" className="button" disabled={loading || !sessionId || !histColumn}>
            Render histogram
          </button>
          <ChartPanel title="Histogram" data={histogramData} variant="bar" />
          {kdeData ? <ChartPanel title="KDE" data={kdeData} variant="line" /> : null}
        </form>
        <form className="tabular-form" onSubmit={handleBox} aria-labelledby="tabular-box-heading">
          <h3 id="tabular-box-heading">Box plot</h3>
          <label className="tabular-field">
            <span className="tabular-field__label">Column</span>
            <select value={boxColumn} onChange={(event) => setBoxColumn(event.target.value)} disabled={!numericColumns.length}>
              {numericColumns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tabular-field">
            <span className="tabular-field__label">Group by</span>
            <select value={boxBy} onChange={(event) => setBoxBy(event.target.value)}>
              <option value="">None</option>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button" disabled={loading || !sessionId || !boxColumn}>
            Compute box stats
          </button>
          {box ? (
            <dl className="tabular-summary" aria-live="polite">
              {Object.entries(box.group_stats).map(([group, values]) => (
                <div key={group}>
                  <dt>{group}</dt>
                  <dd>
                    min {values.min.toFixed(2)} · q1 {values.q1.toFixed(2)} · median {values.median.toFixed(2)} · q3 {values.q3.toFixed(2)} · max {values.max.toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </form>
        <section aria-labelledby="tabular-corr-heading">
          <h3 id="tabular-corr-heading">Correlation</h3>
          <div className="tabular-corr__controls">
            <div className="tabular-corr__columns" role="group" aria-label="Correlation columns">
              {numericColumns.map((column) => (
                <label key={column.name} className="tabular-checkbox">
                  <input
                    type="checkbox"
                    value={column.name}
                    checked={corrSelection.includes(column.name)}
                    onChange={() => toggleCorrSelection(column.name)}
                  />
                  <span>{column.name}</span>
                </label>
              ))}
            </div>
            <button type="button" className="button" onClick={handleCorr} disabled={loading || !sessionId}>
              Compute correlation
            </button>
          </div>
          {corr ? (
            <div className="tabular-corr__matrix" role="table" aria-live="polite">
              <div role="row" className="tabular-corr__row tabular-corr__row--header">
                <span role="columnheader">Column</span>
                {corr.labels.map((label) => (
                  <span key={label} role="columnheader">
                    {label}
                  </span>
                ))}
              </div>
              {corr.matrix.map((row, rowIndex) => (
                <div key={corr.labels[rowIndex]} role="row" className="tabular-corr__row">
                  <span role="cell" className="tabular-corr__label">
                    {corr.labels[rowIndex]}
                  </span>
                  {row.map((value, colIndex) => (
                    <span role="cell" key={`${rowIndex}-${colIndex}`}>
                      {value.toFixed(2)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
