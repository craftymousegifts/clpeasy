# PR #156 — v14 automated QA and remaining-before-release (26 Sep 2026)

- **Branch:** `feature/pay-as-you-go-downloads`.
- **Site code:** v14 (`9e00b40`); no site file has changed since.
- **Server:** `billing-status` fix `51447d5`, deployed to CLPeasy Test as v2.
- **Scope:** everything was run by Claude on CLPeasy Test and Stripe Sandbox. No manual owner
  testing.
- **Untouched:** production, live Stripe, live Brevo and `main`.

## 1. Test environment matches the PR code

| Check | Result |
|---|---|
| Test Edge Functions vs repo | **PASS**. `create-checkout-session` (v7) and `stripe-webhook` (v6) were deployed from `946ae8e`; neither file has changed since (`git diff 946ae8e HEAD -- supabase/functions` touches only `billing-status`). `billing-status` v2 = `51447d5` (byte-identical, verified earlier). The checkout function differs from the repo only by the Test origins and return URLs. |
| Test migrations | **PASS**. All six PR #156 migrations are applied, including v12 C1 (`redownload_upgrade_and_fixed_window_pr156_c1`) and v13 (`redownload_legacy_key_transition_pr156_v13`). |
| Test DB function bodies vs repo | **PASS**. `consume_download`, `credit_payg_purchase`, `credit_purchased_downloads` and `protect_profile_billing_columns` are identical to the repo migrations (md5 with comments and whitespace removed; applied locally to PostgreSQL 16). Security definer, `search_path=public`, and grants: `consume_download` → authenticated/service_role; the crediting functions → service_role only. |
| v14 site files vs branch head | **PASS**. No site file changed between `9e00b40` and the head. |

## 2. Automated results

| Suite | Where | Result |
|---|---|---|
| Node test files (includes jsdom pages, 126 SQL groups on real migrations, 19 printing-guidance groups in real Chromium, hazard-source integrity) | local, head | **60/60 PASS** (`evidence/logs/test-suite-run-v14-final.txt`) |
| Deno Edge Function scenarios: webhook, checkout, billing-status (incl. 10 `billing_mode=flexible`) | local | **31 + 36 + 26 = 93 PASS** |
| `npm test` | local | **PASS** (exit 0) |
| Lifecycle suite on the real Test DB, rolled back (`tests/sql/test-env-lifecycle-rollback.sql`, T01–T41) | CLPeasy Test | **42/42 PASS, 0 FAIL**, nothing persisted |
| Real PostgREST RPC with real customer logins | CLPeasy Test | **PASS**, see §3 |
| Real `create-checkout-session` across 9 account states plus 8 subscription cases (33 calls), and inspection of 17 real Checkout Sessions (each expired immediately) | CLPeasy Test + Stripe Sandbox | **PASS**, see §4 |
| Real `billing-status` | CLPeasy Test | **PASS**. No subscription → `no_subscription`. Unknown Stripe subscription → `lookup_failed` (no amount). The flexible subscription was covered by owner test M2. |
| Real `stripe-webhook` signature enforcement | CLPeasy Test | **PASS**. Forged and unsigned events → 400; no event claim written. |
| Browser matrix on the v14 build: 10 account states × 6 pages × desktop 1366 / mobile 390, plus signed-out, pricing and return-URL runs | local Chromium, stubbed backend | **137/137 PASS**. 0 console errors, 0 horizontal overflow, `[TEST]` + noindex on every page, no Plausible loader, correct sign-in redirects, subscriber PAYG → top-ups routing (`evidence/v14/browser-matrix-v14.json`) |
| Section 2.2 / saved-label matrix on the v14 build | local Chromium | **24/24 PASS** (`evidence/v14/section-2.2-and-library-matrix-v14.json`). Covers the reopen lock (C3), rename blocked until answered (C4), no duplicate on save, clear/re-extract, and the size-aware key (C1). Four expectations in the old v11 script were updated to the approved v12/v13 rules; those were test-script updates, not app changes. |

## 3. Real RPC path (PostgREST, customer JWT)

All results as expected:

- **PAYG with 3 purchased downloads:**
  - first download: charged, 2 left, clean;
  - same label again: free;
  - another size: charged, 1 left;
  - Composer (`p_label_key: null`): charged, 0 left.
- **At zero:**
  - a new label is blocked (`no_downloads_remaining`);
  - the same label inside its 7 days is still free and clean.
- **Argument handling:** calling with only `p_label_key` resolves to the two-argument function.
- **Security:**
  - the customer's own PATCH of credits/plan/status/limit returns 200, but the values are
    unchanged (the trigger holds);
  - calling `credit_payg_purchase` directly → 403;
  - reading another user's profile → nothing returned;
  - anonymous RPC → 401.
- **Legacy key transition (v13):**
  - an old `name::type` record from 2 days ago → free, original time kept, record claimed;
  - a second size → charged.

## 4. Real Checkout Sessions (Stripe Sandbox, all expired immediately)

**Server gates:**

- **PAYG allowed (200):** trial, expired trial, PAYG, paused, fully ended, ended-period-over.
- **PAYG refused (403 `PAYG_NOT_FOR_SUBSCRIBERS`):** Start, Pro, cancel-scheduled.
- **Top-ups allowed (200):** Start (5 and 10), Pro, cancel-scheduled.
- **Top-ups refused (403 `TOPUP_SUBSCRIBERS_ONLY`):** trial, expired, PAYG, paused, ended,
  ended-period-over.
