# ML Server All-In-One

An offline-first Flask platform bundling microstructure analysis, PDF workflows, tabular machine learning, and laboratory utilities behind a shared UI shell. Every tool runs completely in-memory; no uploads ever leave the workstation.

## Feature tour

| Tool | Highlights |
| --- | --- |
| **Hydride Segmentation** | Drag-and-drop zirconium alloy micrographs, configure CLAHE/adaptive threshold/morphology parameters, inspect overlays and metrics, and export PNG artefacts. |
| **PDF Tools** | Queue up to 10 PDFs, reorder with drag handles, apply per-file page ranges, merge instantly, or split a single PDF into per-page downloads. |
| **PDF Stitch** | Upload a few PDFs, assign aliases, and describe an exact multi-line page plan (including “end”) to assemble a custom sequence in one pass. |
| **Tabular ML** | Upload CSV datasets (≤2 MB), preview rows, build scatter plots, auto-detect regression vs. classification, and train CPU-only models (Random Forest, Gradient Boosting, SVM, Extra Trees, optional Torch MLP if installed) with importances. |
| **Unit Converter** | Convert between engineering units with Pint-backed accuracy, interval-aware temperature deltas, expression evaluation, and configurable precision. |
| **Global Activity Log** | Persistent, non-invasive footer console that surfaces upload status, validation warnings, and task progress across every tool in real time. |

Browse in-app help for each workspace via the header **Help** link or jump directly:

- `/help/overview` – platform overview and quick links
- `/help/hydride_segmentation`
- `/help/pdf_tools`
- `/help/tabular_ml`
- `/help/unit_converter`

### Unified activity window

A docked activity window now appears at the bottom of every page. It auto-expands whenever a tool posts a message—upload limits, validation errors, or long-running jobs such as segmentation and PDF splitting. Typical events include:

- `Loaded image successfully. sample_micrograph.png (1.82 MB)`
- `Segmentation is in process. Please wait…`
- `Unsupported file format. Please upload PDF files only.`
- `Pages ready to download (8)`

The log never persists to disk and clears with a single click, keeping the UX transparent without violating the offline/privacy charter.

Detailed developer docs live under [`docs/`](docs/) with step-by-step guides and architecture notes.

## API overview

- All plugin endpoints live under `/api/<plugin>/<action>`.
- Responses follow a shared envelope:
  - Success → `{ "success": true, "data": ... }`
  - Errors → `{ "success": false, "error": { "code": "<id>", "message": "...", "details": { ... } } }`
- Full request/response contracts are documented in [`docs/api/openapi.yaml`](docs/api/openapi.yaml).
- Legacy routes under `/<plugin>/api/v1/...` still function but are considered deprecated.

## Getting started

1. **Create an isolated environment**

   ```bash
   python -m venv .venv
   export PYTHONPATH="$PWD:$PYTHONPATH" ### adding cwd to python path.
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Set a secret key**

   ```bash
   export ML_SERVER_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')"
   ```

   The application refuses to fall back to predictable defaults. Provide your own value in production—one secret per deploymen
t. During local development you may skip this step, but a random key will be generated on every restart which invalidates sessi
ons.

4. **Build the frontend bundle**

   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

   The Vite build places hashed React assets under `app/ui/static/react/`. Re-run the build whenever you change files in `frontend/`. During local development you can skip the build step and rely on the Vite dev server instead (see step 5).

5. **Review configuration** (optional)

   - Open [`config.yml`](config.yml) to adjust:
     - `site.name`, `site.description`, and `site.default_theme`
     - Theme palette definitions exposed through the UI toggle
     - Global upload ceiling (`site.max_content_length_mb`)
     - Per-plugin limits (e.g., `plugins.pdf_tools.merge_upload.max_mb`)
     - Documentation links (`plugins.<tool>.docs`)

6. **Run the development servers**

   Terminal A (Flask API):

   ```bash
   export FLASK_APP=app:create_app
   python scripts/run_dev.py
   ```

   Terminal B (React SPA with proxy to Flask):

   ```bash
   cd frontend
   npm run dev -- --host
   ```

   Visit `http://localhost:5173/?theme=<theme-key>` while the Vite dev server is running. API calls are automatically proxied to the Flask app at `http://localhost:5000`.

