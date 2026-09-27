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

- Node test files **60/60 exit 0**: 59 ran and passed, and 1 was **skipped**
  (`correction-batch-ghs-asset-framing.js` needs a Python/Pillow/numpy toolchain that fails in this
  container). This is an environment limitation; no GHS asset changed;
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

**Site:** `builder.html` changed (F1), so the v15 Test package is built from `5d8531a` with
`build/build-v15.py`.

- **Contents:** the package differs from v14 only by the F1 line in `builder.html` (and
  `TEST-ENVIRONMENT.txt`).
- **Audit:** no production project refs, no Live price IDs, no Plausible loader; `[TEST]` title and
  noindex on every page.
- **Browser check (Chromium, 1366 and 390 px):** the new wording is inside Step 3, with no
  horizontal overflow and no page errors.
- **Zip checksum:** SHA-256 `9b05e5988c193314f685270950cf698ed40b8571220c02ae5a8f7e36553845cb`
  (see `build/zip-checksums.txt`).

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

## 9. v15 iPhone Safari check — FAIL, fixed in v16

- **Symptom (owner, real iPhone Safari, v15 Test site):**
  - on the logged-out homepage the mobile menu opens and shows Sign in;
  - tapping Sign in does nothing, and Safari stays on the homepage.
- **Origin:** pre-existing on `main` since `418fc50` (19 Sep 2026), which added the mobile menu.
  PR #156 did not touch it. `index.html` on this branch differed from `main` only by one Setup
  Guide wording line.
- **Cause (in the page):** the mobile Sign in link was the only sign-in route on mobile.
  - It opened a **new tab** (`target="_blank"`).
  - The menu's own click handler hid the whole menu (`display:none`) **inside the same click**.
  - Nothing overlays the link (hit-tested). No script intercepts `auth.html` links for signed-out
    visitors.
  - The iPhone-emulated Chromium test shows the original tab never leaves the homepage, matching
    the symptom.
- **Not proven:** WebKit itself cannot be installed in this environment, so I haven't proven which
  of the two Safari acts on. It could be dropping a new-tab navigation from a link hidden
  mid-click, or opening the tab in the background.
- **Fix (`index.html`, mobile menu only):**
  - Sign in opens in the same tab, like "Start free trial" next to it;
  - in-menu link taps close the menu after the click (`setTimeout 0`), never during it;
  - desktop header Sign in, Escape and tap-outside closing are unchanged.
- **Test:** `tests/homepage-mobile-nav-signin.js`, iPhone-emulated Chromium with touch taps plus
  static checks.
  - It fails on the old code and passes on the fix.
  - It also passes against the built v16 package.
- **Suite:** 61/61 test files exit 0 (the GHS image-framing check is still skipped: environment),
  `npm test` PASS, SQL 126 groups, Deno 96 scenarios.
- **v16 package:** built from `d1d5fc5`; it differs from v15 only in `index.html`. Audit clean.
  SHA-256 `b1e552b068d76ffa9d70aebbace600da901cd1a3062f332da2a92a0a66e59a36`.
- **Needed:** upload v16 to the Test site, then repeat the iPhone Safari check once.

## 10. v16 iPhone Safari check — still FAIL; revised cause, fixed in v17

- **Owner evidence (v16 confirmed deployed):**
  - desktop Chrome at mobile width: Sign in works;
  - real iPhone Safari: the menu opens and Sign in is visible, but a tap does nothing, and
    press-and-hold shows no link menu.
- **Revised cause:** the menu panel, not the link.
  - After v16, Sign in was already a bare `<a href="auth.html?mode=signin">`, styled by the same
    `.nav-mobile-menu a` rule as every other menu link.
  - There is no `pointer-events`, pseudo-element, `touch-action`, 3D transform or overlay involved.
    Every positioned element with z-index ≥ 99 was checked; the only bottom-fixed ones are the
    cookie banner and the seasonal banner, both visible when shown.
  - What was unusual is the panel itself: a second `position:fixed` layer that was also its own
    scroll container (`overflow-y:auto` + `max-height: calc(100vh - 68px)`). On iOS, `100vh` is
    taller than the visible area.
  - The fixed header also uses `position:fixed` and `backdrop-filter`, but is not a scroll
    container, and it takes taps on the same iPhone (the hamburger works).
  - So the panel-as-fixed-scroll-container is the one structural difference left, and it's what was
    removed.
- **Not reproducible here:** WebKit can't be installed in this environment (its download hosts are
  blocked), so this is the best-supported cause, not a WebKit reproduction. The real-iPhone check
  remains the proof.
- **Press-and-hold:** the homepage cancels `contextmenu` on the whole document (existing content
  protection), which can also suppress a long-press menu. So on its own it doesn't prove the link
  wasn't hit.
- **Fix (`index.html`, mobile menu only):**
  - The panel is `position:absolute`, placed directly under the header at the current scroll position
    when opened (`openMobileNav`). It has no `overflow`/`max-height`, so lower items are reached by
    scrolling the page.
  - It looks the same (backdrop blur kept; screenshot compared with v16).
  - The click handler on the panel is removed, so all menu links are plain native links. In-page links
    close the menu on `hashchange`; Escape and tap-outside closing are unchanged.
- **Tests:** `tests/homepage-mobile-nav-signin.js` checks, at 390×664 and at an iPhone SE-sized
  375×548 with the page scrolled first:
  - no fixed, scroll-container or `pointer-events:none` ancestor, and no pseudo-elements;
  - no click/touch/pointer/mouse listeners on the link or the panel, read through the Chrome DevTools
    protocol;
  - placement under the header;
  - a tap on Sign in loads it in the same tab.
  - It fails on v16 and passes on v17, including against the built v17 package.
