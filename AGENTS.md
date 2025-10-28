# AGENTS.md — Engineering Playbook for **ML Server All‑In‑One (AIO)**

> **MANDATE FOR AGENTS**: Build an **air‑gapped, privacy‑first**, single‑repo web platform that serves ML utilities (Hydride Segmentation, PDF Tools, Unit Converter, Tabular ML, etc.) with **uniform backend + frontend** in one codebase. **No external calls**, **in‑memory processing**, **cross‑browser (Chrome/Firefox/Edge)**, **standards‑only HTML/CSS/JS**. Prefer **Flask** + vanilla JS; keep code **simple, deterministic, and testable**.

---

## 0) North Star

- **One repo, many tools**: Each tool is a self‑contained Python package under `plugins/` with
  - `api/` (Flask blueprint endpoints)
  - `core/` (pure, unit‑tested logic; no Flask, no disk writes)
  - `ui/` (templates, static assets, minimal vanilla JS)
- **Uniform UX**: Common shell (navigation, header/footer, status toasts), consistent CSS tokens, input validation, predictable errors.
- **Privacy & Security**: No analytics/cookies/localStorage; **no user data persisted to disk**. Use **tmpfs (RAM)** for temporary artifacts and purge before response completes.
- **Offline‑first**: All assets self‑hosted. Optional React/Plotting libs must be **vendored** under `third_party/` and used sparingly.
- **Deterministic infra**: Pin Python and tool versions in `environment.yml` + `requirements.txt` mirrored offline.
- **Cross‑browser compatibility**: Standards‑only; avoid experimental APIs. Provide long‑poll fallback for WS/SSE.

---

## 1) Monorepo Layout (Authoritative)

```
ml_server_aio/
├─ app/                              # Flask app shell
│  ├─ __init__.py                    # create_app(), global config, plugin discovery
│  ├─ config.py                      # Privacy, limits, tmpfs, CORS=off, CSP strict
│  ├─ security.py                    # input sanitization, MIME checking helpers
│  ├─ ui/                            # shared templates and assets
│  │  ├─ templates/
│  │  │  ├─ base.html                # site shell, no external CDNs
│  │  │  ├─ home.html
│  │  │  └─ errors/{400,413,500}.html
│  │  └─ static/
│  │     ├─ css/core.css
│  │     ├─ js/core.js               # toasts, form helpers, long-poll helper
│  │     └─ vendor/                  # vendored minimal libs (no CDN)
│  └─ blueprints.py                  # register all plugin blueprints
├─ plugins/                          # Each plugin is a Python package
│  ├─ hydride_segmentation/
│  │  ├─ api/                        # Flask blueprint (routes only)
│  │  ├─ core/                       # pure logic; loads models in RAM
│  │  ├─ ui/                         # templates/static specific to plugin
│  │  ├─ tests/
│  │  └─ __init__.py
│  ├─ pdf_tools/
│  ├─ unit_converter/
│  └─ tabular_ml/
├─ common/                           # Shared utilities (NO plugin knowledge)
│  ├─ io_mem.py                      # in-memory file pipes, tmpfs helpers
│  ├─ validate.py                    # schema & input validation
│  ├─ tasks.py                       # short-lived in-RAM task runner
│  └─ imaging.py                     # common image utils (PIL/NumPy)
├─ third_party/                      # vendored OSS, pinned and offline
├─ tests/                            # integration tests across plugins
├─ scripts/
│  ├─ run_dev.py                     # FLASK_ENV=development launcher
│  ├─ run_gunicorn.sh                # production launcher (intranet only)
│  └─ migrate_from_multi_repo.md     # notes for subtree/filter-repo import
├─ requirements.txt
├─ environment.yml
├─ README.md
└─ AGENTS.md
```

**Golden rule**: **`core/` is importable and testable without Flask**. All side‑effects (HTTP, file streams) happen in `api/` wrappers that compose `core/`.

---

## 2) Architectural Conventions

1. **Framework**: Flask (WSGI) with Blueprints per plugin. Use simple `werkzeug` for streams.
2. **Endpoints**: Stateless POST/GET returning JSON + downloadable responses with `Content-Disposition: attachment`.
3. **No persistence**: User uploads handled as `BytesIO`; transient artifacts placed in **tmpfs** (Linux: `/dev/shm/ml_server_aio/<uuid>`). A teardown hook **always** deletes the dir.
4. **Limits**: Enforce maximum upload size (`MAX_CONTENT_LENGTH`), per‑endpoint size caps, and timeouts. Return **413** if exceeded.
5. **Models**: Load once per worker with **warm‑start** endpoint `GET /api/v1/<tool>/warmup` to amortize load time.
6. **Concurrency**: Prefer simple, synchronous flows; use short‑lived threads/process pools only if needed; always bound by time/memory.
7. **Schemas**: Define pydantic‑ish schema (dataclasses + `common.validate`) for each request/response.
8. **MIME Discipline**: Strict MIME & extension checks. Disable MIME sniffing headers (`X-Content-Type-Options: nosniff`).

---

## 3) Privacy & Security Guardrails (Non‑Negotiable)

