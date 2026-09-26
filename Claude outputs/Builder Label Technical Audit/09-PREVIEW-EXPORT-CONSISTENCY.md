# 09 — Preview vs Export Consistency

## Paths compared

| Output | Code | Renderer call | How it is drawn | Font actually available |
|---|---|---|---|---|
| Builder live preview (Pro) | `renderPreviewInto` → `commitPreviewMarkup` | `renderLabel(data, {forExport:false, overrides…})` | inline SVG in page | page fonts (DM Sans 300–600 via `<link>`) + SVG `@import` (400/700/900); Georgia only if installed |
| Builder live preview (non-Pro / signed out) | `rasterizePreviewSVG` | same | SVG → `<img>` → PNG embedded in an SVG | **system fallback fonts only** (SVG-as-image cannot load `@import`) |
| Final review (Step 5) | same preview container | same | same | same |
| PNG | `downloadPNG` | `forExport:true` | SVG → `<img>` → canvas 600 dpi | **system fallback** |
| SVG | `downloadSVG` | `forExport:true` | file | whatever the opening app/printer has; embeds Google Fonts `@import` URL |
| PDF | `printToPDF` | `forExport:true` | inline SVG in a Blob HTML page, browser print | web fonts may load (online) |
| Saved label | `saveLabel` | — | data record incl. overrides, bgColour, signal | — |
| Reopened label | `loadLabel` → `updateLabel` | Builder path | signal **recomputed** from H codes | — |
| My Labels thumbnails | my-labels.html | shared renderer | — | — |
| Composer preview / export | print.html `renderSheetPosition` | `renderLabel(record, {pw, ph, bgColour, sharedDefs, watermark})` — **no overrides** | sheet SVG → `<img>` → canvas | system fallback |

## Findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| E1 | **One renderer for everything.** No duplicated layout implementation; Builder's legacy `getDims` duplicates only mm maths. H_LIB/P_LIB copies identical today. | code, node diff | PASS |
| E2 | **Layout is resolution-independent** — same inner SVG at any output size, so wrapping/size decisions are identical between preview and export *as computed*. | probe 15, existing test | PASS |
| E3 | **Fit engine measures with the wrong font.** `measureText()` uses canvas `400/700 sans-serif` or `serif`; the SVG draws `DM Sans` / `Georgia`. Measured in this container: DM Sans is 7–10 % *narrower* than Arial-metric fonts (safe direction for DM Sans text), but the business and product names are measured as generic `serif` (Times on Windows/macOS/iOS) and drawn as **Georgia**, which is materially wider than Times on those platforms. Which font is drawn also differs by path (table above). Consequence: a name that "fits" by measurement can render wider than its allowance on real devices, and the same label can wrap differently in PNG vs PDF vs Pro preview. | `harness/fontprobe*.js`; env widths in results.json | UNCERTAIN MEDIUM — needs a real Windows/macOS/iOS device check |
| E4 | In this headless environment, inline SVG text with `font-family="DM Sans,sans-serif"` rendered at the fallback font's width (identical to the fitter's assumption), while `"DM Sans"` alone rendered DM Sans. Cause not established; may be environment-specific. | `fontprobe4.js` | UNCERTAIN |
| E5 | **Composer ignores fine-tune overrides** saved with the label (hazard, product name, business name, type, signal font sizes and hazard vertical offset). | code print.html:2302; probe 14 | ISSUE MEDIUM |
| E6 | **Signal word source differs**: Builder recomputes from H codes; Composer/My Labels use the saved value. | code builder.html:4812 vs print.html | ISSUE LOW (legacy data only) |
| E7 | Builder download gate uses its own flag list (omits `bcfTooSmall`) instead of `result.fits`; Composer uses `result.fits`. | builder.html:4851 | ISSUE LOW (latent) |
| E8 | Exports do not re-check `fits` at export time; they rely on the preview's last `_labelBlockDownload`. Safe today because layout is deterministic and `readForm()` re-reads the same DOM; any blocked label would export the red overlay, not the content. | code | PASS (note) |
| E9 | Pictogram size identical preview/export/Composer (single computed mm, pooled `<symbol>` sized explicitly). | existing tests + probe | PASS |
| E10 | Rasterisation: PNG 600 dpi; pictograms are JPEG sources converted to PNG before rasterising. | code | PASS |
| E11 | Unreachable legacy exports (`downloadPDFSheet`, `downloadPrintReadyPDF`, `downloadCricutPNGs`): width-only Avery layout (rectangles use round-label pitches; tall custom rectangles would overlap rows), "300 DPI" text while rendering 600 dpi, Cricut uses the non-export SVG. No button calls them in builder.html. | code builder.html:1736–1960 | ISSUE LOW (dead code; record only) |
| E12 | Blocked label: preview and any export show the same red overlay (renderer draws it into the SVG). | screenshot `12-heavy-combined__rect-80x100__export-png.png` | PASS |
