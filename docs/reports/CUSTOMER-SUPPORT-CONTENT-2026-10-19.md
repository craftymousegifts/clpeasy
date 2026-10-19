# Customer support and website content revision

## Current status — HSE evidence correction approved and implemented

The owner supplied the original HSE reply dated 16 June 2026 and approved the exact replacement passages on 19 October 2026. The earlier HSE source-access hold below is resolved by correcting the unsupported claims, not by treating HSE's reply as a software exemption. Compliance, FAQ and homepage use the approved factual summary; the regulatory statements in Compliance and Terms match exactly. The pre-launch HSE badge is removed. Terms' last-updated date is 19 October 2026. No other Terms clauses change.

The HSE source says supplier classification/labelling responsibility remains with the supplier, use of tools is the supplier's choice, errors causing loss may lead to redress, and HSE cannot advise on software development/disclaimers or recommend guidance. It does not confirm that no specific obligations apply to CLPeasy. The 16 June reply also says the original message could not be found; no pre-launch assessment is asserted. Full private correspondence has not been published in the repository.

A focused independent review of this correction found no material source mismatch or lost surrounding structure. Exact Compliance/Terms statement equality, unchanged inline scripts, removal of unsupported claims and static content checks pass. Desktop/mobile-size browser checks cover the four revised pages. The separate concentration/Article 18 questions remain outside this correction and unresolved.

Cricut-specific guide remains outside public release. Remaining release requirement is founder approval under the agreed out-of-hours process; no merge or production deployment has been performed. The unrelated baseline plan-finder test failure remains documented below; the full suite is not claimed green.

The remainder of this report preserves the earlier implementation and investigation history; earlier statements that the HSE reply is unavailable or remains REVIEW are superseded by this current status.

Owner approved the complete CLPeasy-Content-Review-Proposal.md in chat on 19 October 2026. Base: main `3a9524e8184538bdd1ead12b0cbe1ac867e7a913` (v1.3.0).

## Scope

Support, Compliance & Transparency, FAQ, homepage and Knowledge Base copy; new blend article and separate printing hub, hand-cut and Cricut guides. Existing /knowledge#blended accordion and links retained. Support checkbox values and submission code unchanged; two visible labels updated. No Builder, hazard logic, billing, authentication, database or export changes.

Use CLP Ready; distinguish classification from label creation. The current Builder needs suitable SDS extraction documentation, cannot combine SDSs or classify blends and provides no manual hazard overrides. The 10%-SDS/lower-load question remains unresolved: obtain provider confirmation, no blanket legal rule asserted.

## Evidence and review

Authoritative pages opened/read 19 October 2026:

- https://www.hse.gov.uk/chemical-classification/legal/clp-regulation.htm — GB scope.
- https://www.hse.gov.uk/chemical-classification/what-to-do/use-chemicals.htm — changed compositions and downstream-user duties.
- https://www.gov.uk/government/publications/general-product-safety-regulations-2005/general-product-safety-regulations-2005-great-britain — separate GB product-safety duties.
- https://www.businesscompanion.info/en/quick-guides/product-safety/candles-diffusers-oil-heaters-etc — Trading Standards candle testing guidance; standards are distinct from certification.
- https://help.cricut.com/hc/en-us/articles/360009387274-How-to-Print-Then-Cut-in-Design-Space — manufacturer workflow only.

High tier because wording is regulatory. One focused independent review against approved proposal and anchors: no material divergence, no new capability promises or regulatory overreach. Minor spacing and inline-link findings fixed. Wider sensitiser/international tables were not audited.

## Validation

PASS: support-multi-topic (5 groups), footer-and-compliance-wording, app-static-audit (33 HTML files), public-nav-consistency, updated kb-blended-fragrances (3 groups). Updated existing KB check to follow the moved article, retain its retired-claim guard and confirm authoritative link/route; no new test suite.

PASS: JSDOM structure/local-link audit of nine content pages, exactly one H1 per page, no duplicate IDs, 160 internal link instances resolve through files or explicit article rewrites.

Broader npm test run: passed Smart Paste scope, PNG accounting, live Builder export guard, site scroll/accessibility, static audit, Builder regression, PAYG accounting, PAYG display and PAYG pricing checks. It then made no progress during the unrelated immediate-supply-consent test and was interrupted; the full suite is NOT reported as passed. No failures were emitted before interruption.

