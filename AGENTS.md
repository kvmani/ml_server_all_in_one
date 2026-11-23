# AGENTS.md — ML Server All‑In‑One (AIO) — **legacy repository**

> **Status: legacy, superseded.** This monorepo was the first all-in-one platform. Its tools now live
> in dedicated repositories that are developed and released independently: the portal
> `kvmani/ml_server`, `kvmani/pdf_tools`, `kvmani/tabular_ml`, `kvmani/scientific_calculator`,
> `kvmani/unit_converter`, `kvmani/pytex` (crystallography), `Pushpalathadevi/HydrideSegmentation`,
> and the suite installer `kvmani/ml_server_deploy`. Do **not** add new features here; build them in
> the owning repository. Make changes here only when the owner asks (for example to keep a
> reference implementation runnable), and keep them minimal.
>
> This file is the operating contract for every coding agent (Codex, Claude, Gemini, …) and human
> contributor. The cardinal rules below come first; the original engineering playbook that
> follows remains the reference for this codebase's architecture and conventions, and the plugin
> files `plugins/*/AGENTS.md` add plugin-specific rules.

## Cardinal rules (owner-mandated, every repository)

1. **Fetch before you change anything.** Start every task with
   `git fetch origin && git pull --rebase --autostash origin main`. Several people and agents push
   to this repository; never build on a stale checkout.
2. **Work on `main` only.** Commit and push directly to `main` unless the owner names another
   branch for the task. No feature branches or pull requests by default. Fetch again before
   pushing; if the push is rejected, `git pull --rebase origin main`, rerun the affected tests,
   then push. Never force-push or rewrite published history.
3. **Keep the progress ledger current:** [`docs/PROGRESS.md`](docs/PROGRESS.md). Before coding, add (or claim)
   the task entry: goal, plan, who is working on it, date. After each meaningful step record what
   was done, the commit, test evidence, decisions, blockers and the next step. Commit the ledger
   with the work it describes. A new session must be able to resume from the ledger and git
   history alone, without the chat that started the work.
