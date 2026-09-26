# Post-fix QA evidence: curved product name vs business name on circular labels (audit finding M45)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of the Issue #1 fix at `59faa0c` |
| Status | Accepted for TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. |
| Scope | Circles only. Squares and rectangles are unchanged. |

## Defect

On circles the product name is drawn on a fixed arc. Its size was fitted as straight serif text to a chord about ⅔ of the diameter. The business name was placed without reference to the arc. Once a name was longer than about 0.38–0.41 × the diameter, the arc's ends ran down into the business name. This happened at every circle size, and the label still reported FIT.

## Fix (`label-render.js`, circles only)

1. **Upper bound unchanged.** The product-name size the renderer already chose stays the upper bound, so a short name is unchanged.
2. **Collision cap.** The name is capped to the largest size at which its ink is at least **0.5 mm** from the business name's ink. That 0.5 mm is a CLPeasy rendering safety clearance, not a statutory GB CLP figure. The check uses:
   - the business name's final size and position;
   - each letter's real ink shape, in 8 bands per letter;
   - the arc's own fonts: the device's bold sans-serif fallback, measured live, and DM Sans Bold, from a built-in advance table. The name must clear in both.
3. **Blocked at the minimum.** If the complete name cannot clear even at the existing 1.2 mm minimum:
   - the full name is kept at that size;
   - the label is blocked through the existing `scentTooSmall` path: NOT FIT, red overlay, blocked download;
   - Builder's "smallest size that fits" suggestion is shown.
4. **Manual "+" limit.** The cap applies to the automatic size and to the manual product-name "+"/"−" size alike, so "+" can never draw the name closer than 0.5 mm.
   - The Builder's fine-tune range (`fsBounds.scent`) is left as before. Reporting the cap as the "+" maximum fed back through the existing header spacing and made "+" shrink the name slightly; signed-out QA found this and it was corrected before sign-off.
   - Stepping "+" up never makes the drawn name smaller, except the pre-existing collapse to the minimum when a requested size no longer fits as one straight line (audit finding M43, out of scope). That happens in 8 of 32 sweeps, down from 12 before the fix.
5. **Not changed:**
   - business-name position and size;
   - arc radius;
   - header order;
   - wrapping;
   - squares and rectangles;
   - hazard, sensitiser and P layout (the Issue #1 code).

## Results

Pixel test: 343 circle cases × 3 font scenarios = 1,029 renders at 52, 63, 75, 100 and 150 mm. Font scenarios:
- **S0:** fallback fonts only;
- **S1:** Georgia installed (signed-out preview, PNG, Composer);
- **S2:** Georgia + DM Sans (Pro preview, PDF).

| | Before (`59faa0c`) | After |
|---|---|---|
| FIT renders | 804 | 755 |
| FIT renders with visible product-name/business-name overlap | **362** | **0** |
| FIT renders closer than 0.5 mm (tolerance 0.071 mm = one pixel diagonal at 20 px/mm) | 399 | **0** |
| Smallest clearance on a FIT label | 0.000 mm | **0.570 mm** |
| Manual "+" sweeps checked (never shrinking the name, M43 aside) | — | 96 |
| NOT FIT because the complete name cannot clear at the minimum size | 0 | 118 |

**FIT → NOT FIT changes** (`data/fit-changes-vs-pre-fix.txt`):
- 13 of the 343 cases in S0 and 18 in S1.
- All are names of 25+ characters on 63–100 mm circles, e.g. "Christmas Spiced Orange & Cinnamon" and "Midnight Blackberry, Bay Leaf & Smoked Vanilla".
- Each gets a larger-size suggestion, e.g. 73 mm for the Christmas name and 89 mm for the 46-character name at 63 mm with "Crafty Mouse Gifts".
- 0 NOT FIT → FIT changes.

**Unchanged output:**
- Everything except the curved name is byte-identical to the pre-fix renderer for every circle case that is not newly blocked. That is 296 of 343 in the jsdom baseline `tests/fixtures/circle-non-arc-render-baseline.json`; 130 are fully identical.
- All 63 square/rectangle fingerprints are byte-identical to `main`.

**Issue #1:** `tests/circle-per-line-text-containment.js` passes. The output is identical to the Issue #1 evidence: 38 FIT circle renders geometrically verified, 27 NOT FIT blocked, no text ink outside any FIT circle.

**Full test suite:**

| | Pass | Fail |
|---|---|---|
| Before (`59faa0c`) | 49 | 5 |
| After | 50 (incl. the new test) | 5 |

The 5 failures are the same pre-existing wording/copy tests, with identical messages.

**Render time** (`data/render-timing-ms.txt`):
- about 4 → 7 ms per label;
- the "smallest size that fits" search on a newly blocked label takes about 240 ms; for existing blocked heavy-hazard labels it already takes about 830 ms.

## Visible change on labels that fit

A name only gets smaller when it would otherwise come closer than 0.5 mm to the business name.

At 63 mm with "Crafty Mouse Gifts":

| Name | Before | After |
|---|---|---|
| "Vanilla Bean" | 3.36 mm | 3.26 mm |
| "Lavender Fields" | 3.36 mm | 2.53 mm |
| "Midnight Blackberry" | 3.36 mm | 1.83 mm |

With a short business name such as "CMG", all 40 tested cases (8 names × 5 sizes) are unchanged.

## Folder contents

| Path | What |
|---|---|
| `before-after-screenshots/` | Before (top row) vs after (bottom row), Georgia-metric business name. Red = pixels inked by both names. 63 mm name set; "Midnight Blackberry" at 52–150 mm; 100 mm long-name set. |
| `data/pixel-test-report-BEFORE-pre-fix-renderer.txt` / `data/pixel-test-output-AFTER.txt` | New pixel test on the pre-fix and fixed renderer. |
| `data/fit-changes-vs-pre-fix.txt` | Every FIT → NOT FIT change with its smallest fitting size. |
| `data/issue-1-circle-per-line-text-containment-output.txt` | Issue #1 test on the combined code. |
| `data/full-suite-BEFORE-59faa0c.txt` / `data/full-suite-AFTER.txt` | Every `tests/*.js`. |
| `data/render-timing-ms.txt` | Render and size-search timings before/after. |

Evidence was produced in headless Chromium 141 in the Claude Code cloud container. Georgia is not installed there, so a metric-compatible face (Gelasio) is registered as "Georgia". The test fonts are in `tests/fixtures/fonts/` (SIL OFL 1.1).
