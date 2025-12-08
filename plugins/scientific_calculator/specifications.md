# Scientific Calculator – Specification

## Overview

An offline Scientific Calculator plugin that evaluates math expressions with optional degree/radian modes, shows a canonical parenthesized rendering of the parsed expression, and plots expressions with up to two free variables plus named constants. Everything runs in memory; no data touches disk or external services.

## Requirements

1. **Expression evaluator**
   - Accepts a string expression plus optional variable assignments and an angle unit toggle (`degree`/`radian`).
   - Supports operators `+ - * / % ^`, numeric literals (including `1e5`), constants `pi`, `e`, `tau`, and standard math functions (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `ln`, `log10`, `exp`, `sqrt`, `abs`, `floor`, `ceil`, `sinc`, `min`, `max`).
   - Returns the numeric result **and** a canonical parenthesized string (e.g., `3*4+5` → `((3 * 4) + 5)`).
   - Rejects unsafe syntax (attributes, comprehensions, imports) and overlong input (>1024 chars).

2. **Function plotter**
   - Up to **two** free variables with user-defined ranges (`start`, `stop`, `step`); total evaluated points capped at 5000.
   - Named constants (`a`, `b`, `c`, …) injected into the evaluation context.
   - Outputs either a 1D series `{mode:"1d", series:[{x,y}]}` or a 2D surface `{mode:"2d", grid:{x:[], y:[], z:[[]]}}`.
   - Same function/angle semantics as the evaluator.

3. **Backend constraints**
   - Pure logic in `core/engine.py` using `ast` for parsing; no `eval`.
   - Flask blueprint under `/api/scientific_calculator` exposing `/evaluate` and `/plot`.
   - Errors returned via `common.responses.fail` with `ValidationAppError` codes.
   - Stay within privacy guardrails: no logging of user expressions, no persistence.

4. **Frontend expectations**
   - Tabbed UI similar to other tools:
     - **Evaluate**: input box, angle radio, submit; show result and canonical string.
     - **Plot**: controls for variable count (1–2), range sliders/inputs, constants list, expression box; renders line chart (1D) or heatmap/mesh (2D). Show evaluated point count.
   - Input hints should mention supported operators/functions and the caret-as-power rule.
   - Validation errors displayed inline with the server’s error message.

## Data contracts

### Evaluate
Request:
```json
{ "expression": "3*4+5", "variables": {"x": 2}, "angle_unit": "degree" }
```
Response:
```json
{
  "result": 17.0,
  "canonical": "((3 * 4) + 5)",
  "angle_unit": "degree",
  "used_variables": []
}
```

### Plot
Request:
```json
{
  "expression": "a*x^2 + b*y",
  "angle_unit": "radian",
  "variables": [
    { "name": "x", "start": 0, "stop": 2, "step": 1 },
    { "name": "y", "start": 0, "stop": 1, "step": 1 }
  ],
  "constants": [{ "name": "a", "value": 1.5 }, { "name": "b", "value": 2 }]
}
```
Response:
```json
{
  "mode": "2d",
  "expression": "(a * (x ^ 2)) + (b * y)",
  "angle_unit": "radian",
  "variables": [...],
  "points": 6,
  "grid": { "x": [0,1,2], "y": [0,1], "z": [[0,2,6],[2,4,8]] }
}
```

## Validation rules

- `angle_unit` ∈ {`radian`, `degree`}.
- Variable names must be identifiers not starting with `__` and cannot shadow reserved functions/constants.
- `step` > 0 and `stop` ≥ `start`.
- Total evaluated points ≤ 5000; otherwise return `sci_calc.invalid_expression`.
- Results must be finite real numbers; complex/NaN/inf are rejected.

## Testing

- Unit tests for expression parsing, caret-to-power, trig degree mode, and 1D/2D plotting.
- API tests for `/evaluate` and `/plot` success + validation failures.
- Future frontend tests: RTL for form interactions and render guards; Playwright for plotting flows.

## Future enhancements

- Add piecewise functions and conditional expressions (ternary) with explicit allowlisting.
- Support named presets for common expressions and constant sets.
- Export plot data as CSV and SVG snapshots for offline reports.
