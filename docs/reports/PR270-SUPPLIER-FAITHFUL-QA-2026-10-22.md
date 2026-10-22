# PR #270 supplier wording preservation — development readiness

**Status: HOLD — not release-ready.** High tier. Development branch only; no merge, production deployment, live-service change, payment or real download entitlement consumption authorised or performed.

## Current verification position (latest follow-up)

Earlier sections retain the chronological evidence; the later browser and supplier follow-ups supersede their original environment limitations only where explicitly stated.

| Check | Latest result |
|---|---|
| Seven-module source-preservation suite, stored Nikura corpus, four wider supplier formats, targeted Builder/Composer regressions | PASS; details and applicability limits below |
| Chrome extraction, guest save/reopen, UFI and complete Composer text | PASS on implementation preview `5c93d4c` |
| Saved explicit None signal/pictograms and reset reviews | PASS in Chrome on `a70ed86` (documentation-only successor of the same implementation) |
| 63 mm synthetic Room Spray / Black Pomegranate preview | Full source text retained in Builder and Composer; visually clear header in this fixture |
| Actual individual SVG/PNG files | Earlier 90 mm files verified; this later 63 mm run did not return a completed download and is unverified |
| PDF, iPhone Safari, signed-in sheet exports and physical printing | OPEN; browser PDF observation blocked, no workaround attempted |
| Four earlier timeout modules | PASS after test-page cleanup and adequate runtime; see final follow-up |
| Automated pixel-gap/DPR matrix | OPEN; the one visual 63 mm check does not replace those tests |

## Cross-chat reconciliation — Digital visibility plan

Michaela asked on 22 October to reuse checks completed in that conversation. Retrieved conversation evidence confirms the mobile pricing text check after a reload: trial watermark wording, PAYG/Unlimited watermark-removal text and no sideways scrolling. Those are accepted as completed for PR #274; do not request them again for #270. PR #272 separately records passing quantity/restoration/Builder and SVG/PDF-source rendering checks at `0f5ae88`; these are retained at that scope. Its PR description still lists mobile and actual binary exports as unverified and is not evidence that #270 supplier text was tested.

PR metadata checked: #274 at `ca45e6a` and #272 at `0f5ae88`, both separate draft branches. Neither is incorporated into #270. Their tests establish their own wording/quantity behaviour, rather than #270's longer supplier statements. The exact test attached to the later “Let's treat that as passed” reply was not recovered; no additional pass is inferred from that phrase alone.

### Remaining checks specifically for this change

1. Inspect actual #270 63 mm SVG/PNG and PDF output for complete supplier wording, including contact-lens paragraphs, EUH208, supplemental text and UFI. Earlier 90 mm SVG/PNG checks stay passed.
2. Verify the changed supplier-text path on real iPhone Safari, reusing earlier general mobile checks rather than repeating pricing/homepage tests.
3. Verify complete supplier text in a signed-in Composer sheet export. Guest saved-label/Composer text checks stay passed.
4. Confirm actual-size physical output preserves dimensions, legibility and full text. Earlier print calibration is background evidence, not a measurement of these changed dense labels.
5. Close the existing automated layout/DPR checks at the final release gate. The four previously timed-out modules now pass after harness cleanup and an adequate runtime window; see final follow-up.

No repeated pricing, plan-watermark-copy or grams/ml feature test is requested. This reconciliation changes evidence tracking only; no additional implementation, merge or production deployment.

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
7. Standalone supplier Contains information and unencoded text under supplemental/additional labelling headings are now preserved automatically in a frozen `supplierSupplemental` list, rendered and saved/reopened with the rest of the supplier wording. It is not reconstructed from the sensitiser library and no extra customer decision is required. Contains inside a coded EUH208 continuation is also preserved. An empty Contains field remains an incomplete-source review.
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
| Extraction integrity | Single Section 2.2 scoping retained. Ambiguous/missing wording, frozen-source/code mismatch and empty Contains information block; no library substitution in source-active mode. Unsupported source layouts remain a release coverage gap. |
| Product/SDS suitability | Existing product name/type/load reviews, source acknowledgement, hazard confirmation and final review retained. Tests exercise reset/keep/clear routes. |
| Regulatory/data safeguards | GB unsupported-code gate, required business content, EUH208 substance checks and existing optional-item confirmations retained. No new regulatory classification judgement implemented. |
| Legacy recognition | Library-only rejection removed for reliably supplied descriptions in source-active mode. Legacy/manual records without source still need resolvable text; unknown code alone is insufficient. |
| Payments/account data | Existing paths unchanged; mocked regression checks only. New fields travel through existing account-scoped saved-label mutation, not a new store. No live account/Stripe/Supabase operation. |

