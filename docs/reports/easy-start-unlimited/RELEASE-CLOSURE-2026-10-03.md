# Release closure: PAYG, Easy Start Unlimited and PR #202 homepage (3 Oct 2026)

**Status: RELEASED.** Two checks are outstanding (Live purchase and invoice email). The owner did
not authorise a real payment, so they were **NOT PERFORMED**. They are outstanding verification
items, not a release failure.

## Production state
| Item | Value |
|---|---|
| `main` | `ae070b6` |
| Netlify production deploy | `6ac10c662ab69100081654ba` (ready, built from `ae070b6`) |
| `create-checkout-session` | v52 (byte-identical to `ae070b6`, sign-in check on) |
| `stripe-webhook` | v63 (byte-identical to the release, sign-in check off as before; one `claimEvent`) |
| `consume_download` | source md5 `4be137bbbf8930365c4390096214a506` (identical to CLPeasy Test) |
| Live £89/yr price | `price_1UMSlpGZLILz5vqUKA7dE3JS` (GBP 8900, yearly, tax-inclusive, active, product `prod_Ucsr7Mghv6kj0C`) |
| `EASY_START_ANNUAL_PRICE_ID` | set by the owner |
| Stripe "Successful payments" emails | ON (owner confirmed) |

## Rollback points
- **Pages:**
  - Netlify deploy `6ac101b60af8020008fe50f2` (`cfe025c`, before the cancellation-wording fix);
  - `6ac002c19cb6e900090c2484` (`ae03748`, before the release).
- **`create-checkout-session`:** v51 (`cfe025c`), or v49 (`ae03748`).
- **`stripe-webhook`:** v61 (`ae03748`).
- **Database:** `rollback/consume_download-rollback-to-20260930.sql` (restores md5 `e9cb4aa5…`).
- **Stripe:** archive (do not delete) the £89 price. Keep the secret while any £89 subscription exists.

## Evidence: PASS
**Automated tests:** 67/72 Node test files pass. The 5 failures are the known baseline:
- `homepage-mobile-nav-signin`;
- `lifecycle-reminder-accuracy`;
- `payg-download-accounting`;
- `pricing-checkout-ux`;
- `pricing-signed-in-cta`.

Offline function checks: `create-checkout-session` 50/50, `stripe-webhook` 51/51.

**Sandbox end-to-end** (CLPeasy Test plus Stripe Sandbox, 2 Oct 2026, event
`evt_1UMF6YKF3jvQfgEamHdVNzUI`):
- **Payment:** Checkout Session `cs_test_a1Q8oX…`, payment mode, £4.99, `payment_status=paid`,
  delivered with no webhooks pending.
- **Credit:**
  - the webhook logged "PAYG: +8 downloads (balance 32)" exactly once;
  - there is one `stripe_processed_events` row for the event, with a unique index on `event_id`;
  - the balance is still 32.
- **Consent records:** `payg_immediate_supply_consent=true`, a timestamp and the wording version
  on the Session and the invoice.
- **Invoice:** `in_1UMF6VKF3jvQfgEa5OKxiT4I` is paid and carries the memo.
- **Not covered by this run:**
  - a real Stripe redelivery of this event (duplicate protection is covered by the offline tests
    and the unique index);
  - the invoice email (the Sandbox does not send it).
  - The Sandbox run used the earlier wording version (`payg-immediate-supply-2026-10-02`).

**Production smoke checks** (deploy `6ac10c662ab69100081654ba`, checked through the identical
`main--clpeasy.netlify.app` deploy, because `clpeasy.com` is unreachable from the test
environment):
- **Pages:** 13 key pages returned 200 at release. 9 were re-checked after the fix.
- **Files:** the served scripts, styles and hero image match the commit. No page points at the
  Test database.
- **Homepage (390 px and 1366 px):** the hero is 1672×941, the offer bar is visible below the
  menu, the seasonal link is on-site, and nothing spills sideways.
- **Pricing (390 px and 1366 px):**
  - the new consent text is live;
  - Buy without ticking shows the prompt and sends no checkout request;
  - £89 annual is shown and Easy Pro is not offered.
- **Refund Policy:**
  - shows the 14-day cancellation for unused credits, oldest-pack-first matching, rounding up to
    the penny, and the faulty or undelivered downloads section;
  - "Nothing in this policy limits your statutory rights" is kept;
  - no "lose your statutory 14-day" wording.
- **Terms:** Clause 9 has the PAYG sentence.
- **Supabase logs** since the release: no errors.

## Outstanding verification items: NOT PERFORMED (owner did not authorise a real payment)
| # | Check | Status | How to close it |
|---|---|---|---|
| V1 | Live £4.99 PAYG purchase: exactly 8 credits added once, balance kept after refresh | NOT PERFORMED | The first genuine customer purchase, or an owner-authorised purchase. Confirm with `stripe_processed_events`, `profiles.topup_credits` and the webhook log. |
| V2 | Live webhook processing and duplicate protection on a real event | NOT PERFORMED | As V1. Optionally resend the event from the Stripe Dashboard and confirm no second credit. |
| V3 | Live consent records (wording version `payg-immediate-access-unused-refund-2026-10-03`) on the Session, PaymentIntent and invoice | NOT PERFORMED | Read the first Live PAYG Checkout Session. |
| V4 | Live invoice email received, with the memo | NOT PERFORMED | The customer or owner confirms receipt for the first Live PAYG purchase. |
| V5 | Sandbox duplicate redelivery of a real event | NOT PERFORMED | Optional: Stripe Sandbox → Developers → Webhooks → Resend `evt_1UMF6YKF3jvQfgEamHdVNzUI`; the balance must stay 32. |

No card was charged and no paid subscription was created for verification.

## Other open items
- **OPEN, #202 artwork workstream:** genuine, product-appropriate safety icons on all four hero
  products (`PR202-RECONCILIATION-FINDINGS-2026-10-03.md`, section G).
- **Legal confirmation:** whether PAYG is digital content or a service. The conservative policy is
  live pending confirmation (`PAYG-CANCELLATION-REVIEW-2026-10-03.md`).
- **Recorded, not changed:**
  - Terms Clause 7 liability cap refers only to subscription fees;
  - the DMCC subscription regime (reported start January 2027).
