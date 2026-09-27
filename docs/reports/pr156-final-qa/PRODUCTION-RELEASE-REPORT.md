# PR #156 — Production release report

Date: 27 Sep 2026 (UTC). Authorised by Michaela ("AUTHORISATION GRANTED — proceed with the PR #156 PRODUCTION RELEASE").
Production Supabase: `qvkosdqcryrcfbjtaxic`. Live Stripe account: `acct_1TdczNGZLILz5vqU`. Site: Netlify project `clpeasy` → https://clpeasy.com.

Status key: **PASS** = verified directly · **OWNER-CONFIRMED** = confirmed by the owner, not readable from here · **NOT DIRECTLY VERIFIABLE** = could not be checked from this environment (reason given) · **FAIL**.

## 1. Starting state — PASS
PR #156 open and unmerged, head `41276a5`, `main` at `e8c1f25` (unchanged), production functions/DB at the recorded baseline, the 6 PR #156 migrations not applied.

## 2. Migrations — PASS
Applied in order, verbatim from the repo, top-level DDL only:

| Repo file | Recorded version |
|---|---|
| 20260925000000_atomic_download_accounting | 20260927104706 |
| 20260926000000_download_entitlement_lifecycle | 20260927104734 |
| 20260927000000_payg_trial_conversion_and_annual_refill | 20260927104814 |
| 20260928000000_protect_download_counters | 20260927105022 |
| 20260929000000_redownload_upgrade_and_fixed_window | 20260927105051 |
| 20260930000000_redownload_legacy_key_transition | 20260927105142 |

Verification (read-only):
- `consume_download`, `credit_payg_purchase`, `credit_purchased_downloads`, `protect_profile_billing_columns` are byte-identical (normalised-source md5) to CLPeasy Test, where the rolled-back SQL suite passed 42/42.
- One `consume_download(text,text)` overload.
- Grants: anon none; authenticated only `consume_download`; service_role all.
- Protect trigger is enabled, and `downloads_used`/`downloads_reset_date` are now protected.
- `label_downloads.clean_export` exists (default false).

The rolled-back SQL suite was NOT run against production. It inserts `auth.users` rows and is marked never-run-on-production.

Customer data unchanged by the release (before → after the merge): profiles 21 (16 trial/trialing), subscriptions 0, Stripe events 5, label_downloads 16, total purchased balance 5, total downloads_used 23.

## 3. Edge Functions — PASS

| Function | Production version | ezbr_sha256 | verify_jwt | Source |
|---|---|---|---|---|
| create-checkout-session | v48 | `d825d74ee18fa4651f69183ad3fe20a8bf4f1f7c6196a579c5d0e5d1a16e521d` | true | repo file (md5 `f38edabd…`); retrieved source inspected: PAYG_5_PRICE_ID fail-closed, 8/5 download stamp, promo map, subscriber rules |
| billing-status (new) | v1 | `9fee5c13db7ded434e9972bfa42f5d616f09b6c0cee960f9c82546f8f65f1e1a` | true | retrieved source **diff-identical** to repo (md5 `1e1ec66f…`) |
| stripe-webhook | v59 (was v58) | `1f9f98fd66cd4d790178f0d0e8edba45415cc6900b3b3a1e4ea5b515ba561b93` | false | repo file (md5 `a6f0933b…`, same as Test v8); retrieved source inspected: `invoiceSubscriptionId`, MS-1 `resetUsage: priceJustChanged`, `invoice.created` promo removal |
| manage-subscription | v9, NOT touched | `5d9931578da9edd1481e95bdca85c9927b6c8b060a99c196e31de439cc722728` (unchanged) | true | — |

ezbr hashes differ between projects even for the same source, so Test and production cannot be compared by ezbr. Each production ezbr equals its own deploy response.

## 4. Configuration — OWNER-CONFIRMED
The following are set by the owner. Secret values cannot be read through the available tools and none were exposed:
- `STRIPE_SECRET_KEY` (sk_live);
- `STRIPE_WEBHOOK_SECRET` (Live whsec);
- `PAYG_5_PRICE_ID` = `price_1UKF6YGZLILz5vqUwdiwcokx`;
- `PROMO_2026_EASY_START_MONTHLY_COUPON_ID` / `PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID` = `tdO6j8q7`;
- the Brevo secrets.

Indirect evidence: stripe-webhook v59 boots and rejects an unsigned request with `400 Invalid signature` before any database write.

