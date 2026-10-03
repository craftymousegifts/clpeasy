# CLPeasy outstanding register — reconciled against main `6bd9a00`, 3 Oct 2026

Remote main was rechecked by Codex and remains `6bd9a0077eac27eecd3e027c6f099b8a8eaf1069`. Latest production deploy **reported by Claude/owner**: `6ac15532a64d0600072093bd`. Codex has not independently queried Netlify. Previously reported checkout v52, webhook v63 and database fingerprint `4be137bb…` were not changed by this work.

## Complete and already released

| Item | Evidence |
| --- | --- |
| Hero safety-icon correction | `e342149`; approved and released before Phase 1. Artwork unchanged by Phase 2. |
| Phase 1 M03, M51, M55, M56/M57 | `148334a`, production deploy reported as `6ac11de8dc77a100080354f0`. |
| PAYG conservative 14-day cancellation wording | Released before Phase 1; checkout v52 and policy pages. |
| Pricing local-storage/version-history wording | `4bc3e9a`, production deploy reported as `6ac14342948ac900080a6c9c`. |
| Finished-product fragrance calculator and supplier-document coverage check | `f885ef9` code, main `6bd9a00`, production deploy reported as `6ac15532a64d0600072093bd`. Includes draft saving, old-label recovery, inclusive explicit coverage ranges and written supplier confirmation. These are evidence-recording policies, not legal certification. |

The former questions about accepting lower percentages, coverage ranges and written confirmations have implementation decisions recorded in the supplier-document handover. Do not repeat those as undecided work.

## Phase 2 — implemented, tested, not released

| Item | Status |
| --- | --- |
| M09/M31, M10, M38 and M21 | Hand-integrated on `fix/builder-phase2-codex`, code `e5477dd`; 78/83 tests pass, exactly five known baseline failures and no new failures. |
| Test preview and real signed-in review | Still needed for this Phase 2 branch. Existing Test preview was not updated by Codex. |
| Production approval and deployment | Not authorized or performed for Phase 2. Main and production remain unchanged. |

See `BUILDER-PHASE2-CODEX-HANDOVER-2026-10-03.md` for scope, exact test evidence and safe continuation. Do not replace or assume access to Claude's unpublished local branch; fetch and review the new branch.

## Remaining audit work — separate from Phase 2

| Item | Remaining action |
| --- | --- |
| M19/M20, then M24 (Phase 3) | Approved items not yet ported. Depend on the integrated content gate; assess wording/fit and homepage-template impact before a separate release. |
| M44/M45/M43 circle-fit changes | Need decisions/review and template regeneration/visual approval if approved label artwork changes. |
| M04, M63, M37/M64 | No implementation in this batch. Confirm individual approval; M37/M64 also requires independent review. |
| PR #203 | Still open and frozen. Do not merge; document-applicability work has superseded its direction. Closure remains a separate action. |

## Other recorded UX items — still separate

- Signed-in seasonal banner still showing trial wording.
- Visible explanation when a typed custom height exceeds 150 mm.
- Truncated Composer-link hover handler in Netlify-served Builder HTML (previously reported on production and preview).
- General phone stacking rule for other Step 2 rows; fragrance row was already fixed.
- Customer notice for the released supplier-document check: draft exists; not sent or published. Obtain owner instructions and retain legal-review limitations.

## Legal/policy review — not closed by these code changes

- GB CLP primary legislation and exact sensitiser thresholds: partial official guidance recorded; legislation verification remains incomplete.
- PAYG legal classification (digital content versus service), despite the conservative refund policy already being live.
- Terms Clause 7 liability cap referring only to subscription fees.
- Subscription-regime changes: verify current commencement details and applicable promotional/renewal obligations before changing policy. Earlier dates in reports remain reported information, not a fresh verified conclusion.

## Verification — not performed, not a request for an owner payment

- Real signed-in Test Builder → save → reopen → Composer → export journey. Automated/simulated tests and the owner's earlier Composer check are separate evidence.
- Live PAYG credits, webhook, duplicate protection, new consent record and invoice email: close from a genuine customer purchase when available. **Do not request or create an owner Live test payment.**
- Sandbox duplicate redelivery of a real event: optional, previously not performed.

## Known baseline failures

`homepage-mobile-nav-signin`, `lifecycle-reminder-accuracy`, `payg-download-accounting`, `pricing-checkout-ux`, `pricing-signed-in-cta`.

The final Phase 2 suite contains 83 files (79 previous + four new). It passes 78 and fails exactly these five. Fixing them is separate work, not completed merely because they are baseline failures.
