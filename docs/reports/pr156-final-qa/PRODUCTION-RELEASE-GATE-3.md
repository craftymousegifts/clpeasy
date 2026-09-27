# PR #156 production release — pre-release gate, follow-up after the signing-secret update (27 Sep 2026), read-only

- **Scope:** only the checks affected by the owner's `STRIPE_WEBHOOK_SECRET` update. All other items
  stand as recorded in PRODUCTION-RELEASE-GATE-2.md.
- **Result:** no production change made; the release has not started.

| # | Check | Result |
|---|---|---|
| 12 | `STRIPE_WEBHOOK_SECRET` = signing secret of the Live "CLPeasy Production Webhook" | **OWNER-CONFIRMED** (revealed in Stripe Live and copied into the production secret; no other secret changed). Not directly verifiable until the first real Live event is received; it becomes a required post-release smoke check (first Live delivery must be 200, not a signature 400). |
| 11 | Live webhook event set | **OWNER-CONFIRMED**, recorded: `checkout.session.completed`, `invoice.paid`, `invoice.created`, `customer.subscription.updated`, `customer.subscription.deleted` (5 events; endpoint active, API `2026-05-27.dahlia`, production `stripe-webhook`). |
| 6 | Production function code unchanged | **PASS**. Every function's version rose by exactly 1 (consistent with one secret update); every code hash is unchanged (`create-checkout-session` b690f183…, `stripe-webhook` 6b350edc…, `manage-subscription` 5d993157…). |
| 4 | Production migrations | **PASS**. Unchanged: 15 recorded, none of the 6 PR #156 migrations applied. |
| 1–2 | Branch / PR | **PASS**. Branch head `7bc433e` (docs-only commits since the tested `4720a18`); PR #156 open, unmerged; `main` = `e8c1f25`. |
| — | Webhook traffic since the change | None in the last 6 h. Nothing contradicts the change, and nothing yet proves it. |

## Gate result

**PASS**, with owner-confirmed items that no available tool can read directly:

- the values of the secrets;
- the Live price and coupon settings;
- that the webhook signing secret matches the Live endpoint.

No open blocker remains before release authorisation.

## Required post-release checks arising from the owner-confirmed items

- **Webhook signature:** the first real Live event delivered to production `stripe-webhook` returns
  200, not 400.
- **PAYG checkout:** a PAYG checkout session request uses `price_1UKF6YGZLILz5vqUwdiwcokx` (£4.99)
  and stamps `downloads=8`. Checked from the session only; no purchase needed.
- **Monthly checkout:** a monthly checkout session carries coupon `tdO6j8q7` (£8.99 / £13.49 shown
  on Stripe Checkout, not paid).