SVG creation uses the shared renderer; inspected PNG/PDF routes consume Builder SVG output. The tested `forExport` and saved-data paths agree on text. **Actual browser PNG/PDF generation and individual/sheet physical printing were not verified here.**

## Remaining release blockers and decisions

1. **Founder direction confirmed, 22 October:** keep the workflow automatic; do not introduce the proposed extra customer choice about missing pictograms. Preserve Section 2.2 label information. Explicit GHS tokens remain authoritative; the existing automatic fallback plus normal label review remains while source-format coverage is tested. Copied text can lose graphical symbols, so this remains a verification gap, not a claim that every graphical SDS is supported.
2. **Broader format support:** no fresh Supplies for Candles, Candle Shack or genuine reed-diffuser/room-spray full SDS corpus executed. Stored Nikura extracts cannot prove full-SDS boundaries across vendors. Image-only symbols, other uncoded label fields, unlabelled signals, unfamiliar page furniture and statements split by unfamiliar headings need coverage/support. Existing unstructured-paste and P-only repeated-heading limitations in `sds-section-scope.js` remain.
3. **Browser/iPhone/exports:** no Chromium executable available. `npx puppeteer browsers install chrome` failed: “End-of-central-directory signature not found” / invalid downloaded ZIP. Real desktop, iPhone Safari, font geometry, SVG/PDF/PNG files and single/sheet print QA remain unverified. No visual screenshots or rendered PDF/PNG sign-off claimed.
4. **Historical browser checks:** `circle-curved-name-collision.js` and `pricing-checkout-ux.js` skip on branch and main because Chromium is absent. The 63 mm Black Pomegranate collision and pricing icon heights are unresolved, not passed. Composer timing/identity remains unresolved as above.
5. **CI:** no PR-triggered test workflow configured in this checkout. Existing workflows are scheduled/manual health/link checks. GitHub returned no PR-triggered runs for the starting head. No production-oriented health workflow was manually triggered.

**Next step:** complete full-document multi-supplier and actual browser/export QA in a browser-capable test environment. Keep PR draft. Founder approval and the established out-of-hours release process are still required before any merge/deployment.

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

## Follow-up: simplify the customer flow (22 October)

Founder rejected the extra pictogram decision and asked for all Section 2.2 label data to flow through automatically. No new choice or missing-pictogram block was added. Fixed an unnecessary stop for standalone Contains statements and missing unencoded supplemental wording: preserve the exact supplier text, freeze it in saved labels and render it in Builder/Composer. Focused seven-module suite passes; additional Builder save/reopen, fit contract and Composer checks pass. The 35-module results above describe the earlier broader run; those four known baseline timeouts and outstanding browser/supplier coverage are not reclassified as passed.

## Follow-up: real browser and wider supplier formats (22 October)

This supersedes the earlier browser-unavailable and no-fresh-supplier statements **only for the checks listed here**. Browser evidence anchors to preview head `bbe1f0181b90107340824844019e2260eedc50e7` at https://deploy-preview-270--clpeasy.netlify.app. Subsequent UFI/reopen fixes are separately covered by local tests and independent diff review; no claim those fixes were browser-tested yet.

