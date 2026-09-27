# PR #156 production release — pre-change gate (27 Sep 2026): STOPPED before any production change

- **Result:** no production database, function, secret, Stripe, Brevo or site change was made.

## Confirmed (read-only)

- **Branch and PR:**
  - `feature/pay-as-you-go-downloads` head `4720a18`, equal to GitHub.
  - PR #156 is open, not a draft, base `main` = `e8c1f25`.
- **Change set against `main`:**
  - Site files: account, builder, dashboard, index, my-labels, pricing, print, `entitlement.js`,
    `package.json`.
  - Removal of the two stale root copies `create-checkout-session.ts` / `stripe-webhook.ts`.
  - 4 Edge Functions: `billing-status` new; `create-checkout-session`, `stripe-webhook` changed;
    `manage-subscription` is only now tracked in the repo (production v5 is identical).
  - 6 migrations `20260925000000` … `20260930000000`.
- **Production baseline (rollback position):**

  | Area | State |
  |---|---|
  | Migrations | 15 recorded, the latest `20260828202209 revoke_public_execute_on_trigger_functions`. None of the 6 PR #156 migrations are applied. |
  | `create-checkout-session` | v43 (ezbr `b690f183…`) |
  | `stripe-webhook` | v54 (ezbr `6b350edc…`) |
  | `manage-subscription` | v5 (ezbr `5d993157…`) |
  | `create-portal-session` | v28 |
  | `billing-status` | not deployed |

  Supabase keeps prior function versions, and the sources can be re-read read-only for a redeploy.
- **Production data (aggregate only):**
  - 21 profiles: 16 trial/trialing, 5 free/cancelled;
  - **0** `subscriptions` rows;
  - 5 processed Stripe events, all on 30 Jul 2026.
  - No paying subscriber's entitlement is affected by the migrations.
- **Settings the release code needs** (names only):
  - `PAYG_5_PRICE_ID` (create-checkout-session);
  - `PROMO_2026_EASY_START_MONTHLY_COUPON_ID` and `PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID`
    (create-checkout-session, billing-status, stripe-webhook);
  - `BREVO_PAID_LIST_ID` (stripe-webhook);
  - plus the existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY`,
    `SUPABASE_*`.

## Why the release stopped

1. **Required Live configuration could not be verified.**
   - None of the available tools can read production Edge Function secret names or values; the
     production Vault holds only `beta_tester_email_token`.
   - Presence and correctness of `PAYG_5_PRICE_ID`, both 2026 coupon IDs and `BREVO_PAID_LIST_ID`
     are therefore **unverified**.
2. **The Stripe mode behind production is ambiguous.**
   - The site sends the "Live" price IDs (`price_1Tdo…` / `price_1Tdpd…`), and the owner confirmed a
     Live-mode production webhook on `2026-05-27.dahlia`.
   - But the production diagnostic `diag-stripe-price-lookup` (29 Jul) and comments in
     `stripe-webhook` (30 Jul) state that CLPeasy "actually runs in" the **Test Mode** of account
     `acct_1TdczNGZLILz5vqU`, with "Test Mode" price IDs `price_1Ty…`.
   - It is not verified whether production `STRIPE_SECRET_KEY` is that account's live or test key.
3. **The read-only route was blocked by the environment.** Calling the existing read-only diagnostic
   from the production database was blocked by the environment's credential guard (it would have
   needed the production public key inside an HTTP call). Not retried or worked around.
