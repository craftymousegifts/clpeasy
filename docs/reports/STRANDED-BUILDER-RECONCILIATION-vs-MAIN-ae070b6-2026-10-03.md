# Stranded Builder fixes: reconciliation against current main `ae070b6` (3 Oct 2026)

**Read-only. Nothing was ported, merged or deployed.** PR #203 is still frozen.

**Sources:**
- `audit/m37-m64-pictogram-precedence` at `8f0812c` and `fix/circle-per-line-text-fit` at `cd4ab86`.
  Both are unchanged since the 2 Oct register.
- Approval status is from `STRANDED-BUILDER-FIX-REGISTER-2026-10-02.md`, which names Michaela where
  she approved.

## Method
1. **Ancestry:** is any fix commit an ancestor of `ae070b6`?
2. **Already present:** does each commit's app-code diff (`builder.html`, `print.html`,
   `label-render.js`, `label-library.js`, `index.html`) reverse-apply cleanly on `ae070b6`?
3. **Ports cleanly:** does the forward diff apply to `ae070b6` (in order within the item)?
4. **Trial:**
   - each cleanly-applying item was applied alone to a scratch copy of `ae070b6`;
   - Builder/Composer/renderer guard tests and the item's own test were run;
   - then the full suite was run with all clean approved items together.

