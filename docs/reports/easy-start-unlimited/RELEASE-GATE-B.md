# Release gate B — Easy Start Unlimited, PAYG kept, Easy Pro and top-ups retired (2 Oct 2026)

Status: **Test / Sandbox only. Not merged; nothing deployed to production; Live Stripe not touched.**

## What changed

### Entitlement (server is the authority)
- `supabase/migrations/20261002000000_easy_start_unlimited.sql`: `consume_download()` has a new
  first branch.
  - A current Easy Start subscription gets a clean download that consumes nothing (no counter, no
    purchased download). Current means `plan` easy_start (or legacy easy_pro) and active, or
    cancel-at-period-end still inside its paid period.
  - The rule is explicit (plan + status). It is not a large `downloads_limit`.
  - Paused, past-period, ended, trial and PAYG accounts follow the existing finite rules unchanged.
  - The signature and grants are unchanged. Applied to **CLPeasy Test only**.
- `entitlement.js` mirrors the rule for display only. It adds `unlimited`. Top-ups are never offered.
  PAYG is not offered while unlimited.

### Checkout and webhook (`supabase/functions`)
- `create-checkout-session`:
  - New subscriptions are allowed only for the Easy Start monthly prices (live, test-mode, sandbox)
    or the £89 annual price from the new secret **`EASY_START_ANNUAL_PRICE_ID`** (productKey
    `easy_start_annual`).
  - Easy Pro, the old £99 annual and unknown prices are refused with 400 `PLAN_NOT_AVAILABLE`.
  - Annual fails closed with 503 `ANNUAL_NOT_CONFIGURED` until the secret is set.
  - All top-up checkouts are refused with 410 `TOPUPS_RETIRED`.
  - PAYG refusal for current subscribers now says they already have unlimited downloads (no top-up
    redirect).
  - The 2026 coupon still applies to Easy Start monthly only.
- `stripe-webhook`:
  - Maps the `EASY_START_ANNUAL_PRICE_ID` price to easy_start annual.
  - All historical Easy Pro, £99 annual and top-up mappings and crediting are kept. Nothing deleted.
- `manage-subscription`, `billing-status`, `create-portal-session`: no price or plan logic, so
  unchanged. `billing-status` shows Stripe's real amount, so £89 will display correctly.

### Customer pages
- **pricing.html:**
  - Three cards: Trial, PAYG, Easy Start Unlimited.
  - £8.99 offer then £9.99, or £89/year "Save £30.88" (about £7.42/mo).
  - Comparison tables, FAQs and meta description updated.
  - Annual is requested by productKey; the browser no longer sends the old £99 price ID.
- **checkout.html:** one plan (monthly/annual). The hidden top-up step and code removed.
- **account.html:**
  - Dormant top-up modal and code removed; `buyTopup()` routes to PAYG, or does nothing for
    unlimited.
  - Reactivate offers Easy Start Unlimited only.
- **dashboard, builder, print (Composer), my-labels:**
  - Show "Unlimited" for unlimited subscribers.
  - "Buy downloads →" goes to PAYG for everyone else.
- **plan-checker.js / plan-picker.html:**
  - Redesigned as PAYG vs Easy Start Unlimited (break-even about 10 downloads a month).
  - Never recommends Easy Pro or top-ups.
- **faq.html:** plan comparison rewritten.
- **refund.html:** trial sentence only (see Owner actions).

## Tested
- **Full Node suite + Deno, branch vs main:**
  - Every file that passes on main passes on the branch.
  - The 5 files failing on the branch also fail on main, at the same assertions:
    - `homepage-mobile-nav-signin`;
    - `lifecycle-reminder-accuracy`;
    - `payg-download-accounting` (stale "8 downloads for £4.99" copy assertion);
    - `pricing-signed-in-cta`;
    - `pricing-checkout-ux` (the same 6 sub-checks as main).
- **Deno (real functions, offline):**
  - create-checkout-session: 46 scenarios.
  - stripe-webhook: 47.
  - billing-status: 26.
  - manage-subscription: 8.
- **SQL (real migrations, local Postgres):** `download-entitlement-sql.js` 134 groups, including
  the Unlimited matrix.
- **CLPeasy Test database, rollback-only:** **48/48 PASS** (T42–T47 are new Unlimited checks), 0 QA
  rows left, grants unchanged. Output: `test-db-rollback-run-4-unlimited.txt`.
- **Browser (Chromium), 1366 / 1024 / 390 px:**
  - Pages checked: pricing (monthly and annual), checkout (monthly and annual), plan-picker, faq.
  - No horizontal overflow and no page errors.
  - Three cards; £89 / £7.42 / £30.88 shown correctly.

## Issues found and fixed during testing
- Several existing tests encoded the retired model (Easy Pro card, top-up modal, £99 annual).
  They were updated to assert the new rules. No test was skipped or weakened.
- The Account reactivation test still selected the removed Easy Pro option. Updated.

## Not done / limitations
- **Not tested signed-in end to end:** Stripe/Supabase Edge Functions can't be reached from this
  container, and the £89 Sandbox price doesn't exist yet.
- The Netlify Test site was **not** redeployed with these pages.
- **`index.html` pricing copy is deliberately unchanged here.** It still lists Easy Pro and top-ups.
  It is Phase C (homepage), so it isn't done in a way that conflicts with #202.
- **Internal pages not changed:** `packagemonitor.html`, `monitor.html`, `scrum.html`,
  `clpeasy-flow.html`.
- **`beta-feedback.html` not changed:** it is a survey and still quotes Easy Pro and £99/£149.
- The annual-refill code in `consume_download()` is now unreachable for paid plans. It is left in
  place for a safe rollback.

## Owner action required
1. **Stripe Sandbox (CLPeasy sandbox account):** create a new recurring Price, £89.00 GBP yearly,
   on the existing Easy Start product. Don't edit the £99 price.
   - Put its `price_…` ID in the **CLPeasy Test** Supabase secret `EASY_START_ANNUAL_PRICE_ID`.
   - Then redeploy `create-checkout-session` and `stripe-webhook` to Test.
2. **Stripe Live, later and only after Sandbox E2E:** create the same £89/year Price on the live
   Easy Start product.
   - Put it in the **production** secret `EASY_START_ANNUAL_PRICE_ID`.
   - Optionally archive the old prices; don't delete them.
3. **Refund policy wording (legal):** the "Top-Up Download Packs" section is unchanged, and the
   policy says nothing explicit about PAYG packs. Decide the PAYG refund wording.
4. **Decide whether Easy Pro legacy stays "unlimited".** It currently does; there are no paying
   Pro customers.

## Release gate (before merge or production)
- [ ] Owner visual approval of pricing / checkout / plan picker (screenshots available).
- [ ] Sandbox price + Test secret, then a signed-in Sandbox E2E:
  - monthly with coupon £8.99;
  - annual £89;
  - PAYG £4.99 (8);
  - unlimited downloads in Builder and Composer;
  - cancel-at-period-end;
  - ended → PAYG.
- [ ] Production: apply migration `20261002000000`, deploy both functions, set the Live secret,
  deploy pages. Merge only on explicit approval.
