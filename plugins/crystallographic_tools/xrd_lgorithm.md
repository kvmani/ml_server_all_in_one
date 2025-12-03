# XRD Powder Diffraction Simulation Algorithm

> Draft design document for developers and users – pycrystallography / XRD module

---

## 1. Scope and Goals

This document specifies the end-to-end algorithm, software architecture, and physical principles for implementing an advanced X-ray powder diffraction (XRD) simulator in the pycrystallography codebase.

The tool will:

- Take phase information from one or more CIF files and instrument or sample parameters as input.
- Compute powder XRD patterns (intensity versus 2θ, with peak tables) using a trusted scientific stack, primarily pymatgen.
- Support an extensible architecture that can later accommodate:
  - Multi-phase mixtures (weighted patterns, phase fractions).
  - Rietveld-style refinement (parameterized model plus optimization loop).
- Return results as frontend-friendly JSON structures for web visualization.

This document is meant to serve both as:

- A developer guide for algorithms and architecture.
- A user-facing reference for the main physical concepts and equations behind the simulated patterns.

Non-goals for the initial version:

- Full Rietveld refinement (parameter optimization); only the forward model is designed now.
- Highly specialized geometries (for example grazing-incidence, capillary transmission with complex packing) beyond a standard Bragg–Brentano and simple transmission approximation.
- Total scattering or PDF (pair distribution function) analysis.

---

## 2. External Libraries and Ecosystem

### 2.1 Core scientific engines

Back-end computations should delegate crystallographic math and basic diffraction calculations to well-established libraries where possible:

- pymatgen
  - pymatgen.core.Structure – loading and representing structures from CIF.
  - pymatgen.analysis.diffraction.xrd.XRDCalculator – powder XRD peak positions and intensities from a structure.
- Optional in later phases
  - diffpy (diffpy.structure, diffpy.srfit, diffpy.srmise) – more advanced diffraction or PDF modeling.
  - GSAS-II, FullProf, TOPAS – external or reference codes for validation and, if desired, interoperation.

The initial implementation will use pymatgen’s XRDCalculator as the primary engine and apply additional correction factors (polarization, absorption, etc.) in our own domain layer as multiplicative terms where needed.

### 2.2 Recommended references (for principles and validation)

Developers and users are encouraged to consult the following classical references:

1. B. D. Cullity and S. R. Stock, Elements of X-Ray Diffraction, 3rd ed., Prentice Hall.
2. H. P. Klug and L. E. Alexander, X-Ray Diffraction Procedures, 2nd ed., Wiley.
3. R. A. Young (editor), The Rietveld Method, International Union of Crystallography / Oxford University Press.
4. H. M. Rietveld, A profile refinement method for nuclear and magnetic structures, Journal of Applied Crystallography 2, 65–71 (1969).
5. International Tables for Crystallography, Volume C: Mathematical, Physical and Chemical Tables (sections on powder diffraction and scattering factors).

These references underpin the physical models and correction factors summarized below.

---

## 3. Physical Principles of Powder XRD

This section gives a concise overview of the physics implemented by the simulator. Many of these are already partially handled by pymatgen.analysis.diffraction.xrd.XRDCalculator. Our design makes these factors explicit so that they can be extended or refined.

### 3.1 Bragg’s law and 2θ positions

For monochromatic X-rays of wavelength lambda, constructive interference from lattice planes with spacing d(hkl) occurs when Bragg’s law is satisfied:

2 d(hkl) sin(theta) = n lambda,  n = 1, 2, ...

In powder diffraction we typically use the first-order reflection n = 1, and report peaks as a function of

2θ = 2 arcsin(lambda / (2 d(hkl))).

The simulator computes d(hkl) from the crystal structure and Miller indices using the reciprocal lattice, then converts to 2θ for a given wavelength.

### 3.2 Structure factors and intensity

The structure factor for reflection hkl is

F(hkl) = sum over atoms j [ f\_j(Q) \* exp(2 pi i (h x\_j + k y\_j + l z\_j)) \* exp(-W\_j) ],

where f\_j(Q) is the atomic scattering factor for X-rays, (x\_j, y\_j, z\_j) are fractional atomic coordinates, and W\_j is the Debye–Waller (temperature) factor.

The kinematic intensity for a powder pattern can be written as

I(hkl) proportional to S \* m(hkl) \* |F(hkl)|^2 \* Lp(theta) \* A(theta) \* P\_pref(theta, phi),

