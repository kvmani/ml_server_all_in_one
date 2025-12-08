# Scientific Calculator Plugin

Evaluate math expressions offline with degree/radian modes and render canonical parentheses so users can see how the parser interprets their input. A plotting tab generates 1D series or 2D surfaces for expressions with up to two free variables plus named constants.

## API surface

- `POST /api/scientific_calculator/evaluate` — JSON body with `expression`, optional `variables` dict, and `angle_unit` (`radian`|`degree`). Returns the numeric result, canonicalized expression string, and variables detected.
- `POST /api/scientific_calculator/plot` — JSON body with `expression`, `variables` (list of ranges), optional `constants`, and `angle_unit`. Returns either a 1D series (`mode: "1d"`) or 2D surface grid (`mode: "2d"`), along with metadata.

## Expression grammar (safe subset)

- Operators: `+`, `-`, `*`, `/`, `%`, power via `^` or `**`.
- Literals: integers, decimals, scientific notation (`1e5`), constants `pi`, `e`, `tau`.
- Functions: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `ln`, `log10`, `exp`, `sqrt`, `abs`, `floor`, `ceil`, `sinc`, `min`, `max`.
- Angle mode: `degree` converts trig inputs from degrees and inverse trig outputs back to degrees; `radian` uses raw values.

## Plotting contract

- Up to **two** free variables, each defined by `name`, `start`, `stop`, `step`. Total evaluated points are capped at 5000 to prevent runaway grids.
- Named constants (e.g., `a`, `b`, `c`) can be supplied once and reused across evaluations.
- 1D output shape: `{ mode: "1d", series: [{ x, y }, ...] }`.
- 2D output shape: `{ mode: "2d", grid: { x: [...], y: [...], z: [[...]] } }` where `z` rows align to each `y`.

## Privacy and safety

- No `eval` or dynamic imports; expressions are parsed with `ast` and restricted to numeric operators/functions.
- All computations stay in memory; nothing is written to disk.
- Inputs exceeding 1024 characters or grids exceeding 5000 points are rejected early with structured `AppError` responses.

## Frontend expectations

- Tab 1: Expression evaluator with text area, angle-mode radio (degree/radian), live canonical preview, and result box.
- Tab 2: Function plotter with controls for variable count (1 or 2), per-variable range and step, constants list, and a canvas/chart that switches between line plot (1D) and heatmap/mesh (2D).

See `specifications.md` for deeper design notes and future enhancements.