Local Chrome visual QA could not start: environment denied its process-singleton socket. Hosted Netlify preview `https://deploy-preview-263--clpeasy.netlify.app` succeeded for commit `1f351bc`. Desktop Support and blend-article layout were inspected in the Cloud Browser. Two minor follow-ups: give Support eyebrow clearance below fixed nav; add explicit same-article skip links because the root base URL would otherwise resolve the generated fragment to the homepage. Full desktop/mobile sign-off remains pending. Existing form code/values preserved and tests pass; no live support request sent.

## Publication holds

1. Check the actual private HSE correspondence before publishing the retained engagement claim. Non-approval clarification is present.
2. Physically validate the current CLPeasy SVG → Design Space → Maker 3 workflow, particularly outer background/cut edge and dimensions. General Cricut docs alone do not establish compatibility.
3. Preview desktop/mobile layout, nested article navigation and retained /knowledge#blended behaviour on the draft deployment.
4. Founder release approval and agreed out-of-hours process before merge/production deployment.

Only the disputed/unverified items are held. This draft PR is reviewable work, not a production release.

## Completion update — 19 October 2026

### Content and browser verification

- Desktop (1280 px) and mobile-size (390 px) browser checks completed on the actual changed source for all eight release-candidate public pages. No horizontal page overflow, missing H1, header-obscured H1 or broken internal links. All FAQ answers expand. Desktop/mobile screenshot layouts inspected.
- Browser interactions pass: retained `/knowledge#blended` opens its topic; expanding the accordion exposes the full article link; link navigates to the nested article; keyboard skip link stays on the article; mobile menu Home link resolves correctly from nested route; Support `?topic=excluded-statements` preselects the existing topic.
- Local QA intentionally blocked third-party requests. Home/Knowledge Base therefore report the expected absent Supabase CDN `createClient` error; no unexpected page errors. Inline application scripts remain unchanged. These are content/navigation checks, not auth, live AI or billing verification.
- Headless Shell resolved the earlier full-Chrome startup restriction, enabling the responsive checks without changing application code or environment permissions.

### Test status correction

The earlier suspicion that the consent test stalled was not established: run independently, `payg-immediate-supply-consent.js` passes. A subsequent broader sequence exposed `tests/plan-checker-decision.js:298`: expected `frequency`, actual `labels`. Its test, `plan-checker.js`, `plan-picker.html`, `entitlement.js` and checkout function are byte-identical to main `3a9524e`; outside this content diff. This is recorded as an unrelated baseline issue, not fixed here. The full suite is not green.

The subsequent sequence completed account next-payment, pause wording, preview watermark/export authorization and hazard-source integrity checks successfully. PostgreSQL and Deno checks skipped because those runtimes are absent; the pre-existing print-guidance scripts skipped because their browser discovery does not find the installed Headless Shell. The independent content browser checks above did run. A duplicate time-bounded export-test attempt timed out early; it does not invalidate the earlier completed 23-assertion run and is not reported as another pass.

### HSE source access

Original HSE correspondence not found in the connected Gmail account (exact reference, HSE-domain and CLPeasy/HSE searches) or available file search. Zoho Mail opened without a signed-in mailbox. No correspondence was sent, login attempted or source claim marked verified. The existing HSE engagement statement therefore remains REVIEW until the original reply is supplied or mailbox access is available. This does not settle the outstanding fragrance-concentration or Article 18 questions.

### Cricut publication separation

The export-specific Cricut article is now retained only at `docs/reports/customer-support-content/cricut-print-then-cut-DRAFT.html`, under the existing publicly blocked `/docs/*` path. Its public root file and article rewrite are removed, and public pages have no links to it. The printing hub and homepage instead link to Cricut's official instructions. This lets hand-cut guidance proceed independently. No physical test is claimed.

Physical validation still needed before releasing the CLPeasy-specific draft: import one current SVG into Design Space; confirm intended dimensions and intact text/symbols; flatten with the full label background; print through Design Space; measure the print; cut it with Maker 3 and inspect its outer edge. Record the export file, size and result.

### Remaining release actions

The digital content implementation and responsive/navigation checks are complete. HSE correspondence verification remains blocked on source access. The Cricut guide is excluded from public release pending physical testing. Founder release approval and agreed out-of-hours process still apply. No merge or production deployment has occurred.
