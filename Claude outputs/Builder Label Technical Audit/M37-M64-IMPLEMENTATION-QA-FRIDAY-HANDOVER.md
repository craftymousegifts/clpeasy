# M37 + M64 implementation and QA handover

**Date:** 29 Sep 2026  
**Branch:** `audit/m37-m64-pictogram-precedence`  
**Base:** `fix/circle-per-line-text-fit` at `cd4ab86c97088816a517fa62b501063d4288f533`  
**Production/main:** not changed.

## Regulatory basis verified
GB CLP Article 26 mandatory precedence was checked against legislation.gov.uk before implementation:
- GHS06 applies -> GHS07 shall not appear.
- GHS05 applies -> GHS07 shall not appear for skin or eye irritation.
- GHS08 applies for respiratory sensitisation -> GHS07 shall not appear for skin sensitisation or skin/eye irritation.
- optional GHS01/GHS02/GHS03 and GHS04 choices were deliberately NOT silently exercised.

## Implementation
`label-render.js`
- shared `expectedPictogramsForHazardCodes()` keeps pictogram reasons until precedence is applied;
- reason-aware suppression, not blanket deletion;
- `checkPictogramConsistency()` compares expected/stored pictogram sets;
- `checkRequiredContent()` fails closed on a saved mismatch when pictogram data is present;
- no saved record is mutated by rendering/validation.

`builder.html`
- Step 3 pictogram sync uses the shared resolver;
- export required-content check includes current pictograms;
- a saved mismatch remains blocked merely by opening/rendering;
- only after the maker re-checks the SDS, ticks Step 3 confirmation and successfully leaves Step 3 is the pictogram list rebuilt from the confirmed H-codes.

`print.html`
- Composer blocks a saved mismatch and tells the maker to reopen Builder and re-check Step 3.

## Mandatory regression cases
- H314 + H319 -> corrosive only.
- H314 + H302 -> corrosive + exclamation.
- H314 + H317 -> corrosive + exclamation.
- H334 + H317 -> health only.
- H361 + H317 -> health + exclamation.
- H334 + H302 -> health + exclamation.
- H301 + H302 -> skull only.
- H301 + H315 + H400 -> skull + aquatic.
- H334 + H315 + H317 + H319 -> health only.
- unrelated exclamation reasons survive contextual suppression.
- optional Article 26 choices are left unchanged.
- M64 comparison is order-insensitive; missing/extra valid keys block.
- validation does not mutate the saved record.

## QA evidence
Temporary workflows were used only for executable QA and then removed.

Focused GitHub Actions run **36606596767**: SUCCESS
- targeted M37/M64: PASS
- M38 unknown-pictogram real-browser recovery: PASS
- required-content/export blocking: PASS
- core `npm test`: PASS

Full Builder Safety Baseline on the same application-code implementation: PASS
- 10 representative labels
- invariants + existing snapshot unchanged
- known 63x44 candle and 52x36 minimum rectangle remain blocked for their pre-existing fit reasons.

Earlier failed QA runs are intentionally retained in Actions history. They document:
1. initial test harness lacked browser DOM;
2. jsdom cross-realm array comparison;
3. stale M38 expectation that H301+H317 should keep GHS07;
4. synthetic EUH-only fixtures carrying an inconsistent exclamation pictogram.
These were test/harness expectation issues exposed by the new requirement, not hidden.

## Friday independent review request
Claude should independently:
1. diff this branch against `fix/circle-per-line-text-fit`;
2. verify the Article 26 interpretation from current GB primary sources;
3. challenge every suppression case, especially mixed reasons that must retain GHS07;
4. verify no saved record changes merely by load/render;
5. verify explicit Step 3 confirmation is required before repair;
6. rerun targeted M37/M64, M38, required-content, Builder Safety Baseline and full suite;
7. inspect current `main` separately before any integration;
8. do not merge/deploy merely because this handover says PASS.

## Separate unresolved items
M36 pictogram geometry is NOT changed on this branch. Primary-source review now confirms the one-fifteenth rule, 1 cm2 floor, and Table 1.3's <=3 L 10x10 mm minimum / if possible 16x16 mm pictogram dimensions. Current CLPeasy tests still describe 16 mm as an OUTER bounding-box target; this requires its own isolated design/fix and regression because it may legitimately change FIT/NOT FIT results.

M66 (non-numeric fine-tune -> NaN while FIT) and M62 (split combined P-codes Step 3 inconsistency) remain separate open defects for their own isolated changes.
