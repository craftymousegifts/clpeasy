# 01 — Pipeline Map

Audited commit: `main` @ `e8c1f25` (branch `claude/awesome-meitner-va8zlq` was identical to `main`; nothing from PR #156 / `feature/pay-as-you-go-downloads` was touched).

## 1. End-to-end flow

```
 USER / SDS INPUT                           NORMALISATION & STATE                    RENDER                       OUTPUT
 ─────────────────                          ─────────────────────                    ──────                       ──────
 Step 1  shape, custom-w/-h  ──onDimInput()──► S.shape/S.size/customW/H (clamp 10–150)
 Step 2  scent-name, product-type,          readForm()  (builder.html:4660)
         net-weight, frag-load, burn-time   ───────────► S.* strings (raw, untrimmed)
 Step 3  Smart Paste textarea ──extractSDS()──► S.hStatements (H + EUH, SDS order)
         (builder.html:3770)                   S.pStatements (minus 9 excluded codes)
                                               S.sdsSignal, S.sensitisers (EUH208 clause
                                               or SENSITISERS table scan)
         H/P chips, P280 picker ────────────► S.hSelected / S.pSelected / p280Items
         syncPictogramsFromH() (H_PICTO_MAP) ► S.pictograms
 Step 4  biz-name/address/phone/website,
         batch-num                ─────────► S.biz*, S.batchNum
 Label appearance: bg colour (DOM), text colour, border, fine-tune overrides

 updateLabel() (builder.html:4808)
   ├─ resolveGbClpSignalWord(H codes, sdsSignal) → S.signal   (recomputed EVERY update)
   ├─ buildSVG(false) (4688) → plain `data` + `opts` ──► LabelRenderer.renderLabel()   [label-render.js]
   │                                                     ├─ normalizeLabel()  (defaults incl. "Your Brand")
   │                                                     ├─ choosePictoMmAndRender(): binary search 10→11.31 mm
   │                                                     │   red-square side, each trial = full layout
   │                                                     ├─ getLabelDims(): canonical 260-unit-wide space
   │                                                     ├─ header band (scent/arc, biz, web) → type → signal
   │                                                     │   → pictograms → H/sens/P flow (_layoutHazard) → footer
   │                                                     │   → EN 15494 row
   │                                                     ├─ fit flags → fits / blockReason / overlay SVG
   │                                                     └─ returns {svg, fits, warnings, metrics}
   ├─ window._labelBlockDownload = own OR of flags (NOT result.fits — see finding M07)
   └─ renderPreviewInto(): Pro → inline vector SVG; non-Pro → rasterised PNG inside SVG (watermarked)

 Exports (all call buildSVG(true) → same renderLabel(), forExport:true only changes outer width/height)
   PNG  downloadPNG()  : SVG string → JPEG→PNG swap → Blob → <img> → canvas 600 dpi → .png
   SVG  downloadSVG()  : SVG string, width/height → mm, data: URI
   PDF  printToPDF()   : inline SVG in a Blob HTML page sized in mm → user prints to PDF
   (downloadPDFSheet / downloadPrintReadyPDF / downloadCricutPNGs exist and are wrapped by the
    download counter but have NO button in builder.html — unreachable legacy paths)

 Save (saveLabel, builder.html:3058) → record incl. overrides, bgColour, signal, pictograms, fragLoad
 My Labels (my-labels.html)  → thumbnails via label-render.js; "Edit" reopens in Builder (loadLabel → S.* → updateLabel)
 Print Sheet Composer (print.html:2296 renderSheetPosition) → renderLabel(savedRecord, {pw,ph,bgColour,sharedDefs,watermark})
   sheet export: many labels into one SVG (SharedAssetPool <symbol>/<use>) → <img> → canvas → PNG/PDF
```

## 2. Where content is transformed

| Stage | File:function | Transformation |
|---|---|---|
| Smart Paste H | builder.html `extractSDS` | regex `\bH\d{3}\b`, `\bEUH\d{3}\b`, de-duplicated, H first then EUH (SDS order within each) |
| Smart Paste P | `extractSDS` | regex incl. `+`/`/` combos → canonical `P302+P352`; **9 codes excluded** (P264, P270, P272, P280, P303+P361+P353, P362, P362+P364, P363, P405) |
| Signal word | `resolveGbClpSignalWord` | derived from H codes (Danger > Warning); supplier word only for ambiguous codes |
| Sensitisers | `EUH208_CLAUSE_RE` + `parseBoundedSubstanceList` / table scan | bounded clause authoritative, supplier order kept, split on `;` or `, ` |
| Pictograms | `syncPictogramsFromH` / `H_PICTO_MAP` | union of mapped pictograms, no precedence rules |
| Defaults | label-render.js `normalizeLabel` | missing product name → "Your Scent Name", missing business → "Your Brand" |
| H text | `renderLabel` | H_LIB descriptions joined ". " + "." ; EUH208 removed from H stream |
| P text | `renderLabel` | adjacent codes auto-combined if a combined P_LIB entry exists; P280 built from picker |
| Sens text | `renderLabel` | `"Contains: " + names.join(", ")` + separate line `"May produce an allergic reaction."` |
| Case | `renderLabel` | product type and signal word upper-cased |
| Footer | `renderLabel` | address, phone, `[net, "Burn: x", "Batch: y"].join(" · ")` — single line each, never wrapped |

## 3. Places where preview and export can follow different logic

| # | Difference | Impact |
|---|---|---|
| P1 | **Font actually drawn differs by context.** Fit engine measures with canvas generic `sans-serif`/`serif`; SVG asks for `DM Sans`/`Georgia`. Pro inline preview and the PDF page can load web fonts; non-Pro raster preview, PNG export and Composer exports rasterise SVG-as-image, where the embedded `@import` cannot load → system fallback. | Wrapping/width can differ between preview, PNG and PDF on the same device; differs between Windows / macOS / iOS. See 09. |
| P2 | Composer does **not** pass saved fine-tune overrides (`hazardFSOverride`, `scentFSOverride`, `bizNameFSOverride`, `typeFSOverride`, `sigFSOverride`, `hazardYOffset`). | A fine-tuned Builder label prints at different sizes in the Composer (measured: 1.98 mm vs 1.88 mm hazard text). |
| P3 | Builder recomputes the signal word from H codes on every update; Composer and My Labels use the saved `signal`. | Legacy labels whose saved signal differs from the resolver print differently. |
| P4 | Builder's download gate re-derives its own list of flags and omits `bcfTooSmall`; Composer uses `result.fits`. | Latent only — `bcfTooSmall` was not reachable in any tested geometry. |
| P5 | Resolution: preview/export/Composer all share the canonical 260-unit layout. | Verified identical inner SVG at 200 px, 900 px and export size (probe 15). No difference. |
