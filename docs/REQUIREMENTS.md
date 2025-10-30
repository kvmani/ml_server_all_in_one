# Testing and automation requirements

This project ships both Python unit tests and browser-level Playwright coverage. Keep the following expectations in mind when updating tooling or CI settings.

## Runtime prerequisites

- **Python**: 3.11 or newer – aligns with the `environment.yml` pinning and the Flask back-end runtime.
- **Node.js**: 20.x LTS – required for the React/Vite frontend, Playwright test runner, and the GitHub Actions workflow cache key.
- **Browsers**: Playwright installs Chromium, Firefox, and WebKit locally. Use `npx playwright install --with-deps` once per workstation or CI runner.

## Local testing workflow

1. Install Python dependencies and run the service tests:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   pytest -q
   ```
2. Install Node dependencies and execute the Playwright suite:
   ```bash
   cd frontend
   npm install
   npx playwright install --with-deps  # first run only
   npm run test:e2e
   cd ..
   ```
   The Playwright command starts a Vite dev server automatically, walks through every plugin workflow, and saves rich artifacts under `frontend/playwright-report/` and `frontend/test-results/`.

## Continuous integration guarantees

- **Playwright E2E workflow** – triggered on every push and pull request. The job runs from the `frontend/` directory, restores the npm cache, installs Playwright browsers, launches `npm run test:e2e`, and uploads two artifacts:
  - `playwright-report` (HTML + trace viewers)
  - `playwright-test-results` (raw attachments such as JSON summaries)
- Treat failing runs as blockers; each spec exercises the critical “happy-path” workflow for home discovery plus the four plugins (PDF tools, unit converter, hydride segmentation, tabular ML).

## Updating dependencies safely

- Update `frontend/package.json` and `package-lock.json` together so the workflow cache stays coherent.
- After bumping Playwright, regenerate snapshots by re-running `npm run test:e2e` and checking in updated artifacts (reports remain build output and should not be committed).
- Keep this document in sync with new tooling to avoid silent CI regressions.