4. **Targeted tests for ordinary changes.** Run only the tests that cover what you touched (see
   [Tests](#tests-targeted-by-default)). Run the full suite only when preparing a release or when the owner asks.
5. **CI runs only on request.** GitHub Actions workflows start by `workflow_dispatch` only;
   tag-triggered release workflows are the single exception. Never add push, pull-request or
   schedule triggers, and never start a workflow unless the owner asks.
6. **Be honest.** Never report a check as passed unless you ran it and saw it pass; record skipped
   checks and the reason. Never weaken, skip or delete a test to make it pass.
7. **Keep git clean.** Commit sources and canonical assets only: no secrets, real personal data,
   virtual environments, caches, logs or build output.

The cardinal rules decide *how work is done* (sync, branch, ledger, test scope, CI). The project
rules in this file decide *what this repository must achieve and protect*; nothing generic here
relaxes them. If a project rule and a cardinal rule genuinely conflict, stop and ask the owner.

## Tests (targeted by default)

```bash
pytest -q plugins/<tool>/tests            # backend change in one plugin
pytest -q tests                           # shared app/common code
(cd frontend && npm test)                 # frontend change
pytest -q                                 # full suite: release or on request
```

---

# Original engineering playbook

> **MANDATE FOR AGENTS**  
> Build an **air‑gapped, privacy‑first**, single‑repo web platform that serves ML utilities (Hydride Segmentation, PDF Tools, Unit Converter, Tabular ML, etc.) with a **uniform backend + frontend** in one codebase. **No external calls**, **in‑memory processing**, **cross‑browser (Chrome/Firefox/Edge)**.  
> **Frontend** has evolved to a **React + Vite** SPA **served by Flask** (hybrid). This **supersedes prior “vanilla‑JS only” guidance**, while keeping the original **offline, vendor‑everything** discipline. Prefer **React** for rich UX (charts, spinners, settings), and keep backend logic **simple, deterministic, and testable**.

---

## 0) North Star

- **One repo, many tools**: Each tool is a self‑contained Python package under `plugins/` with
  - `api/` (Flask blueprint endpoints; JSON in/out; no UI rendering)
  - `core/` (pure, unit‑tested logic; no Flask, no disk writes; model loads in RAM)
  - `tests/` (unit + route tests)
  - **UI now lives in React** (shared SPA), not per‑plugin Jinja templates.
- **Uniform UX**: Common React shell (navigation, header/footer, status toasts), consistent tokens, input validation, predictable errors.
- **Privacy & Security**: No analytics/cookies/localStorage for data; **no user artifacts persisted to disk**. Use **tmpfs (RAM)** for transient artifacts and purge before response completes.
- **Offline‑first**: All assets self‑hosted. Any libs (charts, UI kits) are **bundled** by Vite; no CDNs.
- **Deterministic infra**: Pin Python/Node deps in `environment.yml`, `requirements.txt`, `package.json` (lockfiles) mirrored offline.
- **Cross‑browser compatibility**: Standards‑only; avoid experimental APIs. Long‑poll fallback for WS/SSE if used.

---

## 1) Monorepo Layout (Authoritative)

```
ml_server_aio/
├─ app/                              # Flask app shell
│  ├─ __init__.py                    # create_app(), config, plugin discovery
│  ├─ config.py                      # Privacy, limits, tmpfs, CORS=off, CSP strict
│  ├─ security.py                    # input sanitization, MIME checking helpers
│  ├─ ui/                            # Flask shell only (serves SPA + error pages)
│  │  ├─ templates/
│  │  │  ├─ react_app.html           # single HTML shell bootstrapping React SPA
│  │  │  └─ errors/{400,413,500}.html
│  │  └─ static/
│  │     ├─ react/                   # Vite build output (hashed JS/CSS/assets)
│  │     └─ css/core.css             # minimal base styles (if any legacy UI)
│  └─ blueprints.py                  # register all plugin blueprints
├─ plugins/                          # Each plugin is a Python package
│  ├─ hydride_segmentation/
│  │  ├─ api/                        # Flask blueprint (routes only; JSON/file out)
│  │  ├─ core/                       # pure logic; loads models in RAM
│  │  ├─ tests/
│  │  └─ __init__.py
│  ├─ pdf_tools/
│  ├─ unit_converter/
│  └─ tabular_ml/
├─ common/                           # Shared utilities (NO plugin knowledge)
│  ├─ io.py                          # in-memory file pipes, tmpfs helpers
│  ├─ validate.py                    # schema & input validation
│  ├─ errors.py                      # AppError + JSON error encoder
│  ├─ responses.py                   # ok(data), fail(error)
│  └─ logging.py                     # logger factory w/ request IDs
├─ frontend/                         # React + Vite SPA (all tool UIs)
│  ├─ src/{components,features,routes,lib}
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.ts
├─ third_party/                      # vendored OSS, pinned and offline (if needed)
├─ tests/                            # integration/e2e tests across plugins
├─ scripts/
│  ├─ run_dev.py                     # Flask dev launcher
│  ├─ run_gunicorn.sh                # production launcher (intranet only)
│  └─ migrate_from_multi_repo.md     # notes for subtree/filter-repo import
├─ requirements.txt
├─ environment.yml
├─ package-lock.json / pnpm-lock.yaml / yarn.lock
├─ README.md
└─ AGENTS.md
```
**Golden rule**: **`core/` is importable and testable without Flask**. All side‑effects (HTTP, file streams) happen in `api/` wrappers that compose `core/`. The React SPA is the **only** place where UI is rendered.

---

## 2) Architecture at a Glance (React‑First Hybrid)

- **Backend**: Flask app with **plugins** (Blueprints) under `/api/<plugin>/…`. All common logic (IO, validation, errors, logging, responses) lives in `common/`.
- **Frontend**: **React + Vite** integrated and served by Flask. A single HTML shell loads the React SPA; all tool UIs are React components.
- **Data Flow**: React calls JSON APIs; Flask never renders tool UIs. Any images/files are returned as downloads or links; data for charts is JSON.
- **Offline**: No external calls/CDNs at runtime; all assets bundled.

---

## 3) Architectural Conventions

1. **Framework**: Flask (WSGI) with Blueprints per plugin.
2. **Endpoints**: Stateless GET/POST returning JSON or downloads with `Content-Disposition: attachment`.
3. **No persistence**: User uploads handled as `BytesIO`; artifacts in **tmpfs** (Linux: `/dev/shm/ml_server_aio/<uuid>`). A teardown hook **always** deletes the dir.
4. **Limits**: Enforce upload caps (`MAX_CONTENT_LENGTH`), per‑endpoint size/timeouts. Return **413** for size violations.
5. **Models**: Load once per worker; optional warm‑start `GET /api/v1/<tool>/warmup` to amortize latency.
6. **Concurrency**: Prefer simple sync flows; if needed, short‑lived thread/process pools with bounded time/memory.
7. **Schemas**: Dataclasses/pydantic‑ish validation via `common.validate` for each request/response.
8. **MIME Discipline**: Strict MIME & extension checks; `X-Content-Type-Options: nosniff`.
9. **Response Schema** (unified):
   - Success → `{ "success": true, "data": ... }`
   - Error → `{ "success": false, "error": { "code": "<id>", "message": "...", "details": {…} } }`

---

## 4) Privacy & Security Guardrails (Non‑Negotiable)

- **No logging of user inputs/outputs**. Only ephemeral, on‑screen run summaries (never saved).
- **No analytics; no external telemetry; no CDN assets**.
- **CSP**: `default-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'`.
- **Uploads**: Reject archives with nested paths (`..`); sanitize names; use random safe names in tmpfs.
- **Downloads**: Always `Content-Disposition: attachment; filename="<safe>"`.
- **Secrets**: No hard‑coded secrets; intranet only; CORS disabled.
- **Accessibility**: Keyboard navigation, labels, ARIA roles; high contrast.

---

## 5) Plugin Contract (Agents must follow)

**Folder**: `plugins/<tool_name>/`

**Required files**:
- `api/__init__.py` → `bp = Blueprint("tool_name", __name__, url_prefix="/api/<tool_name>")` with routes like:
  - `POST /api/<tool_name>/<op>` (pure wrappers around `core/`)
  - `GET  /api/<tool_name>/warmup` (optional)
- `core/` → pure functions/classes with docstrings + unit tests; **no Flask**, **no disk I/O**.
- `tests/` → pytest unit tests for `core` and route tests for `api` (Flask test client).

**Route shape** (example):
```
POST /api/pdf_tools/merge
Request: multipart/form-data files=[pdf1, pdf2, ...]  (max N, max size M)
Response: application/pdf (download), headers set, no persistence
Errors: 400 (validation), 413 (too large), 500 (internal sanitized)
```

> **Note**: All UI is React; **do not** add Jinja templates for plugins. Provide JSON data suitable for charts/tables in the SPA.

---

## 6) Backend Conventions

- **Blueprint per plugin**: `plugins/<plugin>/api/__init__.py`
- **Routes**: `/api/<plugin>/<action>`; verbs: GET (metadata), POST (processing).
- **Errors**: raise `AppError(code, message, details)` → JSON via `common.errors`.
- **Logging**: `common.logging.get_logger(__name__)` (request IDs, durations).
- **Config**: Global config via `config.yml`; read once, inject into plugins.
- **Files**: `common.io` for tmpfs, safe paths, allowed mime/types, size checks.

---

## 7) Frontend Conventions

- **Structure**: `frontend/src/{components,features,routes,lib}`
- **State**: Local state or lightweight store (e.g., Zustand); avoid over‑engineering.
- **Networking**: `lib/api.ts` wraps `fetch` with error normalization and spinner hooks.
- **UX Components** (shared):
  - `LoadingOverlay` — global spinner overlay during inflight requests.
  - `SettingsModal` — per‑tool advanced settings (persist; apply triggers refresh).
  - `ChartPanel` — interactive charts (Recharts/Chart.js), tooltips/legends.
- **Routing**: React Router; SPA navigation (no full reloads).
- **Styling**: Tailwind or CSS modules; all assets bundled (no remote fonts/CDNs).

---

## 8) UX Standards

- **Feedback**: Always show a spinner/progress on long tasks; disable actions while running.
- **Charts**: Prefer interactive charts over static images; hover tooltips; responsive layout.
- **Settings**: Gear icon opens a modal with relevant controls; sensible defaults; persist choices.
- **Errors**: Prominent banners with actionable messages; consistent schema from backend.

---

## 9) Testing Policy

- **Backend (pytest)**: Validate schemas, error codes, size/time limits, file handling, core logic.
- **Frontend (Vitest/RTL)**: Components render; settings apply; spinners show/hide correctly.
- **E2E (Playwright)**: At least two tools covered end‑to‑end (upload → process → results).
- **Performance checks**: Bundle size guard; long‑task smoke (timeouts under agreed thresholds).
- **Coverage**: Aim 80%+ in `core/`; smoke tests for routes; visual/e2e screenshots stored as text artifacts (no binaries committed).

---

## 10) CI/CD

- **Checks**: Ruff/Black (Python), ESLint/Prettier (JS/TS), mypy/tsc, pytest, Playwright, Vite build.
- **Artifacts**: Vite build outputs to `app/ui/static/react/` with hashed filenames.
- **Dev Flow**: `npm run dev` (Vite) with proxy to Flask `/api/*`; or `scripts` to run both.
- **Releases**: Tag + changelog; publish Docker image/intranet artifact.

---

## 11) Acceptance Checklist (Self‑Verify Before Pushing; the full list before a release)

- [ ] Builds offline: `conda env create -f environment.yml` (only internal mirrors)
- [ ] Targeted `pytest` for the touched plugin green; before a release, full `pytest` green with coverage >= 80% for `core/`
- [ ] `flask run` serves SPA shell and APIs; no Jinja tool pages remain
- [ ] All endpoints enforce size/time limits; return correct HTTP codes
- [ ] No network calls; CSP + headers audited
- [ ] SPA smoke: Each tool UI navigates, uploads a sample, shows results, downloads artifact (e2e)
- [ ] **Compatibility**: Chrome, Firefox, Edge → same UX/behavior
- [ ] No non‑standard APIs / No CDN assets
- [ ] Long‑poll fallback for WS/SSE (if used)
- [ ] Keyboard‑navigable; ARIA labels; accessible color/contrast
- [ ] PC‑first layout (≥1280px), graceful downscale; mobile not required

---

## 12) Commit, Branch & PR Rules

- **Branches**: work directly on `main` (cardinal rule 2 above); no `dev` or feature branches unless the owner asks for one.
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`...). State privacy impact if any.
- **Change record** (in the commit body and `docs/PROGRESS.md`; a pull request only when the owner asks for one) includes:
  - Checklist from §11
  - Screenshots/GIFs of UI (or deterministic text artifact summary)
  - Test plan + performance notes
  - API changes (request/response schema diffs)
  - Docs updated (Y/N)

---

## 13) Run Modes

- **Development**: `python scripts/run_dev.py` (debug toolbar off), `npm run dev` for SPA.
- **Production (intranet)**: `scripts/run_gunicorn.sh` spawning N workers; tmpfs configured; limits enforced.

---

## 14) Risk Register (watch & mitigate)

- **OOM** on large PDFs/images → hard caps + graceful 413
- **Model warm‑load latency** → warmup endpoint, lazy load on first call
- **Cross‑plugin CSS/JS leakage** → React isolation + CSS modules; no global leakage
- **Silent privacy regressions** → static scanner to flag forbidden APIs (external fetch, localStorage usage, etc.)
- **Inconsistent schemas** → shared validators in `common/validate.py`
- **Stale assets** → Vite hashed assets; cache‑busting; rebuild scripts

---

## 15) Migration Plan (from multi‑repo to monorepo)

- Preserve all functionality and parity.
- Ensure cross‑browser compatibility.
- Replace plugin Jinja pages with React routes; expose JSON from backend.
- Document endpoint/contract changes in `MIGRATION_NOTES.md`.

---

## 16) Breaking Changes Policy

- Avoid when possible; if required, document in `MIGRATION_NOTES.md` with:
  - Old vs new endpoints/fields
  - Transition guidance
  - Rationale and timeline

---

## 17) Task Template (for future prompts)

```
Title: <short actionable title>

Context:
- What part of the system and why this change is needed.

Scope:
- Backend changes (routes, schemas, common utilities)
- Frontend changes (components, routes, state)
- Tests and docs

Steps:
1) …
2) …
3) …

