# Crystallographic Tools

Offline CIF handling plus powder XRD and TEM/SAED diffraction calculators. Everything runs in memory—no uploads leave the machine.

## Quick start

1. Open `/tools/crystallographic_tools`.
2. Upload a CIF or paste one into the editor; the lattice and sites appear in editable form.
3. Adjust lattice constants or atomic sites and click **Update CIF** to refresh the preview and enable download.
4. Pick a task:
   - **Powder XRD**: choose radiation (e.g., Cu Kα), set the 2θ window/step, and calculate peaks.
   - **TEM/SAED**: set accelerating voltage (kV) and camera length (cm), then compute spot positions/intensities for the chosen zone axis.
5. Download the edited CIF or the diffraction table as CSV from the results panel.

## Powder XRD (backend physics)

- **Model**: `pymatgen.analysis.diffraction.xrd.XRDCalculator` with kinematic scattering.
- **Core equations**:
  - Bragg’s law: `2 d_hkl sin(theta) = n * lambda`.
  - d-spacing from lattice: `d_hkl = 1 / |h a* + k b* + l c*|` using the reciprocal lattice.
  - Relative intensity ∝ `|F_hkl|^2` (structure factor) with polarization and Lorentz corrections provided by `pymatgen`.
- **Inputs**: CIF structure, radiation (wavelength derived from preset), 2θ range (`min`, `max`, `step`).
- **Outputs**: peak list (`hkl`, `two_theta`, `intensity`, `d_spacing`). Peaks are normalized to the strongest line.
- **Tips**: Narrow the 2θ window to focus on specific families; use smaller steps for sharper charts, larger steps for faster previews.

## TEM / SAED (backend physics)

- **Model**: `pymatgen.analysis.diffraction.tem.TEMCalculator` (kinematic SAED approximation).
- **Core equations**:
  - Relativistic electron wavelength (λ) computed from accelerating voltage `V`: `lambda ≈ h / sqrt(2 m_e e V (1 + eV / (2 m_e c^2)))`.
  - Bragg condition (small-angle electron diffraction): `2 d_hkl sin(theta) = n * lambda`.
  - Film radius for a reflection: `R ≈ L * 2 theta` for small θ, where `L` is camera length.
  - Spot intensity ∝ `|F_hkl|^2`; `pymatgen` provides structure factors and applies zone-axis filtering.
- **Inputs**: CIF structure, zone axis `[u v w]`, optional in-plane rotation, accelerating voltage (kV), camera length (cm), index/Laue limits.
- **Outputs**: reflection table with `hkl`, `two_theta`, `d_spacing`, detector coordinates, normalized intensity, and optional normalized positions for plotting.
- **Tips**: Increase the max index to see higher-order reflections; lower the relative intensity threshold to reveal weak spots; rotate in-plane in the UI without recomputing intensities.

## API

- `POST /api/crystallographic_tools/load_cif` — multipart form-data with `file`; returns structure JSON.
- `POST /api/crystallographic_tools/edit_cif` — JSON with `cif`, optional `lattice`, `sites`, `supercell`; returns updated structure JSON.
- `POST /api/crystallographic_tools/xrd` — JSON with `cif`, `radiation`, `two_theta` (`min`, `max`, `step`); returns `peaks`.
- `POST /api/crystallographic_tools/tem_saed` — JSON with `cif`, `zone_axis`, `voltage_kv`, `camera_length_cm`, optional rotation/index limits; returns reflections.

## Notes and limits

- Uploads respect the global `site.max_content_length_mb` in `config.yml`; oversized CIFs return 413 before processing.
- All computations are CPU-only and offline; optional `diffsims/orix/kikuchipy` extras are pinned for richer diffraction in future releases.
- The UI shows inline errors for invalid CIFs, unphysical lattice parameters, or index ranges that cannot be satisfied.
