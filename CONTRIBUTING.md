# Contributing

## Backend workflow

1. **Environment**
   - Create a virtualenv (`python -m venv .venv && source .venv/bin/activate`).
   - Install dependencies with `pip install -r requirements.txt`.

2. **Formatting & linting**
   - Run `black .` to enforce code style (line length 88).
   - Run `ruff check .` to lint Python files.

3. **Testing**
   - Execute `pytest` before submitting changes.
   - React bundles should be rebuilt with `npm run build --prefix frontend` when UI props change.

4. **API discipline**
   - All JSON endpoints must respond with `{ "success": true|false, ... }` via `common.responses.ok/fail`.
   - Validate inputs using `common.validation.SchemaModel` or helper utilities; never trust raw request data.
   - Use `common.errors.ValidationAppError` for user-facing validation issues.

5. **Docs & schemas**
   - Update [`docs/api/openapi.yaml`](docs/api/openapi.yaml) when adding or modifying endpoints.
   - Log breaking changes in [`MIGRATION_NOTES.md`](MIGRATION_NOTES.md).

## Pull requests

- Include screenshots or API examples when relevant.
- Reference related issues and describe testing performed.
- CI will run Black, Ruff, and pytest; ensure they pass locally first.