- **Suite:** 61/61 test files exit 0 (the GHS framing check is still skipped: environment), `npm test`,
  SQL 126 groups, Deno 96 scenarios.
- **v17 package:** built from `3f377c8`; it differs from v16 only in `index.html`. Audit clean.
  SHA-256 `4bef12d48498de05bda94aae14bb6734c155a9956983c7b6de800d6bef1c9170`.

## 11. Real iPhone Safari check on v17 — PASS (owner, 26 Sep 2026)

The owner tested v17 on the v10 Test site with a real iPhone in Safari. All of the following
worked:

- mobile menu → Sign in → signed in as the QA user;
- Account renders correctly, and the Easy Start / billing / download information is correct;
- Builder steps and validation;
- Print Sheet Composer usable on mobile;
- My Labels (0 labels is expected: labels live in each browser's localStorage);
- Builder export.

**Backend check (read-only, CLPeasy Test)** for QA account `33333333-…0156`:

| | Before the Safari run | After |
|---|---|---|
| Plan downloads used | 1 / 20 | **2 / 20** (18 left) |
| Purchased downloads | 24 | 24 (unchanged) |
| `label_downloads` records | 4 | 5 |

- **New record:** `safari test::scented candle::circle::70x70mm`, clean export, 26 Sep 2026
  23:32:03 UTC.
- **Result:** the Safari export used **exactly one plan download**. Purchased downloads were not
  touched, and the new record uses the size-aware key.

## 12. Live webhook API version, and `manage-subscription` brought into the repository

### Live Stripe webhook API version (owner-confirmed)

- **What the owner found:** the active CLPeasy Production webhook in Stripe Live mode (pointing at
  the production Supabase project) uses API version **`2026-05-27.dahlia`**.
- **What that means:** this is within the range affected by the invoice-format defect in §3.
  - Until the corrected `stripe-webhook` is deployed, production `invoice.paid` (monthly allowance
    refill on renewal) and `invoice.created` (2027 promotion removal) do nothing.
- **Release consequence:** deploying the corrected `stripe-webhook` is a **required production
  release item**. No Live or production change was made.

### `manage-subscription`

- **Source:** production `manage-subscription` v5, retrieved **read-only**. Production was not
  modified or redeployed.
  - Committed verbatim as `supabase/functions/manage-subscription/index.ts`.
  - Its header comment still says "NOT YET DEPLOYED"; it is deployed and was kept verbatim.
- **Behaviour:**
  - **Sign-in:** the user comes only from the verified login token. The Stripe subscription is
    looked up server-side for that user; the request body can't choose a user or subscription.
  - **`pause`:** `pause_collection: mark_uncollectible`, then profile `paused` plus the reason and
    time.
  - **`cancel`:** `cancel_at_period_end: true`, then profile `cancelled` with `deletion_date` =
    Stripe's current period end.
  - **`reactivate`:** if Stripe says `canceled`, it returns 409 `FULLY_ENDED`. Otherwise it clears
    pause and cancellation on the **same** subscription, then sets the profile `active`.
  - **No linked subscription:** 404 `NO_SUBSCRIPTION`. **Stripe error:** 500, and the profile is
    left unchanged (Stripe is always called first).
  - **Browser access (CORS):** `https://clpeasy.com` only. That is correct for production; the Test
    copy allows the Test site instead.
- **Fit with the Account page and PR #156:**
  - `account.html` sends exactly `{action:'pause'|'cancel', reason}` / `{action:'reactivate'}` with
    the user's login token.
  - On `FULLY_ENDED` or `NO_SUBSCRIPTION` the page falls back to one subscription Checkout.
  - Paused accounts can't use plan downloads (`consume_download`), consistent with the rules in the
    PR migrations.
  - The function needs no change for PR #156.
- **Test deployment:** CLPeasy Test `manage-subscription` v1. It is the repo file with only the CORS
  origin changed to the v10 Test site.
- **Real Test + Sandbox results** (`evidence/v15/manage-subscription-e2e.json`), all as designed:
  - pause;
  - a renewal while paused: invoice **uncollectible**, no charge, no refill;
  - reactivate after pause, and after a scheduled cancellation;
  - cancellation at period end, then a full downgrade;
  - `FULLY_ENDED` (409), `NO_SUBSCRIPTION` (404) and no login (401).
- **Coverage:**
  - `tests/deno/manage-subscription.test.ts`: 8 offline scenarios on the real function file.
  - `tests/account-manage-subscription.js`: 6 scenarios driving the real `account.html` Pause /
    Cancel / Reactivate flows and checking the exact requests, the error handling and the Checkout
    fallback.
- **Findings** (both pre-existing: the same `stripe-webhook` logic is on `main`):
  - **MS-1 (billing policy, owner decision):**
    - Reactivating after a pause or a scheduled cancellation resets `downloads_used` to 0. The
      webhook treats it as a "genuine reactivation" and calls `applyProfilePlan`.
    - A subscriber who has used their allowance can pause (or cancel) and reactivate straight away
      to get a fresh allowance in the same billing period. Seen on Test: 5 → 0 and 8 → 0.
    - With pause, the paused period's renewal invoice is marked uncollectible. Reactivating
      mid-period restores access and a full allowance without paying for that period.
    - Not fixed: this changes billing and entitlement policy. The suggested fix is that
      reactivation restores the plan and limit but keeps `downloads_used` (and refills only on a
      paid renewal).
  - **MS-2 (low):** the customer's cancellation reason is saved by the function and then
    overwritten with `'other'` by `stripe-webhook`. Only the reason recorded on the profile is
    affected.
