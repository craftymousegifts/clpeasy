# stripe-webhook duplicate-protection claim fix (2 Oct 2026)

## Finding (CLPeasy Test, real Sandbox events)
- Cold start of `stripe-webhook` v9. The `invoice.created` invocation (execution `39c881ed`)
  had its claim insert into `stripe_processed_events` rejected:
  - API gateway: `POST /rest/v1/stripe_processed_events` → **401**;
  - PostgREST: `PGRST303` "JWT issued at future".
- The parallel `invoice.paid` insert, 20 ms later, got 201. So it's a transient, sub-second
  token/clock-skew rejection, not a persistent fault. It was seen once in 24 h of logs.
- **Code behaviour (same in main/production):** any non-23505 claim error fell through and the
  event was processed WITHOUT a recorded claim.
- **Reproduced offline:** a PAYG `checkout.session.completed` with one claim failure followed by a
  Stripe redelivery credited **16** downloads for one £4.99 purchase, instead of 8.

## Fix
- `claimEvent()` retries the claim insert after 250 / 500 / 1000 ms.
- If the claim still can't be recorded, the event is **not processed** and Stripe receives a 500, so
  it retries the delivery later (fail closed).
- An error without a code (network / lost response) followed by 23505 is treated as this
  invocation's own claim, so a purchase is never lost.
- Commits:
  - `58cc6d6` on `feature/pay-as-you-go-downloads`;
  - `ae03748` on `fix/webhook-claim-fail-closed` (main-based, cherry-pick of the same change).

## Tests
- **4 new offline scenarios:**
  - one PGRST303 rejection, then retried and credited once, with redelivery = duplicate;
  - persistent failure → 500, nothing credited or claimed, then a later retry credits once;
  - claim written but response lost → processed once;
  - genuine duplicate after a coded failure.
- **Deno totals:**
  - feature branch: stripe-webhook 51, create-checkout-session 46, billing-status 26,
    manage-subscription 8 — all PASS;
  - main-based fix branch: stripe-webhook 49, create-checkout-session 41, billing-status 26,
    manage-subscription 8 — all PASS.
- **Test deploy:** `stripe-webhook` **v10** on CLPeasy Test. A real Sandbox £89 subscription
  (`sub_1UM8x0KF3jvQfgEaCLbFeL65`) and its cancellation on a cold start produced:
  - `invoice.paid`, `invoice.created` and `customer.subscription.deleted`, all claimed and
    processed;
  - profile active/annual, PAYG 7 kept.

## Not changed
- Production. The fix needs the normal release gate.
