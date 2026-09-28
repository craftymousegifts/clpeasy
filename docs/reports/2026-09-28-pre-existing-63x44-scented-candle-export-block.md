# Pre-existing defect: 63×44 mm Scented Candle label is export-blocked (footer clips)

**Status:** OPEN, recorded only. **Not fixed in Stage 2 (PR #161).** No renderer or fit logic was changed.
**Found:** 27 Sep 2026, during Stage 2 physical-size regression QA.
**Re-confirmed:** 28 Sep 2026.

## What happens
A minimal **Scented Candle** label on a custom **63 × 44 mm rectangle** is blocked from every export (PNG, SVG, PDF). The reason is that its footer/bottom content clips (`window._footerLegibilityClipped === true`, which sets `window._labelBlockDownload`). The customer sees the standard "…make sure your label content fits at a readable size…" message.

The **Wax Melt** control label, built from the same minimal content at the same 63 × 44 mm size, fits and is not blocked.

## Minimal reproduction (Builder, signed out)
- Product name "Stage2 QA"; business name "QA Candles"; phone "0123"; address "TE1 1ST" or "TE1".
- Shape: rectangle, custom 63 × 44 mm. No net weight, burn time or batch number.
- Hazard data: each of the following still clips as a Scented Candle:
  1. Signal word Warning, H317, P261 P501
  2. Signal word Warning, H317 only
  3. No hazard data at all

| Build | Product type | footer clipped | export blocked |
|---|---|---|---|
| main `fc5fd59` (Stage 2 base) | Scented Candle | true (all 3 cases) | true |
| main `d625bec` (current main, 28 Sep) | Scented Candle | true (all 3 cases) | true |
| main `d625bec` | Wax Melt | false (all 3 cases) | false |
| Stage 2 branch | Scented Candle | true (all 3 cases) | true |

It reproduces on main, both before and after Stage 2's base. **Stage 2 did not introduce it.** Stage 2 does not touch `label-render.js` or any fit/footer logic.

## Notes for whoever picks this up
- This may relate to the candle-specific footer content at small rectangle sizes. It has not been investigated. It sits in protected label-fit/regulatory layout territory, so any fix needs its own investigation and owner approval.
- The Stage 2 tests and regression QA use a Wax Melt at 63 × 44 mm for the rectangle case for this reason.
