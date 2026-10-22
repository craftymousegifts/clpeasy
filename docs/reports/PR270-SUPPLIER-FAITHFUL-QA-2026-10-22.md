# PR #270 supplier wording preservation — development readiness

**Status: HOLD — not release-ready.** High tier. Development branch only; no merge, production deployment, live-service change, payment or real download entitlement consumption authorised or performed.

## Evidence anchors

- Repository: `craftymousegifts/clpeasy`; branch `feat/sds-faithful-section22-stage1-20261021`; draft PR #270.
- Starting remote head verified twice: `50e88fedcfb904450e29e5ac357fa2d848888cdf`, newer than the handover's `ba804f8`.
- Implementation reviewed/tested here: `d8fd2bbeb9a4e4a762dbc2ca6dff38961c1dc007`.
- Baseline comparison: current `main` at `872c8ff731cc74ea868ac6f8ba1a4770ade09edd`. No other draft branch incorporated; #233/#266/#268 unchanged.
- Environment: Linux, Node v24.19.0, repository jsdom; isolated checkout and synthetic local storage. External application calls mocked. Canvas measurement stubbed: this cannot establish actual font geometry, visual fidelity or physical print accuracy.

## Changes actually implemented

1. Supplier H/P/EUH descriptions now take precedence over library descriptions in shared output, including complete EUH208, P280 selected wording, slash/spaced combined P codes, wrapped paragraphs, known PDF row labels and chemical-name hyphen wraps. Source punctuation is retained. Identical repeated statements deduplicate; conflicting/missing wording blocks instead of falling back to a standard description. Continued Section 2.2 headings no longer truncate a wrapped statement.
2. Removed the legacy consumer-product exclusion of nine P statements from Smart Paste. This implements the founder-approved instruction to retain supplier statements; it makes no judgement that every supplied statement is legally appropriate. Unknown library codes with reliable supplier wording are accepted. Existing separately maintained GB unsupported-code safeguards remain for H316/H401/H402.
3. Supplier Signal word values are retained, including explicit None; they are not escalated/downgraded by the H-code resolver. An absent/unrecognised signal field is not guessed. Unlabelled signal formats remain a coverage limitation.
4. Explicit GHS pictogram codes in Section 2.2 override the old H-code inference; explicit `Pictograms: None` is retained. Unknown two-digit GHS tokens reach the existing invalid-pictogram block. Inference when no readable source pictogram information exists remains an open policy issue below.
5. New saved records include the scoped source plus frozen `supplierWording`, `supplierWordingIssues` and `supplierWordingVersion: 1`. Builder and shared saved-record rendering use the same map. Additive fields leave the existing label schema, IDs, mutation coordination and account namespaces intact. Old draft records with source but no map derive it; legacy records without source retain the old library path. This is not a promise of version-stable wording for historical records that never stored wording.
6. Fixed restoration order, cleared source/map on Clear, and fixed readForm retaining stale P codes after an empty field. Source/code mismatches block instead of silently dropping the original descriptions. Product/fragrance review and acknowledgement resets remain.
7. Uncoded standalone Contains information is conservatively flagged for source review, rather than reconstructed from the sensitiser library. This input needs further parser support before claiming full format coverage. Contains inside a coded EUH208 continuation is preserved.
8. Builder/Knowledge Base instructions now explain whole-SDS or Section 2.2 input, Section 2.2-only reading, review and blend limitations. Printing guide explains that printer type alone does not establish compliance. No homepage marketing edited. Context for that explanatory statement: HSE's hazard-label guidance requires the relevant symbols and written warnings, not merely a printer choice: https://www.hse.gov.uk/chemical-classification/labelling-packaging/telling-others-classification-hazard-label.htm (checked 22 October 2026). This is an inference from content requirements, not an HSE quotation about printer technology.

## Executed validation

