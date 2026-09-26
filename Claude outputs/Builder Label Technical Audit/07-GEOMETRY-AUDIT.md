# 07 — Geometry Audit

## Supported geometries in current `main`

- **UI:** three shape cards (circle, rectangle, square) and one custom dimension input (width; height for rectangles). **There are no size-preset buttons any more.** The initial state is `size: 52` (a preset value) → 52 mm circle / 52 × 36 mm rectangle / 52 mm square until the user types a size.
- **Custom limits** (`isCustomSizeBelowSupportedMinimum`): circle/square ≥ 52 mm; rectangle long side ≥ 52 mm and short side ≥ 36 mm; all clamped to 10–150 mm (`onDimInput`, `getLabelDims`). `custom-h` has `max="200"` but the value is silently clamped to 150 (ISSUE LOW).
- **Legacy saved labels** with preset sizes (e.g. 35, 40, 45) reopen as presets and are exempt from the custom minimum (fit engine still applies — 35 mm probe was blocked). UNCERTAIN LOW.
- Rectangle preset height = `round(width × 0.7)`.

## Shape geometry (canonical 260-unit-wide layout space)

| | Circle | Square | Rectangle |
|---|---|---|---|
| Shape box | r = min(pw,ph)/2 − 1.5 | side = min(pw,ph) − 4, rx 5 | inset 2 units, rx 4 |
| Header band | 20 % of shape height | 20 % | 20 % |
| Footer band | 15 % (19 % candles) | same | same |
| Width at a given y | chord × (1 − inset) | constant | constant |
| Hazard text width | chord at **first line of each block** − 2 mm each side | constant − 2 mm | constant − 2 mm |
| Clip | `<clipPath>` = shape → anything outside is **invisible, not flagged** | same | same |
| viewBox | `0 0 260 260·H/W`; outer width/height = display or 600 dpi export; SVG download width/height in mm | | |

Exported physical dimensions: PNG = mm/25.4 × 600 px; SVG `width="{mm}mm"`; PDF page `@page size: W mm H mm`. PASS.

## Findings per geometry (from 144 real-browser renders — see 08)

| Geometry | Result |
|---|---|
| **Circle (all sizes)** | **Mandatory P/H text lines extend past the circle edge and are clipped, while the label reports `fits:true`** (12 of 26 fitting circle renders: 11 of 16 on the 100 mm circle, 1 of 8 on 63 mm; up to 4.5 mm of a line cut off). Root cause: `_layoutHazard()` computes one wrap width per block at its first line; in the lower half of the circle later lines need a narrower chord. **CRITICAL**. Curved product name overlaps business name for names ≳ 15 characters (all sizes 52–150 mm) — **HIGH**. Footer phone line 0.1 mm from edge and candle icon corners clipped on 52 mm — LOW. |
| Square 63 | No clipping/overlap detected on fitting labels. Product-name collapse to floor size when wrapping (M46). |
| Rectangle 52 × 36 (default) | Even the simplest candle label (1 pictogram, H317, 2 P, 1 sensitiser, address + phone) is **blocked**. Only the "missing optional" case fits. |
| Rectangle 63 × 44 (historic) | Same: simplest realistic candle label blocked (`hazard-text-overflow`, `footer-clipped`); the minimal case (1 H, no P, no sensitiser, no address) fits. The historic SCENTED CANDLE / WARNING overlap is now prevented by blocking — visible, not silent. |
| Rectangle 80 × 100 (historic custom) | Fits cases 01, 02, 04 (max H), 05 (max P), 07, 08, 09–11, 13–18; blocks long address and heavy combined payload. No clipping/overlap on fitting renders. PASS. |
| Rectangle 150 × 40 | Blocks almost everything: header/footer bands scale with the 40 mm height; wide label gives no extra lines. In the blocked render, underlying text overlapped candle icons (hidden behind overlay — not exported). |
| Circle 100 | Clipping bug most visible at larger circles because more P lines wrap in the lower half. |

## Custom-size calculation

`getLabelDims` is the single source for mm and layout space (Builder's legacy `getDims` duplicates it identically for outer sizing). Circle/square force H = W. Missing customH on a rectangle → 40 mm. PASS.