where:

- S is a global scale factor (includes illuminated volume, incident flux, etc.).
- m(hkl) is the multiplicity (number of equivalent planes contributing at the same 2θ).
- Lp(theta) is the combined Lorentz–polarization factor.
- A(theta) is an absorption factor.
- P\_pref(theta, phi) encodes preferred orientation (often modeled by March–Dollase or similar functions in Rietveld analysis).

XRDCalculator already handles structure factors plus basic geometric factors; our domain layer can add or expose additional corrections explicitly.

### 3.3 Lorentz and polarization factors

For a Bragg–Brentano reflection geometry with unpolarized X-rays and a flat powder sample, the combined Lorentz–polarization factor is often written as

Lp(theta) = (1 + cos^2(2 theta)) / (sin^2(theta) cos(theta)).

If the X-ray beam is partially polarized, a polarization factor P(theta) can be expressed as

P(theta) = (1 + K cos^2(2 theta)) / (1 + K),

where K is the polarization ratio (for example K about 0.5 for typical laboratory setups with a monochromator). In that case, Lp can be factored as

Lp(theta) = L(theta) \* P(theta),

with L(theta) a pure Lorentz term.

Our simulator will allow different geometry presets (for example Bragg–Brentano or Debye–Scherrer capillary) and corresponding Lorentz–polarization expressions, and expose the effective factor to the user.

### 3.4 Absorption and micro-absorption

For a flat-plate reflection geometry and a sample of thickness t and linear absorption coefficient mu, a simple absorption factor is

A(theta) = [1 - exp(-2 mu t / sin(theta))] / [2 mu t / sin(theta)].

For very thick samples (mu t much greater than 1) this tends to approximately sin(theta) / (2 mu t). For thin or weakly absorbing samples A(theta) tends to 1.

Micro-absorption (in multi-phase and multi-grain-size samples) can significantly distort intensities. A full treatment is complex. Our initial design will:

- Allow a simple per-phase absorption coefficient mu\_p and apply a phase-specific factor A\_p(theta).
- Reserve hooks for more advanced micro-absorption models in the Rietveld phase.

### 3.5 Temperature factors (Debye–Waller)

Atomic thermal motion reduces intensity via the Debye–Waller factor, which is often parameterized by the isotropic B-factor. A common expression for the attenuation is

exp(-2 W\_j) = exp( - B\_j \* sin^2(theta) / lambda^2 ).

CIF files may carry B-factors or anisotropic displacement parameters. pymatgen’s XRD routines already use this information when present. We will expose the possibility to override or scale B-factors at the configuration level.

### 3.6 Peak profiles and instrumental broadening

Experimental peaks are not delta functions; they have profiles that reflect:

- Instrumental resolution (source, optics, detector).
- Sample microstructure (finite crystallite size, microstrain).
- Sample transparency and other effects.

A common Rietveld choice is the pseudo-Voigt profile, which combines Gaussian and Lorentzian line shapes with a mixing parameter eta. The full-width at half-maximum (FWHM) is often modeled by the Caglioti relation:

FWHM(2θ)^2 = U tan^2(theta) + V tan(theta) + W,

with U, V, W as instrument parameters.

For the initial (non-Rietveld) simulator we will:

- Support simple Gaussian or pseudo-Voigt peak shapes.
- Parameterize widths using a small set of instrument parameters (U, V, W, etc.).
- Convolve discrete Bragg intensities onto a regular 2θ grid.

The architecture will allow this profile engine to be upgraded in the Rietveld phase.

### 3.7 Preferred orientation (future)

Preferred orientation can be modeled via the March–Dollase function or similar models, introducing a factor P\_pref(theta, phi) that modifies intensities of certain reflections.

For now we will:

- Include a placeholder parameterization for a single preferred orientation axis and a March–Dollase parameter r.
- Implement this only in the forward model (calculated intensities) with parameters ready for later refinement.

---

## 4. Input and Output Contracts (XRD Domain Level)

We define the following domain-level models (Pydantic or dataclasses) as the public API of the XRD module.

### 4.1 XrdInstrumentConfig

Represents instrument and geometry settings:

