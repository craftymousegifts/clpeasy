# Smart Paste SDS QA — 8 October 2026

Status: **INCOMPLETE — DO NOT MERGE**

## Scope

The user requested 100 genuine supplier SDS documents exercised through the complete Smart Paste browser workflow, defect fixes on an isolated branch, and retesting. The current branch is `qa/smart-paste-sds-corpus`.

## Evidence

- Eight synthetic hazard-code formatting regression cases passed locally using the patched `label-render.js` (not the same as testing actual supplier SDS documents). Four further synthetic cases were committed to the GitHub test file; their GitHub CI outcome is not yet verified.
- The M63 patch is committed to this isolated GitHub branch in `label-render.js` and visible in draft PR #225. It inserts a space before known hazard-phrase openings when PDF text joins the phrase directly to a recognised H-code.
- The regression test `tests/sds-pdf-text-joins.js` is committed to this branch.

## Mandatory gates before merging

1. Verify the committed M63 patch in GitHub CI, all twelve synthetic regression cases, and the existing test suite. GitHub's initial run failed 3/8 on the unpatched source; the subsequent run is not verified.
2. Obtain at least 100 authentic supplier SDS documents, preserve URLs, supplier, revision dates, concentration scope, and Section 2.2 evidence.
3. Run the complete Smart Paste UI workflow in an isolated browser against each document's relevant SDS text. Record extraction, hazard codes, sensitiser names, signal words, pictograms, required statements, review gates, and export-blocking behaviour.
4. Manually compare every output against the applicable source and investigate discrepancies. Do not infer compliance from a successful parse.
5. Re-run every failing case after a fix; document the before/after results.
6. Confirm no production deployments, database mutations, or live customer interactions occurred during testing.

**No claim of 100-document completion is made.**
## QA audit trail

- Draft pull request: https://github.com/craftymousegifts/clpeasy/pull/225 (must remain unmerged).
- First GitHub Actions run: dependency installation passed; joined-text cases `H317May`, `H412Harmful`, `H350iMay` failed 3/8 before M63 was committed.
- The QA branch now contains the M63 `label-render.js` fix and a 12-case synthetic test file.
- GitHub workflow updated with PR trigger, dependency checks, and Chrome installation; no successful completed run has been independently verified.
- Local environment: `jsdom` and `puppeteer` package directories exist but are incomplete; SDS applicability and composer tests fail to load `jsdom`, and browser recovery test skips Puppeteer. This is an environment issue, not a product defect finding.
- Supplier-document sample count actually verified through Smart Paste browser: **0 / 100**. No supplier SDS correctness claims can be made.
- Netlify deploy preview status was reported successful for PR #225; this is not equivalent to passing QA.

## Verified GitHub Actions evidence (run #37807585041)

The post-fix isolated GitHub Actions run reached and **passed** these steps: dependency installation, browser installation, PDF joined-text regression, SDS document applicability, SDS document recovery, and SDS document composer gate. The existing full repository suite was still **in progress** at the latest check; no overall CI pass is claimed. This run uses synthetic/existing automated fixtures, not the 100 real supplier SDS corpus. Link: https://github.com/craftymousegifts/clpeasy/actions/runs/37807585041
