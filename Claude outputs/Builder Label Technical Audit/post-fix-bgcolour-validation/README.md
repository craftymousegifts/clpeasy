# M55 — bgColour validation

Status: FIXED + QA PASSED + SIGNED OFF (Michaela, 29 Sep 2026). Repair `6865d89`, test `b192a9c`.

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

## Remaining QA before sign-off (historical — completed 29 Sep 2026; see the QA sections below)

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

## Formatting defect found in QA and repaired (29 Sep 2026)

Browser QA of `70a4392` found that the change had been written with literal `\n` sequences on a single `//` comment line. The `const bgCol=...` declaration was therefore commented out, and **every** `renderLabel()` call threw `ReferenceError: bgCol is not defined`. No label rendered in the Builder or Composer, and the full suite was 17 pass / 48 fail.

The original test (`10921b5`) only checked source text and a copied validation function, so it passed anyway.

- **Repair `6865d89`:** real line breaks. The approved logic is unchanged: a string matching `^#[0-9a-fA-F]{6}$` is used exactly as given; anything else becomes `#ffffff`. Saved data is not changed.
- **Test `b192a9c`:** `tests/m55-bgcolour-validation.js` now runs the real `label-render.js` and `print.html` in Chromium. Verified to fail on the broken `70a4392` renderer, both on its static check and on `bgCol is not defined`.

## QA results (branch at `82fa124`, real Chromium)

- **Valid colours** `#ffffff`, `#ffe4e1`, `#FFE4E1`, `#000000`, `#123456`, `#a1b2c3`: used exactly as given (case preserved); valid SVG.
- **24 invalid/tampered values** (including missing, empty, null, `#fff`, `red`, `rgb(10,20,30)`, `123`, NaN, ±Infinity, objects, arrays, booleans, spaces, 7-digit values, bad hex, a newline, script markup, the attribute and element/event-handler payloads, and `#fff&x<`): each renders byte-identically to `#ffffff`, as valid SVG, with nothing injected and the same fit and font sizes. Checked for circle, square and rectangle.
- **Original attack reproductions in the Composer:**

| Payload | Before M55 | After |
|---|---|---|
| attribute | injected into thumbnail and preview | none |
| element/`onerror` | script ran twice | nothing injected or run |
| `#fff&x<` | invalid SVG; A4 PDF and cutting PNG failed | valid; PDF and PNG succeed |

  The thumbnail and preview cell are safe for every value; the A4 PDF is written and the cutting PNG generated (709×709); placement is identical to a white control.
- **Legitimate labels, before vs after M55:** 16 cases / 73 fields, 0 differences.
  - Builder: circle, square and 63×44 rectangle × `#ffffff`, `#ffe4e1`, `#a1b2c3` (preview, export SVG, PDF window, downloaded SVG).
  - Composer: all six valid colours plus missing (preview cells and positions, thumbnail, A4 PDF sheet, cutting PNG).
- **Not affected:** fit, layout, dimensions, saved data, accounting, GB CLP logic.
- **Full suite:** 60 pass, 5 fail. The 5 are the long-standing audit-branch baseline failures, with no new failures. The Issues #1–#8 tests pass.
- **Builder context:** the Builder's colour picker shows a non-`#rrggbb` stored value as black. This is existing browser behaviour; no separate finding is recorded (Michaela's decision).
