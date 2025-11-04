import type { ConfigResponse } from "../api";

export type ConfigDrawerProps = {
  config?: ConfigResponse;
};

export function ConfigDrawer({ config }: ConfigDrawerProps) {
  if (!config) {
    return null;
  }
  return (
    <aside className="tabular-config" aria-label="Tabular ML configuration">
      <h2>Plugin limits</h2>
      <dl>
        <div>
          <dt>Max upload size</dt>
          <dd>{config.upload.max_mb} MB</dd>
        </div>
        <div>
          <dt>Max files</dt>
          <dd>{config.upload.max_files}</dd>
        </div>
        <div>
          <dt>Max columns</dt>
          <dd>{config.upload.max_columns}</dd>
        </div>
        <div>
          <dt>Max rows</dt>
          <dd>{config.upload.max_rows.toLocaleString()}</dd>
        </div>
      </dl>
    </aside>
  );
}
