# 08 — Stress Test Results

## Method

- 18 synthetic fixtures × 8 geometries = **144 renders** through the real `label-render.js` in headless Chromium 141 (Playwright), with the same Google Fonts link Builder uses. No production data.
- Harness: `harness/run-audit.js`, fixtures `harness/fixtures.js`, raw output `harness/results.json`. Re-run from repo root: `node "Claude outputs/Builder Label Technical Audit/harness/run-audit.js"` (needs `npm ci` with `PUPPETEER_SKIP_DOWNLOAD=1` only for the existing tests; the harness uses the globally installed Playwright).
- For every render: `fits`/`blockReason`/warnings, pictogram size, every text line's real glyph extents (`getExtentOfChar`), whether each line's ink band lies inside the label shape, text/text and text/pictogram overlaps, arc-text length vs arc path, and presence of every expected string in the SVG.
- Environment limitation: Georgia is not installed in the container (serif fell back to DejaVu Serif); see 09 for font consequences. Results for which font is drawn are **not** representative of Windows/macOS/iOS.

## Summary

| Metric | Result |
|---|---|
| Renders | 144 (52 fit, 92 blocked) |
| Block reasons | hazard-text-overflow 85, footer-clipped 56, business-name-too-small 2 |
| Content missing from markup on a fitting label | **0** (nothing is ever truncated or dropped) |
| Fitting labels with a mandatory text line partly outside the label (clipped, invisible) | **12** — all circles |
| Fitting labels with candle icons partly outside the label | 2 (52 mm circle) |
| Fitting labels with text/text or text/pictogram overlap (straight text) | 0 |
| Curved product name overlapping business name | every circle with a name ≳ 15 characters (separate probe, 30 renders, `screenshots/EVIDENCE__arc-product-name-vs-business-name__circle-63.png`) |
| Smallest mandatory font on a fitting label | 1.199 mm (= floor) |
| Pictogram red-square side on fitting labels | 10.74 – 11.31 mm |
| Arc text longer than its path (glyphs dropped) | 0 |
| Resolution invariance (200 px / 900 px / export) | identical inner SVG |

## Fit matrix (FIT = exportable; ⚠ = defect detected on an exportable label; (pictogram square side, smallest font))

| Case | circle-52-default | circle-63 | circle-100 | square-63 | rect-52x36-default | rect-63x44 | rect-80x100 | rect-150x40 |
|---|---|---|---|---|---|---|---|---|
| 01-short-simple | FIT ⚠ BCF-ICON-OUTSIDE-SHAPE (11.31mm, min 1.27mm) | FIT (11.31mm, min 1.82mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.88mm) | FIT (11.31mm, min 1.82mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.31mm) | BLOCKED |
| 02-long-product-name | BLOCKED | FIT (11.31mm, min 1.35mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.50mm) | FIT (11.31mm, min 1.20mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 1.20mm) | BLOCKED |
| 03-long-supplier-address | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| 04-max-H | BLOCKED | BLOCKED | FIT (11.31mm, min 2.05mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.42mm) | BLOCKED |
| 05-max-P | BLOCKED | BLOCKED | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 1.51mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.47mm) | BLOCKED |
| 06-several-EUH | BLOCKED | BLOCKED | FIT (11.31mm, min 2.16mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.97mm) | BLOCKED |
| 07-multi-sensitisers | BLOCKED | FIT (10.9mm, min 1.20mm) | FIT (11.31mm, min 2.27mm) | FIT (10.74mm, min 1.20mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.19mm) | BLOCKED |
| 08-long-sensitiser-names | BLOCKED | BLOCKED | FIT (11.31mm, min 2.16mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.97mm) | BLOCKED |
| 09-one-pictogram | BLOCKED | FIT (11.31mm, min 1.33mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.48mm) | FIT (11.31mm, min 1.32mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.31mm) | BLOCKED |
| 10-two-pictograms | BLOCKED | FIT (11.31mm, min 1.33mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.48mm) | FIT (11.31mm, min 1.32mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.31mm) | BLOCKED |
| 11-three-plus-pictograms | BLOCKED | BLOCKED | FIT (11.31mm, min 2.27mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.47mm) | BLOCKED |
| 12-heavy-combined | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| 13-special-chars | BLOCKED | FIT (11.31mm, min 1.37mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.54mm) | FIT (11.31mm, min 1.36mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.31mm) | BLOCKED |
| 14-missing-optional | FIT ⚠ BCF-ICON-OUTSIDE-SHAPE (11.31mm, min 1.58mm) | FIT (11.31mm, min 1.91mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 3.03mm) | FIT (11.31mm, min 1.91mm) | FIT (11.15mm, min 1.20mm) | FIT (11.31mm, min 1.45mm) | FIT (11.31mm, min 2.42mm) | BLOCKED |
| 15-long-candle | BLOCKED | BLOCKED | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 1.32mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 2.20mm) | BLOCKED |
| 16-long-wax-melt | BLOCKED | FIT ⚠ OUTSIDE-SHAPE (10.74mm, min 1.20mm) | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.24mm) | FIT (11.31mm, min 1.25mm) | BLOCKED | BLOCKED | FIT (11.31mm, min 2.31mm) | BLOCKED |
| 17-long-diffuser | BLOCKED | BLOCKED | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 1.98mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 1.32mm) | BLOCKED |
| 18-long-room-spray | BLOCKED | BLOCKED | FIT ⚠ OUTSIDE-SHAPE (11.31mm, min 2.03mm) | BLOCKED | BLOCKED | BLOCKED | FIT (11.31mm, min 2.02mm) | BLOCKED |