Success Criteria:
- Observable, testable outcomes (API schema, UI behavior, tests passing).

Constraints:
- Offline-safe, no CDNs
- Performance/accessibility targets
- Backward compatibility expectations

Artifacts:
- Commits on `main` with test logs, updated docs and (for UI) screenshots kept out of git
```

---

## 18) Example Blueprint Skeleton (to imitate)

```python
# plugins/pdf_tools/api/__init__.py
from flask import Blueprint, request, send_file
from io import BytesIO
from ...common.io import new_tmpfs_dir, secure_filename
from ...common.validate import ensure_pdfs
from ...common.errors import AppError
from ...common.responses import ok, fail
from ..core.merge import merge_pdfs

bp = Blueprint("pdf_tools", __name__, url_prefix="/api/pdf_tools")

@bp.post("/merge")
def merge():
    files = request.files.getlist("files")
    ensure_pdfs(files)  # size, count, mime, filename checks
    tmpdir = new_tmpfs_dir()
    try:
        output: BytesIO = merge_pdfs([f.stream.read() for f in files])  # pure core call
        output.seek(0)
        return send_file(
            output,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="merged.pdf",
            max_age=0,
        )
    except AppError as e:
        return fail(e), 400
    finally:
        tmpdir.cleanup()  # always purge
```

---

## 19) Ownership & Governance

- Each plugin has an owner (CODEOWNERS) for review.
- Core UX components (`LoadingOverlay`, `SettingsModal`, `ChartPanel`) are owned by the frontend team; changes require their approval.
- Public API/schema changes require backend lead sign‑off and `MIGRATION_NOTES.md` entry.

---

**You are done when** the site runs offline, passes the acceptance checklist, and each plugin delivers feature parity with the old multi‑repo setup **with React SPA UI**, uniform APIs, and airtight privacy.  
**IMPORTANT** Never commit binary files. Provide representative **text‑based** screenshots/records (e.g., Playwright traces, logs) to judge success. always generate **Previews** of screenshots of importan workflows, home page etc for inspection at the end of the task in chat message.
