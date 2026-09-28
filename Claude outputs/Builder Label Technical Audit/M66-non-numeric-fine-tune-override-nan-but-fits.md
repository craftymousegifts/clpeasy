# M66: a stored non-numeric fine-tune override can produce NaN renderer values while still reporting FIT

| | |
|---|---|
| ID | **M66** (new; continues after M65) |
| Area | Shared renderer `label-render.js` (`renderLabel()` fine-tune override handling); saved-label data validation |
| Status | **OPEN**. Found during the Issue #8 (M03) investigation; recording approved by Michaela on 28 Sep 2026. **Not fixed as part of M03.** |
| Origin | Pre-existing. |
| Regulatory significance | None assigned. This is a shared-renderer robustness/data-validation issue. |

## Finding
`renderLabel()` clamps each fine-tune override with `Math.min(Math.max(value, min), max)` whenever the option is not `null`/`undefined`:
- `hazardFSOverride`
- `scentFSOverride`
- `bizNameFSOverride`
- `typeFSOverride`
- `sigFSOverride`

A non-numeric value therefore survives as `NaN`. Probe, 60 mm circle Scented Candle, real Chromium, audit branch `9be7b2d`:

| `hazardFSOverride` | result |
|---|---|
| (none) | fits: true, hazard 2.217 mm |
| `'abc'` | **fits: true**, hazard font size `NaN`, `NaN` written into the SVG |
| `NaN` | **fits: true**, hazard font size `NaN`, `NaN` written into the SVG |
| `'7'` | coerced to 7 (fits: true, 1.615 mm) |
| `1000` / `0` | clamped to the allowed max / legibility floor (fits: true) |

## Context
- Normal Builder use saves only numbers or `null`: the +/− controls write clamped numbers, Reset writes `null`, and `NaN` cannot survive JSON storage (it becomes `null`).
- Damaged, hand-edited or legacy data can still hold an invalid value (for example a string).
- When the Builder opens such a record it restores the value unchanged and passes it to the renderer, so the Builder preview and exports can show broken hazard text while the label counts as fitting.
- **M03 (Issue #8)** makes the Print Sheet Composer pass only finite numbers, so the Composer is protected. It does **not** fix the renderer or the Builder path. **M66 remains independently OPEN after M03.**

## Not in scope of this record
No fix proposed or made. A future fix would need its own investigation and approval, because it touches the protected shared renderer and/or saved-label loading.
