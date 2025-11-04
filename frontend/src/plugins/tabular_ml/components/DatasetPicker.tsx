import { ChangeEvent } from "react";

import type { ConfigResponse, DatasetMeta } from "../api";

export type DatasetPickerProps = {
  datasets: DatasetMeta[];
  selectedKey?: string;
  loading?: boolean;
  onSelect: (key: string) => void;
  onUpload: (file: File) => void;
  config?: ConfigResponse;
};

export function DatasetPicker({ datasets, selectedKey, loading, onSelect, onUpload, config }: DatasetPickerProps) {
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file);
      event.target.value = "";
    }
  };

  return (
    <section className="tabular-section" aria-labelledby="tabular-datasets-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-datasets-heading">Dataset</h2>
          <p className="tabular-section__description">Choose a built-in dataset or upload a CSV.</p>
        </div>
        {config ? (
          <p className="tabular-section__hint">
            Upload limit: {config.upload.max_mb} MB · {config.upload.max_columns} columns max
          </p>
        ) : null}
      </header>
      <div className="tabular-datasets">
        <div className="tabular-datasets__list" role="list">
          {datasets.map((dataset) => (
            <button
              key={dataset.key}
              type="button"
              role="listitem"
              className={`tabular-datasets__item${selectedKey === dataset.key ? " is-selected" : ""}`}
              onClick={() => onSelect(dataset.key)}
              disabled={loading}
            >
              <span className="tabular-datasets__name">{dataset.name}</span>
              <span className="tabular-datasets__meta">
                {dataset.rows.toLocaleString()} rows · {dataset.cols.toLocaleString()} columns
              </span>
              {dataset.license ? <span className="tabular-datasets__license">{dataset.license}</span> : null}
            </button>
          ))}
        </div>
        <label className="tabular-upload">
          <span className="tabular-upload__label">Upload CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={handleUpload} disabled={loading} />
        </label>
      </div>
    </section>
  );
}
