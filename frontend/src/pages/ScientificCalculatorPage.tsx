import { FormEvent, useMemo, useState } from "react";
import calculatorIcon from "../assets/unit_converter_icon.png";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { StatusMessage } from "../components/StatusMessage";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { apiFetch } from "../utils/api";

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
        <div className="scroll-card">
          <pre>{JSON.stringify(plotResult.series.slice(0, 10), null, 2)}</pre>
          {plotResult.series.length > 10 ? <p className="text-muted">Showing first 10 of {plotResult.series.length}</p> : null}
        </div>
      ) : (
        <div className="scroll-card">
          <pre>{JSON.stringify(plotResult.grid, null, 2)}</pre>
        </div>
      )}
    </div>
  ) : null;

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
        <div className="workspace-columns">
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
        </div>
      }
    />
  );
}
