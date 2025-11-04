import type { DatasetPreview } from "../api";

export type DataPreviewProps = {
  preview?: DatasetPreview;
};

export function DataPreview({ preview }: DataPreviewProps) {
  if (!preview || !preview.head.length) {
    return (
      <section className="tabular-section" aria-labelledby="tabular-preview-heading">
        <header className="tabular-section__header">
          <div>
            <h2 id="tabular-preview-heading">Preview</h2>
            <p className="tabular-section__description">Load a dataset to inspect the first rows.</p>
          </div>
        </header>
        <p className="tabular-empty">No dataset loaded yet.</p>
      </section>
    );
  }

  const columns = Object.keys(preview.head[0]);

  return (
    <section className="tabular-section" aria-labelledby="tabular-preview-heading">
      <header className="tabular-section__header">
        <div>
          <h2 id="tabular-preview-heading">Preview</h2>
          <p className="tabular-section__description">
            Showing up to {preview.head.length} rows · {preview.shape[0].toLocaleString()} total rows
          </p>
        </div>
      </header>
      <div className="preview-table" role="region" aria-live="polite">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.head.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