Actual cloud Chrome, signed out: pasted a complete synthetic room-spray SDS with deliberately conflicting Section 3 H300/Danger text. Builder retained only Section 2.2, including full combined P305+P351+P338/contact-lens paragraphs, supplier P280, reliable test P999, Contains and uncoded supplemental information. Saved a guest test label, reopened it and opened it in Print Sheet Composer. Composer showed the same safety text on a 90 mm circle, with the expected guest watermark. Screenshot: [Composer synthetic preview](pr270-qa/composer-synthetic-preview.jpg). No real customer, account, payment or credit operation.

Actual guest SVG download: 90 × 90 mm, 108,734 bytes; XML checks retained all seven expected source phrases and excluded the outside-section fatal-swallowing statement. Actual guest PNG: 2,126 × 2,126 px, 586,662 bytes; visually inspected full label, no safety-text clipping observed. PDF opened a blob print view, whose observation was blocked by browser policy; **PDF output remains unverified**, with no workaround attempted. Signed-out sheet export remained gated. iPhone Safari, signed-in sheet export, real font/size coverage across the matrix and physical printing remain open.

Fresh source-format checks used three complete supplier PDFs converted with `pdftotext -layout`, plus a web reading-order extraction of a fourth supplier PDF. These documents cover different products and dates: they are copying tests, not approval to substitute one concentration or product SDS for another.

| Source | Version/date and input | Section 2.2 outcome |
|---|---|---|
| Nikura Nag Champa, 10% in candle wax | v1, 21 July 2025; supplied full PDF | All 11 H/EUH/P statements; no Section 3/16 pollution |
| Candle Shack Black Pomegranate FRAG0130, neat fragrance | UK v4, 17 August 2026; full PDF and web reading order | All 15 statements plus UFI; identical output from both text orders |
| 151 PAN AROMA Fluffy Towels room spray PAN0363 | revision 1, 20 March 2017; historical full PDF | EUH208 and all four P statements; Section 3 ethanol H225 excluded |
| Supplies for Candles Natural Diffuser Base | v1, 14 June 2023; web extraction of complete PDF | Both H and all three P statements, preserving punctuation |

