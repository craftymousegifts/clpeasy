# 04 — Pictogram Audit

## Supported pictograms and mapping (builder.html `H_PICTO_MAP`)

| Key | GHS | Mapped from |
|---|---|---|
| explosion | GHS01 | H200–H205, H240, H241 |
| flame | GHS02 | H223–H228, H242, H250–H252, H260, H261 |
| oxidiser | GHS03 | H270–H272 |
| gas | GHS04 | H280–H284 |
| corrosive | GHS05 | H290, H314, H318 |
| skull | GHS06 | H300, H301, H310, H311, H330, H331 |
| exclamation | GHS07 | H302, H312, H315, H316*, H317, H319, H332, H335, H336 |
| health | GHS08 | H304, H334, H340–H373 |
| aquatic | GHS09 | H400, H410, H411 (not H412/H413) |

\* H316 is blocked anyway as GB-unsupported.

## Pipeline

- **Deduplication:** `[...new Set(data.pictograms)]` in the renderer; `syncPictogramsFromH` also avoids duplicates. PASS.
- **Ordering:** order in which pictograms were added (Smart Paste: order of first H code needing each). No canonical order. (C)
- **Precedence rules:** none. H301 + H317 renders skull **and** exclamation mark (probe 8); H318 + H315 renders corrosive **and** exclamation. GB CLP has pictogram-precedence rules (GHS06/GHS05/GHS08 suppress GHS07 in defined cases) — **needs verification against the primary text; not implemented.** (D → likely B-category issue)
- **Unknown key:** `ghsPicto()` silently falls back to the exclamation mark for any key not in `GHS_IMG` (probe 9: `'nonsense'` rendered GHS07, `fits:true`). Only reachable through corrupted/legacy saved data. ISSUE MEDIUM.
- **Assets:** JPEG raster diamonds with baked-in red border, square canvas, `preserveAspectRatio="xMidYMid meet"` → aspect ratio and border always intact (verified 9 assets fill canvas — existing test). In PNG export the JPEGs are converted to PNG first. Raster resolution vs 600 dpi print not assessed.

## Sizing (label-render.js)

| Constant | Value | Meaning | Source |
|---|---|---|---|
| `PICTO_FLOOR_SQUARE_MM` | 10 | red-square side floor (100 mm²) | A (as interpreted in code comments — verify) |
| `PICTO_TARGET_OUTER_BBOX_MM` | 16 | preferred outer diamond bounding box ("if possible") | B (explicit Michaela decision: 16 mm = outer bbox, not square side) |
| `PICTO_TARGET_SQUARE_MM` | 11.31 | derived square side | B |

Algorithm: try 11.31 mm → if content fits, use it; else try 10 mm → if still not fitting, keep 10 mm and block; else bisect to 0.1 mm. Measured across 52 fitting stress labels: 10.74–11.31 mm square side. Never below 10 mm.

**Regulatory question (D, HIGH):** the code implements an absolute 10 × 10 mm floor and a 16 mm "if possible" target. It does **not** implement any rule relating pictogram size to label area (CLP Annex I 1.2.1 is commonly summarised as "each pictogram shall cover at least one fifteenth of the minimum surface area of the label, and not less than 1 cm²"). Whether and how that applies to CLPeasy's labels, and whether "10 × 10 mm" refers to the red square side or the diamond footprint, must be verified against the current GB text before any change. Primary sources were unreachable from this environment.

## Spacing / placement (measured)

- Gap between diamonds: 4 % of pictogram size (~0.45 mm); row gap 18 %.
- Rows wrap when more pictograms than fit at the chosen size; slot reserved up front.
- Pictograms placed flush to the bottom of their slot; centred horizontally.
- 144 renders: **no pictogram diamond tip outside the label shape; no pictogram/text overlap** on any fitting label. PASS.
- One / two / three / four pictograms tested on every geometry (cases 09, 10, 11, 04). 4 pictograms fit on 63 mm circle and 80×100 when text allows.

## Across outputs

| Output | Pictogram |
|---|---|
| Builder preview / SVG / PDF / PNG | same `<image>` markup, same size (canonical layout) |
| Composer sheet export | `<symbol>`/`<use>` pooled — same size (existing test `print-sheet-export-fidelity.js`) |

## EN 15494 candle icons

- Shown only for 6 candle product types, when not hidden and **both** dimensions ≥ 40 mm; below that they are **silently omitted** (e.g. the default 52 × 36 rectangle). The Step 1 red notice explains they may go on packaging and offers a hide checkbox. (B)
- 5 mm floor, 5.5/8 mm target; `candle-safety-symbols-too-small` blocks if the floor can't fit — not reachable in the sweep (40–150 mm), so latent.
- On the 52 mm circle the outer icons' bottom corners fall slightly outside the circle (clipped by < 0.5 mm) and the phone line sits 0.11 mm from the edge (`EVIDENCE__01-short-simple__circle-52-default…png`). ISSUE LOW.
