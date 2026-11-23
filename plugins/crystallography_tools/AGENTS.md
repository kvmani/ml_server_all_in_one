# Crystallographic Tools Plugin – Agent Guidelines

This document is intended for autonomous coding agents (e.g., OpenAI Codex) tasked with implementing and maintaining the **Crystallographic Tools** plugin for the ML Server AIO.  It supplements the repository‑level `AGENTS.md` and provides specific instructions, conventions and constraints for this plugin.  Read it carefully before writing any code.

** Before implmenting any code changes, read and undrstand the 'specifications' laid out in the file ./specifications.md of this plugin ** for implmenting any feature. Follow these specifications in spirit.

## General principles

1. **Follow the core architecture.**  The ML Server AIO uses a unified backend (Flask) and a single React front‑end【101954032698654†L17-L33】.  Each plugin lives under `plugins/<name>/` with `api/`, `core/`, and `tests/` subpackages and must expose a Flask blueprint.  UI code must be written in React and lives in the shared SPA.  Do not add Jinja templates or render HTML from the backend.
2. **Keep logic pure and testable.**  Put all crystallographic calculations, CIF parsing, pattern simulations and orientation logic in the `core/` package.  These functions should be deterministic and side‑effect free.  The `api/` layer should perform input validation (via `common.validate`), call core functions, handle exceptions and format responses using `common.responses.ok` or `fail`.  Avoid duplicating logic between layers.
3. **Stay offline and respect privacy.**  The server operates in an air‑gapped environment【101954032698654†L26-L33】.  All dependencies must be vendored; no CDN or remote API calls are allowed at runtime.  Do not fetch resources from the internet, contact external servers or embed third‑party analytics.  Use temporary in‑memory storage only.  Purge any uploaded data or generated files before returning the response.
4. **Use established libraries instead of reinventing.**  Leverage `pymatgen`, `kikuchipy`, `hyperspy`, `orix` and `diffsims` for crystallographic computations, structure handling and diffraction simulations.  Only implement custom algorithms when the library lacks a necessary feature, and even then encapsulate the extension in `core/` with clear tests.
5. **Write comprehensive tests.**  Every new function in `core/` must have unit tests.  Each API endpoint requires route tests covering success, validation errors and edge cases.  When writing UI components, add component tests with React Testing Library and, where appropriate, end‑to‑end tests using Playwright.  Tests must run offline and deterministically.
6. **Validate inputs rigorously.**  Use dataclasses and `common.validate` to define request and response schemas.  Check file sizes and MIME types; enforce limits from `config.yml`.  Provide clear error messages for malformed CIFs, invalid Miller indices or unsupported parameter combinations.  Return HTTP 413 for payloads that exceed the configured size limit【101954032698654†L121-L124】.
7. **Log meaningfully.**  Use `common.logging` to create a per‑request logger with a request ID.  Log key events (e.g., CIF parsed, XRD computed, simulation started) at appropriate levels.  Do not log sensitive data (file contents, user inputs).  Convert exceptions to `common.errors.AppError` with user‑friendly messages.
8. **Respect the repository’s coding conventions.**  Use snake_case for Python functions and camelCase for JavaScript variables.  Follow the formatting and linting rules already defined in the repo.  Pin package versions in `environment.yml` and `package.json`.  Use ES2017 features but no experimental JavaScript APIs.  Keep UI accessible and responsive.

## Do’s

* Do **scaffold** the plugin directory before implementing features.  Start with an empty blueprint and ensure the plugin registers correctly.
* Do **break work into small, reviewable commits**.  Each commit should address one feature or bug.  Include both code and tests.
* Do **document your code** with docstrings and inline comments explaining the reasoning behind non‑obvious computations (e.g., orientation matrices, reciprocal lattice calculations).  Update `specifications.md` and the user documentation when behaviour changes.
* Do **reuse patterns** from existing plugins.  The hydride segmentation and PDF tools plugins demonstrate how to organise endpoints, handle file uploads and return chart data.  Use them as templates when in doubt.
* Do **write asynchronous computations** if a calculation may take longer than a second.  Use Python’s `concurrent.futures` with timeouts.  Communicate progress back to the UI via incremental polling if necessary.  Remember to clean up resources when tasks are cancelled or time out.
* Do **test with real CIFs**.  Use simple structures (like body‑centred cubic Fe or hexagonal α‑Zr) to verify correctness.  Compare results against known references or the `pycrystallography` implementation【382860410506281†L74-L78】.
* Do **design for extension**.  Use base classes or registries for diffraction calculators and EBSD simulators so that additional methods can be plugged in later (e.g., dynamical scattering, composite patterns).  Keep UI components modular and independent.

