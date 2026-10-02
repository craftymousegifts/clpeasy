# Production release plan — PAYG + Easy Start Unlimited (prepared 2 Oct 2026)

**Status: READY FOR MICHAELA PRODUCTION APPROVAL. Nothing in this plan has been executed.**

No production deploy, no merge to `main`, no production migration, no Live Stripe change.

## 1. Release candidate
- **Branch:** `feature/pay-as-you-go-downloads` at the release-candidate merge commit (recorded in
  the report).
- **Built from:**
  - the PAYG branch (`19974de`; release code at `4e62cff`, plus Test evidence);
  - `main` at `ae03748` (production webhook fail-closed hotfix), merged in;
  - PR #202 head **`f0e83e9`** (homepage, Phase C wording and lifecycle-label fixes), merged in.
- **Both merges were clean.** No file is changed by both PAYG and #202. Git auto-merged
  `stripe-webhook`: the PAYG branch already carried the same fix (`58cc6d6`).
- **Main and #202 are both ancestors of the release candidate.** Releasing it fast-forwards `main`;
  nothing on main or #202 is overwritten.
- **Not included:**
  - PR #184 (stale);
  - PR #203 (frozen);
  - stranded Builder fixes;
  - `audit/m37-m64-pictogram-precedence`.

## 2. What changes in production
- **Pages and scripts (Netlify, from `main`):**
  - `index.html` (#202 homepage), `pricing.html`, `checkout.html`, `account.html`,
    `dashboard.html`, `plan-picker.html`, `faq.html`, `refund.html`, `terms.html`, `my-labels.html`;
  - `entitlement.js`, `plan-checker.js`, `public-nav.js`, `public-nav.css`, `seasons.js`;
  - `builder.html` and `print.html`: display text and links only. "Unlimited" counter; "Buy
    downloads" links go to PAYG instead of retired top-ups; help FAQ text. No label, CLP, sizing or
    export logic.
- **Database (production `qvkosdqcryrcfbjtaxic`):** migration
  `20261002000000_easy_start_unlimited.sql`.
  - It replaces `consume_download(text,text)` only. Current Easy Start, and legacy Easy Pro, active
    or cancel-at-period-end within the paid period, gets clean downloads that consume nothing.
  - No table or data changes. Grants are unchanged.
  - Identical to what was tested on CLPeasy Test (md5 of the applied text matches the repo file).
- **Edge Functions:**
  - **`create-checkout-session`** (prod v49 = `main`):
    - Easy Start Unlimited only for new subscriptions;
    - the £89 annual price from secret `EASY_START_ANNUAL_PRICE_ID`;
    - Easy Pro, £99 annual and top-ups refused;
    - PAYG requires `immediateSupplyConsent` (400 `PAYG_CONSENT_REQUIRED`);
    - consent metadata on Session, PaymentIntent and invoice;
    - `invoice_creation` with the consent memo.
  - **`stripe-webhook`** (prod v61 = `ae03748`): adds only the mapping for the
    `EASY_START_ANNUAL_PRICE_ID` price. The fail-closed duplicate-event claim is unchanged; there is
    exactly one `claimEvent`.
  - No other function changes.
- **Stripe Live (account `acct_1TdczNGZLILz5vqU`):**
  - New Price **£89.00 GBP / year**, tax-inclusive (as Sandbox `price_1UM5UwKF3jvQfgEa5A5F3ac5`), on
    the Live Easy Start product (the product of Live monthly `price_1TdoEYGZLILz5vqUIqlEsf4X`).
  - Old Live prices stay unchanged and active for existing subscriptions.
  - Dashboard → Settings → Customer emails → **Successful payments: ON**. Needed for the PAYG
    invoice/confirmation email.
  - Post-payment invoice fee **0.4%** (about £0.02 per £4.99), confirmed by the owner.
- **Supabase production secret:** add `EASY_START_ANNUAL_PRICE_ID` = the new Live price ID.
  - Existing secrets are reused: `PAYG_5_PRICE_ID`, `PROMO_2026_EASY_START_MONTHLY_COUPON_ID`. The
    current production code already requires them and fails closed without them.

## 3. Deployment order (on approval)
0. **Record rollback points:**
   - Netlify production deploy ID (currently `6ac002c19cb6e900090c2484`, built from `ae03748`);
   - `create-checkout-session` v49 and `stripe-webhook` v61;
   - `consume_download` source md5 `e9cb4aa5d45f6dfbc2fe0091170c8a07`.
1. **Stripe Live:** create the £89/year Price. It isn't sold anywhere until steps 2 and 5. Confirm
   "Successful payments" emails are ON.
2. **Supabase production:** set secret `EASY_START_ANNUAL_PRICE_ID`.
3. **Supabase production:** apply migration `20261002000000_easy_start_unlimited`. It only adds
   unlimited downloads for current subscribers, so it is safe with the old pages.
4. **Deploy `stripe-webhook`** from the release candidate, then verify the deployed source matches
   byte for byte.
5. **Deploy `create-checkout-session`** from the release candidate, then verify the same way.
6. **Immediately fast-forward `main`** to the release candidate. Netlify production auto-deploys
   the pages.
   - **Between steps 5 and 6 (a few minutes):** the old pages' PAYG button sends no consent, so
     PAYG checkout is refused; old annual/Easy Pro/top-up buttons are refused.
   - This order is chosen so no PAYG purchase can be made without recorded consent. The reverse
     order would allow that briefly.
7. **Smoke checks:**
   - pages load and the PAYG consent box is unticked;
   - Netlify deploy is `ready` from the expected commit;
   - function versions are as expected;
   - Stripe webhook deliveries return 200.
8. **One real Live PAYG purchase** (owner, £4.99) to confirm credits +8 and that the invoice email
   with the consent memo arrives. Optionally one £89 annual, cancelled afterwards.

## 4. Rollback plan
- **Pages:** in Netlify, publish the previous production deploy (`6ac002c19cb6e900090c2484`).
  Instant. Then revert on `main` at leisure.
- **Functions:**
  - redeploy `create-checkout-session` from `ae03748` (= v49);
  - redeploy `stripe-webhook` from `ae03748` (= v61, keeps the fail-closed fix).
- **Database:** run `rollback/consume_download-rollback-to-20260930.sql`.
  - Its function body is byte-identical to production's current `consume_download` (md5
    `e9cb4aa5…`).
  - No data to restore.
