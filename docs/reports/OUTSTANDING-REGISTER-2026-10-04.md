# CLPeasy outstanding register (master): production `main` `815f8b6` (4 Oct 2026)

**Production:**
- `main` `815f8b6` (#213);
- Netlify deploy `6ac2c50d06704800091a46b4`, state ready, published 21:28 UTC on 4 Oct.

**Supersedes:** `OUTSTANDING-REGISTER-2026-10-03.md`. Detail lives in:
- `FINAL-PR-SIGNOFF-2026-10-04.md` (PR dispositions);
- `DOWNLOAD-DELIVERY-SIGNOFF-2026-10-04.md` (downloads, credits, tests).

## COMPLETE (since 3 Oct)
| Item | Evidence |
|---|---|
| Mobile view/preview, export controls, business details | #207, #208 |
| PNG generated before credit | #209 |
| Suffixed H codes, required-content export block (M09/M31), M38 guards | #210, #211 |
| Homepage signed-in CTAs | #212 |
| Supplier questionnaire removed (owner decision); fragrance % optional | `8794aab`, `75c7311` |
| **SVG and PDF print view generated before credit** | **#213** `815f8b6`, live in deploy `6ac2c50d…`. Production capture as a guest at 1366 and 390 px: PNG 2362×1654, SVG 100×70 mm and a one-page PDF print view were delivered and inspected |
| Three obsolete tests refreshed (homepage nav, pricing checkout, pricing CTAs) | #213. Full suite 81/83; the 2 remaining failures are the genuine regressions below |

## OPEN: genuine regressions found by the refreshed tests (owner decision on visible change)
| Item | Notes |
|---|---|
| **R1:** pricing header shows "Start free trial →" to signed-in visitors | The shared `public-nav.js` header is not converted on the pricing page. The homepage uses "My account" plus "Go to builder →". No billing effect. Test: `pricing-signed-in-cta` |
| **R2:** checkout-in-progress indicator is not shown on the pricing page | `pricing.html` mounts it into `nav .nav-actions`, which the shared navigation no longer has. Server-side duplicate protection and the dialog still work. Test: `pricing-checkout-ux` |

## OPEN: owner checks
| Item | Notes |
|---|---|
| **OWNER DEVICE QA REQUIRED:** real iPhone/Safari | Checklist: `IPHONE-OWNER-CHECK-2026-10-04.md`. No WebKit is available in the build environment |
| Paid path on the Test database with #213 | Test Supabase is blocked by the build environment's network policy (external verification limitation). Optional owner check with a Test PAYG account |
| Physical actual-size print; Cricut Print Then Cut | No hardware available. Not a marketing blocker |
| First genuine live purchase, invoice email, live duplicate protection | Close from the first real customer purchase. No owner payment is requested |

## OPEN: product decisions (unchanged from the #212 audit)
| Item | Notes |
|---|---|
| M19/M20 precautionary-statement wording; M24 deduplication | Needs isolated reconciliation, primary-source check and visual review |
| M44/M45/M43 circle-fit tightening | Awaits owner visual review of regenerated templates |
| M04, M63, M37/M64 | Need named decisions; M37/M64 also needs an independent review |
| Height over 150 mm: explanatory message | UX enhancement |
| Signed-in seasonal banner wording | Recorded in #202 E2; re-check against the #212 homepage CTAs |
| Issues #166 (legacy plan switches), #127 (server-side rendering), #128 (research) | Still open, as audited in #212 |

## OPEN: legal / policy
| Item | Notes |
|---|---|
| PAYG legal classification | The conservative policy is live; needs adviser confirmation |
| Terms Clause 7 | Liability cap refers to "subscription fees" |
| DMCC subscription regime (January 2027) | Review before then |

## PR #203 and the customer notice
**PR #203 is frozen, not closed.**
- It was superseded by `8794aab`; no code is left to merge.
- Status note: `sds-document-applicability/STATUS-2026-10-04.md`.

**Customer notice:** do **not** send the draft. It describes a questionnaire that production no
longer has. That file also gives a short optional replacement wording for owner approval.
