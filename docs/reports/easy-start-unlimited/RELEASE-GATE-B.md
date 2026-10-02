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

## Sandbox / Test E2E (2 Oct 2026, after the Stripe connector was linked)
Full evidence: `SANDBOX-E2E-2026-10-02.md`.
- **New Sandbox price:** `price_1UM5UwKF3jvQfgEa5A5F3ac5`, £89/year on product `prod_UcstRjI13CbKaI`.
  The £99 price is untouched.
- **Functions:** `create-checkout-session` v8 and `stripe-webhook` v9 deployed to CLPeasy Test.
  The Test build falls back to the Sandbox price because the secret couldn't be set with the
  available tools.
- **Test site:** redeployed with the Phase B pages (deploy `6abfa60e6bb1425165b86ecc`).
- **What passed, all through real Sandbox payments and signed webhooks:**
  - £89 paid with no discount;
  - entitlement active, annual and unlimited;
  - 30 labels + 4 sheets consumed nothing, PAYG 8 kept;
  - cancel-at-period-end stays unlimited until 2027-10-02;
  - ended → free, then PAYG used;
  - a declined first payment and its expiry leave the trial intact;
  - the duplicate-event guard holds.
- **Not covered:** the Stripe-hosted Checkout page and the in-browser Builder/Composer buttons
  against the real backend (the container can't reach those hosts). This needs one manual signed-in
  run on the Test site.

## Not done / limitations
- The Stripe-hosted Checkout page and the browser download buttons weren't exercised against the
  real backend (see above).
- **`index.html` pricing copy is deliberately unchanged here.** It still lists Easy Pro and top-ups.
  It is Phase C (homepage), so it isn't done in a way that conflicts with #202.
- **Internal pages not changed:** `packagemonitor.html`, `monitor.html`, `scrum.html`,
  `clpeasy-flow.html`.
- **`beta-feedback.html` not changed:** it is a survey and still quotes Easy Pro and £99/£149.
- The annual-refill code in `consume_download()` is now unreachable for paid plans. It is left in
  place for a safe rollback.

## Owner action required
1. **Done 2 Oct 2026:** the Sandbox price `price_1UM5UwKF3jvQfgEa5A5F3ac5` exists and Test is
   configured. Optional: set the **CLPeasy Test** secret `EASY_START_ANNUAL_PRICE_ID` to that ID in
   the Supabase dashboard; the Test-build fallback then becomes redundant.
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
- [x] Sandbox £89 price and Test configuration (fallback in the Test build).
- [x] Server-side Sandbox E2E: annual £89, no discount, unlimited, cancel-at-period-end, ended →
  PAYG, declined and expired payments, duplicate guard.
- [ ] One manual browser run on the Test site:
  - Stripe-hosted checkout (annual);
  - Account display;
  - one Builder label and one Composer sheet.
  - Optionally also monthly £8.99 and PAYG £4.99.
- [ ] Production: apply migration `20261002000000`, deploy both functions, set the Live secret,
  deploy pages. Merge only on explicit approval.
