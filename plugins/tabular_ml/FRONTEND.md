# Tabular ML Frontend

The enhanced Tabular ML UI lives under `frontend/src/plugins/tabular_ml/` and integrates into the shared React shell (`frontend/src/App.tsx`).

## Structure

- `index.ts` – plugin registration helper used by the router/menu.
- `api.ts` – typed wrappers for calling the backend REST endpoints.
- `components/` – React components for dataset selection, preprocessing, outlier management, visualisation, training, evaluation, and the config drawer.
- `pages/TabularMLPage.tsx` – the page entrypoint assembled from the components above.
- `state/tabularMLStore.ts` – Zustand store (or equivalent lightweight state container) encapsulating plugin state.

Components reuse the existing design tokens, typography, and layout primitives already present under `frontend/src/components/` (e.g. `ToolShell`, `Panel`, button styles). No third-party UI libraries are introduced.

## Behaviour highlights

- Auto-loads the Titanic dataset on first render and initialises the preprocessing defaults.
- Keeps all dataset previews, model summaries, and chart data in memory; nothing is written to localStorage.
- Provides keyboard accessible controls with aria labels and descriptive text.
- Streams downloads through the existing download helpers when the user exports metrics or feature importances.

Refer to `docs/help/tabular_ml.md` for the user-facing walkthrough.
