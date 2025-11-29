# Crystallographic Tools Plugin – Specification

## Overview

The **Crystallographic Tools** plugin will extend the `ml_server_all_in_one` intranet server with a rich, responsive web application for crystallographic analysis.  Its goal is to provide materials scientists and engineers with interactive tools for editing crystal structures, computing diffraction patterns, exploring orientations and performing basic crystallographic calculations, all without leaving the secure intranet.  The design must follow the monorepo conventions for plugins described in the repository’s engineering playbook (AGENTS.md).  This means isolating pure logic in a `core/` package, exposing JSON‑only Flask endpoints via an `api/` blueprint, writing a React front‑end served by Vite, and shipping tests for both backend and UI【101954032698654†L17-L33】.  No external network calls or persistent storage are permitted; all heavy calculations should occur in memory, and any transient files must be stored in RAM and purged before the response completes【101954032698654†L26-L33】.  The plugin should draw inspiration from the `pycrystallography` web app on the `advanced` branch, which combines a CIF editor, high‑fidelity 3‑D unit‑cell visualisation and instant XRD/TEM diffraction plots while delegating expensive crystallographic workloads to the backend【382860410506281†L74-L78】.  Similarly, the plugin will leverage established libraries such as **pymatgen** for structure handling, **kikuchipy** and **hyperspy** for diffraction and EBSD simulations, and **orix/diffsims** for orientation and diffraction mathematics.  Where these libraries provide sufficient functionality the plugin must reuse them rather than re‑implement algorithms.

## Feature requirements

The user interface will be organised into a **tabbed layout** with six core sections.  Each tab corresponds to an independent set of API endpoints and React components; the heavy computation occurs in the backend while the frontend manages interactivity and visualisation.

### 1. Structure loader and 3‑D unit cell view

* **CIF upload & editing:** users can upload a CIF file, or start from a blank lattice.  The backend parses the CIF using `pymatgen`’s `Structure.from_file` or `CifParser`.  The parsed lattice parameters, space group and atomic sites are returned to the UI as JSON; the UI displays editable forms for lattice constants, angles and site positions.  Users may modify these values and submit them to a `/edit_cif` endpoint to obtain an updated structure.  Validation must ensure physical plausibility (e.g. positive lattice lengths).  Modified structures can be downloaded as CIF.
* **High‑fidelity 3‑D cell viewer:** the UI provides an interactive 3‑D visualisation of the unit cell.  The viewer should support orbit controls (pan/zoom/rotate), bond toggling, supercell replication and colour schemes.  `pymatgen.vis` offers VTK‑based viewers and a `quick_view()` helper that renders structures using the chemview package【795398579060872†L159-L186】.  In the browser the plugin can either use a pre‑rendered image returned from the backend or a WebGL/VTK.js component that consumes JSON coordinates.  Default settings like atom radii, bond thickness and background colour should be configurable via a YAML file similar to `diffraction_web_ui.yaml` in `pycrystallography`【382860410506281†L94-L113】.
* **Supercell & orientation:** allow the user to replicate the structure (e.g. 2×2×2) and apply fractional translations.  Provide sliders or inputs to adjust replication factors.  Provide an option to show/hide the unit cell box.

### 2. Powder X‑ray diffraction (XRD) calculation

* Use `pymatgen.analysis.diffraction.xrd.XRDCalculator` to compute powder diffraction patterns.  Inputs include the radiation type (e.g. Cu Kα), wavelength, 2θ range and step size.  The backend returns a list of peaks with their 2θ values, d‑spacings, intensities and Miller indices.
* The UI displays the pattern as an interactive bar/line chart (e.g. using Plotly).  Hovering a peak reveals its Miller indices and d‑spacing.  Users can adjust the 2θ window with sliders and regenerate the pattern.  Provide an option to download the peak list as CSV.

### 3. Transmission electron diffraction (SAED/TEM) calculation

* **SAED pattern simulation:** build on the `diffsims` and `orix` libraries used by `kikuchipy`.  Given a structure, an accelerating voltage and camera length, compute the reciprocal lattice points and their structure factors.  Use kinematical or dynamical scattering approximations depending on library capabilities.  The backend returns a list of diffraction spots with coordinates, intensities, Miller indices, d‑spacings and reciprocal lengths.
* **Interactive display:** the UI plots the spots on a 2‑D canvas.  A rotation control allows the user to rotate the pattern in‑plane (0–360°) without re‑computing intensities.  Hovering over a spot shows its Miller indices, d‑spacing and reciprocal length.  A table beneath the plot lists all reflections, sorted by intensity, including structure factors.
* **Dynamic cursor readout:** as the cursor moves over the plot, the UI should display the current d‑spacing and g‑vector magnitude computed from the pixel position and instrument calibration.  This requires the backend to return calibration constants (camera length, pixel size) along with the pattern.

