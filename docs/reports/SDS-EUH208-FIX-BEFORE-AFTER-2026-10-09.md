# CLPeasy® — EUH208 PDF layout correction (D1/D2/D4): before/after QA, 9 Oct 2026

**Status:** development only. Fix branch `fix/euh208-pdf-layout-artefact` (commit `d736f0f`, based on `main` 85af515), draft PR. Nothing has been merged or deployed, and no production data has been touched.

## Change under test

`builder.html`, `extractSDS()`, at the EUH208 step only: the EUH208 clause is now matched against a copy of the pasted text with two changes.
- The SDS row label `Information:` (or `Supplemental Information:`) is removed **only at the start of a line**.
- A name broken directly after a hyphen across lines is re-joined.

H/P codes, signal word and pictograms still use the original text. There are no UI, warning, sizing or renderer changes.

## Supplier names: independent source

Each supplier's EUH208 names were read straight from the supplier **PDF** with PyMuPDF text blocks (`scripts/e2e-sds-euh208-pdf-names.py`). These blocks keep the right-hand column separate from the "Supplemental / Information:" row label.
- Only 9 line-end hyphens occur, and all are genuine hyphenated names (beta-Pinene, trans-Nerolidol, l-.β.-Bisabolene…).
- The PDF names are identical to those used in the 100-case QA for all 86 EUH208 cases.

## Smart Paste extraction, all 100 SDSs (real `extractSDS()` in JSDOM, fresh page per case)

| | main 85af515 | fix |
|---|---|---|
| EUH208 names identical to supplier (exact case and punctuation) | 38 / 86 | **74 / 86** |
| Identical apart from capitalisation | 40 / 86 | **86 / 86** |
| Cases that got worse | — | **0** |
| H codes / P codes / signal / pictograms changed (100 cases) | — | **0** |
| Sensitisers changed in the 14 SDSs without EUH208 | — | **0** |

The remaining 12 are capitalisation only: the supplier writes *Geranyl acetate* and CLPeasy prints *Geranyl Acetate*. This comes from the builder's existing `SENSITISERS` table normalisation (`normaliseSubstanceName`), not from this fix, and was left unchanged. Of the 12, 10 are among the 46 affected cases (021, 023, 054, 055, 062, 066, 067, 073, 079, 087) and 2 were already counted correct (022, 065).

## Real builder journey, 46 affected cases (Chromium)

The same harness and offline entitlement fixture as the 100-case QA were used, with no production requests.

| | Before (100-case QA) | After |
|---|---|---|
| Cases with an EUH208 issue (D1/D2/D4) | 46 | **0** |
| Downloaded labels printing wrong names | 32 | **0** |
| Cases reaching downloads | 32 | **33** (014 now exports; it was previously blocked because no names had been extracted) |
| Browser extraction: H/P/signal/pictograms differing from before | — | **0** (92 runs) |

**Exact-name check** (`qa-artifacts/sds-e2e-euh208-fix/exact-name-check.json`):
- Browser state names were exactly the supplier's in 72 of 92 size runs. The other 20 runs (10 cases × 2 sizes) differ only in *Geranyl Acetate* capitalisation.
- Every name was found in all **163** preview/export SVG and PDF files, and no file contains "Information:" or "Supplemental".
- The 33 PNG exports were checked visually against the PDF render by the analyser, and no mismatch was found.

**Verdicts for the 46 cases:**

| Before → after | Cases |
|---|---|
| FAIL → REVIEW | 30 |
| FAIL → SUPPLIER REVIEW | 11 |
| FAIL → PASS | 2 (039, 040) |
| FAIL → FAIL | 3 |

- The REVIEW cases are the existing R1 policy item.
- The SUPPLIER REVIEW cases are S1 (GHS-only codes), plus 068's supplier text.
- The remaining FAILs are not EUH208:
  - 053 and 073 are D3;
  - 097 is D3 and D5.

**Corpus totals:**

| | PASS | FAIL | REVIEW | SUPPLIER REVIEW |
|---|---|---|---|---|
| Before | 8 | 50 | 28 | 14 |
| After | 10 | 7 | 58 | 25 |

The 54 unaffected cases keep their earlier browser evidence; their extraction was proven unchanged offline.

**Labels for case 021 are now smaller:** the recommended size dropped from 94 × 63 mm to 88 × 59 mm, because "Geranyl Information: acetate" is no longer printed. 014 exports at 80 × 54 mm. All other export sizes are unchanged.

**Example (039, downloaded PDF):**
- Before: *"…Neral, alpha-Pinene, l-.β.-Bisabolene. Information:"*
- After: *"…Neral, alpha-Pinene, l-.β.-Bisabolene"*

**Case 068:** the supplier's own unusual text *"Nikura | Niaouli Essential Oil - 100% Pure"* is kept verbatim, as before. It remains a supplier anomaly.

**Console:** the only errors were a favicon 404 from the local QA web server (2 runs), which is a test-environment artefact.

## Regression and security checks

- New test `tests/euh208-pdf-layout-artefact.js` passes on the fix and fails on main (010: no names extracted).
- Existing `tests/` suite, run on both main and the fix: **84 / 86 files pass on the fix; the same 83 / 85 pass on main** (the extra file is the new test). This includes:
  - the EUH208 tests (bounded extraction, horizontal overflow);
  - hazard-source integrity and the builder regression/safety baselines;
  - the output-sanitisation (M56/M57) and static app audit checks;
  - the export/download tests.
- **Two pricing-page test failures already exist on `main`** and are not related to this change. Neither test loads `builder.html`:
  - `tests/payg-pricing-checkout.js` hangs with no output (killed at 300 s; also hangs on its own on main);
  - `tests/pricing-checkout-ux.js` has two "checkout in progress" indicator checks that fail with "Cannot read properties of null (reading 'visible')".
- **Performance/ReDoS:** both new regular expressions process adversarial inputs of up to 1.2 MB in ≤ 5 ms. They are applied only to the customer's own pasted text, and their output is used only as substance names, which go through the existing rendering/sanitisation path.

## Evidence

- `qa-artifacts/sds-e2e-euh208-fix/`:
  - `100_SDS_E2E_RESULTS.csv/.json` (after);
  - `exact-name-check.json`;
  - `supplier-euh208-names-from-pdf.json`;
  - for each of the 46 cases, `journey.json` and the downloaded PNG/SVG/PDF;
  - `*-tests*.txt` (suite exit codes).
- Scripts: `scripts/e2e-sds-euh208-compare.js`, `scripts/e2e-sds-euh208-exact.py`, `scripts/e2e-sds-euh208-pdf-names.py`.
