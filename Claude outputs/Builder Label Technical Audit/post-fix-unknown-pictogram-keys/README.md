# Post-fix evidence: unknown pictogram keys (audit finding M38, Issue #7)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1–#6 (application code `a762538` before this fix) |
| Status | **FIXED + QA PASSED + SIGNED OFF** (signed off by Michaela; recorded 28 Sep 2026). Not merged to `main`. Not deployed to production. `main` was **not** merged into this branch. |

## Defect (M38, MEDIUM)

`ghsPicto()` drew the exclamation mark (GHS07) for any pictogram key it didn't know, and the label still counted as fitting. The pictogram keys come from the stored label, so a corrupted, misspelt or legacy value was silently printed as a different pictogram:
- a misspelt skull key (`'skul'`) printed an exclamation mark;
- `['exclamation','bogus']` printed **two** exclamation marks.

Before and after: `data/before-after-renderer.json`.

## Fix (Option A: block in the shared renderer)

**Validation happens in one place**, `label-render.js` `renderLabel()`, where the stored pictogram list is read. Each key is checked with `isValidPictogramKey()` against the nine existing internal keys (the keys of `GHS_IMG`: flame, exclamation, aquatic, explosion, oxidiser, gas, health, skull, corrosive).

**Valid keys are drawn exactly as before.** The drawn list is identical for any list of valid keys.

**Any other value blocks the label:** unknown, misspelt, wrong case, a display label such as `GHS06`, empty, blank, or not text. Specifically:
- the renderer returns `fits:false` with `blockReason: 'unrecognised-pictogram'` (after the existing code reasons), `unrecognizedPictograms`, and a warning `unrecognized-pictogram:<key>`;
- the preview overlay says, for example, *"LABEL DATA NEEDS REVIEW — Pictogram 'skul' was not recognised. Re-check the hazards in Step 3."*;
- an empty or non-text value reads *"A saved pictogram was not recognised."*, without empty quotation marks.

**Nothing is substituted, dropped silently, corrected or re-cased.** `ghsPicto()` no longer falls back to the exclamation mark. The record is never modified.

**Builder:**
- the block is added to the download block (`window._labelBlockDownload`), so every export route refuses;
- the Step 5 note and every refusal name the key;
- no "try a bigger size" advice is given;
- the note tells the maker to extract Section 2.2 again, or change the H-statement selection, in Step 3.

**Composer:** `describeFitWarnings()` names the key, sends the maker to the Builder, and gives no size advice.

**Wording:** these messages are CLPeasy data-integrity wording, not a regulatory claim. The H-code → pictogram mapping is unchanged.

## Results (`tests/unknown-pictogram-keys.js`)

- **Valid-label equivalence:**
  - 105 valid-key labels (9 single keys, combinations, a duplicate, an empty list; circle, square and rectangle sizes) are **byte-identical** to the renderer before M38 in SVG, fits and warnings. Baseline: `tests/fixtures/pictogram-key-render-baseline.json`, generated from `a762538` (copy in `data/`);
  - all nine keys each draw their own, distinct pictogram.
- **Invalid keys:** `nonsense`, `skul`, `Health`, `GHS06`, `''`, `'   '`, `null`, `['health','bogus']`, `['exclamation','bogus']`, `['bogus','junk']` and `['skul','']` all block with a named message. Only the valid keys in the list are drawn: no substitute and no duplicate.
- **Unknown code + bad key together:** both are named.
- **Builder, real Chromium, desktop and mobile.** A corrupted saved label (H301 + H317, `['exclamation','skul']`), opened the real way from the library:
  - it opens at Step 5, **blocked**, with every export button disabled;
  - the Step 5 note names `'skul'`, with no size advice;
  - **8 of 8** export attempts refused, each naming the key: PNG, SVG, print, PDF sheet, print-ready PDF, Cricut, and both mobile-sheet buttons. Nothing was downloaded or opened;
  - opening it doesn't repair it; the list stays `['exclamation','skul']`, and the stored record is unchanged;
  - **Recovery:** Step 3 → clear hazard data and extract Section 2.2 again. The pictograms are rebuilt from the H-codes (**skull + exclamation**) and the label proceeds and is exportable;
  - the stored record stays unchanged **until the maker explicitly saves**. Saving then stores the repaired list.
- **Composer:** corrupted labels (`'skul'` and blank) are blocked and named ("Open this label in the Builder and re-check the hazards in Step 3."), with no size advice. PDF, ZIP and PNG all refuse, a valid control label prints, and the records are unchanged.

## Signed-out QA on the test site (`e1c0a32`, deploy `6ab9478eb824cd05f6ed64a0`)

Results are in `data/live-test-site-qa-results.json` and `screenshots/live__*.png`.

- **Builder, desktop and mobile.** A corrupted saved label (H301 + H317, `['exclamation','skul']`) in the signed-out guest library, opened the real way:
  - it lands at Step 5, **blocked**, with every export button disabled;
  - the note and the preview overlay name `'skul'`;
  - **8 of 8** export attempts were refused, each naming the key, with 0 downloads or windows opened;
  - opening it doesn't repair the list.
  - **Recovery:** Step 3 → clear hazard data, extract Section 2.2 again. The list becomes skull + exclamation, and the label reaches Step 5 exportable. The stored record is unchanged until an explicit save.
- **Composer:** the corrupted label is blocked with "Pictogram 'skul' was not recognised. Open this label in the Builder and re-check the hazards in Step 3." There's no size advice, export is blocked, the valid control label has no issue of its own, and the records are unchanged.
- **No page errors, and no blocked write attempts.**
- **Observed, pre-existing and unchanged:**
  - the Composer's issues-panel heading ("…doesn't fit and must be fixed…") is its generic heading for every blocked label, including the existing unknown-H-code blocks; the per-label reason underneath is specific;
  - "Save to my label library" is disabled while a label is blocked (the existing save rule). It works again once the label is repaired.

## Regression

- **Issues #1–#6:** all pass, as do the real Nikura fixtures (`data/*-output.txt`).
- **Full suite:** 55 pass, 5 fail. The 5 are the audit-branch baseline failures (builder-desktop-scroll-model, builder-step-navigation-layout, footer-and-compliance-wording, lifecycle-reminder-accuracy, smart-paste-user-guidance-wording). **No new failures.** The historical baseline was not redefined against the new `main`.

## Not changed

- **M64** (a saved list of *valid* keys can disagree with the H-codes): recorded as OPEN in `../M64-saved-pictograms-can-disagree-with-h-codes.md`. Not fixed; no "always derive from the H-codes".
- **M62 and M63:** untouched, OPEN.
- **The H-code → pictogram mapping:** unchanged.
