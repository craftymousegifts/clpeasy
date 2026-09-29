# Builder Safety Baseline

**Established 29 Sep 2026** on `fix/circle-per-line-text-fit`, after M55 and the M10 regression work. It is test code only; no application code changed.

Run it with `node tests/builder-safety-baseline.js`. Snapshot: `tests/fixtures/builder-safety-baseline.json`.

## What it drives (real Chromium)
For each label, the real journey:
1. Step 1 shape and size.
2. Step 2 product name and type.
3. Step 3 Smart Paste of a Section 2.2 extract, then confirm.
4. Step 4 supplier name, address and telephone, through the real Step 4 check.
5. Step 5 verify, then FIT / NOT FIT.
6. SVG, PNG and PDF.
7. Save to My Labels, then reopen via `builder.html?label=<id>`.
8. Print Sheet Composer, A4 PDF and cutting-machine PNG.

The Builder runs signed out. The Composer uses an in-page signed-in stand-in, with no network and no real account.

| Label | Shape / size | Content | Current state |
|---|---|---|---|
| circle-52-light | circle 52 mm | H317, P102, P501 | exportable |
| circle-63-medium-euh208 | circle 63 mm | H317, H412, EUH208 (2 names), 4 P | exportable |
| circle-90-heavy | circle 90 mm | 5 H, EUH208 (4 names), 7 P, 2 pictograms | exportable |
| square-52-light | square 52 mm | light | exportable |
| square-63-medium-euh208 | square 63 mm | medium, EUH208 | exportable |
| square-75-heavy | square 75 mm | heavy | exportable |
| rectangle-63x44-waxmelt-light | 63×44 mm | light | exportable |
| rectangle-63x44-candle-light | 63×44 mm | light candle | **blocked** (footer-clipped); known pre-existing (see `docs/reports/2026-09-28-...63x44...` on the Stage 2 branch) |
| rectangle-52x36-min-light | 52×36 mm (smallest supported custom rectangle) | light | **blocked** (hazard-text-overflow) |
| rectangle-100x60-diffuser-danger | 100×60 mm | Danger, H304, 3 pictograms | exportable |

## Asserted on every run
- **Preview vs export:** exported SVG text is identical to the preview (the SVG the preview is drawn from); the reopened label is identical; the Composer label text is identical to the Builder export.
- **Wording:** required wording is present (H/P/EUH208 names, signal word, product type, product name, supplier name, address, telephone). No placeholders (`Your Brand`, `Your Scent Name`, `sensitising substance`, `…`, `undefined`, `NaN`, `null`).
- **Pictograms:** every selected pictogram is drawn, identified by its image and not only by count, in both preview and export; none missing or substituted.
- **Exact sizes:** SVG `width`/`height` in mm; PDF `@page` and SVG in mm; PNG at 600 dpi; the Composer A4 PDF renders each label at its own size (300 dpi, ±1 px, never resized); cutting PNG at 300 dpi.
- **Blocking:** blocked labels produce no export.
- **Accounting:** guest Builder exports never touch download accounting.
- **Snapshot:** every label's FIT / NOT FIT, warnings, printed text, pictograms, sizes, export counts and Composer results must match. Any difference fails and is listed.

## Proven to catch regressions
- A changed H-statement wording in `label-render.js` gave a "required wording missing" failure.
- The Composer rendering labels at 95% gave "Composer A4 PDF resized the label" (583 vs 614 px).

Both were temporary and reverted.

## Rules (Michaela, 29 Sep 2026)
- Re-run after **every** application-code audit fix.
- If anything differs: **STOP**. Identify the exact regression first. Do not compensate with more application changes.
- Update the snapshot (`--update`) only when a difference is fully explained and approved, for example an approved requirement that genuinely changes a label.
