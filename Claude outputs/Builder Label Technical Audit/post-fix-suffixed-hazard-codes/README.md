# Post-fix evidence: suffixed hazard-statement codes (audit finding M21, Issue #6)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1–#5. Interim capture/block commit `fbdae72`; completed in the Issue #6 implementation commit. |
| Status | For TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. `main` (now `b9d3e32`, PAYG PR #156) was **not** merged into this branch. |
| Regulatory source | Statements, classifications, signal words and pictograms verified by Michaela against the CLP material on legislation.gov.uk (Sept 2026). CLPeasy's build environment cannot reach that site; nothing was inferred from neighbouring entries. |

## Defect (M21, MEDIUM)

Smart Paste found H-codes with `\bH\d{3}\b`, which fails when a letter directly follows the digits.
- **Complete codes vanished.** H350i, H360F/D/FD/Fd/Df and H361f/d/fd were dropped silently. The label exported without the statement or its GHS08 pictogram, and with the wrong signal word: H317 + H360FD showed "Warning" instead of "Danger".
- **Spaced forms lost their suffix.** "H361 d" became H361, printing the generic wording.

Reproduction: `data/before-fix-reproduction.json`.

## Fix

**1. Extraction** (`LabelRenderer.extractHazardCodesFromText()`, used by Smart Paste):
- **Exact codes kept.** A code with 1–2 letters directly after its digits is kept exactly as written.
- **Spaced forms joined only when verified.** A spaced suffix is joined only when the result is one of the nine verified codes ("H361 d" → H361d); otherwise the letters are treated as prose.
- **Unknown suffixes blocked, never reduced.** Unknown suffixes (H317s, H361F, H360fd) are kept exactly, so the existing unrecognised-code check blocks them at Step 3, in the renderer and at export.
- **Nothing else changes.** All other extraction is unchanged: 9,504 non-suffixed boundary combinations are identical to the previous extraction. M63 inputs ("H412Harmful") are deliberately untouched.

**2. Support:** the nine codes were added to the H-statement library (both copies, still identical), with the signal word and pictogram mapping below. Existing combination and precedence logic is unchanged.

| Code | Verified statement | Classification | Signal word | Pictogram |
|---|---|---|---|---|
| H350i | May cause cancer by inhalation. | Carc. 1A/1B | Danger | GHS08 |
| H360F | May damage fertility. | Repr. 1A/1B | Danger | GHS08 |
| H360D | May damage the unborn child. | Repr. 1A/1B | Danger | GHS08 |
| H360FD | May damage fertility. May damage the unborn child. | Repr. 1A/1B | Danger | GHS08 |
| H360Fd | May damage fertility. Suspected of damaging the unborn child. | Repr. 1A/1B (Category 1 label elements) | Danger | GHS08 |
| H360Df | May damage the unborn child. Suspected of damaging fertility. | Repr. 1A/1B (Category 1 label elements) | Danger | GHS08 |
| H361f | Suspected of damaging fertility. | Repr. 2 | Warning | GHS08 |
| H361d | Suspected of damaging the unborn child. | Repr. 2 | Warning | GHS08 |
| H361fd | Suspected of damaging fertility. Suspected of damaging the unborn child. | Repr. 2 | Warning | GHS08 |

**Implementation note:** the signal-word lookup upper-cases codes, so its entries are upper-case (H361f is looked up as H361F). Only the exact-case codes in the library ever reach a label; any other case is blocked.

## Results (`tests/suffixed-hazard-codes.js`)

- **Extraction:** 78 cases pass (`data/extraction-cases.json` has the before/after table):
  - every verified code, with every punctuation boundary;
  - spaced forms (H361 d, H360 FD, H350 i, H361 fd, H360 Df);
  - unknown suffixes kept for blocking;
  - prose never attached ("H317 a…", "H317 d", "H350 i.e.", "H317 s");
  - M63 inputs unchanged.
- **Builder, real Chromium, desktop and mobile.** For each of the nine codes on its own:
  - Smart Paste keeps the exact code, and Step 3 accepts it;
  - the signal word is correct, the pictogram is GHS08, and the preview shows the statement and signal word;
  - all six export routes contain the exact statement: SVG, PNG, print/PDF, PDF sheet, print-ready PDF, Cricut PNGs (108 export outputs checked).
- **Builder combinations:**
  - H317 + H360FD / H350i / H360Df → **Danger** with exclamation + GHS08;
  - H317 + H361f → Warning with exclamation + GHS08.
- **Builder, spaced form:** "H361 d" becomes H361d and prints its statement.
- **Builder, unknown codes:** H317s, H361F and H360fd are kept exactly and blocked at Step 3, and the message names the code.
- **Saved labels:** a saved H317 + H360Fd label keeps the exact code, Danger and the pictograms. Reopening it re-renders the statement.
- **Composer:** 9 saved labels, one per code. Each renders the complete statement and prints, and the records are unchanged.

## FIT impact (`data/fit-impact-restored-content.json`)

- **Existing baselines are unchanged.** The Issue #1–#4 baselines contain no suffixed codes, and their tests pass unchanged.
- **Restored content:** I compared the same label before (code silently dropped) and after (statement + GHS08 + signal word). This covered 2 home-fragrance contents × 9 codes × 10 shapes/sizes = 180 cases:
  - **4 FIT → NOT FIT**, all "light" content on a 52 mm square with the longest two-sentence codes (H360FD, H360Fd, H360Df, H361fd);
  - **0 NOT FIT → FIT**.
- **No truncation.** Nothing was shortened; the existing NOT FIT protection applies.

## Regression

- **Issues #1–#5:** all regression tests pass (`data/issue-*-output.txt`).
- **Full suite:** 54 pass, 5 fail. The 5 are the audit-branch baseline failures (builder-desktop-scroll-model, builder-step-navigation-layout, footer-and-compliance-wording, lifecycle-reminder-accuracy, smart-paste-user-guidance-wording). They were reproduced on the pre-PAYG `main` `e8c1f25` at the Issue #5 closure. **No new failures.** This baseline was **not** re-measured against the new `main` `b9d3e32`.

## Not changed

- **M62** (separately entered combined P-codes at Step 3): OPEN, untouched.
- **M63** (codes joined to following text): OPEN, untouched (`../M63-smart-paste-codes-without-separator.md`).
- **The two copies of the H-statement library** were kept as they are (no refactor).