## Result: none of the 16 items is on main
No fix commit is an ancestor of `ae070b6`, and no item's change is already present (every reverse
check: absent). The release (PAYG, Easy Start Unlimited, #202) touched only Builder/Composer display
text and links (`1895a92`), so applicability is the same as on 2 Oct.

The audit branch's base is `e8c1f25` (24 Sep). Since then main has gained 23 Builder/Composer
commits, including:
- PAYG download accounting;
- the PR #156 C1/C3–C6 hazard-review export gate;
- Stage 1 sheet-geometry guard (PR #159);
- Stage 2 download guidance;
- Plan Checker.

## Status per item against `ae070b6`
| Item | Approved (named)? | On main? | Ports onto `ae070b6` | Trial on `ae070b6` | Classification |
|---|---|---|---|---|---|
| **M03** Composer applies saved fine-tune | Yes (28 Sep). Integration QA with PR #159 was required, and #159 is now on main | No | Clean (`print.html`) | Guard tests PASS; `m03-composer-fine-tune-overrides` PASS | **APPROVED, MISSING, ready to port** |
| **M51** Height input max 150 mm | Yes (29 Sep) | No | Clean (`builder.html`, 1 line) | Guard tests PASS | **APPROVED, MISSING, ready to port** |
| **M55** Validate saved background colour | Yes (29 Sep) | No | Clean (`label-render.js`) | Guard tests PASS. `m55-bgcolour-validation` **fails as written** only because its mock account uses the retired `plan:'pro'` shape. With a current-model account (`easy_start`, active) it PASSES. No production profile has `plan='pro'`. | **APPROVED, MISSING, ready to port** (test fixture update needed) |
| **M56/M57** Strip XML-invalid characters; escape PDF pop-up title | Yes (29 Sep) | No | Clean (`builder.html`, `label-render.js`) | Guard tests PASS; `m56-m57-output-sanitisation` PASS | **APPROVED, MISSING, ready to port** |
| **M10** Require supplier address | Yes (29 Sep) | No | Conflicts. It extends M09/M31's shared required-content gate (`checkRequiredContent`), which is not on main | Not trialled | **APPROVED, MISSING, BLOCKED by M09/M31 decision** |
| **M19/M20** Verified P-statement wording; incomplete supplier P-codes block export | Yes (Sept) | No | Conflicts. Builds on M09/M31 sheet content-blocking and overlaps main's export gates | Not trialled | **APPROVED, MISSING, BLOCKED by M09/M31 decision**. Also changes rendered P text: 36 FIT → NOT FIT; homepage templates may need regenerating |
| **M24** De-duplicate H/P codes | Yes (29 Sep) | No | Conflicts. Built on M19/M20's `P_DEFS` structure | Not trialled | **APPROVED, MISSING, depends on M19/M20** |
| **M21** Suffixed H-codes (H360FD) | Yes (Sept) | No | Conflicts, only on the renderer export list line that includes `checkRequiredContent` (M09/M31) | Not trialled | **APPROVED, MISSING. Small dependency on M09/M31** (could be adapted without it). 4 FIT → NOT FIT |
| **M38** Block unknown pictogram keys | Yes (28 Sep) | No | Conflicts. Its blocked-download message is built into M09/M31's required-content message | Not trialled | **APPROVED, MISSING. Dependency on M09/M31** (core could be adapted without it) |
| **M09/M31** Block export of labels with missing required content | **Not named** | No | Conflicts **with main itself**: same functions as main's hazard-review gate (`_hazardReviewRequired`) and Stage 1 `getSheetGeometryBlockMessage()`. Needs hand integration so all three gates apply | Not trialled | **NEEDS YOUR DECISION** (key prerequisite for M10, M19/M20, M24, M38, M21) |
| **M44** Circle per-line text containment | Not named | No | Clean (the `index.html` part re-generates the old *Vanilla* thumbnail, which #202 replaced, so that part must not be ported) | Guard tests PASS except `decorative-labels-renderer-derived` **FAILS**: it changes the Musk & Sandalwood circle output, so the #202 homepage and lifecycle templates would have to be regenerated | **NEEDS YOUR DECISION** (10 FIT → NOT FIT; changes the approved homepage label) |
| **M45** Curved name / business name clearance | Not named | No | Clean | Same as M44: `decorative-labels-renderer-derived` FAILS (homepage template changes) | **NEEDS YOUR DECISION** |
| **M43** Product names on one line | Not named | No | Conflicts (depends on the M44/M45 stack) | Not trialled | **NEEDS YOUR DECISION** |
| **M04** Composer resolved signal word | Not named | No | Conflicts (6) | Not trialled | **NEEDS YOUR DECISION** |
| **M63** Smart Paste fails closed on joined codes | Not named | No | Conflicts | Not trialled | **NEEDS YOUR DECISION** |
| **M37/M64** Article 26 pictogram precedence | Not approved (handover asks for independent review) | No | Depends on the whole stack | Not trialled | **NEEDS YOUR DECISION** (+ independent review) |

**Totals:**
- **Already present:** 0.
- **Approved and missing:** 9.
  - 4 ready to port now: M03, M51, M55, M56/M57.
  - 5 blocked by dependencies: M10, M19/M20, M24, M21, M38.
- **Need your decision:** 7 (M09/M31, M44, M45, M43, M04, M63, M37/M64). **M09/M31 is the
  critical one.**

## Focused integration plan (not started)
Rules for every phase:
- one new branch per phase, from current main;
- port item diffs only, never the audit branch (it would remove PAYG from `entitlement.js`);
- port each item's own test;
- run the full suite plus the Builder Safety Baseline;
- run a browser QA of Builder and Composer;
- get your visual approval;
- no deploy without explicit approval.

**Phase 1 (no decision needed): M03, M51, M55, M56/M57**
- Branch `fix/builder-approved-batch-1` from `main`.
- Apply the four items' app-code diffs. Add `tests/m03-composer-fine-tune-overrides.js`,
  `tests/m55-bgcolour-validation.js` (mock account updated to the current plan model only) and
  `tests/m56-m57-output-sanitisation.js`.
- Expected visible changes:
  - Composer sheets honour each label's saved fine-tune (M03);
  - custom height capped at 150 mm (M51);
  - invalid saved colours fall back to white (M55);
  - no visible change for normal text (M56/M57).
- No CLP wording, pictogram or fit change. The homepage templates are unaffected (decorative test
  passes).
- **Trial evidence:**
  - setup: a scratch copy of `ae070b6` with all four items plus their three tests (not committed);
  - full suite: 70/75; the only failures are the same 5 baseline;
  - `print-sheet-size-integrity` (Stage 1 / PR #159): PASS, which completes M03's outstanding
    integration check;
  - browser QA: not yet run (part of Phase 1).

**Phase 2: after your decision on M09/M31**
- If approved, hand-integrate the required-content gate *alongside* main's hazard-review gate and
  Stage 1 geometry guard. All three must block, each with its own message.
- Then port M10 (supplier address) and M38 (unknown pictograms) on top.
- M21 can follow; its dependency is minimal.

**Phase 3: P-statement and code fixes (M19/M20, then M24)**
- These change printed P wording and fit outcomes (36 FIT → NOT FIT).
- If the Musk & Sandalwood templates change, regenerate the #202 homepage and lifecycle templates
  from the real renderer, and get your visual approval of the homepage label.

**Phase 4: your remaining decisions**
- M44/M45/M43 (fit tightening; changes the homepage template).
- M04, M63 and M37/M64 (needs an independent review first).

Unchanged by this work: PR #203 (frozen), PR #184 (stale), production.
