import { FormEvent, useEffect, useMemo, useState } from "react";
import unitConverterIcon from "../assets/unit_converter_icon.png";
import { SettingsModal, type SettingsField } from "../components/SettingsModal";
import { StatusMessage } from "../components/StatusMessage";
import { ToolShell, ToolShellIntro } from "../components/ToolShell";
import { useLoading } from "../contexts/LoadingContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { useStatus } from "../hooks/useStatus";
import { useToolSettings } from "../hooks/useToolSettings";
import { apiFetch } from "../utils/api";

type UnitItem = {
  symbol: string;
  aliases?: string[];
  dimension?: string;
};

type UnitConverterPreferences = {
  defaultFamily: string;
  defaultMode: "absolute" | "relative";
  defaultNotation: "auto" | "fixed" | "scientific" | "engineering";
};

function formatAliases(aliases?: string[]) {
  if (!aliases?.length) {
    return "";
  }
  return `Also accepts: ${aliases.join(", ")}`;
}

export default function UnitConverterPage() {
  const pluginConfig = usePluginSettings<{ docs?: string }>("unit_converter", {});
  const helpHref = typeof pluginConfig.docs === "string" ? pluginConfig.docs : "/help/unit_converter";
  const { withLoader } = useLoading();
  const { settings: preferences, updateSetting, resetSettings } = useToolSettings<UnitConverterPreferences>(
    "unit_converter",
    {
      defaultFamily: "",
      defaultMode: "absolute",
      defaultNotation: "auto",
    },
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [families, setFamilies] = useState<string[]>([]);
  const [units, setUnits] = useState<Record<string, UnitItem[]>>({});
  const [family, setFamily] = useState<string>(preferences.defaultFamily);
  const [fromUnit, setFromUnit] = useState<string>("");
  const [toUnit, setToUnit] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [mode, setMode] = useState<"absolute" | "relative">(preferences.defaultMode);
  const [sigFigs, setSigFigs] = useState<string>("");
  const [decimals, setDecimals] = useState<string>("");
  const [notation, setNotation] = useState<string>(preferences.defaultNotation);
  const [result, setResult] = useState<string>("");
  const [base, setBase] = useState<string>("");

  const converterStatus = useStatus({ message: "Enter a value to convert", level: "info" }, {
    context: "Unit Converter · Direct",
  });

  const [expression, setExpression] = useState("");
  const [expressionTarget, setExpressionTarget] = useState("");
  const [expressionNotation, setExpressionNotation] = useState(preferences.defaultNotation);
  const [expressionSigFigs, setExpressionSigFigs] = useState("");
  const [expressionResult, setExpressionResult] = useState<string>("");
  const expressionStatus = useStatus(
    { message: "Evaluate combined expressions without extra requests", level: "info" },
    { context: "Unit Converter · Expression" },
  );

  const availableUnits = units[family] || [];

  useEffect(() => {
    let cancelled = false;
    const loadFamilies = async () => {
      try {
        const data = await withLoader(() =>
          apiFetch<{ families: string[]; units: Record<string, UnitItem[]> }>(
            "/api/unit_converter/families",
          ),
        );
        if (cancelled) {
          return;
        }
        setFamilies(data.families);
        setUnits(data.units);
        const initialFamily =
          (preferences.defaultFamily && data.families.includes(preferences.defaultFamily)
            ? preferences.defaultFamily
            : data.families[0]) ?? "";
        setFamily(initialFamily);
        const items = data.units[initialFamily] || [];
        setFromUnit(items[0]?.symbol ?? "");
        setToUnit(items[1]?.symbol ?? items[0]?.symbol ?? "");
      } catch (error) {
        if (!cancelled) {
          converterStatus.setStatus(
            error instanceof Error ? error.message : "Unable to load unit families",
            "error",
          );
        }
      }
    };
    loadFamilies();
    return () => {
      cancelled = true;
    };
  }, [converterStatus, preferences.defaultFamily, withLoader]);

  useEffect(() => {
    if (!families.length) {
      return;
    }
    if (preferences.defaultFamily && families.includes(preferences.defaultFamily)) {
      setFamily(preferences.defaultFamily);
    }
  }, [families, preferences.defaultFamily]);

  useEffect(() => {
    setMode(preferences.defaultMode);
  }, [preferences.defaultMode]);

  useEffect(() => {
    setNotation(preferences.defaultNotation);
    setExpressionNotation(preferences.defaultNotation);
  }, [preferences.defaultNotation]);

  useEffect(() => {
    const items = units[family] || [];
    if (!items.length) {
      setFromUnit("");
      setToUnit("");
      return;
    }
    setFromUnit((prev) => (items.some((item) => item.symbol === prev) ? prev : items[0].symbol));
    setToUnit((prev) => {
      if (items.some((item) => item.symbol === prev)) {
        return prev;
      }
      return items[1]?.symbol ?? items[0].symbol;
    });
  }, [family, units]);

  const settingsFields = useMemo<SettingsField[]>(
    () => [
      {
        key: "defaultFamily",
        label: "Default unit family",
        type: "select",
        options: [
          { value: "", label: "Auto-detect from configuration" },
          ...families.map((item) => ({ value: item, label: item })),
        ],
        description: "Family preselected when the workspace loads.",
      },
      {
        key: "defaultMode",
        label: "Default temperature mode",
        type: "select",
        options: [
          { value: "absolute", label: "Absolute (e.g., K → °C)" },
          { value: "relative", label: "Interval (ΔK → Δ°C)" },
        ],
        description: "Applied to both converters when resetting.",
      },
      {
        key: "defaultNotation",
        label: "Default notation",
        type: "select",
        options: [
          { value: "auto", label: "Automatic" },
          { value: "fixed", label: "Fixed" },
          { value: "scientific", label: "Scientific" },
          { value: "engineering", label: "Engineering" },
        ],
        description: "Formatting used unless overridden in the form.",
      },
    ],
    [families],
  );

  const handleFamilyChange = (next: string) => {
    setFamily(next);
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
      const data = await withLoader(() =>
        apiFetch<{
          value: number;
          unit: string;
          formatted: string;
          base: { value: number; unit: string };
        }>("/api/unit_converter/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setResult(`${value.trim()} ${fromUnit} = ${data.formatted} ${data.unit}`);
      const baseValue = Number(data.base?.value);
      const baseUnit = data.base?.unit ?? "";
      const baseDisplay = Number.isFinite(baseValue)
        ? baseValue.toPrecision(6)
        : String(data.base?.value ?? "");
      const baseText = baseUnit ? `${baseDisplay} ${baseUnit}` : baseDisplay;
      setBase(`Base quantity: ${baseText}`.trim());
      converterStatus.setStatus("Conversion complete", "success");
    } catch (error) {
      converterStatus.setStatus(error instanceof Error ? error.message : "Conversion failed", "error");
    }
  };

  const resetConverter = () => {
    setValue("");
    setSigFigs("");
    setDecimals("");
    setNotation(preferences.defaultNotation);
    setMode(preferences.defaultMode);
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
      const data = await withLoader(() =>
        apiFetch<{ formatted: string; unit: string }>("/api/unit_converter/expressions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setExpressionResult(`${expression.trim()} → ${data.formatted} ${data.unit}`);
      expressionStatus.setStatus("Expression evaluated", "success");
    } catch (error) {
      expressionStatus.setStatus(error instanceof Error ? error.message : "Expression evaluation failed", "error");
    }
  };

  const resetExpression = () => {
    setExpression("");
    setExpressionTarget("");
    setExpressionNotation(preferences.defaultNotation);
    setExpressionSigFigs("");
    setExpressionResult("");
    expressionStatus.setStatus("Ready", "info");
  };

  const currentFromAliases = formatAliases(availableUnits.find((unit) => unit.symbol === fromUnit)?.aliases);
  const currentToAliases = formatAliases(availableUnits.find((unit) => unit.symbol === toUnit)?.aliases);

  return (
    <section className="shell surface-block" aria-labelledby="unit-converter-title">
      <ToolShell
        intro={
          <ToolShellIntro
            icon={unitConverterIcon}
            titleId="unit-converter-title"
            category="General Utilities"
            title="Scientific unit converter"
            summary="Convert between laboratory units, inspect base quantities, and validate interval calculations without leaving the offline workspace. Choose a unit family, configure precision and notation, and view the converted value alongside the base SI representation."
            bullets={[
              "Unit registry powered by Pint with engineering materials presets",
              "Toggle between absolute and interval temperature conversions",
              <>Evaluate composite expressions such as <code>5 kJ/mol to eV</code></>,
            ]}
            actions={
              <>
                <button className="btn btn--ghost" type="button" onClick={() => setSettingsOpen(true)}>
                  ⚙️ Settings
                </button>
                <a className="btn btn--subtle" data-keep-theme href={typeof helpHref === "string" ? helpHref : "/help/unit_converter"}>
                  Read conversion guide
                </a>
              </>
            }
          />
        }
        workspace={
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
                  {families.length ? (
                    families.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}
                      </option>
                    ))
                  ) : (
                    <option value="">No families available</option>
                  )}
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
                <select
                  id="mode"
                  name="mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "absolute" | "relative")}
                >
                  <option value="absolute">Absolute (default)</option>
                  <option value="relative">Interval / delta</option>
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
        }
      />
      <SettingsModal
        isOpen={settingsOpen}
        title="Unit converter preferences"
        description="Configure default unit family, mode, and notation."
        fields={settingsFields}
        values={preferences}
        onChange={(key, value) =>
          updateSetting(key as keyof UnitConverterPreferences, value as UnitConverterPreferences[keyof UnitConverterPreferences])
        }
        onReset={() => resetSettings()}
        onClose={() => setSettingsOpen(false)}
      />
    </section>
  );
}
