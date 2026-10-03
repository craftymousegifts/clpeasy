# CLPeasy outstanding register: against production `main` `148334a` (3 Oct 2026)

**Production:**
- `main` `148334a`;
- Netlify deploy `6ac11de8dc77a100080354f0`;
- checkout function v52, Stripe webhook v63;
- `consume_download` md5 `4be137bb…`.

## COMPLETE
| Item | Evidence |
|---|---|
| Hero safety-icon correction (owner-directed, matching candle-care artwork on all four products) | `e342149`, live since deploy `6ac11ba1592825000890984f`; served image byte-identical |
| Phase 1 Builder fixes M03, M51, M55, M56/M57 | `148334a`, live in deploy `6ac11de8dc77a100080354f0`; QA record `docs/reports/BUILDER-PHASE1-QA-2026-10-03.md` |
| PAYG conservative 14-day cancellation wording | live since deploy `6ac10c662ab69100081654ba` |

## IN PROGRESS
| Item | Status |
|---|---|
| Fragrance-load / supplier-document applicability (replaces the direction of PR #203) | Branch `fix/sds-document-applicability`, **not deployed**. See `docs/reports/SDS-FRAGRANCE-PERCENTAGE-REVIEW-2026-10-03.md` |

## OPEN: needs owner decision
| Item | Notes |
|---|---|
| **M09/M31** required-content export block | Prerequisite for M10, M19/M20 (then M24), M38 and M21. Must be hand-integrated with main's hazard-review and Stage 1 geometry gates |
| M10, M19/M20, M24, M21, M38 (approved, blocked by M09/M31) | See `STRANDED-BUILDER-RECONCILIATION-vs-MAIN-ae070b6-2026-10-03.md` |
| M44 / M45 / M43 circle-fit tightening | Change the approved homepage label template; need template regeneration and visual approval |
| M04, M63, M37/M64 | Not approved by name. M37/M64 also needs an independent review |
| PR #203 (SDS fragrance %) | **Frozen.** Superseded in direction by the applicability branch; do not merge |
| Higher-% supplier document for a lower-% product | Blocked by the applicability branch pending owner/legal decision (see the review) |
| 150 mm height: visible message | Typing more than 150 is now marked out of range, but there is no on-screen message; the label is clamped to 150 mm (pre-existing). A message would be a new UX change |
| Signed-in seasonal banner wording | Signed-in customers still see "Start your 14-day free trial" (#202 E2) |

## OPEN: legal / policy
| Item | Notes |
|---|---|
| PAYG legal classification (digital content vs service) | The conservative policy is live; needs adviser or Trading Standards confirmation |
| Terms Clause 7 | Liability cap refers to "subscription fees" (£0 for PAYG-only customers) |
| DMCC subscription regime (reported January 2027) | Review Easy Start promo and renewal cooling-off before then |

## OPEN: verification (NOT PERFORMED)
| Item | Notes |
|---|---|
| Live £4.99 PAYG purchase: credits, webhook, duplicate protection, consent records | Close from the first genuine customer purchase. **No owner payment will be requested** |
| Live invoice email | As above |
| Sandbox duplicate redelivery of a real event | Optional (Stripe Dashboard resend) |
| Signed-in Composer export on the Test preview | Unverified. Test Supabase is unreachable from the build environment; covered by the automated M03 test and the owner's Composer check |

## KNOWN BASELINE TEST FAILURES (pre-existing, unchanged)
`homepage-mobile-nav-signin`, `lifecycle-reminder-accuracy`, `payg-download-accounting`,
`pricing-checkout-ux`, `pricing-signed-in-cta`.
