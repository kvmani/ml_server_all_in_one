# Developer guide

This document expands on the repository layout described in the README and the root `AGENTS.md`. It focuses on day-to-day workflows for contributors building new tools or extending the UI shell.

## Application architecture recap

* `app/` hosts the Flask application factory, shared templates (`ui/templates`), and static assets (`ui/static`).
* `plugins/<name>/` packages provide isolated functionality. Each plugin contains:
  * `api/` – Flask blueprints and request validation.
  * `core/` – pure Python logic and unit tests (no Flask dependencies).
  * `ui/` – Jinja templates, namespaced CSS/JS.
  * `tests/` – pytest coverage for API endpoints and core logic.
* `common/` contains shared helpers (input validation, in-memory IO, image utilities).
* `config.yml` centralises branding, theme palettes, and per-plugin upload limits.

The application factory (`app/__init__.py`) loads `config.yml` at startup, exposes settings via `app.config["SITE_SETTINGS"]` and `app.config["PLUGIN_SETTINGS"]`, then injects them into every template through a context processor.

## Local setup

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Launch the development server:

   ```bash
   python scripts/run_dev.py
   ```

   Visit `http://localhost:5001/?theme=midnight` (or another theme key from `config.yml`).
   Set `ML_SERVER_AIO_PORT` if you need a different Flask port.

3. Run the test suite before committing:

   ```bash
   pytest -q
   ```

## Working with themes

* Theme palettes live in `config.yml` under `site.themes`. Add a new key with `label`, `description`, and optionally `color_scheme`.
* `app/ui/static/css/core.css` defines custom properties (backgrounds, borders, shadows). Provide overrides inside `:root[data-theme='<key>']` to apply the palette.
* The header `<select>` is populated automatically; switching themes updates `?theme=<key>` and re-renders templates using that palette.
* Avoid client-side storage (cookies/localStorage). All theme state is URL-based to honour privacy constraints.

## Updating upload constraints

* Prefer editing `config.yml` rather than modifying Python constants.
* Each plugin reads its limits via helper functions:
  * Hydride segmentation – `_plugin_limits()` in `plugins/hydride_segmentation/api/__init__.py`
  * PDF tools – `_merge_limit()` / `_split_limit()` in `plugins/pdf_tools/api/__init__.py`
  * Tabular ML – limit handling inside the `train` view
* After adjusting limits, surface the new values in the UI by referencing `plugin_settings` inside templates (see existing examples).

## Adding a new plugin

1. Scaffold a package under `plugins/<tool>/` with the structure outlined above.
2. Define a manifest in `plugins/<tool>/__init__.py` containing `title`, `summary`, `blueprint`, `category`, and optionally `icon`.
3. Register routes in `plugins/<tool>/api/__init__.py` and ensure they return JSON responses or file downloads with appropriate headers.
4. Build the UI under `plugins/<tool>/ui/`, consuming global CSS tokens and JS helpers.
5. Update `config.yml` with per-plugin limits and documentation URL (e.g., `/help/<tool>`).
6. Write tests in `plugins/<tool>/tests/` covering core functionality and HTTP endpoints.

## Documentation workflow

* Author tool-specific markdown under `docs/tools/` (see provided templates for hydride segmentation, PDF tools, tabular ML, and unit converter).
* Link repository documentation from README sections to keep the help centre and markdown in sync.
* UI help pages live in `app/ui/templates/help/`; they should echo the content of the markdown docs for offline consumption.

## Coding conventions

* Follow the shared CSS token model; define new variables before hardcoding colours or shadows.
* Keep JavaScript ES2017-compatible and avoid third-party dependencies. Use modules (`type="module"`) and helper functions from `core.js`.
* Maintain privacy guarantees: do not use localStorage, cookies, analytics, or remote network calls.
* Ensure all user inputs have validation, inline status messaging, and accessible labels/tooltips.

## Release checklist

- [ ] `pytest -q`
- [ ] `config.yml` validated (YAML syntax) and reflects shipped defaults
- [ ] UI verified on both provided themes via the header toggle
- [ ] Help pages and docs updated for any user-facing changes
- [ ] No binary artefacts committed

Refer back to `AGENTS.md` for architectural guardrails when in doubt.
