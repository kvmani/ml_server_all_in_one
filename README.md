# ML Server All-In-One

An offline-first Flask platform bundling microstructure analysis, PDF workflows, tabular machine learning, and laboratory utilities behind a shared UI shell. Every tool runs completely in-memory; no uploads ever leave the workstation.

## Feature tour

| Tool | Highlights |
| --- | --- |
| **Hydride Segmentation** | Drag-and-drop zirconium alloy micrographs, configure CLAHE/adaptive threshold/morphology parameters, inspect overlays and metrics, and export PNG artefacts. |
| **PDF Tools** | Queue up to 10 PDFs, reorder with drag handles, apply per-file page ranges, merge instantly, or split a single PDF into per-page downloads. |
| **Tabular ML** | Upload CSV datasets (≤2 MB), auto-detect regression vs. classification, view accuracy/R² metrics, and inspect feature importance rankings. |
| **Unit Converter** | Convert between laboratory units (length, mass, temperature, energy, etc.) with keyboard-friendly controls and four-decimal precision. |

Browse in-app help for each workspace via the header **Help** link or jump directly:

- `/help/overview` – platform overview and quick links
- `/help/hydride_segmentation`
- `/help/pdf_tools`
- `/help/tabular_ml`
- `/help/unit_converter`

Detailed developer docs live under [`docs/`](docs/) with step-by-step guides and architecture notes.

## Getting started

1. **Create an isolated environment**

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Review configuration** (optional)

   - Open [`config.yml`](config.yml) to adjust:
     - `site.name`, `site.description`, and `site.default_theme`
     - Theme palette definitions exposed through the UI toggle
     - Global upload ceiling (`site.max_content_length_mb`)
     - Per-plugin limits (e.g., `plugins.pdf_tools.merge_upload.max_mb`)
     - Documentation links (`plugins.<tool>.docs`)

4. **Run the development server**

   ```bash
    export FLASK_APP=app:create_app
    python scripts/run_dev.py
   ```

   Visit `http://localhost:5000/?theme=<theme-key>` to preview the UI. Use the header toggle to switch between light and dark palettes—URLs update with the active theme for easy sharing.

5. **Execute tests**

   ```bash
   pytest -q
   ```

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

## Development notes

- Reuse `setupDropzone`, `bindForm`, and `downloadBlob` from `app/ui/static/js/core.js` for consistent behaviours across tools.
- New UI components should consume CSS variables defined in `core.css`; extend with additional custom properties when introducing new themes.
- Keep binary assets (screenshots, datasets, etc.) outside version control. Generate previews in the sandbox when preparing reports or PRs.
