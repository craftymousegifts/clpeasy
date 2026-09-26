# CLPeasy — Unattended Development Report

Friday 25 September 2026 · work branch `claude/optimistic-knuth-ayey91` (built on PR #156 head `3fd342e`)
**Nothing was merged or deployed. I didn't touch production, live Stripe, live Brevo, any Supabase project, the v9 test site or the QA account.**

---

## EXECUTIVE SUMMARY

| | |
|---|---|
| Application issues fixed on the work branch | **15** (12 introduced by PR #156, 2 pre-existing on main, 1 hardening) |
| Further application issues found, not fixed | **8** (decisions, Stripe configuration, or out of scope; listed below) |
| Test-suite problems fixed | 12 files (5 stale on main too, 7 stale mocks from PR #156) |
| Tests | 3 new Node test files, 2 Deno Edge Function suites (with runner and stubs), 1 SQL shim; 31 existing test files updated |
| Test status | **57 / 57 Node test files pass** (PR #156 head: 42 / 54; main: 48 / 53). Edge Function suites: 17 / 17 scenarios pass under Deno 2.9.6 |
| Release blockers remaining | **4** (see STILL OUTSTANDING) |
| Decisions required from Michaela | **5** |

**Unexpected findings (please read first):**
1. **The pricing-page PAYG button on the PR #156 head is broken.** `startPaygCheckout()` uses a variable called `sb` and a key called `SUPABASE_ANON_KEY`, and pricing.html defines neither. Every click shows "Something went wrong starting checkout". I confirmed this in Chromium and fixed it on the work branch. **I can't see the v9 package, so I don't know whether v9 still has this bug.** It directly affects Monday's first step.
2. **Stripe Checkout returns to live clpeasy.com, not the test site.** PR #156 hard-codes `successUrl`/`cancelUrl` to `https://clpeasy.com/...`, and the Edge Function only allows that origin. Unless the isolated deployment changed this, Monday QA step 6 ("confirm return to isolated test site") will send you to the **live** site. Check before paying.
3. The v9 "eight local commits" are **not in GitHub**, and the proxy blocks the test site, so I couldn't inspect them. All my work sits on top of the PR #156 head. Before anything is merged into PR #156 it has to be reconciled with v9 (see COMMITS).

---

## COMPLETED

### Priority 1 — failing tests

**1. Five tests failing on main and PR alike: stale tests, not app bugs.**
- *Problem:* `builder-desktop-scroll-model`, `builder-step-navigation-layout`, `footer-and-compliance-wording`, `lifecycle-reminder-accuracy` and `smart-paste-user-guidance-wording` failed on both main and PR #156.
- *Root cause:* in every case Michaela's later merged commits deliberately changed the wording, and the tests still pinned the old text:
  - c5c1d57/#136 changed the compliance card and the Step 5 checkbox.
  - 6de95cf rewrote the Showcase wording.
  - e7151e9 removed the roadmap and "coming soon" rows.
  - 63e631b removed the FAQ cost comparison.
  - 27c976d and 7778094 removed homepage sections.
  - c370053/#149 and b8945ae/#152 reworded pricing text.
- *Fix:* the positive assertions now check the current approved wording. Checks for deliberately removed sections only apply if those sections come back. **Every "no overclaim / no guarantee" guard is unchanged.**
- *Existed on main:* yes. *Introduced by PR #156:* no. *Production impact:* none (test-only).

**2. Seven tests failing only on PR #156: stale test mocks, not app bugs.**
- *Problem:* the Composer and preview tests (`print-sheet-composer`, `print-sheet-export-fidelity`, `print-sheet-fit-blocking`, `checkpoint-c-composer-identity`, `custom-rect-grid-geometry`, `p280-precautionary-statement`, `preview-watermark-and-export-authorization`) failed on the PR only.
- *Root cause:* PR #156 moved entitlement from the `subscriptions` row to `profiles` plus the `consume_download` RPC. The test mocks still returned `{plan,status}` and had no RPC. They also lacked `document.open()`, which PR #156's pop-up-first PDF flow needs.
- *Fix:* the mocks now model the profile and RPC. I rewrote the security test's harness so an in-page `consume_download` simulation gives the same answer as the real SQL (proven by the SQL test). Its security intent is kept, and I added lifecycle, PAYG and trial cases.

### Priority 2 — PR #156 bug audit

**3. Dead `dlGate()` in the Builder** (PR #156) — it had no callers and called `showDlLimitModal()`, which PR #156 had deleted. *Fix:* removed. The test asserts it stays gone.

**4. Guests could no longer download from the Builder** (PR #156 regression)
- *Problem:* on main, a signed-out visitor could download a watermarked, uncounted label. The code comment said so and a test protected it. PR #156 blocked this with the misleading message "We could not verify your download allowance".
- *Fix:* main's behaviour is restored in `wrapDownloads()`. Guests get a watermarked export and the RPC is never called. Output is never clean, even if someone tampers with `S.isPro`.

**5. Plan name wrong in the Builder sidebar**
- *Problem:* PAYG customers were shown as "Easy Pro" (PR #156). Easy Start subscribers were also shown as "Easy Pro" — that part is pre-existing on main.
- *Fix:* the name now comes from the shared `entitlement.js`.

**6. The pricing-page PAYG button always failed** (PR #156): see summary item 1.
- *Fix (`pricing.html`, JavaScript only):* uses `sbClient` and `SUPABASE_KEY`, like `startCheckout()` does. No design, wording or price change.
- *Verified:* in Chromium, the PR head shows "Something went wrong". The fix sends the correct `payg_5` request with the apikey and user JWT, then goes to the returned Checkout URL.

**7. New customers lost their PAYG purchase at sign-up** (PR #156)
- *Problem:* the signed-out redirect used `?return=pricing.html`, but auth.html only reads `?next=`. New customers landed on the Builder and the pending £4.99 checkout was dropped. The resume code also didn't wait for the session.
- *Fix:* the redirect now uses `?next=pricing.html` and the resume waits for `initSupabase()`. Verified in Chromium; covered by `tests/payg-pricing-checkout.js`.

**8. PAYG checkout could fall back to a browser-supplied price** (PR #156)
- *Problem:* if `PAYG_5_PRICE_ID` were ever missing, the function would use a price ID sent by the browser but still stamp 8 downloads.
- *Fix:* the function now fails closed with HTTP 503.

**9. Webhook didn't check payment status** (hardening) — the webhook now never credits a PAYG session whose `payment_status` isn't `paid`.

**Audit items checked with no change needed:**
- The atomic credit path is correct: only one of two racing final downloads succeeds (tested on real PostgreSQL).
- Idempotency and retry release are correct.
- RPC grants are correct: anon is denied, authenticated users can't credit, service_role can.
- The 7-day grace keeps each file's original clean or watermarked status.

### Priority 3 — PAYG display on authenticated pages

**10. One shared rule set: `entitlement.js`** (new, about 100 lines)
- It's the browser copy of the `consume_download` rules: usable plan allowance, clean or watermarked, PAYG balance, plan name, and sidebar card.
- `tests/download-entitlement-sql.js` runs the real migrations on a throwaway **local** PostgreSQL and checks that, for all 20 state combinations, this file agrees with the database.
- It replaces five diverging copies in Builder, Composer, Account, Dashboard and My Labels.

**11. Display fixes** (PR #156 / PAYG-related; the Composer sidebar was never populated on main):
- **Account:**
  - Expired trial plus PAYG downloads now shows "Pay As You Go". It's no longer told "Choose a plan to continue".
  - The sidebar counts purchased downloads and no longer counts an expired trial's unusable allowance.
  - A scheduled cancellation now shows its remaining paid allowance.
- **Dashboard:**
  - The main card shows purchased downloads, e.g. "0 of 10 remaining · 8 purchased", or "Purchased downloads — 3 remaining".
  - An expired trial now shows 0 remaining (it used to show 10).
  - The renewal line is fixed for PAYG.
- **My Labels:** the sidebar shows the plan name and PAYG balance.
- **Composer:** the sidebar is now filled in, and it refreshes after each export.
- *Wording rule:* plan-only balances keep the existing "X of Y" wording. Only balances that include purchased downloads show "N downloads".

**12. Pre-existing crash on main: every cancelled account's page stopped rendering part-way**
- *Problem:* `account.html` called an undefined `fmtDate(u.renewal_date)` for any account with status `cancelled`. `renderAccount()` threw at that point, so the purchased-download balance, billing details and the Reactivate button never appeared.
- *Fix:* it now uses the stored Stripe `cancel_at` date (`deletion_date`). A scheduled cancellation shows "Access continues until <date>"; an ended one shows "Subscription cancelled · Reactivate →".

*Browser verification (Chromium, desktop 1366px and mobile 390px, Supabase stubbed in the page):*
- Checked Account, Dashboard, Builder, My Labels and Composer, in PAYG, expired-trial, scheduled-cancellation and live-trial states.
- No JavaScript errors. The only 404 was `/favicon.ico` (the repo has no favicon).
- No horizontal scrolling at either width.

### Priority 4 — cancellation and period-end entitlement

**13. Scheduled cancellations lost their paid downloads immediately** (PR #156 regression)
- *Trace:*
  - Stripe `cancel_at_period_end` → the webhook sets `subscription_status='cancelled'` and `deletion_date=cancel_at`, and keeps the plan and allowance.
  - The webhook's own comment says pause and scheduled cancellation keep "the paid plan/allowance until the subscription genuinely ends". Only `downgradeToFree()` removes it, when `customer.subscription.deleted` arrives.
  - account.html promises "Your access continues until the end of your current billing period".
  - PR #156's `consume_download` allowed only `status='active'`, so the customer was cut off the moment they clicked cancel. On main, allowance and clean exports continued, because `subscriptions.status` stays `active` in Stripe.
- *Fix:* new migration `20260926000000_download_entitlement_lifecycle.sql` (not applied anywhere). A scheduled cancellation stays usable and clean while the plan is still paid, the limit is above 0, and `deletion_date` is empty or in the future. The browser mirror in `entitlement.js` matches.
- *Other states:*
  - **Paused** stays blocked, as PR #156 intended ("Downloads are paused" in the pause modal). On main, paused users could still download clean.
  - **past_due** stays blocked, as in PR #156.
  - **Purchased downloads** work in every state.
- *Tests:* all ten states, with and without purchased downloads, on real PostgreSQL (the SQL harness below). The test also confirms the original PR function had the bug.

### Priority 5 — Trial vs Print Sheet Composer

**14. Live-trial users got clean A4 sheets and spent trial downloads on them** (PR #156 regression)
- *Main:* the Composer blocked trial users completely ("Upgrade to Pro").
- *PR #156:* the Composer checks for "any available download", so a live trial passes. The RPC spends a *trial* download (`clean_export=false`), but the Composer renders before charging and ignores that flag. The result is a **clean** A4 sheet. Confirmed by a test that fails on the PR head.
- *The Builder, for comparison:* trial exports are watermarked.
- *Fix:* I restored main's rule: trial-only accounts can't export Composer sheets and nothing is charged. They now see "Print sheets need a paid plan or purchased downloads" instead of the untrue "No downloads remaining". Whether trials *should* get watermarked Composer sheets is a decision (D1).

### Priority 6 — PAYG Brevo (mocked only)

**15. `stripe-webhook`:**
- Only after a successful credit, the buyer is upserted to the list in the new secret `BREVO_PAYG_LIST_ID`, with `PLAN = "Pay As You Go"`.
- It's skipped if that secret isn't set.
- It's skipped for current subscribers, so their subscriber `PLAN` attribute is never overwritten.
- It's fully wrapped: a Brevo error can never trigger the idempotency-claim release, which would otherwise let Stripe's retry **double-credit** the purchase.
- The subscription path is unchanged.
- *Tests (Deno, offline):* the real webhook file runs with Stripe and Supabase stubbed through an import map and Brevo's HTTP calls mocked. Scenarios covered:
  - new contact and existing contact
  - duplicate delivery
  - credit failure, then retry, then resend
  - Brevo HTTP 500 and Brevo network error (credit kept, no double credit on resend)
  - list not configured
  - subscriber buying PAYG
  - unpaid session and invalid quantity
  - subscription purchase still going to the paid list
- I checked that these tests fail against the PR head's webhook. The list and automation choice is D2.

### Priority 7 — Stripe subscription promotion audit (read-only on Stripe)

**16. Findings:**
- `pricing.html` sends these price IDs:
  - Monthly: `price_1TdoEYGZLILz5vqUIqlEsf4X` (Start) and `price_1TdoEXGZLILz5vqUvZKB1RQw` (Pro)
  - Annual: `price_1TdoEXGZLILz5vqUQj5n6Zri` (Start) and `price_1TdoEXGZLILz5vqUFgTznTUT` (Pro)
- `create-checkout-session` passes the chosen price through with **no** coupon, discount, promotion code or `allow_promotion_codes` (tested).
- **There is no promotion handling anywhere in the code.** Checkout will charge whatever those Stripe prices currently are.
- Nothing implements "£8.99/£13.49 until 31 December 2026, then £9.99/£14.99".
- `checkout.html` still shows £9.99/£14.99.
- The PR's own comment agrees: "Stripe still needs the actual 10%-off subscription billing configuration".
- On the PR head, switching Annual back to Monthly resets the cards to £9.99/£14.99. v9 reportedly changes this toggle; please confirm.
- Not fixed, because it needs a Stripe configuration or commercial choice (D3).

### Priority 8 — `Deno.core.runMicrotasks() is not supported`

**17. Assessment: almost certainly harmless runtime noise.**
- Both PAYG functions import Stripe and Supabase through `esm.sh ?target=deno`, which loads esm.sh's Node polyfills. Its `process.nextTick` polyfill calls `Deno.core.runMicrotasks`, which Supabase's Edge Runtime doesn't provide, so it logs this line.
- It appears after responses and doesn't affect results. Your PAYG tests all passed, and the offline suites pass.
- **I couldn't reproduce it** (esm.sh is blocked here), so this is an informed assessment, not a verified one.
- *Optional clean-up at the next planned Edge Function deploy (not done):* switch to `npm:stripe@14` and `npm:@supabase/supabase-js@2` specifiers, then retest in the Sandbox. **No action is needed before release.**

---

## DECISIONS REQUIRED FROM MICHAELA

**D1 — TRIAL / COMPOSER**
- *Evidence:*
  - Main blocked trial users from the Composer.
  - PR #156 gave them clean sheets (now fixed back to blocked).
  - Pricing says the trial "gives you full access to every feature" but also promises "10 watermarked trial downloads".
- *Option A (current work branch):* trial-only accounts can't export Composer sheets. No charge, never clean. Nothing else to do.
- *Option B:* allow **watermarked** trial A4 sheets that spend one trial download. The Composer would need to render its sheet from the RPC's `clean_export` result, like the Builder does. That's a medium-sized change to the export flow: render after charging, plus the existing failed-render protections.
- *Recommendation:* A for release. Revisit B later if trial users ask for it.
- *Decision needed:* A or B.

**D2 — PAYG Brevo journey**
- *Option A:* a dedicated PAYG list and automation. Set `BREVO_PAYG_LIST_ID` to that list.
- *Option B:* the existing paid list, with the automation branching on `PLAN = Pay As You Go`. Set `BREVO_PAYG_LIST_ID` to the paid list ID. This is riskier: the subscriber emails mention renewal and cancellation.
- The same code supports both. **Recommendation:** A.
- *Also decide:*
  - whether subscribers who buy PAYG downloads should get any email (currently skipped);
  - whether you want extra attributes such as `PAYG_DOWNLOADS` (they'd need creating in Brevo first).

**D3 — Subscription promotional prices** (release blocker)
- *Option A:* create discounted Stripe prices (£8.99/£13.49) and switch the price IDs on 1 January.
- *Option B:* a Stripe coupon applied by `create-checkout-session` until 31 December 2026. Duration and end behaviour need deciding (for example, is it "10% off while subscribed until 31 Dec", or "for N months"?).
- *Option C:* show standard prices only.
- I can prepare the code for A or B once you decide. Nothing was changed.

**D4 — "Buy Top-Up" route**
- The sidebar and account buttons still open the old top-up modal: 5 for £3.99, 10 for £7.99, using the old live price IDs. These are cheaper than PAYG's 5 for £4.99 after the campaign, and they're shown to non-subscribers too.
- *Options:*
  - (A) send all top-up links to the PAYG checkout;
  - (B) keep top-ups for subscribers only and use PAYG for everyone else;
  - (C) keep both as they are.
- This is a commercial decision; I made no change.

**D5 — Trial customer who buys PAYG: which download is used first?** (implemented provisionally)
- PR #156 states "trial allowance is consumed before purchased downloads". But then a customer who pays £4.99 during their trial gets **watermarked** files until the trial runs out, while their Builder preview looks clean.
- The work branch uses the purchased (clean) download first **only while the trial allowance would be watermarked**. Subscriptions are unchanged: plan allowance first.
- *To reverse:* one condition in the migration plus one line in `entitlement.js`, and update 3 test expectations.
- *Recommendation:* keep it.
- *Decision needed:* confirm or reverse.

---

## STILL OUTSTANDING

**Release blockers:**
1. **Reconcile with v9.** Compare the 8 local v9 commits with commits `4552c74`, `9d9ec70` and `5492166` here. They probably overlap in pricing.html (the PAYG button JavaScript), the account, dashboard and builder plan names, and the expired-trial counts. Check especially whether v9 fixed the pricing `sb` bug.
2. **D3:** subscription promotional pricing isn't implemented in checkout.
3. **Apply the new migration and redeploy both Edge Functions to CLPeasy Test**, then re-run the server tests you already did. The isolated database currently has the original PR function.
4. **Checkout return URLs:** they're hard-coded to live clpeasy.com (see summary item 2).

**Other, not blocking:**
- Deploy `entitlement.js` alongside the pages. If it's missing, the Builder and Composer fail closed: signed-in exports are blocked with "could not verify".
- Stale copies of the Edge Functions sit at the repo root (`create-checkout-session.ts`, `stripe-webhook.ts`). They are not the deployed versions and could mislead.
- Pre-existing items:
  - checkout.html / account.html top-up price-ID comments disagree about Live vs Test mode.
  - Subscription checkout accepts any recurring price ID from the browser. Low risk, because the webhook maps unknown prices to 0 downloads.
  - The Dashboard shows "Subscription cancelled" for a *scheduled* cancellation.
  - The 7-day grace key (scent + product type) is shared across label sizes.

### SEPARATE SECURITY TASK (Michaela — do not combine with PR #156)
I only inspected code. I never displayed, copied, rotated or tested any credential.
- *How it got embedded:*
  - Signup triggers `notify-signup` from two places: auth.html, and the "on-user-signup" **Database Webhook** created in the Supabase Dashboard.
  - When a Dashboard webhook is set to call an Edge Function with "add auth header with service key", Supabase writes the service-role JWT **literally into the trigger definition** (`supabase_functions.http_request(...)` headers). That is almost certainly the embedded credential.
  - The repo's older `new_user_alert.sql` reads `current_setting('app.service_role_key')` instead, so it doesn't contain the literal key.
- *Related weakness:* `notify-signup` accepts any POST that passes the gateway JWT check, and the public anon key is enough. Anyone could add contacts to Brevo or start the onboarding emails.
- *Suggested plan, in order, when you're ready:*
  1. Add a `NOTIFY_SIGNUP_WEBHOOK_SECRET` secret, and make `notify-signup` require it in a header (constant-time compare). Remove the duplicate auth.html call, or give it its own path.
  2. Recreate the Database Webhook to send that header instead of the service key. Alternatively, use a SQL trigger with `pg_net` that reads the secret from Supabase Vault.
  3. Only then rotate the service-role key. Prefer the new "secret API keys" plus revoking the legacy service_role JWT. Rotating the legacy JWT *secret* would also invalidate the anon key, which is hard-coded in about 10 pages.
  4. Confirm with `select pg_get_triggerdef(oid) from pg_trigger where tgrelid='auth.users'::regclass;` that no key remains. Don't paste the output anywhere.

---

## FULL TEST RESULTS

| Suite | Result |
|---|---|
| All Node test files (`tests/*.js`), work branch | **57 / 57 pass** |
| Same files on PR #156 head (before this work) | 42 / 54 pass — 12 failures, all explained above (5 stale on main too, 7 stale mocks) |
| Same files on main | 48 / 53 pass (the 5 stale-wording failures) |
| `tests/download-entitlement-sql.js` (real migrations, local PostgreSQL 16) | pass. Covers 20 lifecycle × PAYG combinations, grace re-downloads, permissions and a concurrency race |
| `tests/deno/stripe-webhook.test.ts` (Deno 2.9.6, offline) | 12 / 12 scenarios pass |
| `tests/deno/create-checkout-session.test.ts` | 5 / 5 scenarios pass |
| `npm test` | passes. SQL and Deno suites print SKIP on machines without PostgreSQL or Deno |
| Chromium browser checks (local, stubbed Supabase) | pass. Account, Dashboard, Builder, My Labels, Composer (desktop and mobile) and the pricing PAYG click |

Remaining failures: **none**. Not verified: real Supabase, Stripe or Brevo behaviour (not allowed), the v9 contents, and the Deno warning's exact source.

---

## COMMITS / WORK PRESERVED

Branch `claude/optimistic-knuth-ayey91` — **not merged, no PR opened, nothing deployed.** It sits on top of PR #156 head `3fd342e`.

| Commit | Content |
|---|---|
| `d128253` | Update five stale wording tests (test-only, also valid for main) |
| `4552c74` | Entitlement lifecycle fixes: migration, `entitlement.js`, Builder, Composer, test harnesses |
| `9d9ec70` | PAYG display on Account, Dashboard and My Labels, plus the `fmtDate` crash fix |
| `f53ef2a` | PAYG Brevo (mocked), webhook and checkout hardening, offline Deno tests |
| `5492166` | Pricing PAYG button and sign-up resume fix |
| (this report) | `docs/reports/2026-09-25-unattended-development-report.md` |

---

## SAFE NEXT ACTIONS FOR MONDAY

1. Resume PAYG browser QA at "Buy 8 downloads — £4.99" (v9 test site, unchanged).
2. Inspect the Stripe Sandbox Checkout before paying: test mode, £4.99, product wording.
   - **If the click shows "Something went wrong starting checkout"**, v9 still has the `sb`/`SUPABASE_ANON_KEY` bug (fixed in `5492166`). Stop and bring that fix in.
3. Before cancelling or paying, note the return address. If it's `https://clpeasy.com/...` (live), that comes from PR #156's hard-coded URLs, not a payment failure. After returning, check the balance on the **test** site's account page, not the live one.
4. Continue QA steps 5–21 exactly as planned.
5. Then make decisions D1–D5.
6. Reconcile v9 with this branch (outstanding item 1). Then, in CLPeasy Test only: apply `20260926000000_download_entitlement_lifecycle.sql`, set `BREVO_PAYG_LIST_ID` to a **test** list if wanted, and redeploy the two Edge Functions.
7. Re-run the server tests you already did, plus:
   - a scheduled-cancellation account still downloading until its `deletion_date`;
   - a trial account buying PAYG (D5);
   - a trial account opening the Composer (D1).
8. Configure the subscription promotion (D3) and verify a £8.99 Sandbox subscription checkout.
9. Separately, schedule the security remediation above.

---

## ADDENDUM (26 Sep 2026) — v9 reconciliation

Source: `clpeasy-pr156-payg-test-site-v9.zip` supplied by Michaela, which is the deployed test build of commit `3fd342e` (its `TEST-ENVIRONMENT.txt` says so). Before comparing, I put back the production values the test build had changed:

- the test Supabase project and its public anon key (no service-role key was in the zip)
- the `noindex` meta tags and `[TEST]` page titles
- the test-site Stripe return URLs
- the Plausible analytics tags the test build had removed
- the test-only `_headers`, `_redirects` and `robots.txt`
- `TEST-ENVIRONMENT.txt`

**Imported:**
- **pricing.html:** the v9 approved design and behaviour, taken as-is from the zip. It includes:
  - four cards in the order Easy Trial, Pay As You Go, Easy Start, Easy Pro
  - the PAYG card, its "Buy 8 downloads — £4.99" button and the "when it makes sense" text
  - the 2026 offer blocks
  - the billing selector label and note
  - annual savings of up to 17% versus standard monthly prices
  - the Annual view hiding the monthly promotion
  - the Monthly view restoring the promotional prices exactly
  - the readability changes

  The merged cards render **pixel-identical** to v9 in Chromium (desktop and mobile, Monthly and Annual).
- **index.html:** the setup-guide annual saving now reads "save up to 17% vs standard monthly".
- **builder.html:** v9's zero-balance counter wording, "No downloads remaining".

**Kept from the audited PR instead of v9 (same intent, newer and more complete):**
- The v9 display fixes in account.html, dashboard.html, builder.html and my-labels.html. These are the expired-trial count and the "Pay As You Go" plan name. PR #156 already does the same through `entitlement.js`, which also covers scheduled cancellation and paused subscriptions, and is tested.
- The pricing-page PAYG button code. v9 still has the broken `sb` / `SUPABASE_ANON_KEY` / `?return=` code, so the audited fix from `5492166` was kept on top of the v9 design.

**Test updates:** `payg-download-accounting.js` now checks v9's approved wording (the removed launch-banner headline is replaced by checks on the card order, the PAYG CTA and the explanation of annual savings). `payg-pricing-checkout.js` gained a test for the Monthly/Annual selector.