7. **Execute backend tests**

   ```bash
   pytest -q
   ```

8. **Run frontend unit tests**

   ```bash
   cd frontend
   npm run test
   cd ..
   ```

9. **Run Playwright end-to-end suite**

   ```bash
   cd frontend
   npx playwright install --with-deps  # first run only
   npm run test:e2e
   cd ..
   ```

   The Playwright runner spins up the Vite dev server automatically, exercises every plugin workflow in Chromium, Firefox, and Safari engines, and stores HTML reports, traces, and videos under `frontend/playwright-report/` and `frontend/test-results/`.

## Running in different environments

### Air-gapped workstations

1. On a networked staging machine, pre-download dependencies:

   ```bash
   pip download -r requirements.txt -d wheelhouse
   ```

   Copy the repository plus the `wheelhouse/` directory to the air-gapped host.

2. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

3. Install from the local wheel cache without touching the internet:

   ```bash
   pip install --no-index --find-links ./wheelhouse -r requirements.txt
   ```

4. Run the server offline:

   ```bash
   export FLASK_APP=app:create_app
   python scripts/run_dev.py
   ```

   All uploads stay in-memory; the bottom activity log will surface file-size checks (e.g., `File exceeds allowed limit (5 MB)`).

### GitHub Codespaces

1. Create a Codespace from the repository and wait for the container to build.
2. Initialise the environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Launch the dev server (it already binds to `0.0.0.0`):

   ```bash
   export FLASK_APP=app:create_app
   python scripts/run_dev.py
   ```

4. Forward port 5000 in the Codespaces UI. The activity log appears once you upload a sample file—helpful when verifying that transfers never leave the Codespace sandbox.

### Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
set FLASK_APP=app:create_app
python scripts\run_dev.py
pytest -q
```

The logging window mirrors the same status messages, so you receive `Segmentation is in process. Please wait…` prompts directly in the Windows browser.

## Configuration summary

- **`config.yml`** – single source of truth for site branding, theme palettes, upload thresholds, and help endpoints. The Flask factory loads it on startup and shares values with templates via context processors.
- **Theme toggle** – stored themes from `config.yml` populate the header `<select>`. Switching themes updates the URL query (`?theme=...`) so subsequent navigation stays consistent without cookies or local storage.
- **Plugin settings** – each plugin reads its limits from `app.config["PLUGIN_SETTINGS"]`. Adjust `max_files`/`max_mb` values here instead of editing Python constants.

Refer to [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) for plugin scaffolding patterns, shared component usage, and testing strategy.

## Project structure

- `app/` – Flask shell, shared templates (`base.html`), CSS tokens (`static/css/core.css`), and navigation helpers.
- `plugins/<tool>/` – tool-specific API routes, core logic, UI assets, and tests.
- `docs/` – developer onboarding, tool deep dives, and configuration references.
- `config.yml` – editable YAML controlling appearance and limits.

## Continuous integration

- **Playwright E2E** – GitHub Actions workflow triggered on every push and pull request. It caches Node dependencies, installs Playwright browsers, runs `npm run test:e2e`, and uploads the HTML report plus raw artifacts so reviewers can inspect traces and console output straight from the PR.

## Development notes

- The React single-page shell lives under [`frontend/`](frontend/) and is built with Vite. Use `npm run dev` for a hot-reloading preview and `npm run build` before running Flask tests so hashed assets are up to date.
- Each plugin UI is represented by a page component in [`frontend/src/pages/`](frontend/src/pages/). Export a default component and register it in [`frontend/src/App.tsx`](frontend/src/App.tsx) with a route key matching the blueprint name.
- Flask routes render the React bundle through `_render_react_page` in [`app/__init__.py`](app/__init__.py). Pass initial props from the route handler when server-side context is required.
- Shared styling tokens continue to live in [`app/ui/static/css/core.css`](app/ui/static/css/core.css); React components import supporting styles from [`frontend/src/styles/`](frontend/src/styles/).
- Keep binary assets (screenshots, datasets, etc.) outside version control. Generate previews in the sandbox when preparing reports or PRs.
