import { FormEvent, useMemo, useState } from "react";
import { useStatus } from "../hooks/useStatus";
import { StatusMessage } from "../components/StatusMessage";

type UnitItem = {
  symbol: string;
  aliases?: string[];
  dimension?: string;
};

type UnitConverterProps = {
  families?: string[];
  units?: Record<string, UnitItem[]>;
  helpHref?: string;
};

function formatAliases(aliases?: string[]) {
  if (!aliases?.length) {
    return "";
  }
  return `Also accepts: ${aliases.join(", ")}`;
}

export default function UnitConverterPage({ props }: { props: Record<string, unknown> }) {
  const { families = [], units = {}, helpHref } = props as UnitConverterProps;
  const [family, setFamily] = useState<string>(families[0] ?? "");
  const availableUnits = units[family] || [];
  const [fromUnit, setFromUnit] = useState<string>(availableUnits[0]?.symbol ?? "");
  const [toUnit, setToUnit] = useState<string>(availableUnits[1]?.symbol ?? availableUnits[0]?.symbol ?? "");
  const [value, setValue] = useState<string>("");
  const [mode, setMode] = useState("absolute");
  const [sigFigs, setSigFigs] = useState<string>("");
  const [decimals, setDecimals] = useState<string>("");
  const [notation, setNotation] = useState("auto");
  const [result, setResult] = useState<string>("");
  const [base, setBase] = useState<string>("");

  const converterStatus = useStatus({ message: "Enter a value to convert", level: "info" }, {
    context: "Unit Converter · Direct",
  });

  const [expression, setExpression] = useState("");
  const [expressionTarget, setExpressionTarget] = useState("");
  const [expressionNotation, setExpressionNotation] = useState("auto");
  const [expressionSigFigs, setExpressionSigFigs] = useState("");
  const [expressionResult, setExpressionResult] = useState<string>("");
  const expressionStatus = useStatus(
    { message: "Evaluate combined expressions without extra requests", level: "info" },
    { context: "Unit Converter · Expression" },
  );

  const familyOptions = useMemo(() => families, [families]);

  const handleFamilyChange = (next: string) => {
    setFamily(next);
    const items = units[next] || [];
    setFromUnit(items[0]?.symbol ?? "");
    setToUnit(items[1]?.symbol ?? items[0]?.symbol ?? "");
  };

  const submitConvert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) {
      converterStatus.setStatus("Enter a value to convert", "error");
      return;
    }
    converterStatus.setStatus("Converting…", "progress");
    try {
      const payload: Record<string, unknown> = {
        value: value.trim(),
        from_unit: fromUnit,
        to_unit: toUnit,
        mode,
        notation,
      };
      if (sigFigs) {
        payload.sig_figs = Number.parseInt(sigFigs, 10);
      }
      if (decimals) {
        payload.decimals = Number.parseInt(decimals, 10);
      }
      const response = await fetch("/unit_converter/api/v1/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Conversion failed");
      }
      setResult(`${value.trim()} ${fromUnit} = ${data.formatted} ${data.unit}`);
      setBase(`Base quantity: ${data.base.value.toPrecision(6)} ${data.base.unit}`);
      converterStatus.setStatus("Conversion complete", "success");
    } catch (error) {
      converterStatus.setStatus(error instanceof Error ? error.message : "Conversion failed", "error");
    }
  };

  const resetConverter = () => {
    setValue("");
    setSigFigs("");
    setDecimals("");
    setNotation("auto");
    setMode("absolute");
    setResult("");
    setBase("");
    converterStatus.setStatus("Ready", "info");
  };

  const submitExpression = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expression.trim()) {
      expressionStatus.setStatus("Enter an expression to evaluate", "error");
      return;
    }
    expressionStatus.setStatus("Evaluating…", "progress");
    try {
      const payload: Record<string, unknown> = {
        expression: expression.trim(),
        notation: expressionNotation,
      };
      if (expressionTarget.trim()) {
        payload.target = expressionTarget.trim();
      }
      if (expressionSigFigs.trim()) {
        payload.sig_figs = Number.parseInt(expressionSigFigs.trim(), 10);
      }
      const response = await fetch("/unit_converter/api/v1/expressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Expression evaluation failed");
      }
      setExpressionResult(`${expression.trim()} → ${data.formatted} ${data.unit}`);
      expressionStatus.setStatus("Expression evaluated", "success");
    } catch (error) {
      expressionStatus.setStatus(error instanceof Error ? error.message : "Expression evaluation failed", "error");
    }
  };

  const resetExpression = () => {
    setExpression("");
    setExpressionTarget("");
    setExpressionNotation("auto");
    setExpressionSigFigs("");
    setExpressionResult("");
    expressionStatus.setStatus("Ready", "info");
  };

  const currentFromAliases = formatAliases(availableUnits.find((unit) => unit.symbol === fromUnit)?.aliases);
  const currentToAliases = formatAliases(availableUnits.find((unit) => unit.symbol === toUnit)?.aliases);

  return (
    <section className="shell surface-block" aria-labelledby="unit-converter-title">
      <div className="tool-shell__layout">
        <aside className="tool-shell__intro">
          <div className="tool-shell__icon" aria-hidden="true">
            <img src="/unit_converter/static/img/UnitConverter_icon.png" alt="" />
          </div>
          <p className="tool-card__category">General Utilities</p>
          <h1 id="unit-converter-title" className="section-heading">
            Scientific unit converter
          </h1>
          <p>
            Convert between laboratory units, inspect base quantities, and validate interval calculations without leaving the offline workspace. Choose a unit family, configure precision and notation, and view the converted value alongside the base SI representation.
          </p>
          <ul>
            <li>Unit registry powered by Pint with engineering materials presets</li>
            <li>Toggle between absolute and interval temperature conversions</li>
            <li>Evaluate composite expressions such as <code>5 kJ/mol to eV</code></li>
          </ul>
          <div className="tool-shell__actions">
            <a className="btn btn--subtle" data-keep-theme href={typeof helpHref === "string" ? helpHref : "/help/unit_converter"}>
              Read conversion guide
            </a>
          </div>
        </aside>

        <div className="tool-shell__workspace">
          <form id="converter-form" className="surface-muted form-grid" onSubmit={submitConvert}>
            <div className="input-grid">
              <div className="form-field">
                <label className="form-field__label" htmlFor="family">
                  Unit family
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Families group compatible dimensions (e.g. mass, pressure)."
                    aria-label="Unit family help"
                  >
                    ?
                  </button>
                </label>
                <select
                  id="family"
                  name="family"
                  value={family}
                  onChange={(event) => handleFamilyChange(event.target.value)}
                  required
                >
                  {familyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="value">
                  Value
                  <button
                    type="button"
                    className="tooltip-trigger"
                    data-tooltip="Enter a numeric quantity using decimal or scientific notation."
                    aria-label="Value help"
                  >
                    ?
                  </button>
                </label>
                <input
                  id="value"
                  name="value"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="from-unit">From unit</label>
                <select
                  id="from-unit"
                  name="from_unit"
                  required
                  value={fromUnit}
                  onChange={(event) => setFromUnit(event.target.value)}
                >
                  {availableUnits.map((unit) => (
                    <option key={unit.symbol} value={unit.symbol} data-aliases={(unit.aliases || []).join(", ")}>
                      {unit.symbol}
                    </option>
                  ))}
                </select>
                <p className="form-field__hint" id="from-hint">
                  {currentFromAliases}
                </p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="to-unit">To unit</label>
                <select
                  id="to-unit"
                  name="to_unit"
                  required
                  value={toUnit}
                  onChange={(event) => setToUnit(event.target.value)}
                >
                  {availableUnits.map((unit) => (
                    <option key={unit.symbol} value={unit.symbol}>
                      {unit.symbol}
                    </option>
                  ))}
                </select>
                <p className="form-field__hint" id="to-hint">
                  {currentToAliases}
                </p>
              </div>
            </div>

            <div className="input-grid">
              <div className="form-field">
                <label className="form-field__label" htmlFor="mode">
                  Conversion mode
                </label>
                <select id="mode" name="mode" value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="absolute">Absolute (default)</option>
                  <option value="interval">Interval / delta</option>
                </select>
                <p className="form-field__hint">Interval mode keeps offsets for temperature differences.</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="sig-figs">Significant figures</label>
                <input
                  id="sig-figs"
                  name="sig_figs"
                  type="number"
                  min="1"
                  max="12"
                  step="1"
                  placeholder="e.g. 4"
                  value={sigFigs}
                  onChange={(event) => setSigFigs(event.target.value)}
                />
                <p className="form-field__hint">Leave blank to auto-select.</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="decimals">Fixed decimals</label>
                <input
                  id="decimals"
                  name="decimals"
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  placeholder="e.g. 3"
                  value={decimals}
                  onChange={(event) => setDecimals(event.target.value)}
                />
                <p className="form-field__hint">Overrides significant figures when set.</p>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="notation">Notation</label>
                <select
                  id="notation"
                  name="notation"
                  value={notation}
                  onChange={(event) => setNotation(event.target.value)}
                >
                  <option value="auto">Automatic</option>
                  <option value="scientific">Scientific</option>
                  <option value="engineering">Engineering</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn" type="submit">
                Convert value
              </button>
              <button
                className="btn btn--ghost"
                type="reset"
                id="converter-reset"
                onClick={(event) => {
                  event.preventDefault();
                  resetConverter();
                }}
              >
                Reset
              </button>
            </div>
            <StatusMessage status={converterStatus.status} />
          </form>

          <section className="surface-muted" aria-live="polite" id="converter-output" hidden={!result}>
            <h2 className="form-section__title">Conversion result</h2>
            <p id="result" className="section-heading">
              {result}
            </p>
            <p id="base" className="form-field__hint">
              {base}
            </p>
          </section>

          <section className="surface-muted" aria-labelledby="expression-title">
            <h2 id="expression-title" className="form-section__title">
              Evaluate unit expression
            </h2>
            <form id="expression-form" className="form-grid" onSubmit={submitExpression}>
              <div className="input-grid">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="expression">
                    Expression
                    <button
                      type="button"
                      className="tooltip-trigger"
                      data-tooltip="Examples: '5 kJ/mol to eV', '1.2e6 Pa to bar', or '980 cm^3 * 7 g/cm^3 to kilogram'."
                      aria-label="Expression help"
                    >
                      ?
                    </button>
                  </label>
                  <input
                    id="expression"
                    name="expression"
                    placeholder="e.g. 5 kJ/mol to eV"
                    required
                    autoComplete="off"
                    value={expression}
                    onChange={(event) => setExpression(event.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="expression-target">
                    Target unit (optional)
                  </label>
                  <input
                    id="expression-target"
                    name="target"
                    placeholder="Only needed if expression omits 'to <unit>'"
                    value={expressionTarget}
                    onChange={(event) => setExpressionTarget(event.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="expression-notation">
                    Notation
                  </label>
                  <select
                    id="expression-notation"
                    name="notation"
                    value={expressionNotation}
                    onChange={(event) => setExpressionNotation(event.target.value)}
                  >
                    <option value="auto">Automatic</option>
                    <option value="scientific">Scientific</option>
                    <option value="engineering">Engineering</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="expression-sig-figs">
                    Significant figures
                  </label>
                  <input
                    id="expression-sig-figs"
                    name="sig_figs"
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={expressionSigFigs}
                    onChange={(event) => setExpressionSigFigs(event.target.value)}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn" type="submit">
                  Evaluate expression
                </button>
                <button
                  className="btn btn--ghost"
                  type="reset"
                  id="expression-reset"
                  onClick={(event) => {
                    event.preventDefault();
                    resetExpression();
                  }}
                >
                  Reset
                </button>
              </div>
              <StatusMessage status={expressionStatus.status} />
            </form>
            <div id="expression-output" hidden={!expressionResult} aria-live="polite">
              <p className="section-heading" id="expression-result">
                {expressionResult}
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
