# Post-fix QA evidence: required-content export blocking (audit findings M09 / M31, Issue #4)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1–#3 (`0102247`) |
| Status | Accepted for TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. |

## Defect

Missing required content was replaced by placeholder text, and the result could be exported:
- a blank business name printed as **"Your Brand"**;
- a whitespace-only business name printed **no supplier name at all**;
- a blank product name printed as **"Your Scent Name"** (saved records / Composer, or cleared after confirming at Step 5);
- EUH208 without a named substance printed as **"Contains: sensitising substance"**.

The Builder gate checked only the Step 5 confirmation and physical fit, and was not re-checked after a field was cleared. The Composer checked only physical fit.

## Fix

**Required-content completeness is kept separate from physical fit.** The rendered SVG, `fits` and the blocked overlay never change because content is missing, and placeholders may still preview while a label is being built.

- **`label-render.js`:** `LabelRenderer.checkRequiredContent(record)`, also returned by `renderLabel()` as `requiredContent`. It returns `{complete, missing}`, where `missing` contains:
  - `product-name`;
  - `business-name`;
  - `euh208-substance` (EUH208 present, but no name containing a letter or digit).

  Values are trimmed, so whitespace-only counts as missing. Supplier address (M10) is not checked here.
- **`builder.html`:**
  - Business / Brand name is marked `(required)` in the same way as the other Step 4 fields. Step 4 won't continue without it: "Add your business name before continuing."
  - Step 3 won't continue with EUH208 but no named substance: "EUH208 needs the named sensitising substance(s). Check your current supplier SDS and paste the complete relevant EUH208/Contains information." No manual name-entry UI was added.
  - The export gate `_downloadAllowed()` now requires confirmation, physical fit **and** complete content. Content is re-read from the form fields on every call. That gate is used by all six export functions, the Step 5 buttons, the preview-panel buttons and the mobile preview sheet.
  - Refusals name the missing content, and Step 5 shows a "required label content is missing" note.
  - Saving to the library keeps its existing gate.
- **`print.html` (Composer):**
  - saved records with missing content are marked on the sheet and listed with a specific reason ("No business name." / "No product name." / the EUH208 guidance);
  - the single sheet export gate refuses PDF, cutting-machine ZIP and sequential PNG output;
  - records are never altered or repaired;
  - complete records print as before.

## Results

`tests/required-content-export-blocking.js`:

- **Renderer:**
  - 11 records classified correctly: blank, whitespace and undefined business names; blank and whitespace product names; EUH208 with no names or blank names; EUH208 with a valid name; complete controls;
  - 33 renders (circle, square, rectangle) are **byte-identical** to the renderer before this change (SVG, fits, warnings);
  - placeholders still render.
- **Composer:** 8 saved records, all physically FIT at 52 mm:
  - the 6 incomplete ones are blocked with a specific reason; PDF, ZIP and PNG refuse with nothing opened or downloaded;
  - the 2 complete ones print as before;
  - saved records are unchanged.
- **Builder (real Chromium), 12 flows:**
  - placeholders preview during editing, with no warning or overlay;
  - Step 2 still blocks a blank product name;
  - Step 3 blocks EUH208 without names in 3 variants;
  - Step 4 blocks blank and whitespace business names;
  - a complete confirmed label exports;
  - clearing the business name, setting it to spaces, clearing the product name, or removing the EUH208 names **after confirming** disables every export button, and 32 attempts across all routes (including the mobile sheet) were refused with nothing downloaded;
  - physical fit is unaffected; restoring the content makes the label exportable again.
- **Issue #1, #2 and #3 regression tests:** pass unchanged (`data/`).
- **One existing test fixture updated:** `tests/preview-watermark-and-export-authorization.js` gained a business name in its minimal Builder label. The label was only exportable before because the "Your Brand" placeholder was accepted. The test is about watermarking and export authorisation, and it passes (19 assertions) on both the old and new code.

## Folder contents

| Path | What |
|---|---|
| `screenshots/before__*.png` | Original Issue #4 reproduction on the test site (before) |
| `screenshots/after__*.png` | Signed-out QA of the fixed test deployment |
| `data/issue-4-…`, `data/issue-1-…`, `data/issue-2-…`, `data/issue-3-…` | Test outputs on the combined code |