## Defects on labels reported as fitting

| Case | Geometry | Detected |
|---|---|---|
| 01-short-simple | circle-52-default | BCF-ICON-OUTSIDE-SHAPE: candle icon 1 corner outside label<br>BCF-ICON-OUTSIDE-SHAPE: candle icon 5 corner outside label |
| 01-short-simple | circle-100 | OUTSIDE-SHAPE: "and container in accordance with local r" (edge -1.05mm) |
| 02-long-product-name | circle-100 | OUTSIDE-SHAPE: "occurs: get medical advice. Dispose of c" (edge -0.5mm) |
| 05-max-P | circle-100 | OUTSIDE-SHAPE: "CENTRE or doctor if you feel unwell. Get" (edge -0.71mm)<br>OUTSIDE-SHAPE: "Rinse mouth. Do NOT induce vomiting. If " (edge -1.65mm)<br>OUTSIDE-SHAPE: "advice. If eye irritation persists: get " (edge -1.15mm)<br>OUTSIDE-SHAPE: "well-ventilated place. Keep container ti" (edge -2.64mm) |
| 09-one-pictogram | circle-100 | OUTSIDE-SHAPE: "occurs: get medical advice. Dispose of c" (edge -0.26mm) |
| 10-two-pictograms | circle-100 | OUTSIDE-SHAPE: "occurs: get medical advice. Dispose of c" (edge -0.26mm) |
| 13-special-chars | circle-100 | OUTSIDE-SHAPE: "occurs: get medical advice. Dispose of c" (edge -0.85mm) |
| 14-missing-optional | circle-52-default | BCF-ICON-OUTSIDE-SHAPE: candle icon 1 corner outside label<br>BCF-ICON-OUTSIDE-SHAPE: candle icon 5 corner outside label |
| 14-missing-optional | circle-100 | OUTSIDE-SHAPE: "with long lasting effects." (edge -0.63mm) |
| 15-long-candle | circle-100 | OUTSIDE-SHAPE: "protective gloves/eye protection. IF ON " (edge -0.01mm)<br>OUTSIDE-SHAPE: "cautiously with water for several minute" (edge -1.94mm)<br>OUTSIDE-SHAPE: "Collect spillage. Dispose of contents an" (edge -1.55mm) |
| 16-long-wax-melt | circle-63 | OUTSIDE-SHAPE: "irritation or rash occurs: get medical a" (edge -0.89mm) |
| 16-long-wax-melt | circle-100 | OUTSIDE-SHAPE: "environment. IF ON SKIN: wash with plent" (edge -1.27mm)<br>OUTSIDE-SHAPE: "water for several minutes. If skin irrit" (edge -1.84mm)<br>OUTSIDE-SHAPE: "spillage. Dispose of contents and contai" (edge -1.79mm) |
| 17-long-diffuser | circle-100 | OUTSIDE-SHAPE: "breathing vapours and dust. Avoid releas" (edge -0.36mm)<br>OUTSIDE-SHAPE: "POISON CENTRE or doctor. Do NOT induce v" (edge -1.69mm)<br>OUTSIDE-SHAPE: "EYES: rinse cautiously with water for se" (edge -1.94mm)<br>OUTSIDE-SHAPE: "advice. Store in a well-ventilated place" (edge -2.27mm) |
| 18-long-room-spray | circle-100 | OUTSIDE-SHAPE: "flame or other ignition source. Keep con" (edge -0.28mm)<br>OUTSIDE-SHAPE: "IF IN EYES: rinse cautiously with water " (edge -1.88mm)<br>OUTSIDE-SHAPE: "advice. If skin irritation or rash occur" (edge -3.25mm)<br>OUTSIDE-SHAPE: "container tightly closed. Dispose of con" (edge -4.51mm) |

