# Scientific Calculator Help

## Evaluate expressions

1. Enter an expression using `+ - * / %` and power via `^` or `**`.
2. Functions available: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `ln`, `log10`, `exp`, `sqrt`, `abs`, `floor`, `ceil`, `sinc`, `min`, `max`.
3. Constants: `pi`, `e`, `tau`; scientific notation like `1e5` is accepted.
4. Choose **Radian** or **Degree** for trig input/output.
5. Submit to see the numeric result and canonical form (e.g., `3*4+5` → `((3 * 4) + 5)`).

## Plot functions

1. Pick 1 or 2 variables and set `start`, `stop`, `step` for each (total points ≤ 5000).
2. Add constants (`a`, `b`, `c`, …) if needed.
3. Enter the expression (`^` is exponent). Examples: `x^2 + 1`, `a*x + b*y`, `sinc(x)`.
4. Run:
   - **1D** → returns a series of `{x, y}` points.
   - **2D** → returns `{x: [...], y: [...], z: [[...]]}` grid for heatmaps/surface plots.

## Safety

- No external services; everything runs in memory.
- Inputs over 1024 characters or grids over 5000 points are rejected to keep performance predictable.
