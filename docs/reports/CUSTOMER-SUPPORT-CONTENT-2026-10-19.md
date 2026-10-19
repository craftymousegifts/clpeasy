# Customer support and website content revision

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

Local Chrome visual QA could not start: environment denied its process-singleton socket. No desktop/mobile screenshots or browser review claimed. Hosted preview checks remain pending. Existing form code/values preserved and tests pass; no live support request sent.

## Publication holds

1. Check the actual private HSE correspondence before publishing the retained engagement claim. Non-approval clarification is present.
2. Physically validate the current CLPeasy SVG → Design Space → Maker 3 workflow, particularly outer background/cut edge and dimensions. General Cricut docs alone do not establish compatibility.
3. Preview desktop/mobile layout, nested article navigation and retained /knowledge#blended behaviour on the draft deployment.
4. Founder release approval and agreed out-of-hours process before merge/production deployment.

Only the disputed/unverified items are held. This draft PR is reviewable work, not a production release.
