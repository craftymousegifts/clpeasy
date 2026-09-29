# M04 implementation and QA — ChatGPT continuation

**Date:** 29 Sep 2026  
**Status:** FIXED + QA PASSED + SIGNED OFF. Executable GitHub Actions QA completed 29 Sep 2026; main/production untouched.

## Scope
M04 fixes the Composer-only mismatch where an old/tampered saved `signal` could be printed instead of the signal word the Builder derives from the same hazard statements.

## Application changes
- `label-render.js`: the existing Builder signal-word table, ambiguous-code list, normaliser and resolver are now shared exports.
- `builder.html`: uses aliases to the shared normaliser/resolver. The old regulatory table/logic was removed from Builder, not changed.
- `print.html`: `renderSheetPosition()` makes a render-only copy and derives `signal` from saved `hStatements` using the shared resolver. Saved data is not mutated.
- `renderLabel()` itself is unchanged.
- No schema, hazard-code, pictogram, fit-rule, geometry or golden-snapshot change.

## Regulatory-logic identity check
Compared against pre-M04 audit commit `7702396`:
- `GB_CLP_SIGNAL_WORD_BY_CODE`: byte-identical.
- `GB_CLP_SIGNAL_WORD_AMBIGUOUS_CODES`: byte-identical.
- `normaliseSdsSignalWord`: byte-identical.
- `resolveGbClpSignalWord`: byte-identical.

The table remains subject to the final GB-primary pre-production regulatory verification.

## Targeted checks run here
A 16-case resolver matrix covering current, legacy and tampered values passed, including H317, H304+H317, H412, H290, H317+H334, missing/arbitrary/numeric values and ambiguous H228 cases. The simulated Composer render-copy path left every source record unchanged.

A dedicated regression file was added:
`tests/m04-composer-signal-word-consistency.js`.

## Important continuation note
During implementation, two integration mistakes were detected by source inspection before sign-off:
1. the first shared move omitted the resolver function itself;
2. Builder temporarily retained a local resolver after adding the shared alias.
Both were corrected on the audit branch before this record. Current source has exactly one regulatory table (in `label-render.js`), no local Builder resolver, and Composer calls the shared resolver.

## Executable QA completed
Because the local ChatGPT container could not clone GitHub, a temporary push-triggered QA job was added to the audit branch's existing health-check workflow, run on GitHub Actions, and then fully reverted. The workflow file is byte-identical to its original blob after QA.

Final successful run: GitHub Actions run 36546303775.

Results:
- M04 targeted resolver/structure regression: PASS (14 resolver cases).
- Existing GB CLP signal-word resolution test: PASS.
- Suffixed hazard-code test: PASS, including real Chromium desktop/mobile flows and Composer outputs.
- Builder Safety Baseline: PASS with the existing golden snapshot unchanged.
- Full audit suite: **62 PASS / 5 FAIL**. The pass count is one higher than the prior 61 because the new M04 regression test is now included.
- The five failures are exactly the known long-standing audit-branch baseline failures:
  - builder-desktop-scroll-model.js
  - builder-step-navigation-layout.js
  - footer-and-compliance-wording.js
  - lifecycle-reminder-accuracy.js
  - smart-paste-user-guidance-wording.js
- No unexpected failure was found.
- The initial bare-Node M04 test fixture was corrected to run the browser-facing renderer inside JSDOM; this was test-only and did not alter application behaviour.
- Chromium was installed only in the ephemeral GitHub Actions runner.

The M04 application implementation itself was not changed during executable QA.

**Production:** untouched.  
**Main:** untouched by this M04 continuation.

**RESULT: M04 FIXED + QA PASSED + SIGNED OFF.**
