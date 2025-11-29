# Crystallographic Tools

This plugin provides offline CIF handling and powder XRD calculations.

## Features (current slice)

- Upload and parse CIF files (pymatgen).
- Edit lattice parameters and download the updated CIF.
- Compute powder XRD peaks with configurable radiation and 2θ window.

## API

- `POST /api/crystallographic_tools/load_cif` — multipart form-data with `file`; returns structure JSON.
- `POST /api/crystallographic_tools/edit_cif` — JSON with `cif`, optional `lattice`, `sites`, `supercell`; returns updated structure JSON.
- `POST /api/crystallographic_tools/xrd` — JSON with `cif`, `radiation`, `two_theta` (`min`, `max`, `step`); returns `peaks`.

## Frontend

- Route: `/tools/crystallographic_tools`
- Upload CIF, edit lattice fields, compute XRD peaks; status shown inline.

## Notes

- All computations are CPU-only and offline.
- Optional Torch/diffsims/orix/kikuchipy dependencies are pinned in `requirements.txt` for future work; current UI uses only pymatgen-backed endpoints.
