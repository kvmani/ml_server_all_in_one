# Scientific Calculator

Evaluate expressions with standard math functions and plot them in 1D or 2D—all offline and in-memory.

## Expression evaluator

1. Enter an expression (operators: `+ - * / % ^`, functions: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `ln`, `log10`, `exp`, `sqrt`, `abs`, `floor`, `ceil`, `sinc`, `min`, `max`; constants: `pi`, `e`, `tau`). Scientific notation is supported (`1e5`).
2. Choose the angle unit radio: **Radian** or **Degree** (trig input/output is converted accordingly).
3. Provide optional variable values (`x`, `y`, `a`, `b`, …).
4. Submit to see the numeric result and a canonical parenthesized rendering (e.g., `3*4+5` → `((3 * 4) + 5)`).

## Function plotter

1. Pick variable count (1 or 2) and define ranges (`start`, `stop`, `step`) for each variable; total evaluated points are capped at 5000.
2. Add constants (`a`, `b`, `c`, …) as needed.
3. Enter the expression (caret `^` is treated as power).
4. Run the plot:
   - **1D** → returns a series of `{x, y}` points ready for a line/area chart.
   - **2D** → returns a grid `{x: [...], y: [...], z: [[...]]}` suitable for heatmaps or surface plots.

## API endpoints

- `POST /api/scientific_calculator/evaluate` — evaluate a scalar expression with optional variables and `angle_unit`.
- `POST /api/scientific_calculator/plot` — build plot-ready data for one or two variables, with optional constants.

## Limits and safety

- Expressions >1024 characters or grids >5000 points are rejected to keep responses predictable.
- No `eval`; the backend uses a restricted AST walker with allowlisted functions only.
- All calculations are ephemeral—no data is written to disk or sent over the network.