- **No logging of user inputs/outputs**. Only ephemeral, on‑screen run summaries (never saved).
- **No analytics, cookies, localStorage, IndexedDB, service workers, background sync**.
- **CSP**: default‑src 'self'; img-src 'self' blob:; object-src 'none'; frame‑ancestors 'none'.
- **Uploads**: Reject archives with nested paths (`..`), enforce filename sanitization, use random safe names in tmpfs.
- **Downloads**: Always `Content-Disposition: attachment; filename="<safe>"`.
- **Secrets**: No hard‑coded secrets; intranet only; CORS disabled.
- **Accessibility & Keyboard navigation**: required (labels, aria-*).

---

## 4) Plugin Contract (Agent must follow)

**Folder**: `plugins/<tool_name>/`

**Required files**:
- `api/__init__.py` -> `bp = Blueprint("tool_name", __name__, url_prefix="/tool_name")` with routes:
  - UI pages: `GET /tool_name/` (index), others as needed
  - API: `POST /api/v1/tool_name/<op>` (pure wrappers around `core/`)
- `core/` -> pure functions/classes with docstrings + unit tests; **no Flask**, **no disk I/O**.
- `ui/` -> `templates/tool_name/*.html`, `static/tool_name/{css,js}` (namespaced).
- `tests/` -> pytest unit tests for `core` and route tests for `api` (using Flask test client).

**Route shape** (example):
```
POST /api/v1/pdf_tools/merge
Request: multipart/form-data files=[pdf1, pdf2, ...]  (max N, max size M)
Response: application/pdf (download), headers set, no persistence
Errors: 400 (validation), 413 (too large), 500 (internal sanitized)
```

---

## 5) Coding Standards

- **Python**: 3.11+, type hints (mypy‑clean), `ruff` style, small functions, docstrings with Examples.
- **JS**: ES2017 baseline, vanilla modules, no transpilation; keep files <300 LOC where possible.
- **HTML/CSS**: semantic HTML5, CSS Grid/Flexbox; use shared tokens in `/app/ui/static/css/core.css`.
- **UX**: explicit labels/placeholders; progress spinners; clear error banners.
- **Testing**: `pytest -q`; aim for 80%+ in `core/`; smoke tests for `api/` endpoints and UI templates render.
- **Performance budgets**: Document per‑tool RAM/CPU estimates; reject oversized inputs early.

---

## 6) Migration Plan (from multi‑repo to monorepo)
all the functionality should be preserved.
cross browser compatability  must be ensured.
---

## 7) Acceptance Checklist (Agents must self‑verify)

- [ ] Builds offline: `conda env create -f environment.yml` (no network beyond internal mirrors)
- [ ] `pytest` all green; coverage report >= 80% for `core/`
- [ ] `flask run` serves home + each plugin index
- [ ] All endpoints enforce size/time limits; return correct HTTP codes
- [ ] No network calls; CSP + headers audited
- [ ] Visual smoke: Each tool UI renders, uploads a sample, shows result, and downloads artifact (simulated in tests)
- [ ] **Compatibility checklist** (below) passes

**Compatibility checklist**
- [ ] Works on Chrome, Firefox, Edge (same UX + behavior)
- [ ] No non‑standard APIs
- [ ] No third‑party/CDN assets
- [ ] Fallbacks for WS/SSE (long‑poll util provided)
- [ ] Keyboard‑navigable, accessible labels/aria
- [ ] PC‑first layout (≥1280px), graceful downscale; mobile not required

---

## 8) Commit, Branch & PR Rules

- **Branches**: `main` (stable), `dev` (integration), `feature/<tool>-<feat>`
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`...). Message must state privacy impact (if any).
- **PR Template** must include:
  - Checklist from §7
  - Screenshots/GIFs of UI (from sandbox) OR deterministic text artifact summary
  - Test plan + perf notes
  - API changes (request/response schema diffs)

---

## 9) Run Modes

- **Development**: `python scripts/run_dev.py` (auto‑reload off for safety), debug toolbar disabled.
- **Production (intranet)**: `scripts/run_gunicorn.sh` spawning N workers (CPU‑bound estimate), tmpfs configured, limits enforced.

---

## 10) Risk Register (agents must watch & mitigate)

- **OOM** on large PDFs/images → hard caps + graceful 413
- **Model warm‑load latency** → warmup endpoint, lazy load on first call
- **Cross‑plugin CSS/JS leakage** → strict namespacing & BEM‑style classes
- **Silent privacy regressions** → static scanner to flag forbidden APIs (fetch to external, localStorage usage, etc.)
- **Inconsistent schemas** → shared validators in `common/validate.py`

---

## 11) Example Blueprint Skeleton (to imitate)

```python
# plugins/pdf_tools/api/__init__.py
from flask import Blueprint, request, send_file, abort
from io import BytesIO
from ..core.merge import merge_pdfs
from ...common.io_mem import new_tmpfs_dir, secure_filename
from ...common.validate import ensure_pdfs

bp = Blueprint("pdf_tools", __name__, url_prefix="/pdf_tools")

@bp.post("/api/v1/merge")
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
    finally:
        tmpdir.cleanup()  # always purge
```

---

**You are done when** the site runs offline, passes the acceptance checklist, and each plugin delivers feature parity with the old multi‑repo setup, but with uniform UX and airtight privacy.
**IMPORTANT** No committing of binary files at all. 
Create representative and relavent screenshots of UX for preview along ith diff and logs so that we can judge the success of the task.