## 5. Live webhook — OWNER-CONFIRMED
"CLPeasy Production Webhook":
- active;
- production endpoint `…qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/stripe-webhook`;
- API version `2026-05-27.dahlia`;
- 5 events: `checkout.session.completed`, `invoice.paid`, `invoice.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## 6. Pre-merge production checks (no purchase) — PASS
Unauthenticated probes, sent from production pg_net with no key and no side effects:

| Probe | Result |
|---|---|
| stripe-webhook, no signature | 400 `Invalid signature` (processed-events count unchanged at 5) |
| create-checkout-session, no auth | 401 `UNAUTHORIZED_NO_AUTH_HEADER` |
| billing-status, no auth | 401 `UNAUTHORIZED_NO_AUTH_HEADER` |

- **Code:** the production functions use only Live price IDs for Live checkout. Sandbox/Test IDs remain only in the historical backwards-compatibility maps, and no Sandbox ID is sent by any production page (see 9).
- **Logs:** no processing errors from the release functions.

## 7. Merge — PASS
PR #156 was merged into `main` with a merge commit, pinned to head `41276a5`: **`b9d3e32d0a28ef355a5f668acce2744a33267c36`**.

## 8. Site deployment — PASS
Netlify production deploy `6ab8f6ffe306190008c9b08e`:
- context `production`, branch `main`;
- commit_ref `b9d3e32`, state **ready**;
- published 10:59:19Z to https://clpeasy.com;
- 20 redirect rules processed, no errors.

## 9. Post-release smoke tests
The container and WebFetch cannot reach clpeasy.com (egress blocked). Pages were fetched from the live site through production pg_net (public GET, no credentials).

| Check | Result |
|---|---|
| index, pricing, builder, account, auth, dashboard, my-labels, checkout, print (Print Sheet Composer) | **PASS**: all HTTP 200 |
| entitlement.js, label-render.js | **PASS**: byte-identical to `main` |
| label-library.js | **PASS**: Content-Length 50,253 = repo. pg_net stores only the first 15,996 bytes because the file contains literal NUL separator bytes, which Postgres text cannot hold (test-method limitation); that prefix matches. File unchanged by PR #156. |
| HTML pages | **PASS**: release content present. Hashes differ from the repo only because Netlify pretty-URL processing rewrites links (e.g. `href="terms.html"` → `href='/terms'`); this is pre-existing site behaviour. |
| Pricing: PAYG CTA "Buy 8 downloads — £4.99", `payg_5` product key | **PASS** |
| Pricing: Easy Start "£8.99/month until 31 December 2026", Easy Pro "£13.49/month until …" | **PASS** |
| Pricing: annual £99 / £149 (no promo) | **PASS**: annual prices undiscounted in the page; the server applies the coupon only to the two monthly prices |
| Builder, My Labels, Dashboard, Account, Composer load `entitlement.js`; Account calls `billing-status` | **PASS** |
| No Sandbox account IDs (`KF3jvQfgEa`), Test project (`wwjhvpphlbgtywxskqnf`), Test-mode prices (`price_1Ty…`) or `pk_/sk_test_` keys on any page | **PASS** |
| All pages point at production Supabase `qvkosdqcryrcfbjtaxic` | **PASS** |
| Sign-in / account behaviour in a real browser | **NOT DIRECTLY VERIFIABLE** from here: no browser route to clpeasy.com and no production login. Pages load; auth.html is unchanged in behaviour. |
| PAYG checkout opens at £4.99 (`price_1UKF6Y…`) with metadata downloads = 8 | **NOT DIRECTLY VERIFIABLE** from here: creating a session needs a signed-in production user. The code reads only the `PAYG_5_PRICE_ID` secret (owner-confirmed value) and stamps 8 before 2027-01-01. |
| Monthly checkout shows £8.99 / £13.49 | **NOT DIRECTLY VERIFIABLE** from here (same reason). The coupon comes from the owner-confirmed secrets; fails closed with 503 if missing. |
| New production errors | **PASS**: none from the release. Only `event loop error: Deno.core.runMicrotasks() is not supported` at worker shutdown (stripe-webhook after the probe; also on unchanged clp-wizard). The identical Test deployment logged it on 36/36 Sandbox events with 0 processing errors; it is pre-existing runtime noise, not a regression. |

**Owner smoke test recommended (no payment):**
1. Signed in as a trial account, press "Buy 8 downloads — £4.99" and confirm Stripe Checkout shows £4.99 in Live mode.
2. Close it without paying.
3. Do the same with Easy Start monthly (£8.99 first charge) and Easy Pro monthly (£13.49).

## 10. Webhook runtime
Owner-confirmed configuration; runtime verification pending the first Live event. No paid transaction was manufactured. Processed events remain 5 (last 30 Jul 2026).

## 11. Deferred (unchanged by this release)
- MS-2 (cancellation reason)
- C2 (`past_due`)
- the former Easy Pro "Easy Start (Cancelled)" display
- My Labels localStorage
- the signup/service-role security issue
- the Easy Start monthly tax-code inconsistency (not release-blocking)

## 12. Confirmations
- No Test/Sandbox resources were substituted into production.
- No Live Stripe or Brevo changes were made.
- No customer data changed apart from the migrations.
- manage-subscription was not redeployed.
- No secret was printed.

## Rollback (if ever needed)
- **Site:** redeploy Netlify deploy `6ab59c1271d9b500088dabd0` (`e8c1f25`) or revert the merge commit.
- **Functions:** redeploy the previous create-checkout-session v43 and stripe-webhook v58 sources; delete billing-status.
- **Database:** the migrations have no automatic down-migration and the old `consume_download(text)` was dropped. Rolling back the site without the database would break downloads, so roll back the site and database together, or fix forward.

## Result
**RELEASE PASS — QUALIFIED: FAILED LIVE SMOKE TEST (see 13), unresolved.** The deployment steps (migrations, functions, merge, site) passed. The first signed-in live smoke test failed because of a production configuration error.

## 13. Post-release live smoke test failure — 27 Sep 2026 11:08 UTC — OPEN

**What the owner saw:** signed in on clpeasy.com → Pricing → "Buy 8 downloads — £4.99". The button showed "Opening secure checkout...", then the alert "Something went wrong starting checkout. Please try again." Stripe Checkout did not open. No payment was made.

**Production logs (create-checkout-session v48):**
- 11:08:22.271 `OPTIONS 200`.
- 11:08:23.292 `Stripe error: Invalid API key provided: mk_… This looks like the ID of an API key rather than the key itself. API keys typically start with pk_, rk_, or sk_.` (Stripe masked the value; it is not reproduced here.)
- 11:08:23.300 `POST 400`.

**Root cause (established):** the `STRIPE_SECRET_KEY` secret in production holds a Stripe API key *identifier* (`mk_…`), not the secret key value (`sk_live_…`). Stripe rejects every API call made with it.

What this rules out:
- The request passed authentication and user lookup: Stripe was reached, which happens only after the JWT check.
- It passed the PAYG subscriber rule, and `PAYG_5_PRICE_ID` was present; a missing one returns 503 before Stripe is called.
- Price, product, tax and checkout parameters were never evaluated, because Stripe refused the key first.

This is a configuration error, not a PR #156 code defect.

The earlier gate recorded this secret as OWNER-CONFIRMED. The pre-merge probes (no-auth 401, unsigned webhook 400) cannot exercise the key, so the error was not detectable without a signed-in Stripe call. That is a gate-methodology gap.

**Scope — every server-side Stripe API call using this secret fails:**

| Area | Effect while the key is wrong |
|---|---|
| create-checkout-session | Fails for **all** checkout types: PAYG, Easy Start/Pro monthly/annual, subscriber top-ups. For subscriptions the checkout lock is released on the Stripe error, so users are not locked out. |
| billing-status | Returns `available:false`; the Account page shows no amount. |
| manage-subscription (pause/cancel/reactivate), create-portal-session | Would return errors. There are currently 0 subscriptions, so no existing customer can reach these. |
| stripe-webhook | Signature checks do not use this key, so events are still verified. `checkout.session.completed` crediting (PAYG/top-up/subscription) uses only the database and would work. `invoice.paid`, `invoice.created` and reactivation Brevo lookups call Stripe: they would return 500, release the event claim, and be retried by Stripe once the key is fixed. |

**Customer impact:**
- No one can buy anything on clpeasy.com until the key is corrected.
- No charges and no data changes result from the failure: it happens before any Checkout Session exists.
- No existing paying subscriber is affected (0 subscriptions).
- Trials, Builder, My Labels and downloads are unaffected.

**Safest fix — configuration only, owner action:**
1. In Stripe (Live mode) → Developers → API keys, reveal/copy the **Secret key** (`sk_live_…`). Do not copy the key's ID. A restricted `rk_live_…` key also works only if it has the permissions these functions use (Checkout Sessions, Customers, Subscriptions, Invoices, Prices); a standard secret key is simplest.
2. In Supabase (production) → Edge Functions → Secrets, set `STRIPE_SECRET_KEY` to that value.

No code change, redeploy or rollback is required: functions read the secret on each cold start. A rollback would not help, because the pre-release functions read the same secret.

**After the fix:** repeat the PAYG smoke test (open Checkout, confirm £4.99 Live, close without paying), then check the logs for a `POST 200` from create-checkout-session.