### 4. Crystallographic calculations tab

* **Angle between vectors:** given two vectors specified by Miller indices (hkl) or by Cartesian coordinates, compute the angle between them using the lattice metric tensor from the loaded structure.  When only one structure is loaded, both vectors belong to the same lattice; when two structures are loaded, each vector can come from a different lattice to compute orientation relationships.
* **Angle between plane and vector:** compute the angle between a plane (hkl) and a direction [uvw] within a lattice.  Use `pymatgen.core.Lattice.d_hkl()` and reciprocal lattice vectors to derive normals and dot products.
* **Symmetry equivalent directions/planes:** use `pymatgen.symmetry` or `orix` to enumerate equivalent vectors and planes.  Present them in a table or allow the user to select them.
* **Orientation relationship (optional):** for two crystals, compute possible orientation relationships (e.g. Kurdjumov–Sachs) by enumerating low‑index plane/plane and direction/direction correspondences.  Provide this as an advanced feature for later phases.

#### Hexagonal four-index notation (front-end behaviour)

For **hexagonal** structures, the front-end must support four-index notation for planes and directions in a way that is both user-friendly and mathematically correct:

- **Planes:** use Miller–Bravais notation (h k i l) where `i = -(h + k)`.
  - The UI must provide input fields for `h`, `k`, and `l` only.
  - The `i` component must be displayed in a disabled / greyed-out field and computed dynamically as `-(h + k)` as the user types.
  - Users must not be allowed to type directly into `i`.

- **Directions:** use four-index notation (u v t w) where `t = -(u + v)`.
  - The UI must provide editable inputs for `u`, `v`, and `w` only.
  - The `t` component must be shown as a computed, read-only field that always reflects `-(u + v)`.

- The front-end must automatically switch between three-index and four-index representations based on the current lattice type (e.g. a `crystal_system` or `is_hexagonal` flag provided by the backend for the loaded structure).

- All calculations in the backend must use an internal, unambiguous representation (Cartesian vectors or conventional three-index reciprocal / real-space vectors).  
  Conversion to and from four-index notation should be implemented once in a dedicated helper in `core/calculations.py`, and covered by unit tests to avoid duplicated or inconsistent logic across the codebase.


### 5. Euler angles & rotated unit cell

* Provide inputs for three Euler angles (φ₁, Φ, φ₂) following the Bunge ZXZ convention used in electron diffraction.  Use `orix.orientation.Orientation` to convert Euler angles to rotation matrices and apply them to the structure.  The backend returns the rotated atomic coordinates; the frontend updates the 3‑D viewer accordingly.
* Show orientation axes and allow continuous rotation by dragging sliders.  Provide tooltips explaining the physical meaning of each angle.

### 6. EBSD Kikuchi pattern simulation

* **Kinematical Kikuchi patterns:** use `kikuchipy.KikuchiPatternSimulator` to compute master patterns【538124073874103†L95-L118】.  Inputs include accelerating voltage, detector distance, sample tilt, pattern centre coordinates and the crystal orientation (Euler angles).  The simulator requires a `ReciprocalLatticeVector` constructed from the structure and calculates structure factors, Bragg angles and pattern intensities【538124073874103†L95-L119】.  The plugin must ensure that all atom positions are populated and use `Phase.from_cif()` from `orix` when necessary【538124073874103†L99-L109】.
* **Geometry schematic:** the UI shows a schematic of the EBSD setup (electron gun, tilted sample, camera) with adjustable parameters.  The user enters beam voltage, tilt angle, working distance and detector size.  On clicking “Calculate”, the backend returns the simulated pattern as an image or as a 2‑D array plus intensity scale.
* **Pattern display & indexing:** display the pattern using an interactive plotting library.  When the user moves the mouse over the pattern, display the corresponding band indexing, zone axis and d‑spacing.  Provide a table listing the bands (Miller indices) and their intensities.  In the future this tab may support dynamical patterns and pattern matching.

### 7. Miscellaneous

* **Sample CIFs & presets:** include example structures (e.g., α‑Zr, β‑Zr, Fe) that can be loaded with one click to demonstrate capabilities.  The original `pycrystallography` app provides Fe/Zr examples and YAML config for UI defaults【382860410506281†L97-L107】; similar defaults should be vendored in this plugin.
* **Export options:** allow downloading of edited CIFs, peak tables (CSV) and simulated images (PNG).  Provide JSON outputs for integration with other tools.
* **Accessibility & theme:** respect the site’s theme palette; ensure plots and tables have accessible colours.  Avoid storing any user data in cookies or local storage【101954032698654†L26-L33】.

## Non‑functional requirements

