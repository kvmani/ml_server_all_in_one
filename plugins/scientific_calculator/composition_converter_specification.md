# Composition Converter Plugin – Specification

## 1. Purpose & Scope

The Composition Converter should be part of the "Scientifc Calculator" plugin as additional tab (in addition to current tabs : Calculator and functon plotter) and provides a browser-based tool to convert alloy compositions between mass/weight percentage and atomic percentage, for arbitrary multi-element alloys, entirely within an air-gapped intranet environment.

Key goals:

- Allow users to enter compositions as mass% or at%, with any number of elements.
- Support a balance element row.
- Convert between Mass% → At% and At% → Mass%.
- All processing in-memory, zero logging, cross‑browser compatible.

## 2. User Stories
(omitted for brevity in this file—full version previously shown)

## 3. UI/UX Specification

### ASCII Wireframe
```
+----------------------------------------------------------------------------------+
| Composition Converter                                                            |
|----------------------------------------------------------------------------------|
|  Conversion: [● Mass% → Atomic%]  [○ Atomic% → Mass%]                           |
|----------------------------------------------------------------------------------|
|  Elements:                                                                       |
|  +----+---------+----------+-----------+------------+-----------+               |
|  | #  | Element |  Role    | Input  %  | Output  %  |  Action   |               |
|  +----+---------+----------+-----------+------------+-----------+               |
|  | 1  | [ Nb ]  | [Normal] | [ 2.5  ] |  0.XX      | [Remove]  |               |
|  | 2  | [ Zr ]  | [Balance]| [ ---  ] |  0.YY      | [Remove]  |               |
|  +----+---------+----------+-----------+------------+-----------+               |
|  [ + Add element ]   [ Convert ]   [ Reset ]                                     |
|----------------------------------------------------------------------------------|
```

## 4. Functional Requirements

### 4.1 Conversion Logic

**Mass% → At%**
nᵢ = wᵢ / Aᵢ  
xᵢ = nᵢ / Σ nⱼ  
at% = 100·xᵢ

**At% → Mass%**
xᵢ = at%ᵢ / 100  
mᵢ = xᵢ·Aᵢ  
wt% = 100·mᵢ / Σ mⱼ

### Balance element handling
- Only 0 or 1 balance row allowed.
- If 1 balance element: p_balance = 100 - Σ(non-balance inputs).

## 5. Backend Design

POST `/api/v1/composition_converter/convert`

Request:
```
{
  "mode": "mass_to_atomic",
  "elements": [
    {"symbol": "Nb", "role": "normal", "input_percent": 2.5},
    {"symbol": "Zr", "role": "balance", "input_percent": null}
  ]
}
```

Response:
```
{
  "elements": [...],
  "input_sum": 100.0,
  "output_sum": 100.0,
  "warnings": []
}
```

## 6. Frontend Design

React page `/composition-converter`:
- Dynamic table for elements.
- Conversion toggle.
- Summary area.
- Error display.

## 7. Privacy & Security
- No logs of composition.
- No user data persisted.
- Local atomic weight table only.

## 8. Testing
- Backend: unit tests for conversion.
- Frontend: E2E for add/remove/convert workflows.