- `npm run test:sds-faithful`: **PASS**, seven modules, including real Builder extraction/review/save/reopen and shared saved-data output. Two original modules retain structural checks; those are supplemented, not treated as behavioural proof.
- 24 synthetic combinations: four product types, three shapes, minimum/larger sizes. **19 fit / 5 physically blocked**, all expectations pass. Stubbed geometry only.
- Genuine stored Nikura corpus: **100 Section 2.2 extracts, 10% in candle wax; 986 statements; 328 independently recorded PDF substance-name checks**. Parser coverage passes. At a 150 mm synthetic render, 76 fit and 24 block for retained regulatory and/or physical reasons. Every fitting output contains the preserved descriptions. No full-document or other-concentration equivalence claim is made.
- Broader run: **35 modules executed separately using `node tests/<name>.js`, 25-second per-process deadline, four workers: 31 PASS, zero assertion failures, four TIMEOUT**. Running separately prevents one hanging process hiding later test results. Every timeout was reproduced on the baseline `main` checkout with the same environment and deadline.
- `node --check sds-supplier-wording.js`, `node --check label-render.js`, `git diff --check`: PASS.
- Additional checks: optional-label-items (42 fixtures), Composer compaction and font-family structural parity pass on both branch and baseline. Fine-tune override structural check passes, browser portion SKIPPED. Composer identity test times out on both after initial PASS messages (15-second deadline); not counted as a pass.
- Focused independent review found restore-order, blank-continuation, suffix, Step 3, GB-gate and Contains/continued-heading issues. Corrections are covered by executed regressions. This is not final independent release sign-off.

### Timeouts, not passes

| Command | Branch and main result |
|---|---|
| `node tests/payg-account-display.js` | TIMEOUT after multiple PASS messages |
| `node tests/payg-pricing-checkout.js` | TIMEOUT after “PAYG pricing checkout checks passed” |
| `node tests/plan-checker-decision.js` | TIMEOUT; no captured output |
| `node tests/preview-watermark-and-export-authorization.js` | TIMEOUT after final 23-assertion pass message |

The complete chained `npm test` is therefore **not signed off**. No forced exit was added to production or tests to hide these hangs.

## Safeguard audit

| Category | Current behaviour / disposition |
|---|---|
| Physical layout | Existing minimum dimensions, text floors, complete-content overflow, mandatory footer, symbol/edge and invalid-pictogram checks remain. Option A retained: physical failures block; larger-size suggestions are separate from source-data failures. |
| Extraction integrity | Single Section 2.2 scoping retained. Ambiguous/missing wording, frozen-source/code mismatch and uncoded Contains information block; no library substitution in source-active mode. Unsupported source layouts remain a release coverage gap. |
| Product/SDS suitability | Existing product name/type/load reviews, source acknowledgement, hazard confirmation and final review retained. Tests exercise reset/keep/clear routes. |
| Regulatory/data safeguards | GB unsupported-code gate, required business content, EUH208 substance checks and existing optional-item confirmations retained. No new regulatory classification judgement implemented. |
| Legacy recognition | Library-only rejection removed for reliably supplied descriptions in source-active mode. Legacy/manual records without source still need resolvable text; unknown code alone is insufficient. |
| Payments/account data | Existing paths unchanged; mocked regression checks only. New fields travel through existing account-scoped saved-label mutation, not a new store. No live account/Stripe/Supabase operation. |

SVG creation uses the shared renderer; inspected PNG/PDF routes consume Builder SVG output. The tested `forExport` and saved-data paths agree on text. **Actual browser PNG/PDF generation and individual/sheet physical printing were not verified here.**

## Remaining release blockers and decisions

