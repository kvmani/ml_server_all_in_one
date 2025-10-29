# Unit Converter

Convert scientific quantities across multiple categories (length, mass, pressure, energy, temperature, etc.) with instant validation.

## Usage

1. Select a measurement category. Only compatible units are shown in the “From” and “To” dropdowns.
2. Enter a numeric value (supports integers, decimals, and scientific notation).
3. Choose source and destination units and submit the form.
4. The converted value appears with four-decimal precision; copy the result directly into lab notes.

## Implementation notes

* Conversion tables live in `plugins/unit_converter/core/units.py`.
* All conversions use deterministic factors—no external services or floating network dependencies.
* Extend coverage by adding new categories/units to the tables and updating unit tests.

## Tips

* Use the reset button before switching categories to clear previous selections.
* Accessibility: the form supports full keyboard navigation and screen-reader friendly labels.
