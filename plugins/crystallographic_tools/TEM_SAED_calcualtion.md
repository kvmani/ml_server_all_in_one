# TEM SAED Pattern Simulation Algorithm

> Draft design document for developers – pycrystallography / SAED module

---

## 1. Scope and Goals

This document specifies the **end-to-end algorithm** and **division of responsibilities** for implementing a TEM Selected Area Electron Diffraction (SAED) zone-axis pattern simulator in the pycrystallography codebase.

The goal is to:

- Take **phase information from a CIF file** and **TEM settings** as input.
- Compute a **zone-axis SAED pattern** (spot positions + intensities) using a **trusted scientific stack**, primarily **pymatgen**.
- Return results as a **clean, frontend-friendly JSON-like structure**.
- Provide a clear separation between:
  - **Core physics / crystallography backend** (Python, pymatgen, etc.).
  - **Web API layer** (FastAPI or equivalent, still backend).
  - **Frontend / visualization layer** (React).

Non-goals (for this first version):

- Inelastic scattering, dynamical diffraction, or detailed thickness effects.
- Kikuchi patterns, HOLZ line simulation, or intensity redistribution due to dynamical effects.
- Multi-phase composites (these can be composed later using this single-phase SAED core).

---

## 2. External Libraries and References

### 2.1 Core scientific engines

Back-end computations **must delegate physics and crystallographic math** to well-tested libraries where possible:

- **pymatgen**
  - `pymatgen.core.Structure` for loading and representing CIF structures.
  - `pymatgen.analysis.diffraction.tem.TEMCalculator` as the **primary SAED engine**.
- **(Optional, Phase 2)**
  - `hyperspy` / `kikuchipy` for representing patterns as `Signal2D` objects, if we later want a common representation for EBSD/TEM imaging.
  - `orix` for more advanced orientation math, e.g., mapping orientation relationships, variants, and arbitrary goniometer tilts.

### 2.2 Physical principles (for developers)

Core physics concepts used by the backend (implemented for us by pymatgen):

- **Relativistic electron wavelength** from accelerating voltage (kV).
- **Interplanar spacing** \(d_{hkl}\) from crystal structure and Miller indices.
- **Bragg condition** for electron diffraction (small angle): \(2 d \sin \theta = n \lambda\).
- **SAED geometry**: spot radius \(R\) on the detector is approximately
  $$
    R \approx L \tan(2\theta) \approx L \cdot 2 \theta \quad (\theta \ll 1),
  $$
  where \(L\) is the camera length.
- **Kinematic intensity**: spot intensity proportional to \(|F_{hkl}|^2\), where \(F_{hkl}\) is the structure factor. pymatgen already computes these.

The backend **should not re-implement** these; instead it should:

- Call the appropriate pymatgen methods.
- Wrap the results in our domain data model.

---

## 3. Input and Output Contracts (Backend Domain Level)

The SAED module will expose a high-level function / class similar to:

```python
SaedConfig  ->  SaedPattern
```

### 3.1 Input: `SaedConfig`

Conceptual fields (implementation: Pydantic model or dataclass):

- **Phase / structure**

  - `cif_path: Path` – path to the CIF file.
  - `phase_name: str | None` – optional display name; if `None`, derive from composition.

- **Orientation / zone axis**

  - `zone_axis: tuple[int, int, int] = (0, 0, 1)`
    - Crystal zone axis [u v w] aligned with the electron beam direction.
  - `x_axis_hkl: tuple[int, int, int] | None = None`
    - Optional reference plane [h k l] that should lie along the **horizontal (x) axis** in the final SAED pattern.
  - `inplane_rotation_deg: float = 0.0`
    - Additional user-defined in-plane rotation (about the beam) applied **after** aligning `x_axis_hkl`.

- **TEM instrument settings**

  - `voltage_kv: float` – accelerating voltage in kV (e.g. 200).
  - `camera_length_cm: float` – camera length in cm.

- **Reflection limits / filters**

  - `min_d_angstrom: float | None = 0.5`
    - Minimum d-spacing; reflections with smaller d (higher angle) are removed.
  - `max_index: int = 8`
    - Maximum |h|, |k|, |l| to consider.
  - `laue_zone: int = 0`
    - Laue zone index (0 = main zone-axis pattern; ±1 etc. for HOLZ in future).
  - `intensity_min_relative: float = 0.01`
    - Drop reflections whose **normalized** intensity is below this relative threshold.