## Don’ts

* Don’t **render HTML** in Flask endpoints.  Endpoints must return JSON or file downloads with proper headers.  The React SPA is solely responsible for rendering.
* Don’t **write user files to disk**.  Use `io.BytesIO` for file uploads and keep temporary artefacts in the OS RAM tmpfs.  Do not persist user data between requests.
* Don’t **hard‑code parameters** like 2θ ranges, voltage or detector geometry.  Expose reasonable defaults via configuration but allow users to override them via request bodies.  Future users may need different instrument settings.
* Don’t **assume cubic symmetry**.  Implement calculations in a general way that works for any Bravais lattice.  Use lattice metrics from `pymatgen` rather than assuming orthogonality.
* Don’t **pollute global state**.  Each request must be independent.  Avoid using module‑level variables to cache data unless they are read‑only constants.  For caches, use an LRU cache keyed by request parameters.
* Don’t **introduce new external dependencies** without approval.  Any new Python or JavaScript package must be vendored and pinned.  Prefer built‑in modules or existing dependencies.
* Don’t **ignore performance**.  A long‑running simulation can block the server; use concurrency and timeouts.  Precompute and cache expensive quantities like structure factors when possible.
* Don’t **expose internal errors**.  Never return a full stack trace or internal exception message to the client.  Map exceptions to user‑friendly error messages via `common.errors`.

## Additional notes

* The EBSD simulation requires complete atomic positions and appropriate reciprocal lattice vectors【538124073874103†L99-L109】.  Ensure the structure is sanitised using `orix.Phase.from_cif()` and that kinematical structure factors are calculated【538124073874103†L95-L119】.  Validate that the lattice parameters are provided in ångströms.
* HyperSpy’s `plot()` function provides versatile interactive plots for multi‑dimensional data【359264770467793†L90-L96】; however, you should build a custom React component that consumes arrays returned from the backend rather than embedding Jupyter widgets.  For EBSD pattern visualisation you may draw on HyperSpy’s use of matplotlib markers and event handling【246123195106145†L68-L97】 but implement it in JavaScript.
* Pymatgen’s `quick_view()` is suitable for Jupyter notebooks, but for a web application you should either use VTK.js or send precomputed coordinates to a `react-three-fiber` component.  Document these choices in the code and allow switching the renderer in the future.

### Hexagonal 4-index notation (Miller–Bravais) – required UX

- For **hexagonal** structures, agents must implement 4-index notation in the **front-end**:

  - Planes: (h k i l) with `i = -(h + k)`  
    - Only `h`, `k`, and `l` are user-editable.  
    - `i` is computed in the browser as `-(h + k)` and rendered as a disabled / greyed-out field.

  - Directions: (u v t w) with `t = -(u + v)`  
    - Only `u`, `v`, and `w` are user-editable.  
    - `t` is computed as `-(u + v)` and rendered as a disabled / greyed-out field.

- **Do not** let users type into `i` or `t`. These components are redundant by definition and must always be derived, not stored as independent inputs.

- The backend should expose a clear flag for the crystal system (e.g. `crystal_system: "hexagonal"` or `is_hexagonal: true`) so the front-end can automatically switch between 3-index and 4-index widgets.

- Implement all conversions between 3-index and 4-index notation in a single helper module in `core/calculations.py` and cover it with unit tests.  
  Agents must **not** copy-paste conversion snippets into multiple files.


By adhering to this guidance and the comprehensive specification, agents will produce code that is maintainable, testable and fit for the ML Server AIO environment.