# Issue #10 / M58 — real-browser rendering tests — investigation

Status: INVESTIGATED — NO APPLICATION CHANGE

## Original audit finding

Original audit commit: `99fbb21`

M58 — Tests / Real-browser rendering — HIGH.

Original matrix requirement: real-browser tests must exist for layout rules. At the time of the original audit, the existing suite used jsdom/fake text metrics and could not catch the circular-label clipping defect. The audit harness itself rendered 144 synthetic labels in headless Chromium with real fonts and was explicitly identified as the starting point for permanent test infrastructure.

## Current audit-branch position

M58's original factual premise is no longer true.

Subsequent fixes added permanent Puppeteer/Chromium regression tests under `tests/`, including:

- `circle-per-line-text-containment.js` — real Chromium; measures actual rendered glyph positions for Issue #1.
- `circle-product-name-business-name-clearance.js` — real Chromium with controlled embedded DM Sans / Georgia-metric fonts for Issue #2.
- `product-name-one-line-sizing.js` — real Chromium with controlled Georgia-metric font scenario for Issue #3.
- `m03-composer-fine-tune-overrides.js` — real Chromium Builder/Composer parity for Issue #8 when Puppeteer/Chromium is available.
- `unknown-pictogram-keys.js` — real Chromium Builder flows for Issue #7.

The original audit harness also remains available on the original audit branch as historical evidence.

## Classification

QA/test-infrastructure finding, not a GB CLP regulatory issue.

## What is fixed

The highest-risk renderer/layout rules that motivated M58 now have permanent real-browser regression coverage. In particular, the circle clipping class that the original jsdom-only suite missed is now explicitly tested using real Chromium glyph geometry.

## What remains imperfect

The repository's top-level `npm test` script still names only two tests, so merely running `npm test` does not guarantee that all browser renderer regressions execute.

Several browser tests can also skip when Puppeteer/Chromium is unavailable. There is currently no GitHub Actions run attached to this isolated audit branch that proves those browser tests execute automatically on every push.

That is a test-runner/CI orchestration gap, distinct from the original claim that real-browser tests do not exist.

## Decision options

### Option A — recommended for this audit

Treat M58's substantive renderer-coverage requirement as RESOLVED BY SUBSEQUENT WORK, because permanent real-Chromium tests now exist for the critical layout rules discovered by the audit.

Record a separate test-orchestration improvement: ensure the project's canonical full-suite command/CI cannot silently omit or skip the required browser renderer tests.

No application code change.

### Option B

Promote the entire original 144-render audit harness into one monolithic permanent test. This duplicates newer targeted tests, is heavier, and would make failures less focused.

### Option C

Leave M58 OPEN until a CI workflow is introduced. This conflates two issues: existence of real-browser layout tests (now true) and guaranteed CI execution (still incomplete).

## Recommendation

Option A.

The original M58 risk has been materially addressed by the targeted Chromium tests created while fixing Issues #1–#3, #7 and #8. Do not add a second monolithic harness solely to satisfy the old wording.

Before final production integration, however, the canonical full-suite process must explicitly execute the required browser tests in an environment where Chromium is present and must report a failure rather than silently treating missing browser coverage as a successful full QA pass.

## Application code changed

NO

## GB regulatory relevance

NONE