- **Frontend convenience flags**

  - `normalize_position: bool = True`
    - Normalize positions to a canonical range (e.g. [-1, 1]) for easier plotting.
  - `normalize_intensity: bool = True`
    - Return intensities scaled to [0, 1] instead of raw kinematic intensities.

### 3.2 Output: `SaedPattern` (backend domain model)

`SaedPattern` is a backend object that can be serialized to JSON. Canonical structure:

```json
{
  "metadata": { ... },
  "limits": { ... },
  "spots": [ ... ]
}
```

- `metadata` – descriptive information for UI and logging:

  - `phase_name`, `formula`, `cif_path`, `spacegroup`.
  - `zone_axis`, `x_axis_hkl`, `inplane_rotation_deg`.
  - `voltage_kv`, `lambda_angstrom`, `camera_length_cm`.
  - `laue_zone`, `min_d_angstrom`, `max_index`, `intensity_min_relative`.

- `limits` – useful numeric bounds:

  - `x_min`, `x_max`, `y_min`, `y_max` – bounds of rotated coordinates.
  - `r_max` – maximum film radius (distance from center) among spots.
  - `i_max` – maximum normalized intensity (typically 1.0).

- `spots` – list of reflections, each item:

  - `hkl: [int, int, int]`
  - `zone: int` – Laue zone index used (usually 0).
  - `d_angstrom: float`
  - `s2: float` – \(s^2 = (\sin \theta / \lambda)^2\), if available.
  - `intensity_raw: float`
  - `intensity_rel: float` – normalized to [0, 1] if `normalize_intensity` is true.
  - `x_cm`, `y_cm`: original detector coordinates in cm.
  - `x_rot_cm`, `y_rot_cm`: rotated coordinates after applying orientation alignment.
  - `x_norm`, `y_norm`: normalized coordinates (e.g., to [-1, 1] for frontend).
  - `r_cm: float`: film radius.
  - `two_theta_deg: float` – 2θ for that reflection.
  - `label: str` – simple text label, e.g. "100".

The **web API** will just expose `SaedPattern.to_dict()` as JSON.

---

## 4. Backend Algorithm: Detailed Steps

This section is the core algorithm the backend must implement, using pymatgen.

### 4.1 Load and standardize the structure

1. **Read CIF file** into a `Structure`:

   - Use `pymatgen.core.Structure.from_file(cif_path)`.

2. **(Optional) Symmetry refinement**:

   - If needed, pass a symmetry precision (`symprec`) to a `SpacegroupAnalyzer` and obtain a refined or conventional cell.
   - For a first implementation, we can use the CIF structure directly; later we may standardize to conventional settings for nicer HKL labeling.

3. Extract metadata:

   - Reduced formula, space group symbol, etc.

### 4.2 Instantiate `TEMCalculator`

4. **Create the TEM calculator** with instrument settings and zone axis:

   - Use `pymatgen.analysis.diffraction.tem.TEMCalculator`.
   - Set:
     - `voltage` (kV).
     - `beam_direction` = `zone_axis` ([u v w]).
     - `camera_length` (cm).

5. **Compute electron wavelength**:

   - Call `TEMCalculator.wavelength_rel()` to get the relativistic electron wavelength in Å.
   - Store this in `metadata["lambda_angstrom"]`.

### 4.3 Generate candidate Miller indices (hkl)

6. **Generate integer (hkl) grid** in reciprocal space:

   - Use `TEMCalculator.generate_points(coord_left=-max_index, coord_right=max_index)`.
   - This returns an array of integer triplets.
   - Filter out the origin (0, 0, 0).

7. **Apply index limit**:

   - Enforce `max(|h|, |k|, |l|) <= max_index` as a safety check, in case `generate_points` is changed.

### 4.4 Zone-axis (Laue zone) filtering

8. **Filter by Laue zone** relative to the beam direction:
   - Use `TEMCalculator.zone_axis_filter(points, laue_zone=cfg.laue_zone)`.
   - For the basic zone-axis pattern, use `laue_zone = 0`.
   - Higher-order Laue zones (`±1`, `±2`, etc.) can be supported later by allowing the user to choose.

### 4.5 Interplanar spacings and d-spacing cut

9. **Compute d-spacings**:

   - Use `TEMCalculator.get_interplanar_spacings(structure, points)`.
   - This returns a dict mapping each `(h, k, l)` to `d_hkl` in Å.

10. **Apply minimum d-spacing filter**:

- If `min_d_angstrom` is set, remove reflections with `d_hkl < min_d_angstrom`.
- The filtered set is the list of candidate reflections.

### 4.6 Bragg angles and intensities

11. **Compute Bragg angles** for each remaining reflection:

- Use `TEMCalculator.bragg_angles(d_map)` to obtain a mapping `(h, k, l) -> theta_B` in radians.

12. **Compute intensities**:

- Use `TEMCalculator.cell_intensity(structure, bragg_map)` for raw intensities.
- Use `TEMCalculator.normalized_cell_intensity(structure, bragg_map)` for normalized intensities (max = 1).

13. **Apply intensity threshold**:

- Keep only reflections where `intensity_norm[hkl] >= intensity_min_relative`.
- This prevents clutter from very weak spots.

### 4.7 Detector positions and geometry

14. **Compute 2D detector positions**:

- Use `TEMCalculator.get_positions(structure, spots_hkl)`.
- This returns `(x, y)` film coordinates (cm) for each reflection, with the origin at the direct beam.

15. **Compute scattering vector measure **`` (optional but useful):

- Use `TEMCalculator.get_s2(bragg_map)`.

16. **Compute film radius** for each reflection:

- `r_hkl = sqrt(x_cm^2 + y_cm^2)`.

17. **Compute 2θ for logging and optional UI**:

- `two_theta_deg = 2 * theta_B * 180 / π`.

All these are handled numerically by pymatgen; the backend just orchestrates and stores them.

### 4.8 Orientation alignment (x-axis and in-plane rotation)

We now have positions in a default orientation determined by pymatgen’s internal convention. We enforce the user’s requested in-plane orientation.

There are two rotation components:

1. **Alignment of a chosen hkl spot to the +x axis** (optional).

2. **Additional user-defined in-plane rotation**.

3. **Align x-axis if **``** is provided**:

- If `x_axis_hkl` is among the simulated reflections (`spots_hkl`):
  - Let its position be `(x_ref, y_ref)`.
  - Compute its angle: `angle_current = atan2(y_ref, x_ref)` (in degrees).
  - Define `base_rotation_deg = -angle_current` so that the vector becomes horizontal.
- If not present, set `base_rotation_deg = 0`.

19. **Add user in-plane rotation**:

- `total_rot_deg = base_rotation_deg + inplane_rotation_deg`.
- Convert to radians: `theta = total_rot_deg * π / 180`.

20. **Rotate all positions**:

- For each reflection with original film coordinates `(x_cm, y_cm)`:
  - `x_rot = cos(theta) * x_cm - sin(theta) * y_cm`.
  - `y_rot = sin(theta) * x_cm + cos(theta) * y_cm`.
- Store both original and rotated coordinates in the `spot` record.

### 4.9 Normalization for frontend

To make plotting in the web app simple and consistent, we normalize coordinates and intensities.

21. **Compute bounds and maxima**:

- Gather rotated coordinates `(x_rot, y_rot)` for all spots.
- Compute: `x_min`, `x_max`, `y_min`, `y_max`, `r_max`, `i_max`.

22. **Define normalization functions**:

- For positions (if `normalize_position` is true):
  - Map to [-1, 1] or [0, 1]. For example, to [-1, 1]:
    - `x_norm = 2 * (x_rot - x_min) / (x_max - x_min) - 1`.
    - Similarly for `y_norm`.
- For intensities (if `normalize_intensity` is true):
  - `intensity_rel = intensity_norm[hkl]` (already ∈ [0, 1])
  - If raw intensities are needed as well, keep `intensity_raw` separately.

23. **Construct **``** list**:

- For each reflection, create a dict with all the fields described in Section 3.2.

### 4.10 Assemble and return `SaedPattern`

24. **Create **``** and **``** dicts**:

- Fill in phase information, instrument settings, zone axis, and filters.
- Fill numeric bounds for coordinates and intensities.

25. **Return **``:

- Wrap `metadata`, `limits`, and `spots` in a `SaedPattern` object.
- Expose a `.to_dict()` or `.model_dump()` method to serialize to JSON.

---

## 5. Web API Layer Responsibilities

The web API (FastAPI or equivalent) is responsible for:

1. **Input validation and parsing**

   - Expose an endpoint like: `POST /api/v1/diffraction/saed`.
   - Request body: JSON matching `SaedConfig` (or a superset with strings for CIF path, etc.).
   - Validate:
     - Existence of CIF file.
     - Valid integers for zone axis, x-axis HKL.
     - Reasonable ranges for voltage, camera length.

2. **Invocation of backend domain logic**

   - Convert request JSON to `SaedConfig` model.
   - Call `PymatgenTEMBackend.simulate(cfg)`.
   - Handle exceptions gracefully (invalid CIF, unphysical parameters) and return informative error messages.