* **Offline operation:** all Python and JavaScript dependencies must be vendored and pinned via `environment.yml` and `package.json`【101954032698654†L29-L33】.  The plugin must not fetch external resources at runtime.
* **Performance:** heavy crystallographic computations should be executed in backend workers.  Use caching and concurrency (e.g., thread pools) where appropriate.  Enforce upload size limits and timeouts; return HTTP 413 for requests exceeding configured limits【101954032698654†L121-L124】.
* **Security:** validate all inputs via `common.validate` and sanitise uploaded files.  Use strict MIME type checks and never write user data to disk【101954032698654†L26-L33】.  Return errors via the unified response schema and include helpful messages.
* **Accessibility & UX:** follow a uniform React shell with consistent navigation, headers and footers【101954032698654†L23-L25】.  Provide status toasts and inline validation.  The UI must be usable with keyboard navigation and screen readers.
* **Extensibility:** design the core logic in a modular way.  Provide interfaces for additional diffraction calculators, composite patterns and orientation‑relationship analyses.  Do not hard‑code assumptions about lattice symmetry or instrument settings.
* **Testing:** comprehensive automated tests are required.  Core logic functions must be covered by unit tests (pytest).  API endpoints must be tested with Flask’s test client.  The front‑end must have component tests (React Testing Library) and end‑to‑end tests (Playwright) that run in an offline environment.  Coverage should include normal cases and edge conditions (invalid CIFs, unsupported symmetries, extreme parameter values).

## Architecture & design

### Backend structure

The backend follows the plugin blueprint pattern described in AGENTS.md【101954032698654†L17-L33】.  Under `plugins/crystallographic_tools/` the following modules must be created:

* `__init__.py` – defines the plugin manifest (`title`, `summary`, `category`, `icon`) and registers the Flask blueprint.  Provides a `blueprint` object for `app/blueprints.py`.
* `core/` – pure, testable Python functions.  Modules may include:
  * `structure.py` – functions for parsing/editing CIFs, generating supercells and applying Euler rotations.
  * `xrd.py` – wrapper around `pymatgen.analysis.diffraction.xrd` to compute powder patterns.
  * `tem.py` – functions to compute reciprocal lattice points, structure factors and SAED spots using `diffsims`/`orix`.
  * `calculations.py` – functions to compute vector/plane angles and orientation relationships.
  * `ebsd.py` – wrappers around `kikuchipy` simulators to generate Kikuchi patterns and geometry calibration.
* `api/` – Flask blueprint.  Define routes under `/api/crystallographic-tools/…` for each operation.  Use `common.validate` to validate request payloads, and `common.responses.ok`/`fail` for responses.  Use `BytesIO` for any file uploads.  All responses must be JSON except for binary image downloads (served with appropriate `Content-Type` and `Content-Disposition`).
* `tests/` – pytest suites.  Include unit tests for each core module and tests for API routes.  Provide fixtures for small CIFs and expected diffraction results.  End‑to‑end tests using Playwright should be placed under `tests/e2e/`.

### Front‑end structure

The UI lives inside the shared React SPA (`frontend/`).  Create a new route (e.g., `/crystallographic-tools`) that renders a top‑level component `CrystallographicToolsPage`.  Subcomponents correspond to each tab: `StructureEditorTab`, `XrdTab`, `TemTab`, `CalculationsTab`, `EulerTab`, `EbsdTab`.  Use React state or context to manage the current structure and computed results.  Fetch data via `fetch`/`axios` from the plugin’s API endpoints.  Use UI libraries already present in the repo (e.g., charts/spinners) and avoid adding unvetted dependencies.  All assets must be bundled by Vite.  Provide help tooltips and error messages.

### Interfaces & data contracts

Define JSON schemas for requests and responses.  For example, the `/xrd` endpoint may accept:

```json
{
  "structure": { /* serialized Structure or CIF string */ },
  "radiation": "CuKa",
  "two_theta": { "min": 10, "max": 80, "step": 0.05 }
}
```

and return:

```json
{
  "peaks": [
    { "hkl": [1, 1, 0], "two_theta": 44.7, "intensity": 100.0, "d_spacing": 2.04 },
    …
  ]
}
```

Similarly, the `/tem_saed` endpoint returns a list of spots with coordinates and metadata.  Use dataclasses to define these schemas and validate via `common.validate` before executing calculations.

### Logging & error handling

Use `common.logging` to attach a unique request ID to each log entry.  Catch exceptions in API handlers and convert them to structured errors via `common.errors.AppError`.  Provide meaningful error messages for invalid CIFs, unsupported space groups, out‑of‑range parameters and timeouts.  Do not expose internal stack traces in responses.

### Extensibility

Design the plugin so that new diffraction calculators or analysis tools can be added by subclassing a base class (e.g., `DiffractionCalculator`) and registering it in a registry.  The registry can be introspected by the API to list available methods.  Future phases may include composite diffraction (multiple phases), orientation relationship enumeration, and integration with machine‑learning models.  Keep logic decoupled from UI and avoid assumptions about crystal symmetry or instrument configuration.

