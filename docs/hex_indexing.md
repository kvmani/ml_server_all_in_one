# Hexagonal Miller–Bravais Indexing Cheatsheet

This project supports both three‑index (Miller) and four‑index (Miller–Bravais) notation for hexagonal systems. The formulas below follow the International Tables for Crystallography (ITA, Vol. A) and standard texts such as B. D. Cullity & S. R. Stock, *Elements of X‑Ray Diffraction* (3rd ed., §3‑9).

## Directions (zone axes)

- Four‑index direction: `[u v t w]` with the hexagonal constraint `t = -(u + v)`.
- Three‑index direction: `[U V W]`.

Conversions:

- Three → Four  
  ```
  u = (2U − V) / 3
  v = (2V − U) / 3
  t = −(u + v)
  w = W
  ```
- Four → Three (with constraint enforced)  
  ```
  U = 2u + v
  V = u + 2v
  W = w
  ```

## Planes

- Four-index plane: `(h k i l)` with `i = -(h + k)`.
- Three-index plane: `(H K L)`.

Conversions:

- Three → Four  
  ```
  h = (2H − K) / 3
  k = (2K − H) / 3
  i = −(h + k)
  l = L
  ```
- Four → Three (with constraint enforced)  
  ```
  H = 2h + k
  K = h + 2k
  L = l
  ```

To avoid fractional indices after conversion, we scale by 3 when needed and reduce by the greatest common divisor so the four-index tuple uses the smallest possible integers.

## Notes

- The `t`/`i` component is always derived to maintain the basal-plane symmetry; inputs are coerced to satisfy the constraint.
- Direction formulas align zone axes with the hexagonal `a1`, `a2`, `a3`, `c` basis; plane formulas operate in the reciprocal basis.
- UI labels use `[uvw]`/`[uvtw]` for directions (zone axes) and `(hkl)`/`(hkil)` for planes to keep terminology consistent with diffraction practice.
