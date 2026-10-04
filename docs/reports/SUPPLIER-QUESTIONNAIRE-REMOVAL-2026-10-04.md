# Supplier questionnaire removal — 4 October 2026

## Owner instruction

Michaela rejected the Supplier document coverage questionnaire itself after the first usability correction was live. Remove the mandatory questionnaire and its export restrictions, rather than move or collapse it. This supersedes the earlier custom exact/range/written-confirmation evidence requirement.

## Implementation

- Remove the whole questionnaire from Builder Step 3. Keep Smart Paste and expandable GB CLP guidance.
- Disable the custom document requirement centrally with DOCUMENT_CHECK_REQUIRED=false. isExportAllowed is separate from isVerified: absence of supplier evidence is never described as verified evidence.
- Builder, My Labels and Composer use the shared export-permission function. Old, absent, mismatched or stale document answers do not create a document-only export block or a draft marker.
- Do not invent a confirmation or discard existing metadata. The old evaluator and status functions remain available for reading historical records, but do not govern exports.
- Preserve existing hazard-source change review, unsupported-code checks, hazard confirmation when progressing through Step 3, final verification, fit, entitlement and accounting checks. Keep the finished-product calculator correction.
- The renderer, approved hero, entitlement script, server functions, database and Stripe are unchanged. Phase 2 PR #204 stays separate and unpublished.

## Verification

All 79 Node test files ran. After updating and rerunning the hazard-source assertions that required the retired document stamp: 73 pass, six fail. Five failures are the established baseline (homepage-mobile-nav-signin, lifecycle-reminder-accuracy, payg-download-accounting, pricing-checkout-ux, pricing-signed-in-cta). post-download-print-guidance fails at PNG handover in this runtime and previously reproduced at that same assertion on unchanged production main with the same dependencies and Chromium. download-entitlement-sql retains its existing skip.

Focused checks pass: no questionnaire, extraction without answers, ordinary hazard review and final verification still required, fit still enforced, old records unblocked, no fabricated confirmation, prior metadata preserved, and Composer storage unchanged. Real Chromium at 360, 390 and 1366px passes paste → review → Step 5 → verify → save/reopen → Composer, retaining fine-tune settings with no sideways overflow. Hazard-source integrity passes all C3/C4 cases. Ten-label safety baseline and homepage templates pass. Test-generated screenshots were restored.

## Release

Base production commit e8b8f190adc63e80911d2744de9ad09751437d4d. User has requested urgent correction of the live flow. Fetch main before publishing, preserve concurrent changes, and publish only this focused change. Do not deploy Phase 2. Prior deploy remains the rollback target; never rewrite main history.
