# Legacy Asset Porting Guide

This guide enumerates every binary asset from the legacy multi-repo bundle that we need in the monorepo and the exact destination path you should place it in. Because the commit policy forbids checking in binaries, please copy the files manually from `old_codes/mlserver_all_in_one.zip` into the directories listed below before triggering the follow-up UX implementation task.

> **Naming note:** The new repo avoids spaces in filenames. When copying assets, please rename any legacy files that contain spaces accordingly (examples provided).

## 1. Shared Shell & Home Page Icons
Copy these into `app/ui/static/img/` (create the folder if it does not exist yet).

- `ml_server/src/ml_server/static/images/ml_server_icon.png` → `app/ui/static/img/ml_server_icon.png`
- `ml_server/src/ml_server/static/images/GeneralUtilityTools_icon.png` → `app/ui/static/img/general_utility_tools_icon.png`
- `ml_server/src/ml_server/static/images/GeneralUtilityTools.png` → `app/ui/static/img/general_utility_tools.png`
- `ml_server/src/ml_server/static/images/APP3 Coming Soon.......png` → `app/ui/static/img/app3_coming_soon.png`
- `ml_server/src/ml_server/static/images/APP4 Coming Soon.......png` → `app/ui/static/img/app4_coming_soon.png`
- `ml_server/src/ml_server/static/images/under_construction.gif` → `app/ui/static/img/under_construction.gif`
- `ml_server/src/ml_server/static/images/spinner.gif` → `app/ui/static/img/spinner.gif`
- `ml_server/src/ml_server/static/images/preview_unavailable.svg` → `app/ui/static/img/preview_unavailable.svg`

## 2. Hydride Segmentation Assets
Place all hydride-specific assets under `plugins/hydride_segmentation/ui/static/hydride_segmentation/img/`.

- `ml_server/src/ml_server/static/images/hydride_icon.png` → `plugins/hydride_segmentation/ui/static/hydride_segmentation/img/hydride_icon.png`
- `ml_server/src/ml_server/static/images/hydride_icon.svg` → `plugins/hydride_segmentation/ui/static/hydride_segmentation/img/hydride_icon.svg`
- `ml_server/src/ml_server/static/images/hydride_sample.png` → `plugins/hydride_segmentation/ui/static/hydride_segmentation/img/sample_input.png`
- `ml_server/src/ml_server/static/images/ebsd_icon.png` → `plugins/hydride_segmentation/ui/static/hydride_segmentation/img/ebsd_icon.png`

## 3. PDF Toolkit Assets
Place the PDF tool visuals under `plugins/pdf_tools/ui/static/pdf_tools/img/`.

- `ml_server/src/ml_server/static/images/pdf_tools_icon.png` → `plugins/pdf_tools/ui/static/pdf_tools/img/pdf_tools_icon.png`
- `ml_server/src/ml_server/static/images/merge_pdfs_icon.png` → `plugins/pdf_tools/ui/static/pdf_tools/img/merge_pdfs_icon.png`
- `ml_server/src/ml_server/static/images/extract_from_pdf_icon.png` → `plugins/pdf_tools/ui/static/pdf_tools/img/extract_from_pdf_icon.png`

## 4. File Converter & Document Compressor Assets
These belong to the (future) general utility tools section. Store them in `app/ui/static/img/` for now so multiple plugins can reuse them.

- `ml_server/src/ml_server/static/images/File converter_icon.png` → `app/ui/static/img/file_converter_icon.png`
- `ml_server/src/ml_server/static/images/DocCompressor_icon.png` → `app/ui/static/img/doc_compressor_icon.png`

## 5. Unit Converter & Super Resolution Assets
Unit Converter already lives under `plugins/unit_converter/`, while Super Resolution is a planned plugin. Copy their icons as follows:

- `ml_server/src/ml_server/static/images/UnitConverter_icon.png` → `plugins/unit_converter/ui/static/unit_converter/img/unit_converter_icon.png`
- `ml_server/src/ml_server/static/images/SUPER_RES.PNG` → `plugins/super_resolution/ui/static/super_resolution/img/super_res_icon.png` *(create this directory now even though the plugin will be implemented later so that we keep the asset handy)*

## 6. Miscellaneous Legacy UI Assets
The legacy bundle ships a generic “try sample” thumbnail we surface on the Hydride page in the screenshot. We already mapped it to `sample_input.png` above. No other PNG/GIF assets are bundled for testing; all automated tests rely on synthetic in-memory data.

If you notice additional binary assets when exploring the legacy repos (for example, SVG logos in other folders), place them next to the logically-related feature using the same directory conventions: `app/ui/static/<type>/` for shared shell assets and `plugins/<tool>/ui/static/<tool>/<type>/` for tool-scoped assets.

Once the files are copied over, please ping with confirmation so we can wire the updated home page and plugin UIs to the new assets.
