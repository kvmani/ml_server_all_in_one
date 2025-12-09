import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import calculatorIcon from "../assets/unit_converter_icon.png";
import { ChartPanel } from "../components/ChartPanel";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { StatusMessage } from "../components/StatusMessage";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { apiFetch } from "../utils/api";
import "../styles/scientific-calculator.css";

type EvaluateResponse = {
  result: number;
  canonical: string;
  angle_unit: string;
  used_variables: string[];
};

type PlotSeriesPoint = { x: number; y: number };
type PlotResponse =
  | {
      mode: "1d";
      expression: string;
      angle_unit: string;
      variables: { name: string; start: number; stop: number; step: number }[];
      points: number;
      series: PlotSeriesPoint[];
    }
  | {
      mode: "2d";
      expression: string;
      angle_unit: string;
      variables: { name: string; start: number; stop: number; step: number }[];
      points: number;
      grid: { x: number[]; y: number[]; z: number[][] };
    };

type VariableState = { name: string; start: string; stop: string; step: string };

function parseKeyValues(raw: string): Record<string, number> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  const entries = trimmed.split(",").map((item) => item.trim());
  const output: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry) continue;
    const [key, value] = entry.split("=").map((part) => part.trim());
    if (!key || value === undefined) {
      throw new Error("Use name=value pairs separated by commas (e.g., x=1, y=2)");
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Value for ${key} must be a finite number`);
    }
    output[key] = parsed;
  }
  return output;
}

function parseFloatSafe(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ScientificCalculatorPage() {
  const pluginConfig = usePluginSettings<{ docs?: string }>("scientific_calculator", {});
  const helpHref = typeof pluginConfig.docs === "string" ? pluginConfig.docs : "/help/scientific_calculator";
  const { withLoader } = useLoading();

  const [angleUnit, setAngleUnit] = useState<"radian" | "degree">("radian");
  const [activeTab, setActiveTab] = useState<"evaluate" | "plot">("evaluate");

  // Evaluate tab state
  const [expression, setExpression] = useState<string>("3*4+5");
  const [variablesText, setVariablesText] = useState<string>("x=1, y=2");
  const [evaluateResult, setEvaluateResult] = useState<EvaluateResponse | null>(null);
  const evaluateStatus = useStatus({ message: "Enter an expression and evaluate", level: "info" });

  // Plot tab state
  const [variableCount, setVariableCount] = useState<1 | 2>(1);
  const [variables, setVariables] = useState<VariableState[]>([
    { name: "x", start: "0", stop: "10", step: "1" },
    { name: "y", start: "0", stop: "10", step: "1" },
  ]);
  const [constantsText, setConstantsText] = useState<string>("a=1, b=2");
  const [plotExpression, setPlotExpression] = useState<string>("a*x^2 + b");
  const [plotResult, setPlotResult] = useState<PlotResponse | null>(null);
  const plotStatus = useStatus({ message: "Define ranges and plot the function", level: "info" });

  const activeVariables = useMemo(() => variables.slice(0, variableCount), [variables, variableCount]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleEvaluate = async (event: FormEvent) => {
    event.preventDefault();
    evaluateStatus.setStatus("Evaluating…", "info");
    try {
      const vars = parseKeyValues(variablesText);
      const data = await withLoader(() =>
        apiFetch<EvaluateResponse>("/api/scientific_calculator/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expression, variables: vars, angle_unit: angleUnit }),
        }),
      );
      setEvaluateResult(data);
      evaluateStatus.setStatus("Evaluation complete", "success");
    } catch (error) {
      setEvaluateResult(null);
      const message = error instanceof Error ? error.message : "Evaluation failed";
      evaluateStatus.setStatus(message, "error");
    }
  };

  const handlePlot = async (event: FormEvent) => {
    event.preventDefault();
    plotStatus.setStatus("Plotting…", "info");
    try {
      const constants = parseKeyValues(constantsText);
      const variablePayload = activeVariables.map((item) => ({
        name: item.name || "x",
        start: parseFloatSafe(item.start, 0),
        stop: parseFloatSafe(item.stop, 10),
        step: parseFloatSafe(item.step, 1),
      }));
      const data = await withLoader(() =>
        apiFetch<PlotResponse>("/api/scientific_calculator/plot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expression: plotExpression,
            angle_unit: angleUnit,
            variables: variablePayload,
            constants: Object.entries(constants).map(([name, value]) => ({ name, value })),
          }),
        }),
      );
      setPlotResult(data);
      plotStatus.setStatus("Plot data ready", "success");
    } catch (error) {
      setPlotResult(null);
      const message = error instanceof Error ? error.message : "Plotting failed";
      plotStatus.setStatus(message, "error");
    }
  };

  const evaluateResultBox = evaluateResult ? (
    <div className="card">
      <h3>Result</h3>
      <p className="text-large">{evaluateResult.result}</p>
      <p className="text-mono">Canonical: {evaluateResult.canonical}</p>
      {evaluateResult.used_variables?.length ? (
        <p className="text-muted">Variables used: {evaluateResult.used_variables.join(", ")}</p>
      ) : null}
    </div>
  ) : null;

  const plotResultBox = plotResult ? (
    <div className="card">
      <h3>Plot data</h3>
      <p className="text-mono">Expression: {plotResult.expression}</p>
      <p>
        Mode: {plotResult.mode.toUpperCase()} · Points: {plotResult.points}
      </p>
      {plotResult.mode === "1d" ? (
        <ChartPanel
          title="Function preview"
          description={`y = ${plotResult.expression}`}
          data={{
            x: plotResult.series.map((point) => point.x),
            y: plotResult.series.map((point) => point.y),
            meta: { expression: plotResult.expression, angle_unit: plotResult.angle_unit },
          }}
          variant="line"
        />
      ) : (
        <div className="sci-heatmap">
          <div className="sci-heatmap__header">
            <span className="text-mono">z = {plotResult.expression}</span>
            <span className="text-muted">
              x ∈ [{plotResult.grid.x[0]}, {plotResult.grid.x[plotResult.grid.x.length - 1]}], y ∈ [
              {plotResult.grid.y[0]}, {plotResult.grid.y[plotResult.grid.y.length - 1]}]
            </span>
          </div>
          <canvas ref={canvasRef} width={640} height={360} />
        </div>
      )}
      <div className="button-row">
        <button type="button" className="button" onClick={() => downloadPlotData(plotResult)}>
          Download JSON
        </button>
        {plotResult.mode === "1d" ? (
          <button type="button" className="button" onClick={() => downloadCsv(plotResult)}>
            Download CSV
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!plotResult || plotResult.mode !== "2d") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y, z } = plotResult.grid;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const cols = x.length;
    const rows = y.length;
    let min = Infinity;
    let max = -Infinity;
    z.forEach((row) =>
      row.forEach((val) => {
        if (val < min) min = val;
        if (val > max) max = val;
      }),
    );
    const cellW = width / Math.max(cols, 1);
    const cellH = height / Math.max(rows, 1);
    const colorFor = (value: number) => {
      const t = max === min ? 0.5 : (value - min) / (max - min);
      const r = Math.floor(255 * t);
      const b = Math.floor(255 * (1 - t));
      return `rgb(${r}, 80, ${b})`;
    };
    z.forEach((row, rowIndex) => {
      row.forEach((val, colIndex) => {
        ctx.fillStyle = colorFor(val);
        ctx.fillRect(colIndex * cellW, rowIndex * cellH, cellW + 1, cellH + 1);
      });
    });
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= cols; i++) {
      const xPos = i * cellW;
      ctx.beginPath();
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, height);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const yPos = j * cellH;
      ctx.beginPath();
      ctx.moveTo(0, yPos);
      ctx.lineTo(width, yPos);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, 8, 180, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`min: ${min.toExponential(3)}`, 16, 26);
    ctx.fillText(`max: ${max.toExponential(3)}`, 16, 44);
  }, [plotResult]);

  function downloadPlotData(data: PlotResponse) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scientific_calculator_plot.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv(data: Extract<PlotResponse, { mode: "1d" }>) {
    const rows = [["x", "y"], ...data.series.map((point) => [point.x, point.y])];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scientific_calculator_plot.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const tabs = (
    <div className="sci-tabs" role="tablist" aria-label="Scientific calculator">
      {[
        { key: "evaluate", label: "Evaluate" },
        { key: "plot", label: "Plot" },
      ].map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          className={activeTab === tab.key ? "sci-tab active" : "sci-tab"}
          aria-selected={activeTab === tab.key}
          onClick={() => setActiveTab(tab.key as "evaluate" | "plot")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const evaluateSection = (
    <section className="card">
      <div className="card-header">
        <h2>Evaluate expression</h2>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="angle"
              value="radian"
              checked={angleUnit === "radian"}
              onChange={() => setAngleUnit("radian")}
            />
            Radian
          </label>
          <label>
            <input
              type="radio"
              name="angle"
              value="degree"
              checked={angleUnit === "degree"}
              onChange={() => setAngleUnit("degree")}
            />
            Degree
          </label>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleEvaluate}>
        <label className="form-field">
          <span>Expression</span>
          <textarea
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            rows={3}
            required
            placeholder="e.g., 3*5+45-45*45^(2+3)*sin(30)"
          />
        </label>
        <label className="form-field">
          <span>Variables (name=value, comma separated)</span>
          <input
            type="text"
            value={variablesText}
            onChange={(event) => setVariablesText(event.target.value)}
            placeholder="x=1, y=2"
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="button primary">
            Evaluate
          </button>
        </div>
      </form>
      <StatusMessage status={evaluateStatus.status} />
      {evaluateResultBox}
    </section>
  );

  const plotSection = (
    <section className="card">
      <div className="card-header">
        <h2>Function plotter</h2>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="var-count"
              value="1"
              checked={variableCount === 1}
              onChange={() => setVariableCount(1)}
            />
            1 variable
          </label>
          <label>
            <input
              type="radio"
              name="var-count"
              value="2"
              checked={variableCount === 2}
              onChange={() => setVariableCount(2)}
            />
            2 variables
          </label>
        </div>
      </div>
      <form className="form-grid" onSubmit={handlePlot}>
        <label className="form-field">
          <span>Expression</span>
          <textarea
            value={plotExpression}
            onChange={(event) => setPlotExpression(event.target.value)}
            rows={3}
            required
            placeholder="e.g., a*x^2 + b*y + sin(x)"
          />
        </label>
        {activeVariables.map((variable, index) => (
          <div key={index} className="grid grid-4">
            <label className="form-field">
              <span>Name</span>
              <input
                type="text"
                value={variable.name}
                onChange={(event) => {
                  const next = [...variables];
                  next[index] = { ...next[index], name: event.target.value };
                  setVariables(next);
                }}
                required
              />
            </label>
            <label className="form-field">
              <span>Start</span>
              <input
                type="number"
                value={variable.start}
                onChange={(event) => {
                  const next = [...variables];
                  next[index] = { ...next[index], start: event.target.value };
                  setVariables(next);
                }}
              />
            </label>
            <label className="form-field">
              <span>Stop</span>
              <input
                type="number"
                value={variable.stop}
                onChange={(event) => {
                  const next = [...variables];
                  next[index] = { ...next[index], stop: event.target.value };
                  setVariables(next);
                }}
              />
            </label>
            <label className="form-field">
              <span>Step</span>
              <input
                type="number"
                value={variable.step}
                onChange={(event) => {
                  const next = [...variables];
                  next[index] = { ...next[index], step: event.target.value };
                  setVariables(next);
                }}
              />
            </label>
          </div>
        ))}
        <label className="form-field">
          <span>Constants (name=value, comma separated)</span>
          <input
            type="text"
            value={constantsText}
            onChange={(event) => setConstantsText(event.target.value)}
            placeholder="a=1, b=2"
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="button primary">
            Build plot data
          </button>
        </div>
      </form>
      <StatusMessage status={plotStatus.status} />
      {plotResultBox}
    </section>
  );

  return (
    <ToolShell
      intro={
        <ToolShellIntro
          icon={calculatorIcon}
          iconAlt="Scientific calculator icon"
          category="General utilities"
          title="Scientific Calculator"
          summary="Evaluate expressions in radian or degree mode, see canonical parentheses, and generate plot-ready data for 1D/2D functions."
          bullets={[
            "Operators: + - * / % and power via ^ or **",
            "Functions: sin, cos, tan, asin, acos, atan, log, ln, exp, sqrt, abs, floor, ceil, sinc, min, max",
            "Supports constants pi, e, tau and scientific notation",
          ]}
          footer={
            <p className="text-muted">
              Need help? Visit <a href={helpHref}>/help/scientific_calculator</a>.
            </p>
          }
        />
      }
      workspace={
        <div className="sci-main">
          {tabs}
          <div className="sci-panel">{activeTab === "evaluate" ? evaluateSection : plotSection}</div>
        </div>
      }
    />
  );
}
