# PR #156 — v15 Test-environment release gates (26 Sep 2026)

- **Branch:** `feature/pay-as-you-go-downloads`.
- **Scope:** everything was run by Claude on CLPeasy Test (`wwjhvpphlbgtywxskqnf`) and Stripe Sandbox
  (`acct_1TdczqKF3jvQfgEa`). No manual owner testing.
- **Untouched:** production Supabase, Live Stripe, Live Brevo and `main`.
- **Evidence:** `evidence/v15/stripe-lifecycle-e2e-v15.json`.
- **Harness source:** `harness/test-env-lifecycle-harness-v15.ts`, with the token replaced by a placeholder.

## 1. F1 — Step 3 confirmation wording (approved)

**Wording now:** "I confirm the hazard data shown in this step is correct and matches my fragrance
supplier's current SDS/CLP information at the fragrance load used." (`builder.html`)

**Regression coverage** (`tests/hazard-source-integrity.js`):

- **Fresh Smart Paste extraction:**
  - the exact wording is shown, and it no longer mentions Smart Paste;
  - the signal word, pictograms, H/P statements, allergens and the confirmation all sit inside
    Step 3, and the extracted H317 / Warning / exclamation mark are shown there.
- **Reopened saved label:** the same wording and the same Step 3 contents, and the confirmation
  starts unticked.
- **Raw SDS text is not stored:** the saved label JSON contains no raw Section 2.2 text.
- `tests/builder-desktop-scroll-model.js` asserts the new wording.

## 2. Stripe Sandbox webhooks (C7-A / C7-B)

Inspected before any change:

