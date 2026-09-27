# PR #156 production release — pre-release configuration gate, re-run (27 Sep 2026), read-only

- **Result:** no production change was made. The release has not started.

| # | Check | Result |
|---|---|---|
| 1 | Branch `feature/pay-as-you-go-downloads` head `5a4eaed` = GitHub; working tree clean | **PASS** |
| 2 | PR #156 open, not a draft, not merged; base `main` = `e8c1f25` | **PASS** |
| 3 | Release code unchanged since the QA'd `4720a18` (later commits are docs only); no Test-project / Test-site address in the release functions; production defaults are `https://clpeasy.com` | **PASS** |
| 4 | Production migrations: 15 recorded, latest `20260828202209`; none of the 6 PR #156 migrations applied | **PASS** (unchanged baseline) |
| 5 | Production schema prerequisites for the 6 migrations present (profiles columns incl. `topup_credits`, `paused_at`, `pause_reason`; `label_downloads`, `checkout_locks`, `stripe_processed_events`, `subscriptions`; `protect_profile_billing_columns` trigger). The objects they create are absent (`consume_download`, `credit_payg_purchase`, `credit_purchased_downloads`, `label_downloads.clean_export`). Matches the CLPeasy Test schema they were verified on. | **PASS** |
| 6 | Production functions: code hashes and code-update times identical to the gate-1 baseline (`create-checkout-session` b690f183…, `stripe-webhook` 6b350edc…, `manage-subscription` 5d993157…). Every function's version number rose by 3, consistent with secret updates redeploying functions. | **PASS** (code unchanged) |
| 7 | Secrets present: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY`, `BREVO_PAID_LIST_ID`, `PAYG_5_PRICE_ID`, `PROMO_2026_EASY_START_MONTHLY_COUPON_ID`, `PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID` | **OWNER-CONFIRMED**; no tool can read production secret names or values |
| 8 | `STRIPE_SECRET_KEY` is a Live (`sk_live_`) key, "CLPeasy Production Supabase" | **OWNER-CONFIRMED**. Resolves the gate-1 Live/Test key question for the API key only (see 12) |
| 9 | Live PAYG price `price_1UKF6YGZLILz5vqUwdiwcokx`: £4.99 GBP one-off, product "CLPeasy Pay As You Go downloads" | **OWNER-CONFIRMED**. **PASS** (consistency only): the ID carries the same account marker (`…GZLILz5vqU`) as the existing Live CLPeasy prices. Amount, mode and description are not directly verifiable. |
| 10 | Live coupon `tdO6j8q7`: 10 %, Forever, both promotion secrets = same ID | **OWNER-CONFIRMED**. One coupon behind both secrets is supported and is the tested Sandbox setup. |
| 11 | Live "CLPeasy Production Webhook": active, `2026-05-27.dahlia`, production `stripe-webhook`, `invoice.created` added, 5 events | **OWNER-CONFIRMED**. The exact list of 5 is not stated (required: `checkout.session.completed`, `invoice.paid`, `invoice.created`, `customer.subscription.updated`, `customer.subscription.deleted`). |
| 12 | `STRIPE_WEBHOOK_SECRET` equals the signing secret of the **Live** production endpoint | **NOT DIRECTLY VERIFIABLE — open release blocker** (below) |
| 13 | Sandbox → production endpoint `we_1TddU7…` disabled | **PASS**. Verified via the Sandbox API on 26 Sep; production's last requests from it were the three 400s ending 26 Sep 14:34 UTC, none since. |
| 14 | Production data impact | **PASS**: 0 `subscriptions` rows; 21 profiles (16 trial, 5 free/cancelled). |

## Open blocker: webhook signing secret (item 12)

- **What the logs show:**
  - Production has accepted Stripe webhook events only once: 5 events on **30 Jul 2026**.
  - The production code comments from that same day say CLPeasy was then running on the Stripe
    **Test Mode** of account `acct_1TdczNGZLILz5vqU`.
  - No Live event has reached production in the available log window (14 days); the only requests
    were the rejected Sandbox ones.
- **The risk:** the API key was switched to Live, but nothing indicates `STRIPE_WEBHOOK_SECRET` was.
  If it is still a Test-mode endpoint's secret, every Live event would be rejected with 400, and
  paid PAYG purchases, subscriptions and renewals would not be credited.
- **Owner action:**
  - In Stripe **Live** → Developers → Webhooks → "CLPeasy Production Webhook" → Signing secret →
    Reveal, copy the `whsec_…` value into the production Supabase secret `STRIPE_WEBHOOK_SECRET`.
    Re-entering the same value is harmless.
  - Confirm the endpoint's 5 events are exactly the list in item 11.

## Other owner confirmations (not code blockers)

- **PAYG product description:** confirm it matches the approved wording. Only the name was confirmed.
- **Live Customer Portal:** it must be configured and saved in Live mode, because the existing
  "Manage billing" button now uses the Live key. It should also allow switching to Easy Pro annual
  if that path is intended.
- **Tax behaviour:** the PAYG price should match the existing Live top-up prices.

## Deferred (unchanged)

MS-2, C2, the "Easy Start (Cancelled)" display for former Easy Pro accounts, and the mid-period
plan-change allowance policy.
