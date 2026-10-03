# Step 3 usability correction — 3 October 2026

## Status and scope

Review branch `fix/sds-step3-usability`, based directly on production main `6bd9a0077eac27eecd3e027c6f099b8a8eaf1069`. No production deployment, database, Supabase function or Stripe change. Phase 2 PR #204 remains separate and unmerged.

## Problem and resulting behaviour

The maker could not extract Section 2.2 until completing the document questionnaire. Long repeated explanations and a fixed mobile preview button also obstructed the form.

- Smart Paste appears first and can extract hazards before document answers are complete. Extracted data still needs the existing hazard review and a current supplier-document confirmation before Step 3 exit or export.
- Supplier coverage choices are shorter. Range guidance and the existing GB CLP note remain available in expandable help, initially closed.
- Failed coverage checks use inline guidance and focus the relevant unanswered field or explanation, rather than a native alert.
- The mobile View label button sits in normal page flow, so it cannot cover fields.
- Shared document-check messages refer to Smart Paste and the new heading. Its acceptance and invalidation logic is unchanged; a normalized source comparison confirmed wording-only changes.

No percentage tolerance, new evidence route, automatic attestation or export bypass was added. A 9.0909% formulation still needs supplier information explicitly covering it; a 10% statement alone does not pass the existing policy.

## Verification

- All 79 Node test files ran. After updating and rerunning the layout assertion for the new intended ordering: 73 passed, six failed.
- Five failures are the established baseline: homepage-mobile-nav-signin, lifecycle-reminder-accuracy, payg-download-accounting, pricing-checkout-ux and pricing-signed-in-cta.
- The sixth, post-download-print-guidance, fails at PNG handover in this runtime. The identical test also fails at that same assertion on unmodified production main `6bd9a00` with the same Node dependencies and Chromium. It is not reported as a verified export.
- download-entitlement-sql reported its existing skip; no SQL changed.
- Focused supplier applicability: 12 groups pass. Coverage mismatch allows extraction for review but blocks Step 3 with focused inline guidance; all export checks remain enforced.
- Real Chromium recovery journey: nine groups pass, including 360/390px paste-first flow, export blocking without coverage, no sideways overflow or floating overlap, draft recovery, exact/range/written-confirmation save and reopen, and Composer fine-tune preservation.
- Composer gate test passes. Builder safety baseline passes for all ten labels. Homepage renderer-derived templates pass. Renderer and hero are untouched.
- Generated test screenshots were restored, excluded from the change.

## Release and rollback

This is a preview for approval, not an instruction to deploy. Do not merge PR #204 as part of this focused change. Before any approved release, fetch main again and preserve concurrent work. The currently reported production rollback deploy is `6ac15532a64d0600072093bd` (main `6bd9a00`).
