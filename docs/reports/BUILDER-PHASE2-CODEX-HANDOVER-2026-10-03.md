# Phase 2 Builder integration — Codex handover, 3 October 2026

## State and safety

Review branch: `fix/builder-phase2-codex`. Code commit: `e5477dd24d54240c38bb7116570788bb1b212846`.
Base and unchanged remote main: `6bd9a0077eac27eecd3e027c6f099b8a8eaf1069`.
The most recent production deploy reported by the owner/Claude is `6ac15532a64d0600072093bd` from that main commit. Codex did not independently query Netlify or publish a deployment.

Claude's partially completed local Phase 2 branch was not present remotely. Codex rebuilt the approved integration on a new branch, without replacing any Claude branch or merging the old audit stack. The GitHub connector published a commit whose tree is byte-identical to the tested local integration (`bb0b86370e96ba7e39dcb5f2368358327a2a8784`). Shell Git had no authenticated push connection.

No changes to main, production deployment, Stripe, Supabase functions, SQL, database data, secrets or Netlify configuration. PR #203 remains frozen. There is no production deployment approval in this handover.

## Implemented approved items

| Item | Result |
| --- | --- |
| M09/M31 | Missing product name, business name or EUH208 sensitiser names blocks every Builder export and the entire Composer sheet. Missing-content metadata is separate from physical fit; preview placeholders can remain while editing. |
| M10 | A blank/whitespace-only supplier address blocks Step 4 and export, including old saved records in Composer. Step navigation and the Next button both check it. This checks presence, not postal validity. |
| M38 | Unrecognized pictogram keys block export and name the bad key. No substitute pictogram is drawn; no automatic repair or misleading size advice. Re-extracting hazards can repair a label; only the maker's explicit save updates the saved record. |
| M21 | Smart Paste preserves complete, case-sensitive suffixed H codes. Nine approved codes render their existing audit-library statements, with corresponding signal words and GHS08. Unsupported suffixes remain intact and are blocked, rather than reduced to their base code. |

Source ports were restricted to M09/M31 (`cc3c9f8`), M38 (`e1c0a32`), M21 (`fbdae72`, `a762538`) and M10 (`6f70631`, `21a83d1`, `9eff958`), with the later M10 browser test from `b5ad2db`. Conflicts were fitted manually around current gates. The M09 follow-up's message-ordering intent is preserved: an existing physical/confirmation problem is not hidden by missing content.

M19/M20, M24, M44/M45/M43, M04, M63 and M37/M64 were not ported. The existing P-statement libraries are unchanged. This work does not independently reclassify formulations or claim new legal verification.

## Existing behavior preserved

- Builder hazard-source review, supplier-document confirmation and physical-fit checks remain mandatory.
- Composer grid geometry, final physical sheet geometry, supplier-document confirmation and fit checks remain mandatory, alongside the new content check.
- Draft saving remains available under the previously released rules; a missing document confirmation is not turned into a blanket Save prohibition.
- Fine-tune settings, Phase 1 height/colour/character/PDF fixes, PAYG accounting and entitlement logic are retained.
- Homepage artwork, founder content, pricing, seasonal design and supplier-document coverage rules are untouched.
- Current saved records are never silently rewritten by the renderer or Composer.

## Regression evidence

**Full suite: 78/83 passed. The five failures are exactly the previously recorded baseline; no new failures.**

The final suite and its exact failure list are recorded in `BUILDER-PHASE2-CODEX-TEST-RESULTS-2026-10-03.json` alongside this handover.

- Required-content test: 11 records, 33 SVG/fit/warning fingerprints compared with unmodified main, six incomplete Composer records blocked and two complete records exporting; Chromium exercises the Builder's blocked export routes.
- Unknown-pictogram test: 105 valid-key SVG/fit/warning fingerprints compared with unmodified main; 11 invalid-key cases; desktop/mobile recovery, 16 refused export attempts, and Composer blocking without saved-record mutation.
- Suffixed-code test: 78 extraction cases, 9,504 ordinary-code boundary comparisons, 36 real Chromium journeys and 108 exports, plus nine Composer records exporting the full statements.
- Supplier-address test: three groups using the real shared checker and Chromium Builder/Composer. Valid addresses export; blank, whitespace and absent legacy addresses refuse export without billing or file delivery.
- Builder safety baseline: all 10 labels retain their rendering, fit, pictograms, dimensions, text and output results. Its snapshot changes only `requiredComplete: null` to `true`, because these existing complete fixtures now have completeness metadata. The two previously blocked rectangles stay blocked.
- Homepage/lifecycle renderer-derived template checks pass; approved image and homepage files were not changed.

Older complete fixtures now include actual supplier names/addresses and current supplier-document/entitlement prerequisites. No production bypass was added. The Composer fit harness now awaits library initialization instead of assuming 50 ms is enough. A successful-download guidance fixture uses a fitting 63 mm circle: its full footer also clipped at 52 mm on unmodified main in this Chromium environment. Its former missing-product-name PDF charge expectation was changed to expect refusal and no charge, as required by M09. Negative fit/accounting checks remain.

The four new tests run real Chromium, not skipped browser checks. Runtime: Node 24, Chromium 153, jsdom and Puppeteer. Server-side offline Deno tests were not rerun: Deno is unavailable here and no server-side code changed. Generated screenshot changes were restored and excluded.

## What remains before any release

1. Re-fetch main and this review branch. Check for concurrent changes; never overwrite another workstream.
2. Build a fresh **Test** preview using Test Supabase and Stripe Sandbox settings. This branch has not been deployed to the existing Test site; its current URL still shows the previously released document-check work.
3. Review missing-content and unknown-pictogram notices at phone/desktop widths. Verify a complete existing label still exports and a label with missing supplier content can be corrected and saved without changing its design.
4. Run a real signed-in Test Builder → save → reopen → Composer → export journey when Test login/network access is available. Chromium integration tests here used synthetic accounts and local browser storage, not a real customer account.
5. Obtain Michaela's explicit production approval for this Phase 2 batch. If approved later, record rollback to the then-current production deploy, verify scope again, release normally and smoke-check.

Do not merge PR #203 or the old audit branch. Do not bundle the remaining audit phases. No Live card payment is required or authorized.
