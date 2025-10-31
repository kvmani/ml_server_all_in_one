import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPayload = {
  x: Array<number | string>;
  y: Array<number | string>;
  labels?: Array<string | number>;
  meta?: Record<string, unknown> & { chartType?: string };
};

type ChartPanelProps = {
  title: string;
  description?: string;
  data: ChartPayload | null;
  variant?: "line" | "scatter" | "bar";
};

const noopFormatter = (value: unknown) => value;

export function ChartPanel({ title, description, data, variant }: ChartPanelProps) {
  if (!data || !Array.isArray(data.x) || !Array.isArray(data.y) || !data.x.length) {
    return (
      <section className="chart-panel chart-panel--empty" aria-labelledby="chart-panel-empty-title">
        <h3 id="chart-panel-empty-title" className="chart-panel__title">
          {title}
        </h3>
        {description ? <p className="chart-panel__description">{description}</p> : null}
        <p className="chart-panel__empty">No chart data available yet.</p>
      </section>
    );
  }

  const { x, y, labels = [], meta = {} } = data;
  const records = x.map((xValue, index) => ({
    x: xValue,
    y: y[index] ?? null,
    label: labels[index] ?? undefined,
  }));

  const resolvedVariant = variant ?? (typeof meta.chartType === "string" ? (meta.chartType as string) : undefined);

  const chartType = (resolvedVariant as "line" | "scatter" | "bar") || inferType(records);

  return (
    <section className="chart-panel" aria-labelledby={`chart-panel-${slugify(title)}`}>
      <div className="chart-panel__header">
        <h3 id={`chart-panel-${slugify(title)}`} className="chart-panel__title">
          {title}
        </h3>
        {description ? <p className="chart-panel__description">{description}</p> : null}
      </div>
      <div className="chart-panel__figure" role="figure" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height={320}>
          {renderChart(chartType, records)}
        </ResponsiveContainer>
      </div>
      {renderMeta(meta)}
    </section>
  );
}

function inferType(rows: Array<{ x: unknown; y: unknown; label?: unknown }>): "line" | "bar" | "scatter" {
  if (!rows.length) {
    return "line";
  }
  const first = rows[0];
  const numericX = typeof first.x === "number";
  const numericY = typeof first.y === "number";
  if (numericX && numericY) {
    return "scatter";
  }
  if (!numericX && typeof first.y === "number") {
    return "bar";
  }
  return "line";
}

function renderChart(
  type: "line" | "scatter" | "bar",
  rows: Array<{ x: unknown; y: unknown; label?: unknown }>,
) {
  switch (type) {
    case "scatter":
      return (
        <ScatterChart margin={{ top: 12, right: 12, bottom: 24, left: 12 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            type="number"
            dataKey="x"
            tickFormatter={noopFormatter as (value: number) => string | number}
            name="X"
          />
          <YAxis type="number" dataKey="y" name="Y" tickFormatter={noopFormatter as (value: number) => string | number} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Legend />
          <Scatter data={rows} dataKey="y" name="Value" fill="#63d5ff" />
        </ScatterChart>
      );
    case "bar":
      return (
        <BarChart data={rows} margin={{ top: 12, right: 12, bottom: 24, left: 12 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="x" interval={0} tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="y" name="Value" fill="#8c7bff" radius={[6, 6, 0, 0]} />
        </BarChart>
      );
    case "line":
    default:
      return (
        <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 24, left: 12 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="x" tickFormatter={(value) => String(value)} />
          <YAxis tickFormatter={(value) => String(value)} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="y" name="Value" stroke="#63d5ff" strokeWidth={2} dot={false} />
        </LineChart>
      );
  }
}

function renderMeta(meta: ChartPayload["meta"]): React.ReactNode {
  const entries = Object.entries(meta || {}).filter(([key]) => key !== "chartType");
  if (!entries.length) {
    return null;
  }
  return (
    <dl className="chart-panel__meta">
      {entries.map(([key, value]) => (
        <div key={key} className="chart-panel__meta-entry">
          <dt>{formatKey(key)}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ");
  }
  return String(value);
}
