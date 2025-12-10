# Crystal Viewer Plugin – Specification

## 1. Purpose & Scope

The **Crystal Viewer** is a new plugin inside the `crystallographic_tools` section of `ml_server_all_in_one`. It appears as the **first tab** (before XRD, TEM/SAED, etc.) and provides:

- 3D interactive visualization of crystal structures (CIF/POSCAR input).
- Configurable **supercell** display (default `3×3×3`, user-changeable; hard cap defined below).
- Physically meaningful **atom sizes** (proportional to atomic radii) and customizable colors.
- Support for **hexagonal** and other non-cubic cells.
- Superimposed **crystallographic planes and directions** (up to at least 3 planes simultaneously).
- Hooks to existing/future **XRD and TEM/SAED** modules for diffraction simulations (no direct calculation here).
- All heavy visualization logic in the **frontend** (Three.js), backend only parses and normalizes data.

The plugin strictly respects the ML server principles:

- **Air-gapped, self-hosted** assets (no CDNs).
- **In-memory only**: no persistent storage of uploaded CIF/POSCAR files or derived data.
- **Cross-browser** (Chrome, Firefox, Edge) with vanilla JS + Three.js vendored locally.

---

## 2. High-Level UX

### 2.1 Placement

- Main route: existing **Crystallographic Tools** page.
- Tabs (left-to-right):  
  **Crystal Viewer | XRD Simulator | TEM/SAED | …**  
  (`Crystal Viewer` becomes the default active tab).

### 2.2 Layout (within Crystal Viewer tab)

PC-focused 3-column layout:

1. **Left Panel – Input & Structure Info**
   - File upload (CIF/POSCAR; drag & drop + button).
   - Lattice parameters and space group.
   - Supercell settings: `nₐ, n_b, n_c` (integer inputs, defaults 3, max limited).
   - Representation & visual settings (basic controls).

2. **Center Panel – 3D Viewport**
   - `<canvas>` for Three.js renderer.
   - Display of atoms, unit-cell edges, axes, supercell boundary.
   - Mouse controls: orbit (rotate), pan, zoom (scroll).
   - Optional “reset camera” button.

3. **Right Panel – Planes & Directions**
   - Plane manager (up to 3 planes):
     - For each: input `(h,k,l)` or `(h,k,i,l)` for hexagonal 4-index.
     - Transparency slider (0–1), color chooser.
     - Toggle visibility.
   - Direction manager (visualization of `[u v w]`, `⟨u v w⟩` etc. as arrows).
   - Layers list to control visibility of:
     - Atoms
     - Bonds (future)
     - Unit cell
     - Supercell boundary
     - Planes
     - Directions

All configuration changes are **applied instantly on client side** without extra backend calls (after initial parse).

---

## 3. Functional Requirements

### 3.1 File Support

- **Input formats**:
  - CIF (`*.cif`)
  - POSCAR/CONTCAR (VASP-style simple format; `POSCAR` or `.vasp`).
- Single structure per upload.
- Validation:
  - Reject files with ambiguous or invalid cell parameters / atomic positions.
  - Reject structures that would produce more than a configured atom limit after supercell expansion (e.g. `≤ 500` atoms total in supercell).

### 3.2 Structure Representation

Backend returns a normalized JSON representation:

- Lattice:
  - `a, b, c` (Å), `alpha, beta, gamma` (degrees).
  - Lattice matrix `3×3` in Cartesian coordinates (Å).
- Symmetry:
  - Space group symbol + number.
  - Optional list of symmetry operations (for viewer overlays, optional in v1).
- Basis:
  - List of atomic sites (before supercell):
    - `element`
    - `frac_position: [xf, yf, zf]`
    - Optional `occupancy`
- Derived (backend or frontend):
  - Supercell atom list with:
    - `element`
    - `frac_position`
    - `cart_position: [x, y, z]` (Å)
    - Atomic radius (Å; from lookup table) or atomic number.

Backend must not send more than the maximum supported atom count (`MAX_ATOMS_IN_VIEW`) after supercell expansion.

### 3.3 Supercell Handling

- Default: `3×3×3` supercell.
- User may change each dimension, e.g. `1–3` or `1–4` (configurable; guard on atom count).
- All supercell generation handled in **frontend**:
  - Backend returns **one unit cell’s** basis.
  - Frontend replicates positions over integer translations.

### 3.4 Atom Sizes & Colors

- Atom radii:
  - Use **predefined mapping** in JS (e.g. covalent radii or metallic radii), scaled with a global factor:
    - `visual_radius = scale_factor * physical_radius`.
  - `scale_factor` is a frontend control (slider).
- Colors:
  - Default color scheme: per-element (C gray, O red, Fe orange, etc.) from a JS map.
  - Users can override:
    - Global color scheme (e.g. per-element, per-site index, single-color).
    - Individual element colors via a small palette UI (optional v1.1).

### 3.5 Planes Visualization

