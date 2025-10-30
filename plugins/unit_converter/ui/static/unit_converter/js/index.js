import { bindForm } from "/static/js/core.js";

const form = document.getElementById("converter-form");
const familySelect = document.getElementById("family");
const fromUnit = document.getElementById("from-unit");
const toUnit = document.getElementById("to-unit");
const fromHint = document.getElementById("from-hint");
const toHint = document.getElementById("to-hint");
const resultEl = document.getElementById("result");
const baseEl = document.getElementById("base");
const outputSection = document.getElementById("converter-output");
const resetButton = document.getElementById("converter-reset");
const expressionForm = document.getElementById("expression-form");
const expressionResult = document.getElementById("expression-result");
const expressionOutput = document.getElementById("expression-output");
const expressionReset = document.getElementById("expression-reset");

let units = {};

try {
  units = JSON.parse(form?.dataset.units || "{}") || {};
} catch (error) {
  units = {};
}

function formatAliases(aliases) {
  if (!aliases || !aliases.length) {
    return "";
  }
  return `Also accepts: ${aliases.join(", ")}`;
}

function populateUnitSelect(select, items) {
  if (!select) return;
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.symbol;
    option.textContent = item.symbol;
    option.dataset.aliases = (item.aliases || []).join(", ");
    option.dataset.dimension = item.dimension || "";
    select.appendChild(option);
  });
}

function updateHints() {
  const fromOption = fromUnit?.selectedOptions?.[0];
  const toOption = toUnit?.selectedOptions?.[0];
  const fromAliases = fromOption?.dataset?.aliases?.split(", ").filter(Boolean) || [];
  const toAliases = toOption?.dataset?.aliases?.split(", ").filter(Boolean) || [];
  if (fromHint) {
    fromHint.textContent = formatAliases(fromAliases);
  }
  if (toHint) {
    toHint.textContent = formatAliases(toAliases);
  }
}

function refreshUnits() {
  const family = familySelect?.value;
  const items = units[family] || [];
  populateUnitSelect(fromUnit, items);
  populateUnitSelect(toUnit, items);
  if (toUnit && toUnit.options.length > 1) {
    toUnit.selectedIndex = 1;
  }
  updateHints();
}

if (familySelect) {
  familySelect.addEventListener("change", refreshUnits);
}
if (fromUnit) {
  fromUnit.addEventListener("change", updateHints);
}
if (toUnit) {
  toUnit.addEventListener("change", updateHints);
}

refreshUnits();

const converterController = bindForm(form, {
  pendingText: "Converting…",
  successText: "Conversion complete",
  logContext: "Unit Converter · Direct",
  async onSubmit() {
    if (!form) return;
    const payload = {
      value: form.value.value.trim(),
      from_unit: form["from_unit"].value,
      to_unit: form["to_unit"].value,
      mode: form.mode.value,
    };
    if (!payload.value) {
      throw new Error("Enter a value to convert");
    }
    if (form.sig_figs.value) {
      payload.sig_figs = Number.parseInt(form.sig_figs.value, 10);
    }
    if (form.decimals.value) {
      payload.decimals = Number.parseInt(form.decimals.value, 10);
    }
    payload.notation = form.notation.value;
    const response = await fetch("/unit_converter/api/v1/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Conversion failed");
    }
    if (resultEl) {
      resultEl.textContent = `${payload.value} ${payload.from_unit} = ${data.formatted} ${data.unit}`;
    }
    if (baseEl) {
      baseEl.textContent = `Base quantity: ${data.base.value.toPrecision(6)} ${data.base.unit}`;
    }
    if (outputSection) {
      outputSection.hidden = false;
    }
  },
});

converterController.setStatus("Enter a value to convert", "info");

if (resetButton) {
  resetButton.addEventListener("click", () => {
    form?.reset();
    refreshUnits();
    if (outputSection) {
      outputSection.hidden = true;
    }
    converterController.setStatus("Ready", "info");
  });
}

const expressionController = bindForm(expressionForm, {
  pendingText: "Evaluating…",
  successText: "Expression evaluated",
  logContext: "Unit Converter · Expression",
  async onSubmit() {
    if (!expressionForm) return;
    const payload = {
      expression: expressionForm.expression.value.trim(),
      target: expressionForm.target.value.trim() || undefined,
      notation: expressionForm["expression-notation"].value,
    };
    if (!payload.expression) {
      throw new Error("Enter an expression to evaluate");
    }
    if (expressionForm["expression-sig-figs"].value) {
      payload.sig_figs = Number.parseInt(expressionForm["expression-sig-figs"].value, 10);
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
    if (expressionResult) {
      expressionResult.textContent = `${payload.expression} → ${data.formatted} ${data.unit}`;
    }
    if (expressionOutput) {
      expressionOutput.hidden = false;
    }
  },
});

expressionController.setStatus("Evaluate combined expressions without extra requests", "info");

if (expressionReset) {
  expressionReset.addEventListener("click", () => {
    expressionForm?.reset();
    if (expressionOutput) {
      expressionOutput.hidden = true;
    }
    expressionController.setStatus("Ready", "info");
  });
}
