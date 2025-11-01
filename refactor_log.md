# Frontend refactor log

- Introduced a global loading context and overlay to surface request progress consistently across tools.
- Standardised per-tool settings via `SettingsModal` and `useToolSettings`; preferences persist in `localStorage` and feed each page.
- Migrated Hydride Segmentation, Unit Converter, and Tabular ML pages away from server-rendered props. All now consume `/api/<plugin>/…` endpoints through the shared `apiFetch` helper and surface persistent preferences via `SettingsModal`.
- Added shared chart rendering via `ChartPanel` (Recharts) and wired metadata display for reusable legends/meta.
- Configured Vite for dev proxying to Flask and Vitest-based unit tests (`npm run test`). Added minimal coverage for shared components.

## Follow-ups

- Expand Vitest coverage around complex flows (PDF queue behaviours, dataset uploads, Tabular workspace interactions).
- Replace legacy static assets referenced from plugin directories with Vite-managed imports.
- Convert hydride histogram/orientation imagery to structured chart data when backend support is available.
