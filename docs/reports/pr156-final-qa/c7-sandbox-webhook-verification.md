# C7 — Stripe Sandbox webhook verification (26 Sep 2026, read-only)

**Method.** A temporary, token-guarded, GET-only function was deployed to the
existing CLPeasy Test slug `qa-sandbox-price-check` (v4). It refused to run unless
the Test project's `STRIPE_SECRET_KEY` was a test key of account
`acct_1TdczqKF3jvQfgEa`, and returned only non-secret endpoint metadata
(Stripe's list API never returns signing secrets). It was called once from the
Test database through `pg_net`, which was enabled only for this call. Afterwards:

- the function was re-stubbed to `410 gone` (v5);
- `pg_net` was dropped (extensions back to: pg_stat_statements, pgcrypto,
  plpgsql, supabase_vault, uuid-ossp).

Nothing in Stripe was created, changed or deleted. Live Stripe and production
Supabase were not contacted.

## Result (raw fields)

| | Endpoint 1 | Endpoint 2 |
|---|---|---|
| Stripe account | `acct_1TdczqKF3jvQfgEa` ("CLPeasy sandbox"), test key | same |
| id | `we_1UJZJ5KF3jvQfgEahDqXnOEL` | `we_1TddU7KF3jvQfgEa3jvQZY0z` |
| URL | `https://wwjhvpphlbgtywxskqnf.supabase.co/functions/v1/stripe-webhook` (**CLPeasy Test**) | `https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/stripe-webhook` (**CLPeasy production project**) |
| status / livemode | enabled / false | enabled / false |
| events | `checkout.session.completed`, `invoice.created` | `customer.subscription.deleted`, `customer.subscription.updated`, `checkout.session.completed` |
| description | "CLPeasy Test - Stripe Sandbox PAYG checkout testing only" | (none) |
| created | 2026-09-25 13:36 UTC | 2026-06-01 21:34 UTC (before the June launch) |

## Findings

1. **Confirmed:** the Sandbox has an **enabled** endpoint that posts
   **Sandbox (test-mode) events to the production `stripe-webhook`.** Any Sandbox
   checkout completion, or subscription update or deletion, is delivered there.
2. **Whether production acts on them could not be verified without touching
   production.** The production function verifies every event with its own
   `STRIPE_WEBHOOK_SECRET`:
   - If that is the **live** endpoint's secret, Sandbox deliveries fail
     verification (HTTP 400) and change nothing.
   - If production's secret is **this Sandbox endpoint's** secret (possible for a
     setup made before launch), production would process Sandbox events.
     Evidence to check, as the owner, in the Stripe Sandbox dashboard: Developers →
     Webhooks → `we_1TddU7…` → recent deliveries. HTTP 400 responses mean the
     events were rejected; HTTP 200 means production processed Sandbox events.
3. **Legitimate Test workflow:** it uses **endpoint 1 only.** Endpoint 2 is not
   needed for any CLPeasy Test or PAYG QA flow.
4. **Endpoint 1 is missing the events a renewal/test-clock E2E needs:**
   - `invoice.paid` (monthly refill);
   - `customer.subscription.updated` and `customer.subscription.deleted`
     (pause, cancel and end).

## Proposed changes (NOT made — owner approval needed)

- **A.** In the Stripe **Sandbox** only: disable (preferred, reversible) or delete
  endpoint `we_1TddU7KF3jvQfgEa3jvQZY0z`. First confirm that production's live
  Stripe endpoint is separate and unaffected (it is in Live mode, which is not touched).
- **B.** In the Stripe **Sandbox** only: add `invoice.paid`,
  `customer.subscription.updated` and `customer.subscription.deleted` to
  endpoint `we_1UJZJ5…` (CLPeasy Test) before the renewal E2E.