1. **Founder decision — missing pictogram information.** Plain copied SDSs often lose graphical pictograms. Current fallback still infers them from H codes. Recommendation: do not silently present that as extracted supplier information. Choose whether missing readable source symbols should block export until source details are supplied, or whether a separately explicit review of inferred symbols is acceptable. The latter also needs a concrete UI and tests; existing generic review alone is not sufficient sign-off. No new policy silently implemented for this case.
2. **Broader format support:** no fresh Supplies for Candles, Candle Shack or genuine reed-diffuser/room-spray full SDS corpus executed. Stored Nikura extracts cannot prove full-SDS boundaries across vendors. Uncoded Contains fields, image-only symbols, unlabelled signals, unfamiliar page furniture and statements split by unfamiliar headings need coverage/support. Existing unstructured-paste and P-only repeated-heading limitations in `sds-section-scope.js` remain.
3. **Browser/iPhone/exports:** no Chromium executable available. `npx puppeteer browsers install chrome` failed: “End-of-central-directory signature not found” / invalid downloaded ZIP. Real desktop, iPhone Safari, font geometry, SVG/PDF/PNG files and single/sheet print QA remain unverified. No visual screenshots or rendered PDF/PNG sign-off claimed.
4. **Historical browser checks:** `circle-curved-name-collision.js` and `pricing-checkout-ux.js` skip on branch and main because Chromium is absent. The 63 mm Black Pomegranate collision and pricing icon heights are unresolved, not passed. Composer timing/identity remains unresolved as above.
5. **CI:** no PR-triggered test workflow configured in this checkout. Existing workflows are scheduled/manual health/link checks. GitHub returned no PR-triggered runs for the starting head. No production-oriented health workflow was manually triggered.

**Next step:** resolve the missing-pictogram policy, then complete full-document multi-supplier and actual browser/export QA in a browser-capable test environment. Keep PR draft. Founder approval and the established out-of-hours release process are still required before any merge/deployment.

## Broader module results

| Command | Result |
|---|---|
| `node tests/sds-source-confirmation.js` | PASS |
| `node tests/smart-paste-section-scope.js` | PASS |
| `node tests/png-generation-before-credit.js` | PASS |
| `node tests/live-builder-export-hotfix.js` | PASS |
| `node tests/site-scroll-accessibility.js` | PASS |
| `node tests/app-static-audit.js` | PASS |
| `node tests/builder-regression.js` | PASS |
| `node tests/payg-download-accounting.js` | PASS |
| `node tests/payg-account-display.js` | TIMEOUT |
| `node tests/payg-pricing-checkout.js` | TIMEOUT |
| `node tests/payg-immediate-supply-consent.js` | PASS |
| `node tests/plan-checker-decision.js` | TIMEOUT |
| `node tests/account-next-payment.js` | PASS |
| `node tests/pause-duration-wording.js` | PASS |
| `node tests/preview-watermark-and-export-authorization.js` | TIMEOUT |
| `node tests/download-entitlement-sql.js` | PASS |
| `node tests/post-download-print-guidance.js` | PASS |
| `node tests/stage2-print-guidance.js` | PASS |
| `node tests/hazard-source-integrity.js` | PASS |
| `node tests/deno/run.js` | PASS |
| `node tests/sds-faithful-section22-stage1.js` | PASS |
| `node tests/sds-source-snapshot-stage1.js` | PASS |
| `node tests/sds-supplier-wording-stage1.js` | PASS |
| `node tests/sds-print-preservation-stage1.js` | PASS |
| `node tests/sds-supplier-render-behaviour.js` | PASS |
| `node tests/sds-supplier-builder-journey.js` | PASS |
| `node tests/sds-supplier-corpus.js` | PASS |
| `node tests/label-render-fit-contract.js` | PASS |
| `node tests/renderer-block-reason-messaging.js` | PASS |
| `node tests/shared-renderer-integrity.js` | PASS |
| `node tests/print-sheet-composer.js` | PASS |
| `node tests/print-sheet-size-integrity.js` | PASS |
| `node tests/sds-document-composer-gate.js` | PASS |
| `node tests/sds-document-applicability.js` | PASS |
| `node tests/sds-document-recovery-journey.js` | PASS |
