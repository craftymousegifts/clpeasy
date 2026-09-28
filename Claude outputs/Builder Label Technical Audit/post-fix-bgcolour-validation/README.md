# M55 — bgColour validation

Status: IMPLEMENTED — DIRECT SECURITY CONTRACT VERIFIED; FULL BROWSER/FULL-SUITE QA PENDING

## Scope

M55 identified that a saved label's `bgColour` could reach SVG markup without validation in the shared renderer. A tampered browser-storage record could therefore inject SVG attributes/elements in the Print Sheet Composer.

## Implementation

Implementation commit: `70a4392c61531a22343e055d8767b3180f04c844`

The shared renderer now accepts `opts.bgColour` only when it is a string matching:

`^#[0-9a-fA-F]{6}$`

All other values use the existing safe renderer default:

`#ffffff`

Saved data is not rewritten or migrated.

## Regression test

Test commit: `10921b58ce33c92356bf1ffab69d9e8367c02b7d`

`tests/m55-bgcolour-validation.js` covers:
- valid lower/upper-case six-digit hex values;
- short hex, named colours, rgb(), numeric/non-string values;
- empty/missing values;
- attribute-injection payload;
- element/event-handler injection payload;
- malformed XML characters.

The test also asserts that the pre-M55 raw fallback line is absent and that the shared renderer contains the approved validation contract.

## Direct verification performed

The pushed branch was re-read from GitHub after both commits.

Confirmed:
- approved validation rule is present;
- old raw `opts.bgColour || '#ffffff'` path is absent;
- valid six-digit colours are preserved unchanged;
- invalid/tampered values resolve to `#ffffff`;
- the committed test contains the investigation payload classes.

## Branch isolation

Branch: `fix/circle-per-line-text-fit`

No merge to `main`.
No production deployment.

## Remaining QA before sign-off

This execution environment cannot run the repository's Chromium/browser suite and the repository has no GitHub Actions workflow attached to this audit-branch push.

Therefore M55 must NOT yet be recorded as `QA PASSED` or `SIGNED OFF`.

Before sign-off, run:
- `tests/m55-bgcolour-validation.js`;
- Composer browser reproduction proving no injected attribute/element/script execution;
- Composer PDF and cutting-PNG success for the former malformed payload cases;
- representative valid-label before/after output comparison;
- Issues #1–#8 regressions;
- full audit-branch suite.

Expected final status after those pass: `FIXED + QA PASSED`.