- wavelength\_angstrom: float – X-ray wavelength (for example 1.54056 angstrom for Cu Kα1, or an effective value for Kα1/Kα2).
- radiation: string – label (for example "Cu Kα", "Mo Kα", "synchrotron").
- geometry: one of ("bragg\_brentano", "transmission") – measurement geometry.
- divergence\_slits: string or null – descriptive (fixed, variable).
- polarization\_ratio\_K: float or null – for polarization factor; if null, use default per-geometry.
- lp\_model: one of ("auto", "bragg\_brentano\_standard", "custom") – which Lorentz–polarization model to use.

### 4.2 XrdRangeConfig

Defines the 2θ grid:

- two\_theta\_min\_deg: float
- two\_theta\_max\_deg: float
- two\_theta\_step\_deg: float

### 4.3 XrdPhaseConfig

Per-phase information:

- phase\_name: string
- cif\_path: Path
- scale\_factor: float (default 1.0) – relative scale or weight (for multi-phase mixtures).
- absorption\_mu\_cm: float or null – linear absorption coefficient at the chosen wavelength.
- preferred\_orientation\_axis: integer triplet or null – hkl or direction for March–Dollase.
- preferred\_orientation\_r: float (default 1.0) – r = 1 is random; r not equal to 1 indicates preferred orientation.
- use\_adps\_from\_cif: bool (default true) – whether to read B-factors or ADPs from CIF.

### 4.4 XrdProfileConfig

Peak profile and broadening:

- profile\_type: one of ("gaussian", "pseudo\_voigt") – default pseudo\_voigt.
- U: float = 0.0
- V: float = 0.0
- W: float = 0.0
- eta0: float = 0.5 – base pseudo-Voigt mixing.
- size\_L\_nm: float or null – optional Scherrer crystallite size.
- microstrain: float or null – optional microstrain parameter.

### 4.5 XrdSimulationConfig

Top-level configuration for a simulation run:

- instrument: XrdInstrumentConfig
- range: XrdRangeConfig
- phases: list of XrdPhaseConfig
- profile: XrdProfileConfig
- background\_model: one of ("none", "constant", "polynomial") – default "none".
- background\_params: dictionary of background parameters.

### 4.6 Output: XrdPattern and XrdPeak

XrdPattern represents the final pattern sampled on a regular 2θ grid:

- two\_theta: list of float – 2θ grid.
- intensity\_total: list of float – total intensity at each grid point.
- intensity\_by\_phase: mapping from phase\_name to list of float – optional per-phase contributions.
- background: list of float – background intensity on the same grid.
- peaks: list of XrdPeak – list of Bragg peaks (before broadening).
- metadata: dictionary – details (wavelength, geometry, configs).

XrdPeak (per reflection):

- phase\_name: string
- hkl: integer triplet
- two\_theta\_deg: float
- d\_angstrom: float
- intensity\_raw: float – from structure factor, multiplicity, Debye–Waller.
- intensity\_corrected: float – after applying LP, absorption, preferred orientation.
- multiplicity: int

The web API returns XrdPattern as a JSON-serializable dictionary.

---

## 5. Backend Algorithm – Single-Phase XRD Simulation

This section describes the forward model for one phase. Multi-phase mixtures are handled by repeating this for each phase and summing contributions.

### 5.1 Load structure from CIF

1. Read CIF into a Structure using pymatgen.core.Structure.from\_file(cif\_path).
2. Optionally standardize to a conventional cell and validate space group and composition for logging.

### 5.2 Generate Bragg reflections using XRDCalculator

3. Instantiate XRDCalculator with:

   - wavelength set from instrument.wavelength\_angstrom.
   - additional options (for example debye\_waller\_factors or symprec) as needed.

4. Compute peak list using XRDCalculator.get\_pattern(structure, two\_theta\_range=(tmin, tmax)). This returns a pymatgen XRDPattern object with:

   - x – 2θ values for each peak.
   - y – corresponding intensities (including structure factors, multiplicity, and basic geometric factors).
   - hkls – lists of hkl and multiplicity grouped per 2θ.

5. Flatten pymatgen peaks:

   - Iterate over pattern.hkls and pattern.x, pattern.y to create a per-phase, per-hkl XrdPeak list:
     - For each reflection group at 2θ\_i, and for each hkl record r in hkls[i], extract hkl, multiplicity, and the group intensity pattern.y[i].

6. For each hkl store base peak data: two\_theta\_deg, d\_angstrom from Bragg’s law, intensity\_raw from pymatgen.