- **Duplicate protection:**
  - active subscriber with a linked subscription → 409 `ALREADY_SUBSCRIBED`;
  - second click within 5 minutes → 409 `CHECKOUT_IN_PROGRESS`.

**Session contents:**

- **PAYG:** £4.99, product "CLPeasy Pay As You Go downloads", `downloads=8`, `type=payg`.
- **Top-ups:** £3.99 and £7.99, `type=topup`.
- **Monthly promotion:**
  - Easy Start £9.99 → **£8.99**;
  - Easy Pro £14.99 → **£13.49**;
  - coupon `gWcEql0d`, applied server-side.
- **Annual:** £99 and £149, no discount.
- **Injected coupon or promotion code:** ignored (£99, no discount).
- **Foreign `successUrl` / `cancelUrl`:** replaced by the v10 Test defaults.
- **Billing address:** required on subscriptions.
- All sessions `livemode=false`.

## 5. Owner manual tests already passed on v14 (real site, real backend)

- M1–M8 are in `MANUAL-E2E-LOG-v14.md`.
- Earlier real Sandbox purchases:
  - PAYG £4.99 → 8;
  - Easy Start subscription;
  - top-ups £3.99 → +5 and £7.99 → +10, balance 44.

## 6. Clean-up

- **Users:** the 20 disposable `qa-v14-*` users were deleted, and the rollback suite persisted
  nothing.
- **Michaela's QA account is unchanged:** Easy Start active, 1/20 used, 24 purchased, 4 download
  records.
- **Temporary tools:**
  - `pg_net` was dropped (extensions back to pg_stat_statements, pgcrypto, plpgsql,
    supabase_vault, uuid-ossp);
  - `qa-sandbox-price-check` was returned to a 410 stub;
  - harness source is kept in `harness/test-env-qa-harness-v14.ts` with the token replaced by a
    placeholder.

## 7. What remains before release

### Defects / UX findings (not fixed; decisions needed)

| ID | Finding | Severity | Origin | Proposed fix |
|---|---|---|---|---|
| F1 | Reopened labels: the Smart Paste box is blank (raw SDS text is never stored), yet the Step 3 confirmation says "the hazard data shown in the Smart Paste section above". The data is actually in the signal word / pictogram / H/P / sensitiser sections. | Low–medium (compliance wording; more visible now v13 unticks this box after type/load changes) | same on `main` | Reword to "the hazard data shown in this step…", plus optionally a note that the original SDS text isn't stored. **Wording approval needed.** |
| — | "Easy Start (Cancelled)" shown for a fully ended former Easy Pro account | Low | same on `main` | Optional follow-up. |
| — | Overdue (`past_due`) subscriptions never reach `profiles` (C2) | Existing billing-policy issue | same on `main` | Separate follow-up, already recorded. |
| — | Netlify rewrites two hover attributes on the Test site | Cosmetic | existing site setting | Check the production Netlify asset-optimisation setting. |

No new functional defect was found in this run.

### Blocked by owner decisions (Stripe Sandbox configuration)

- **C7-A:** the Sandbox endpoint `we_1TddU7…` posts Sandbox events to the **production**
  `stripe-webhook`.
  - Owner action: check its recent deliveries (400 = rejected), then disable it in the Sandbox.
- **C7-B:** add `invoice.paid`, `customer.subscription.updated` and
  `customer.subscription.deleted` to the Test endpoint `we_1UJZJ5…`.
- Until both are done, the following are **not** end-to-end tested on real Stripe:
  - renewal / test-clock E2E: monthly refill on renewal, first-2027-renewal promo removal,
    unrelated discounts kept;
  - pause, cancel and end webhooks.
  - They are covered by offline Deno tests and the rolled-back DB suite. They weren't run live,
    because Sandbox subscription events would also go to the production endpoint.
- **Billing portal:** `create-portal-session` and `manage-subscription` are not deployed on
  CLPeasy Test, so plan changes and pause/cancel from Account can't be exercised there.
  - Deploying them to Test needs owner approval.
  - The Sandbox billing portal must also allow switching to Easy Pro annual.

### Owner-only

- **Real iPhone Safari/WebKit check:** the final check; not possible in this environment.
- **Delete the `qa-sandbox-price-check` stub** in the CLPeasy Test dashboard (no delete tool
  here).

### Production release checklist (not started, needs authorisation)

1. **Migrations:** apply to production, up to and including `20260930000000`.
2. **Edge Functions:** deploy `create-checkout-session`, `stripe-webhook` and `billing-status`.
3. **Secrets:** set `PAYG_5_PRICE_ID` (live), both 2026 coupon IDs (live), and
   `BREVO_PAID_LIST_ID`.
4. **Live webhook events:** the live endpoint needs `invoice.created`, in addition to its current
   events, for the 2027 promo removal.
5. **Live PAYG Stripe product:** check its name and description (the 8 = 5 + 3 FREE wording).
6. **Label-key change:** each existing label's first download after release is charged once,
   then the normal 7-day rule applies (v13 transition covers labels downloaded in the last 7
   days).

## 8. Readiness

- **Code:** the v14 candidate is technically ready for the final real Safari/iPhone check.
  Automated, real-backend and manual Test results all pass, with no open functional defect.
- **Release still needs:**
  - the F1 wording decision;
  - the C7 A/B Sandbox webhook decisions, followed by the renewal E2E;
  - authorisation for the production checklist above.