- **Stripe:** archive (do not delete) the £89 Price.
  - Keep `EASY_START_ANNUAL_PRICE_ID` set while any £89 subscription exists, so the webhook keeps
    mapping it.
  - PAYG purchases made during the release keep their credits (no rollback needed).
- **Order for a full rollback:** pages → checkout function → database → webhook last. The webhook
  is backward compatible and keeps the hotfix either way.

## 5. Test evidence
- **Automated:** 72 test files, 67 pass. The 5 failures are the known baseline:
  `homepage-mobile-nav-signin`, `lifecycle-reminder-accuracy`, `payg-download-accounting`,
  `pricing-checkout-ux`, `pricing-signed-in-cta`. The release-candidate run result is in the report.
- **Server-side Sandbox (Claude):** trial, PAYG, £89 annual, unlimited, cancel-at-period-end, ended
  → PAYG, declined/expired payments, duplicate guard, v10 cold-start retry.
- **Browser Sandbox E2E (ChatGPT Work, 2 Oct 2026, owner-reported):**
  - one £4.99 payment;
  - balance 24 → 32 (+8), unchanged after refresh;
  - consent unticked at start; purchase without consent blocked;
  - webhook processed once (HTTP 200);
  - consent metadata, timestamp and wording version verified;
  - paid invoice with the immediate-supply and 14-day-right memo, statutory rights unaffected;
  - test subscription cancelled.
  - Non-blocking: runtime shutdown log noise; Brevo not configured in Sandbox.
- **Test site** v19 deploy `6ac02a3a3f861b8fedb5ae62` and Test checkout v9 match the release code
  (plus Test-only URLs and price).

## 6. Remaining items (not blocking approval)
- Test-only `pg_net` extension still installed on CLPeasy Test (owner housekeeping).
- Live invoice email to be confirmed by the first real purchase (step 8).
- `builder.html` help text says "one-off £4.99 pack (5 + 3 free during the 2026 launch offer)".
  This is accurate but not the preferred wording; left alone under the Builder freeze.