### 5.3 Apply Lorentz–polarization and polarization corrections

7. For each peak, compute Lp(theta) based on the selected geometry and polarization model.

   - Convert 2θ to theta in radians.
   - For default Bragg–Brentano geometry, compute Lp(theta) using the standard expression.
   - If instrument.polarization\_ratio\_K is provided, refine the polarization term using the chosen formula.

8. Multiply intensities:

   - I\_lp = intensity\_raw \* Lp(theta).

Depending on what XRDCalculator already includes, this step may be:

- A no-op if Lp is already fully accounted for and consistent with our model.
- A relative correction if we want a different geometry or explicit polarization tuning.

### 5.4 Apply absorption corrections

9. If phase.absorption\_mu\_cm and a sample thickness t are known, compute an absorption factor for each peak using the expression in Section 3.4.

10. Multiply intensities:

- I\_abs = I\_lp \* A(theta).

If absorption data is not known, set A(theta) = 1.

### 5.5 Preferred orientation (optional)

11. If preferred orientation is enabled (preferred\_orientation\_axis is not null and r not equal to 1):

- Compute the angle alpha between the reflection direction and the preferred orientation axis.
- Apply a March–Dollase factor P\_pref(alpha) (see reference [3]).

12. Multiply intensities:

- I\_corr = I\_abs \* P\_pref(alpha).

### 5.6 Scale and store corrected peaks

13. Apply phase scale factor:

- I\_phase = phase.scale\_factor \* I\_corr.

14. Finalize XrdPeak records for this phase, setting intensity\_corrected = I\_phase.

At this stage, we have a list of discrete Bragg peaks for the phase, each with corrected intensity.

### 5.7 Convolution onto 2θ grid (profile engine)

15. Construct a continuous 2θ grid from range.two\_theta\_min\_deg, two\_theta\_max\_deg, and two\_theta\_step\_deg.

16. For each peak at 2θ\_i with intensity I\_i, compute its profile contribution on the grid:

- For each grid point 2θ\_g, compute delta = 2θ\_g - 2θ\_i.
- Compute FWHM using the chosen profile model (for example the Caglioti relation) and instrument parameters U, V, W.
- Generate a Gaussian, Lorentzian, or pseudo-Voigt line shape centered at 2θ\_i with that FWHM.

17. Accumulate contributions:

- For each grid point, sum contributions from all peaks of the phase: I\_phase(2θ\_g) = sum over i [ I\_i \* p\_i(2θ\_g) ], where p\_i is the normalized profile of peak i.

18. Store per-phase intensities in intensity\_by\_phase[phase\_name].

19. Apply background model:

- Compute background(2θ\_g) using the chosen model (none, constant, or polynomial).

20. Sum all phases and background:

- intensity\_total(2θ\_g) = background(2θ\_g) + sum over phases I\_phase(2θ\_g).

Result: a fully simulated XRD pattern on a regular grid, for one or more phases.

---

## 6. Multi-Phase Patterns and Future Rietveld Support

### 6.1 Multi-phase mixture (forward model)

The forward model naturally supports multiple phases:

- For each XrdPhaseConfig, compute its XrdPeak list and gridded intensity I\_phase(2θ\_g).
- Apply phase-specific absorption and orientation corrections.
- Sum contributions across phases.

Relative phase fractions are reflected primarily in the scale factors and absorption coefficients. Later, these can be refined parameters in a Rietveld loop.

### 6.2 Rietveld-ready parameterization (future)

To support Rietveld refinement in a later phase, we design the XRD module around the idea of:

1. A parameter vector p containing:

   - Lattice parameters (a, b, c, alpha, beta, gamma) for each phase.
   - Phase scale factors.
   - Profile parameters (U, V, W, eta, size, strain).
   - Preferred orientation parameters (r, axis).
   - Background parameters.
   - Zero shift or sample displacement.

2. A forward model I\_calc(2θ; p) implemented by the algorithm above.

3. A residual function to be minimized against experimental data I\_obs(2θ):

   R(p) = sum over grid points g [ w\_g ( I\_obs(2θ\_g) - I\_calc(2θ\_g; p) )^2 ],

   with appropriate weights w\_g. Optimization can be implemented later using standard least-squares libraries.

The current design ensures that all essential physics is in the forward model, so adding Rietveld later requires primarily a parameter layer and an optimizer, not a rewrite of the XRD engine.