3. **Response formatting**

   - Serialize `SaedPattern` to JSON.
   - Include useful HTTP headers for caching if appropriate.

4. **Logging and diagnostics**

   - Log each request’s parameters and timing.
   - Optionally store small JSON artefacts for regression tests or reproducing bugs.

The API **must not** contain physics-specific logic; that belongs in the domain layer.

---

## 6. Frontend / Visualization Responsibilities

The frontend (React) consumes the JSON from the API and is responsible for **interactive visualization** and **user controls**, not physics.

### 6.1 Data usage on the frontend

The React app should assume the following from the backend response:

- Spots are already computed and filtered.
- Coordinates are provided in both physical units (cm) and normalized units.
- Intensities are given in a convenient [0, 1] scale.

Typical rendering pipeline:

1. Fetch `SaedPattern` JSON from API.
2. Use `spots[*].x_norm`, `spots[*].y_norm`, `spots[*].intensity_rel` to render.
3. Use `spots[*].label` for HKL text labels (optional UI layer).
4. Use `metadata` and `limits` to display summary info and set up scale bars or rulers.

The frontend should not re-do any crystallographic computations.

### 6.2 Suggested visualization controls

To make the tool useful to TEM users and students, we recommend the following UI controls:

1. **View configuration controls** (talking to backend via API requests):

   - Zone axis [u v w] selector (three integers, or slash-separated string like "0/0/1").
   - Optional x-axis HKL selector [h k l].
   - In-plane rotation slider (deg), e.g. -180° to +180°.
   - Voltage (kV) selection (e.g. 100, 200, 300).
   - Camera length (cm) numeric input.
   - Min d-spacing (Å) slider or numeric input.
   - Intensity threshold slider (0–1) for dropping weak spots.

   Each change can either:

   - Trigger a fresh API call (simplest, always correct), or
   - For purely visual parameters (e.g. intensity scaling, colormap), be handled fully on the frontend.

2. **Visual style controls** (frontend-only):

   - Spot size vs. intensity mapping (e.g. radius proportional to √intensity or intensity).
   - Color map selection (e.g. grayscale, heatmap, color by Laue zone).
   - Toggle: show/hide HKL labels.
   - Toggle: show/hide zone-axis and coordinate crosshair.
   - Background color (black vs. white).

3. **Pattern manipulation tools** (frontend-only):

   - Zoom & pan (mouse wheel, drag).
   - Reset view to defaults.
   - Optional mirror/flip controls if users want to compare with experimental images (but note: physical conventions must be clearly documented).

4. **Data export controls**:

   - Export current spot list as CSV or JSON.
   - Export a snapshot image (PNG/SVG) of the pattern.

### 6.3 Multi-pattern / overlay support (future)

To support overlays (e.g. multi-phase or multiple zone axes):

- Allow the frontend to draw multiple `SaedPattern` responses on the same canvas, differentiated by color and legend.
- This requires no change in the backend design; the frontend simply fetches multiple patterns and renders them together.

---

## 7. Testing and Validation Strategy

To ensure correctness and robustness:

1. **Unit tests (backend)**

   - Verify that `SaedConfig` parameter combinations are validated correctly.
   - Check that the pipeline runs end-to-end on **small canonical structures** (e.g. simple cubic, bcc, fcc) with known zone-axis patterns.
   - Confirm that intensity thresholds and d-spacing filters reduce the number of reflections as expected.

2. **Property tests**

   - Spot sets should be invariant under certain symmetry operations given by the space group (within tolerance).
   - Reversing sign of zone axis (e.g. [0 0 1] vs [0 0 -1]) should produce equivalent patterns up to inversion.

3. **Image regression tests (optional)**

   - Generate PNGs of a few standard patterns (e.g. bcc [110], fcc [111]) and use image regression to ensure patterns remain stable across refactors.

4. **Cross-checks with literature / reference tools**

   - Compare a few patterns against textbook zone-axis patterns or other known tools to validate orientation and indexing conventions.

---

## 8. Extensibility Notes

This architecture is intentionally modular:

- The `PymatgenTEMBackend` can be swapped or wrapped by other backends if we later want to incorporate more advanced physics (e.g., dynamical diffraction).
- Orientation-handling can be upgraded to use `orix` without changing the frontend contract.
- The same `SaedPattern` JSON format can be reused for teaching tools, pattern matching, and OR/variant visualization.

The key principle is: **all crystallographic and physical logic stays in the backend domain layer**, while the **web API and frontend focus on data flow and visualization.**

