# Post-fix QA evidence: product-name one-line sizing (audit finding M43, Issue #3)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1 and #2 (`a092f05`) |
| Status | Accepted for TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. |

## Defect

The product-name size was fitted on one line down to the fine-tune minimum. When the requested size (automatic, or the manual "+") no longer fitted on one line, the name was "wrapped" at `min(size, slot.scent × 0.42)`. `slot.scent` is 0, so the name dropped straight to the mandatory minimum. For example, 2.69 mm → 1.23 mm on a 100 mm square, even though a 2.28 mm one-line size fits. Pressing "+" past the one-line limit also made the name collapse.

Related: names that genuinely wrap (at the minimum) were stacked as if the block were centred on its first line. Their last line(s) could then run into the business name while the label reported FIT.

## Fix (`label-render.js`)

1. **One line whenever possible.** If the requested size doesn't fit on one line, the complete name is drawn on one line at the largest size that does fit, found by bisection between the mandatory minimum and the requested size.
2. **"+" range.** The fine-tune range tops out at that one-line limit, so "+" stops there. The limit depends only on the name and the label width, never on the business name's position.
3. **Fallback wrap.** Only a name that can't fit on one line even at the minimum still wraps there, as before. Nothing is ever truncated.
4. **Wrapped straight names** (squares and rectangles):
   - the header spacing logic uses the real bottom of the last line;
   - the product-name → business-name gap is widened to keep **0.5 mm** between the visible ink. That 0.5 mm is a CLPeasy rendering safety clearance, not a statutory GB CLP figure;
   - this is verified per glyph afterwards. If the clearance can't be kept, the label is NOT FIT and blocked through the existing `scentTooSmall` path, with the whole name still drawn.
5. **Unchanged:**
   - names that already fit at their requested size;
   - the 1.2 mm minimum;
   - the Issue #2 arc cap;
   - the arc radius and header order;
   - hazard, sensitiser and P layout.

## Results

New test `tests/product-name-one-line-sizing.js`, real Chromium, 1,008 measured renders:
- 12 geometries: squares 52/63/100/150 mm; rectangles 63×44, 80×100, 100×70, 150×40; circles 52/63/100/150 mm.
- Names from 4 to 128 characters, grown word by word, plus realistic names and business-name variants.
- 2 font scenarios.

| | Before (`a092f05`) | After |
|---|---|---|
| Collapses to the minimum while a larger one-line size exists | 36 | **0** |
| "+" sweeps that shrink the name (of 144) | 29 | **0** |
| FIT labels with product-name/business-name ink overlap | 10 | **0** |
| FIT wrapped names closer than 0.5 mm (tolerance 0.071 mm) | 11 | **0** |
| Smallest FIT wrapped-name clearance | 0.000 mm | **0.750 mm** |
| Incomplete product names | 0 | 0 |
| Builder vs Composer mismatches (no overrides) | 0 | 0 |

**FIT/NOT FIT changes** (`data/fit-changes-vs-pre-fix.txt`, 432 labels × 2 font scenarios):
- product name bigger in 105–106 labels, smaller in none;
- FIT → NOT FIT: 3 labels, all the same case: the 52 mm square with a 128-character name. Its three wrapped lines previously overlapped the business name while reporting FIT. With the business name placed below the real last line, the hazard text no longer fits (`hazard-text-overflow`);
- NOT FIT → FIT: 0.

**Byte-identity:**
- Every label whose name was not at the minimum before is byte-identical: 262 of 360 jsdom labels. All 98 changed labels had the name at the minimum before.
- All 63 square/rectangle fingerprints are byte-identical to `main`.

**Issue #1:** `tests/circle-per-line-text-containment.js` passes unchanged.

**Issue #2:** `tests/circle-product-name-business-name-clearance.js` passes:
- 0 FIT overlaps, smallest clearance 0.570 mm;
- its "+" check no longer exempts the M43 collapse (96 sweeps, none shrinking).

Its jsdom baseline changed in exactly 3 entries: `{63,100,150}mm|Fresh Linen & White Cotton|…|{"scentFSOverride":999}`. Before the fix these "+ at maximum" cases collapsed to the minimum, and the existing header spacing logic placed the business name from that collapsed size. They were regenerated from the fixed renderer, as documented in `tests/fixtures/generate-circle-non-arc-baseline.js`. No other entry changed.

**Full suite:**

| | Pass | Fail |
|---|---|---|
| Before | 50 | 5 |
| After | 51 (incl. the new test) | 5 |

The 5 failures are the same pre-existing wording/copy tests.

**Render time** (`data/render-timing-ms.txt`): at most about 4 ms more per label (a wrapped name); the size-search on a newly blocked label takes about 7 ms.

## Folder contents

| Path | What |
|---|---|
| `screenshots/before__product-name-sizing.png` / `after__…` | Georgia-metric business name, same content before and after:<br>A: 100 mm square, 58 and 69 characters;<br>B: "+" on a 100 mm square;<br>C: "+" on a 150 mm circle;<br>D: wrapped names at the minimum (63 mm square FIT; 52 mm square now NOT FIT). |
| `data/issue-3-test-report-BEFORE-a092f05.txt` / `data/issue-3-test-output-AFTER.txt` | New test on the pre-fix and fixed renderer |
| `data/fit-changes-vs-pre-fix.txt` | Every FIT/NOT FIT change and product-name size change |
| `data/issue-1-…`, `data/issue-2-…` | Issue #1 and #2 regression tests on the combined code |
| `data/full-suite-BEFORE-a092f05.txt` / `data/full-suite-AFTER.txt` | Every `tests/*.js` |
| `data/render-timing-ms.txt` | Render and size-search timings before/after |
