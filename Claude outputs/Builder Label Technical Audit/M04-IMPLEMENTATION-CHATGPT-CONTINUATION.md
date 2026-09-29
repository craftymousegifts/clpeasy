# M04 implementation and QA — ChatGPT continuation

**Date:** 29 Sep 2026  
**Status:** IMPLEMENTED; targeted source/resolver QA passed; full Chromium/suite sign-off still required before production.

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

## QA still required before sign-off
This ChatGPT environment cannot clone GitHub or launch the repository's Chromium test harness because outbound GitHub/DNS/runtime access is unavailable, and this branch has no GitHub Actions run configured. Therefore the following have **not** been claimed as run here:
- real-Chromium M04 matrix;
- Builder Safety Baseline;
- full audit suite (expected historical baseline: 61 pass / 5 known failures);
- PDF/cutting-PNG byte/output verification.

Do not merge to main or production until those executable checks pass.

**Production:** untouched.  
**Main:** untouched by this M04 continuation.