Visual proof (left = as shipped with clip; right = clip removed, red = real label edge):
`screenshots/EVIDENCE__18-long-room-spray__circle-100__clipped-vs-unclipped.png`,
`EVIDENCE__16-long-wax-melt__circle-63__clipped-vs-unclipped.png`,
`EVIDENCE__05-max-P__circle-100__…`, `EVIDENCE__15-long-candle__circle-100__…`, `EVIDENCE__01-short-simple__circle-100__…`, `EVIDENCE__01-short-simple__circle-52-default__…`.

## Targeted probes (harness `__probes`)

| # | Probe | Result |
|---|---|---|
| 1 | Empty business name/address/phone | renders **"Your Brand"**, fits:true |
| 2 | EUH208 with no sensitiser names | prints **"Contains: sensitising substance"**, fits:true |
| 3 | H317 + EUH208 | single merged "Contains:" list + "May produce an allergic reaction." |
| 4 | Duplicate codes | printed twice |
| 5 | P280 with/without items | with: "Wear protective gloves/eye protection."; without: blocked |
| 6 | H316 + H999 | blocked, both groups reported |
| 7 | "P403, P233" | printed as combined statement |
| 8 | H301 + H317 pictograms | skull **and** exclamation drawn |
| 9 | Unknown pictogram key | drawn as exclamation mark, fits:true |
| 10 | Product-name font vs length (square 100 mm) | 5.32 → 5.12 → 3.39 → **1.23 mm** when the name first wraps |
| 11 | Legacy preset 35 mm | blocked by fit engine |
| 12 | Candle-icon floor sweep 40–150 mm | `bcfTooSmall` never triggered |
| 13 | Candle 52×36 default rectangle | icons silently absent (dims < 40 mm) |
| 14 | Saved overrides in Composer | Builder 1.98 mm vs Composer 1.88 mm hazard text |
| 15 | Resolution invariance | identical |
| 16 | Escaping | no `<script>`, no injected elements from text; **bgColour attribute injectable** |
| 17 | Control characters (U+0000/U+0008) in business name | SVG becomes invalid XML (parser error) |
| 18 | Newlines in name/address | collapsed to spaces |
| 19 | Website on 52 mm circle | 1.46 mm (not floored — not mandatory) |

## Screenshots

`screenshots/<case>__<geometry>__preview.png` (inline SVG as in Builder Pro preview) and `…__export-png.png` (SVG→img→canvas, the PNG/Composer export path, 300 dpi) for 22 representative combinations.