## Implementation tasks for autonomous coding agents

Below is a suggested sequence of tasks for an automated coding agent (such as OpenAI Codex) to implement the plugin.  Each task should be fully tested and reviewed before moving on.

1. **Scaffold the plugin package.**  Create `plugins/crystallographic_tools/` with `__init__.py`, `api/`, `core/`, `tests/` and manifest definitions.  Register the blueprint in `app/blueprints.py`.  Success: plugin is discoverable and Flask starts without errors.
2. **Implement structure handling.**  In `core/structure.py`, write functions to parse CIFs into `pymatgen.Structure`, edit lattice parameters and atomic positions, replicate supercells and apply Euler rotations.  Write unit tests with sample CIFs.  Implement `/load_cif` and `/edit_cif` endpoints that use these functions.  Success: tests confirm parsing/editing works and API returns expected JSON.
3. **Compute powder XRD patterns.**  Implement `core/xrd.py` using `pymatgen.analysis.diffraction.xrd.XRDCalculator`.  Support custom radiation and 2θ window.  Add an endpoint `/xrd` that returns a peak list.  Write tests comparing results against known patterns (e.g., α‑Zr).  Success: patterns are accurate within tolerance and API returns JSON.
4. **Compute SAED/TEM patterns.**  Implement `core/tem.py` using `diffsims`/`orix`.  Compute reciprocal lattice points, structure factors and intensities for given accelerating voltage and camera length.  Implement `/tem_saed` endpoint.  Write unit tests with small structures and cross‑check with pycrystallography outputs.  Success: endpoints return coordinates and metadata; UI can plot them.
5. **Implement crystallographic calculations.**  Implement functions in `core/calculations.py` to compute angles between vectors, planes and orientations.  Use `pymatgen.Lattice` metrics.  Add `/vector_angle`, `/plane_vector_angle` and `/orientation_relation` endpoints.  Write tests with known results (e.g., cubic lattices).  Success: angles match analytical values.
6. **Implement Euler rotation logic.**  Implement rotation functions using `orix` to convert Euler angles to rotation matrices and apply them to structures.  Add `/euler_rotate` endpoint.  Write tests verifying coordinates after rotation.  Success: rotated cell matches expected orientation.
7. **Simulate EBSD Kikuchi patterns.**  In `core/ebsd.py`, wrap `kikuchipy.KikuchiPatternSimulator` to generate master patterns.  Validate input parameters and convert structures to `orix.Phase`.  Implement `/kikuchi` endpoint returning pattern data.  Write tests with small patterns and ensure correct shape and intensities.  Success: API returns arrays and UI can render them.
8. **Develop the React UI.**  Create components for each tab under `frontend/src/features/crystallographicTools/`.  Implement forms for inputs, call the corresponding API endpoints, and render charts and 3‑D viewers.  Ensure responsiveness and accessibility.  Success: running the dev server shows a navigable page with all tabs; interactions produce visible results.
9. **Write frontend tests.**  Use React Testing Library to test component rendering and state updates.  Write Playwright tests to simulate user flows: uploading CIFs, generating patterns, rotating cells.  Success: tests pass offline.
10. **Documentation and help pages.**  Create Markdown documentation under `docs/plugins/crystallographic_tools.md` describing usage.  Implement UI help pages that mirror this content.  Update `config.yml` with plugin limits and documentation URLs.  Success: docs build successfully and help pages load.


#### Hexagonal four-index notation (front-end behaviour)

For **hexagonal** structures, the front-end must support four-index notation for planes and directions in a way that is both user-friendly and mathematically correct:

- **Planes:** use Miller–Bravais notation (h k i l) where `i = -(h + k)`.
  - The UI must provide input fields for `h`, `k`, and `l` only.
  - The `i` component must be displayed in a disabled / greyed-out field and computed dynamically as `-(h + k)` as the user types.
  - Users must not be allowed to type directly into `i`.

- **Directions:** use four-index notation (u v t w) where `t = -(u + v)`.
  - The UI must provide editable inputs for `u`, `v`, and `w` only.
  - The `t` component must be shown as a computed, read-only field that always reflects `-(u + v)`.

- The front-end must automatically switch between three-index and four-index representations based on the current lattice type (e.g. a `crystal_system` or `is_hexagonal` flag provided by the backend for the loaded structure).

- All calculations in the backend must use an internal, unambiguous representation (Cartesian vectors or conventional three-index reciprocal / real-space vectors).  
  Conversion to and from four-index notation should be implemented once in a dedicated helper in `core/calculations.py`, and covered by unit tests to avoid duplicated or inconsistent logic across the codebase.


Following this specification will ensure that the Crystallographic Tools plugin is robust, extensible and aligned with the ML Server AIO architecture.