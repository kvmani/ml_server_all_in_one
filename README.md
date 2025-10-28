# ML Server All-In-One

Offline-first monorepo delivering a suite of ML utilities with a unified Flask
shell. Tools are implemented as plugins that share common UI and validation
primitives.

## Plugins

- **Hydride Segmentation** – performs conventional microscopy segmentation and
  orientation analysis with downloadable visualisations.
- **PDF Tools** – merge PDFs and split them into per-page downloads entirely in
  memory.
- **Unit Converter** – instant scientific unit conversions with validation.
- **Tabular ML** – train lightweight models on CSV datasets and surface metrics
  and feature importances.

## Development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export FLASK_APP=app:create_app
flask --app app:create_app run
```

For tests:

```bash
pytest -q
```