Primary sources: [Candle Shack document listing](https://platform.candle-shack.co.uk/regulatory/black-pomegranate?region=UK), [151 PDF](https://www.151.co.uk/media_files/file/datasheet/PAN0363%20-%20v1%20SDS.pdf), [Supplies for Candles PDF](https://www.suppliesforcandles.co.uk/wp-content/uploads/saved_attachments/NATURAL%20DIFFUSER%20BASE%20(EN)%20(2023-07-13)%20-%20SDS-23037.pdf). Nikura was the existing supplied document. Source text hashes are enforced by `tests/sds-multi-supplier-full-documents.js`; source texts remain in the QA working directory rather than republishing supplier PDFs. Run `node tests/sds-multi-supplier-full-documents.js ../qa-sds` with those retained files. All four cases retain every parsed statement and supplemental line in 150 mm shared-renderer output (stub canvas, not browser/physical fit sign-off). Graphical pictograms are supplied test metadata in this harness; it does not prove automatic extraction of PDF images.

Found and fixed: Candle Shack's two-column UFI was previously omitted. Preserve the supplied identifier automatically, including common one-line and reading-order forms. An unreadable UFI is flagged rather than silently dropped. A PDF text layer exposed a printed chemical-name hyphen as STX: the original rendered PDF confirmed the glyph, and normalization now preserves it. Other invalid XML control characters trigger integrity review. Source labels with an explicitly empty saved pictogram list retain it on reopening. Opening a saved label also clears previous hazard/final-review checks so they cannot be carried from a different label.

Validation: seven-module `npm run test:sds-faithful` PASS, including 100 stored Nikura extracts; four wider source-format cases PASS (36 statements plus one UFI), including Candle Shack text-order parity. Targeted independent review found no blocker in this delta and reran renderer, saved-label, unreadable-UFI and corpus checks. Earlier baseline timeouts remain unresolved; no full-suite pass claimed.

**Result: HOLD / draft.** Continue preview verification of the latest fixes, PDF/iPhone/signed-in Composer/physical-print checks and existing release gates. No merge or production deployment authorized or performed.

### Updated-preview verification

Netlify reported successful preview deployment for implementation head `5c93d4c08a012de4df3e2133978ddab5c613cd5b`. Reloaded Chrome and verified that checking final review then reopening the saved label resets the checkbox and disables exports pending review. On the updated preview, added a deliberately synthetic UFI `TEST-0000-0000-0000` using the two-column supplier field format. It survived automatic extraction, guest save, the actual downloaded SVG (valid XML, full contact-lens wording still present) and Composer's saved-label text. [Updated Composer screenshot](pr270-qa/composer-ufi-preview.jpg). Explicit-empty-pictogram reopening remains covered by behavioural/local tests, not a separate browser assertion. No change to the PDF/iPhone/signed-in sheet/physical-print limitations above.

Additional targeted commands after the final implementation edits: `sds-source-confirmation`, `hazard-source-integrity`, `renderer-block-reason-messaging`, `print-sheet-composer`, `print-sheet-size-integrity` and `builder-regression` all PASS; `git diff --check` PASS.


### Further Chrome checks: explicit None and 63 mm layout

Preview branch head `a70ed86b76c7da78ca348a931d3b32093a5032d4`, same implementation tree apart from evidence files. A deliberately synthetic source containing H317 plus explicit `Signal word: None` and `Pictograms: None` exercised persistence independently of classification correctness. Extracted, saved and reopened: zero selected pictograms, neither signal button selected, hazard review false and final review false. This is a software preservation test, not approval of that fictional classification.

Re-extracted the full synthetic Warning/GHS07 fixture at 63 mm, with product name Black Pomegranate, business name Synthetic QA — Not for sale and Room Spray type. Builder and Composer retained H317, full EUH208, Contains, uncoded supplemental information, P280, full P305+P351+P338 including contact-lens/continue-rinsing sentences and the reliable synthetic P999 description. Composer DOM text was checked with explicit tspan spacing. [Builder 63 mm screenshot](pr270-qa/builder-63mm-label.jpg) shows clear product-name/business-name/type/signal spacing in this fixture; no automated pixel-gap or device-ratio matrix pass is claimed.

The later SVG/PNG clicks did not produce a confirmed download event or synchronized file; a pre-click SVG download wait timed out at five seconds. No product error was observed. Chrome's downloads page could not be inspected because the browser URL policy disallows `chrome:`; no alternate route to that blocked surface was attempted. Therefore this run does not extend the earlier actual 90 mm export sign-off to 63 mm. PDF, iPhone Safari, authenticated sheets and physical checks remain open. No further production-code change was made during these checks.


## Follow-up: automated timeout investigation

Investigated the four earlier 25-second timeouts without changing production code. Test-owned jsdom pages were never closed in the account-display, checkout and preview-authorisation modules, leaving page timers alive after assertions. Their harnesses now register their pages and close them in `finally`, after all assertions or on failure. The plan checker receives the same cleanup; its numerous real-time UI transitions require a longer observation window. Existing assertion code is byte-for-byte unchanged. No forced-success exit or skipped assertion was added. An intentional error injected in memory after pricing-page creation still exits with status 1, confirming failure propagation and cleanup.

| Module | Complete post-cleanup run |
|---|---|
| PAYG account display | PASS, exit 0, 30.82 s, 16 groups |
| PAYG pricing checkout | PASS, exit 0, 5.80 s |
| Preview watermark/export authorisation | PASS, exit 0, 23.84 s, 23 assertions |
| Plan checker | PASS, exit 0, 108.57 s; 27 branching paths and 8 account-state page cases |

The original 25-second account-display deadline was also shorter than its observed complete run. The unchanged plan-checker run was separately stopped at 90 seconds without a result; that cutoff is not an assertion failure or a pass. Production payment, entitlement, auth and label-rendering code are unchanged by this follow-up. These mocked checks do not replace actual signed-in sheet exports, PDF/iPhone output or physical printing. Earlier broader results remain historical; the complete chained `npm test` has not been rerun or signed off.