- Support at least **three planes** simultaneously.
- Plane specification:
  - Cubic / general systems: `(h, k, l)`.
  - Hexagonal: allow `(h, k, i, l)` entry; convert to 3-index internally, or directly to a normal vector using hexagonal basis.
- Visual representation:
  - For each plane:
    - Compute plane normal in reciprocal space.
    - Generate a **finite polygon** that lies within the currently displayed supercell:
      - Intersect the infinite plane with the supercell bounding box.
      - Render as a semi-transparent polygon with adjustable opacity.

### 3.6 Directions Visualization

- Input: `[u v w]` (three integers).
- Convert to a vector in **direct space** using lattice matrix.
- Display as an arrow starting from:
  - Either the cell origin.
  - Or a user-selected atom (later enhancement).
- Allow toggling visibility and color per direction.

### 3.7 Diffraction / Analysis Hooks

- Provide **UI hooks** for:
  - “Send to XRD Simulator”
  - “Send to TEM/SAED Simulator”
- When clicked:
  - Pass current structure definition (in standardized JSON) to the respective plugin.

---

## 4. Algorithms – Overview

### 4.1 CIF/POSCAR Parsing (Backend)

- Use **pycrystallography** to:
  - Parse CIF/POSCAR in-memory.
  - Validate cell parameters and site list.
  - Normalize fractional coordinates within `[0,1)`.
  - Remove zero-occupancy sites.

### 4.2 Lattice Matrices & Coordinate Systems

- Compute lattice vectors in Cartesian coordinates.
- Build `lattice_matrix` as a 3×3 matrix using direct basis vectors.
- Cartesian position:

\[
\mathbf{r}_	ext{cart} = \mathbf{L} \cdot \mathbf{r}_	ext{frac}
\]

- Hexagonal basis:

\[
a⃗ = (a, 0, 0),\quad
b⃗ = (	frac{a}{2}, 	frac{\sqrt{3}a}{2}, 0),\quad
c⃗ = (0, 0, c)
\]

### 4.3 Supercell Generation

- For each fractional site `r_i` and integers `(i,j,k)` with  
  `0 ≤ i < nₐ`, `0 ≤ j < n_b`, `0 ≤ k < n_c`:
  - new fractional position = `r_i + (i, j, k)`.

### 4.4 Plane Construction

- From Miller `(h,k,l)` compute reciprocal-space normal.
- Plane equation:

\[
\mathbf{n} \cdot \mathbf{r} = d
\]

- Intersect plane with supercell bounding box to form polygon.

### 4.5 Direction Construction

- Given `[u,v,w]`:

\[
\mathbf{d} = u a⃗ + v b⃗ + w c⃗
\]

- Render as arrow.

---

## 5. Backend Architecture & API

### 5.1 File Structure

```
backend/plugins/crystallography/crystal_viewer/
    __init__.py
    routes.py
    parser.py
    schemas.py
    atomic_radii.py
```

### 5.2 Endpoints

#### `POST /api/v1/crystallography/crystal_viewer/parse`
- Input: CIF/POSCAR file.
- Output: normalized structure JSON.

#### `GET /api/v1/crystallography/crystal_viewer/element_radii`
- Output: `{ "Fe": 1.26, "O": 0.66, ... }`.

#### `POST /api/v1/crystallography/crystal_viewer/export_structure`
- Output: standardized JSON for handoff to XRD/TEM modules.

---

## 6. Frontend Architecture

### 6.1 Files

```
frontend/src/plugins/crystallography/
    CrystalViewerTab.tsx
    components/
        CrystalCanvas.tsx
        StructureControls.tsx
        PlaneDirectionControls.tsx
    utils/
        crystalMath.ts
        threeHelpers.ts
public/vendor/three/three.min.js
```

### 6.2 Data Flow

- `CrystalViewerTab` manages structure state + supercell + visual settings.
- `CrystalCanvas` renders using Three.js.
- `StructureControls` handles file upload & backend communication.
- `PlaneDirectionControls` manages plane/direction overlays.

---

## 7. Performance & Limits

- `MAX_ATOMS_IN_VIEW ≈ 500` (configurable).
- Limit planes (≤3) and directions (≤5).
- Use **instanced meshes** for atoms.
- No backend memory persistence beyond request scope.

---

## 8. Privacy & Security

- In-memory only.
- No logging of file contents.
- No CDNs.
- Limit upload file size.
- Strict MIME/type validation.
look
---

## 9. Integration with Existing Tools

- XRD Simulator → receives structure JSON.
- TEM/SAED Simulator → receives structure + optional plane/direction definitions.
- Shared JSON schema ensures cross-plugin compatibility.

---

## 10. Compatibility Checklist

- [ ] Works on Chrome, Firefox, Edge.
- [ ] No non-standard APIs.
- [ ] Three.js self-hosted.
- [ ] Keyboard-accessible controls.
- [ ] PC-first layout.

