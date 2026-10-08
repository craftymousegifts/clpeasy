# Smart Paste SDS QA — 8 October 2026

Status: **INCOMPLETE — DO NOT MERGE**

## Scope

The user requested 100 genuine supplier SDS documents exercised through the complete Smart Paste browser workflow, defect fixes on an isolated branch, and retesting. The current branch is `qa/smart-paste-sds-corpus`.

## Evidence

- Eight synthetic hazard-code formatting regression cases passed locally using the patched `label-render.js` (not the same as testing actual supplier SDS documents).
- A proposed M63 patch inserts a space before known hazard-phrase openings when the PDF text layer joins the phrase directly to a recognised H-code. It is not yet committed to GitHub.
- The regression test `tests/sds-pdf-text-joins.js` is committed to this branch.

## Mandatory gates before merging

1. Safely apply and review the M63 patch against the exact branch file, and verify all eight regression tests plus the existing test suite.
2. Obtain at least 100 authentic supplier SDS documents, preserve URLs, supplier, revision dates, concentration scope, and Section 2.2 evidence.
3. Run the complete Smart Paste UI workflow in an isolated browser against each document's relevant SDS text. Record extraction, hazard codes, sensitiser names, signal words, pictograms, required statements, review gates, and export-blocking behaviour.
4. Manually compare every output against the applicable source and investigate discrepancies. Do not infer compliance from a successful parse.
5. Re-run every failing case after a fix; document the before/after results.
6. Confirm no production deployments, database mutations, or live customer interactions occurred during testing.

**No claim of 100-document completion is made.**