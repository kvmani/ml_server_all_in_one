# Scientific Calculator

Evaluate math expressions and generate plot-ready data entirely offline.

## Expression evaluation

1. Enter an expression using `+ - * / %` and power via `^` or `**`.
2. Functions: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `ln`, `log10`, `exp`, `sqrt`, `abs`, `floor`, `ceil`, `sinc`, `min`, `max`.
3. Constants: `pi`, `e`, `tau`; numbers can use scientific notation (`1e5`).
4. Select angle mode (**Radian** or **Degree**) for trig.
5. Submit to see the numeric result plus a canonical rendering (e.g., `3*4+5` → `((3 * 4) + 5)`).

## Function plotter

1. Choose one or two variables and define `start`, `stop`, `step` (total points ≤ 5000).
2. Optionally add constants (`a`, `b`, `c`, …).
3. Enter the expression (caret is power).
4. Run:
   - **1D** returns a series `{x, y}` for line/area charts.
   - **2D** returns a grid `{x: [...], y: [...], z: [[...]]}` for heatmaps or surfaces.

## API endpoints

- `POST /api/scientific_calculator/evaluate`
- `POST /api/scientific_calculator/plot`