| Endpoint | Destination | Events | State found |
|---|---|---|---|
| `we_1TddU7KF3jvQfgEa3jvQZY0z` (livemode false, created 1 Jun 2026) | **production** `qvkosdqcryrcfbjtaxic…/stripe-webhook` | `customer.subscription.deleted`, `customer.subscription.updated`, `checkout.session.completed` | **already disabled** |
| `we_1UJZJ5KF3jvQfgEahDqXnOEL` (created 25 Sep 2026) | CLPeasy Test `wwjhvpphlbgtywxskqnf…/stripe-webhook` | `checkout.session.completed`, `invoice.created`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` | enabled; **all three lifecycle events already present** |

- **Delivery evidence:** 3 Sandbox `checkout.session.completed` events (25 Sep 13:56 and 14:07, 26 Sep
  13:33 UTC) still show an undelivered webhook (`pending_webhooks=1`). This is the earlier
  Sandbox → production delivery that production rejected.
- **No change needed:** both requested states were already in place when inspected (changed outside
  this session), so I changed neither endpoint.
- **No failures in this run:** after the lifecycle run, no lifecycle event has a failed delivery.

## 3. New defect found and fixed: invoice events ignored on current Stripe API versions

- **Cause:**
  - Webhook payloads use the endpoint's API version; both Sandbox endpoints are on
    `2026-05-27.dahlia`.
  - From API 2025-03-31 onwards, an invoice has no `subscription` field; it is under
    `parent.subscription_details.subscription`.
  - `stripe-webhook` read `invoice.subscription`, so `invoice.paid` and `invoice.created` returned
    200 but did nothing.
- **Observed on real Sandbox events:** the first paid invoices left the profiles unchanged (still
  trial).
- **Effect had it shipped:**
  - no monthly allowance refill on renewal;
  - no removal of the 2026 promotion at the first 2027 renewal.
- **Origin:** the same code is on `main`.
  - Whether production is affected today depends on the **Live** endpoint's API version, which I
    did not access.
  - **Owner check:** in Live Stripe → Webhooks → the CLPeasy endpoint → "API version". If it is
    2025-03-31 or later, production renewals currently do not reset `downloads_used`.
- **Fix** (`supabase/functions/stripe-webhook/index.ts`, minimal):
  - `invoiceSubscriptionId()` accepts both payload shapes;
  - `invoice.created` re-reads the invoice through the function's pinned API version before using
    `subscription` / `discount`;
  - nothing else changed.
- **Tests** (`tests/deno/stripe-webhook.test.ts`): 3 new scenarios for the new-API payloads (promo
  removal, and refill for both shapes). They fail on the old code and pass on the new; 34/34 pass.
- **Deployed to CLPeasy Test** as `stripe-webhook` v7; the content is identical to the repo file.

## 4. Real Stripe Sandbox lifecycle E2E (test clock, disposable accounts)

- **Accounts:** three disposable accounts, each with a real Sandbox subscription on a test clock:
  - Easy Start + 2026 promotion;
  - Easy Start + an unrelated 50% coupon;
  - Easy Pro + 2026 promotion.
- **How it ran:** the clock was advanced month by month. Every profile change below came from real
  Stripe events processed by the Test `stripe-webhook`.

| Check | Result |
|---|---|
| Renewals Oct/Nov/Dec 2026 | **PASS**. Invoices £8.99 / £13.49 (promotion) and £4.99 (unrelated coupon). `downloads_used` reset to 0 each time (7→0, 12→0, 9→0, 17→0, 25→0). Plan/limit applied from `invoice.paid`. |
| First renewal on/after 1 Jan 2027 (26 Jan 2027) | **PASS**. `invoice.created` removed the promotion from the subscription and from the still-draft invoice. Paid **£9.99** (Easy Start) and **£14.99** (Easy Pro). The unrelated coupon was **kept** (£4.99). Refill 4→0, 11→0. |
| Upgrade Easy Pro monthly → Easy Pro annual | **PASS**. Profile Easy Pro / annual / 30; usage reset 7→0; subscriptions row `easy_pro_annual`. |
| Pause → resume | **PASS**. `paused` with plan and allowance kept, then `active`. |
| Scheduled cancellation → reactivate | **PASS**. `cancelled` with `deletion_date` = Stripe period end (26 Feb 2027) and plan kept, then `active` with the date cleared. |
| Scheduled cancellation → period ends | **PASS**. `customer.subscription.deleted` → plan free, `cancelled`, 0 downloads; subscriptions row cancelled. |
| Immediate cancellation (fully ended) | **PASS**. Plan free, `cancelled`, 0 downloads. |

**Test-clock-only notes (not app defects):**

- **Clock still advancing:** 2 of the 3 January `invoice.created` deliveries arrived while Stripe was
  still advancing the test clock.
  - Stripe refused the change ("Test clock advancement underway").
  - The webhook correctly returned 500 and released its claim.
  - One was fixed by Stripe's own retry; the other by re-delivering the event to the Test endpoint
    (the Stripe CLI "resend" call).
  - This can't happen on real subscriptions, and it confirms the retry path works.
- **Wall-clock dates:** `next_payment` and `downloads_reset_date` are computed from the real clock,
  not the test clock, so they don't move with it. Same on `main`.

## 5. Billing portal / Account plan management on CLPeasy Test

- **`create-portal-session`:** deployed to Test (v1). It differs from the repo only by
  `return_url` = the v10 Test site's `account.html`.
  - Signed-in subscriber → 200 with a real Sandbox portal URL.
  - No login → 401.
- **Sandbox portal configuration `bpc_1TduilKF3jvQfgEasnxtrTSA`:**
  - Allowed: cancellation (at period end) and plan/price changes.
  - **Pause is disabled** in the portal.
  - The list of products allowed for switching isn't returned without expansion, so I did **not**
    verify that Easy Pro annual is offered in the portal.
- **`manage-subscription` — not deployable:**
  - Its source is **not in the repository**, on any branch or in any history. Production presumably
    runs an untracked copy, which I did not read.
  - It backs Account's **Pause**, **Cancel** and **Reactivate** buttons, so those buttons don't work
    on CLPeasy Test.
  - What those actions do on Stripe's side (pause, cancel at period end, reactivate) was tested
    above with real Sandbox events; the webhook handling is verified.
  - The function itself and its Account-page round trip are **not** verified.
- **Plan change from Account:** Account's "Upgrade plan" goes to `pricing.html` / Checkout, which
  was tested earlier (duplicate-subscription guard: 409 `ALREADY_SUBSCRIBED`). In-place upgrades go
  through the portal, and the webhook result of a price change is verified above.

## 6. Lower-priority findings — do they block PR #156?

| Finding | Evidence | Blocks PR #156? |
|---|---|---|
| Fully ended former Easy Pro shows "Easy Start (Cancelled)" | Same on `main`; display only. The lifecycle run shows an ended subscription is set to plan `free` / `cancelled` / 0 correctly. | **No**. PR #156 neither causes nor depends on it. Separate follow-up. |
| C2: overdue (`past_due`) never reaches `profiles` | Same on `main`. PR #156 doesn't change that mapping (`profileStatus = null` for `past_due`). | **No**. Existing billing-policy issue; separate follow-up. |
| `manage-subscription` not in the repo | See §5. | **Not a code dependency.** PR #156 doesn't change it or its Account call sites. It is a **coverage gap**: Pause/Cancel/Reactivate from Account can't be exercised on Test until its source is supplied. |

## 7. Final verification

**Local suite (head):**

- Node test files **60/60 PASS**;
- Deno Edge Function scenarios **34 + 36 + 26 = 96 PASS**;
- `npm test` PASS;
- SQL groups on real migrations included (local PostgreSQL 16).

**CLPeasy Test vs the committed candidate:**

- `stripe-webhook` v7 = the repo file.
- `billing-status` v2 and `create-checkout-session` v7 are unchanged since v14.
- `create-portal-session` v1 = the repo file plus the Test `return_url`.
- Migrations are unchanged.

**Temporary tools removed:**

- `pg_net` was dropped (extensions back to pg_stat_statements, pgcrypto, plpgsql, supabase_vault,
  uuid-ossp);
- `qa-sandbox-price-check` is a 410 stub again;
- test clock, test coupon and the 3 disposable users were deleted.

**Michaela's QA account:** unchanged (Easy Start active, 1/20, 24 purchased, 4 download records).

**Site:** `builder.html` changed (F1), so the v15 Test package is built from this commit with
`build/build-v15.py`.

## 8. Remaining before release

1. **Deploy v15 to the Test site.** The container can't reach Netlify, so the v15 package must be
   uploaded to the Test site before the Safari check.
2. **`manage-subscription`:** either supply its source (or authorise a read-only copy from
   production) so it can be committed and tested on CLPeasy Test, or accept the coverage gap.
3. **Owner check:** the Live Stripe webhook endpoint's API version (§3). Either way, releasing this
   `stripe-webhook` covers both payload shapes.
4. **Optional:** confirm the Sandbox/Live portal configuration lists Easy Pro annual for switching.
5. **Production release checklist:** unchanged from the v14 report, plus deploying the fixed
   `stripe-webhook`. Needs authorisation.
6. **Owner-only:** the real iPhone Safari/WebKit check.