---

## 7. Web API Layer Responsibilities (XRD)

The web API interface mirrors the XRD domain models.

1. Endpoint definition

   - POST /api/v1/diffraction/xrd/simulate
   - Request body: JSON corresponding to XrdSimulationConfig.

2. Validation

   - Verify that all cif\_path entries exist.
   - Validate ranges (2θ minimum less than maximum, step greater than 0).
   - Check reasonable instrument parameters (wavelength > 0, geometry known).

3. Execution

   - Convert JSON to XrdSimulationConfig.
   - Call XrdSimulator.simulate(config).
   - Handle errors (bad CIF, inconsistent parameters) and return HTTP 4xx or 5xx responses with useful messages.

4. Response

   - Return serialized XrdPattern as JSON:
     - two\_theta, intensity\_total, intensity\_by\_phase, background, peaks, metadata.

5. Logging and diagnostics

   - Log simulation parameters and runtime.
   - Optionally store sample results for regression and benchmarking.

The API must remain thin and stateless, delegating all physics to the domain layer.

---

## 8. Frontend and Visualization Responsibilities (XRD)

The React frontend consumes the XrdPattern JSON and focuses on visualization and user interaction, not physics.

### 8.1 Data usage

The frontend should:

- Plot intensity versus 2θ using two\_theta and intensity\_total.
- Optionally overlay per-phase curves using intensity\_by\_phase.
- Display peak markers and labels from peaks (2θ position plus hkl plus phase name).
- Show metadata such as wavelength, geometry, and phase list.

### 8.2 Recommended controls

1. View controls (trigger API calls):

   - 2θ range selection.
   - Choice of wavelength or radiation (Cu Kα, Mo Kα, etc.).
   - Geometry selection (Bragg–Brentano versus transmission).
   - Inclusion or exclusion of phases (checkbox per phase).
   - Optional toggles for applying or removing LP or absorption corrections (for teaching or sensitivity analysis).

2. Visual style controls (frontend-only):

   - Linear versus log-intensity scaling.
   - Line style and color per phase.
   - Peak marker style and size.
   - Background color and gridlines.

3. Interaction tools:

   - Zoom and pan in 2θ.
   - Hover tooltip showing 2θ, d-spacing, intensity, hkl, and phase.
   - Toggle showing and hiding peak labels.

4. Export tools:

   - Export current pattern as CSV or JSON.
   - Download plot as PNG or SVG.

The frontend should treat the backend as a pure simulation service; no crystallographic formulas should be re-implemented in JavaScript.

---

## 9. Testing, Validation, and Benchmarks

To ensure correctness and stability:

1. Unit tests

   - Verify that XrdSimulationConfig validation catches invalid setups.
   - Test that single-phase patterns for canonical structures (simple cubic, bcc, fcc) match known peak positions and multiplicities.

2. Comparisons with reference tools

   - Cross-check selected patterns with outputs from GSAS-II, FullProf, or other tools for the same structure, wavelength, and geometry.
   - Compare intensity ratios of key peaks with literature data.

3. Property-based tests

   - Invariance of intensities under symmetry-equivalent hkl sets.
   - Reasonable behavior under parameter changes (for example increasing U should broaden peaks).

4. Performance tests

   - Measure runtime as a function of maximum Miller index and number of phases.
   - Ensure that vectorization and caching keep simulations fast enough for interactive web use.

5. Image regression tests (optional)

   - Generate reference PNG plots for a handful of patterns and use image regression to guard against accidental visual regressions.

---

## 10. Extensibility Notes

This XRD module is designed for incremental extension:

- Multi-phase mixing is already supported via phases and summed intensities.
- Rietveld refinement can be added on top by:
  - Defining a parameter vector and bounds.
  - Implementing residual and (optionally) gradient functions.
  - Plugging into a least-squares optimizer.
- Advanced geometries and microstructure models can be integrated by extending:
  - XrdInstrumentConfig (for example GI-XRD parameters, capillary radius).
  - XrdProfileConfig (for example anisotropic broadening, more complex line shapes).
  - Per-phase micro-absorption or strain models.

The core principles remain the same:

- Use pymatgen and other trusted libraries for crystallographic computations.
- Keep physics and parameterization in the Python domain layer.
- Provide a stable JSON contract to the web frontend.
- Maintain testable, deterministic simulations suitable for both research and teaching.

