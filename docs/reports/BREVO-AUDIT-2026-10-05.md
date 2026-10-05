# Brevo read-only audit — 5 Oct 2026

Continues the Brevo items in `RELEASE-SIGNOFF-2026-10-05.md` (branch `audit/release-signoff-2026-10-05`).
**Nothing was created, edited, sent, deleted, activated or deactivated in Brevo, Supabase or Stripe.**
PR #220 was not merged or deployed.

Sources: the Brevo connector (account, lists, contacts, attributes, senders, segments, campaigns, all transactional/automation templates); the **deployed** `stripe-webhook` (v63) and `clp-account-events` (v38) read from Supabase; `notify-signup` in the repo; one read-only `profiles` count.

## 1. What the connector can and cannot see

| Visible | Not visible (no tool exists in the connector) |
|---|---|
| Lists, list membership, contacts and their attributes | **Automation workflows**: names, active state, entry trigger, steps, delays, conditions, exit criteria, which template each step sends |
| Defined contact attributes | Transactional email logs / events (whether template 7 or any automation email was actually delivered or rejected) |
| All 22 email templates (content, sender, active flag) | Automation email history per contact: contact stats are empty for every contact checked, so they do not show workflow sends |
| Senders, segments (none), campaigns (none), account plan | Brevo API-key permissions, unsubscribe page settings |

Workflow names/status come from the owner's screenshots (sign-off Round 6): **1 Onboarding (Active), 2 Paid Subscribers (Active), 3 Annual Renewal Reminder (Active), 4 [COPY] Onboarding (Inactive).** The template names (`…_step_#N`) show which workflow each template belongs to, but not the trigger or branching.

## 2. Account facts

- Brevo **Free plan, 300 emails/day** send limit. Marketing Automation enabled.
- No email campaigns, no SMS campaigns, no segments.
- Senders: `noreply@clpeasy.com` (ids 2, 3), `michaela@clpeasy.com` (4), plus two Crafty Mouse Gifts senders.

## 3. Lists and contacts

| List | Contacts | Who |
|---|---|---|
| 3 `identified_contacts` | 21 | **Every CLPeasy sign-up** (FIRSTNAME = email prefix, which is what `notify-signup` writes) |
| 5 `CLPeasy Paid Subscribers` (= `BREVO_PAID_LIST_ID`) | 5 | **All five are the owner's test accounts** (`craftymousegifts+clptest3/5/6/7`, `teachelite8` "Michaela") |
| 2 `Your first list` | 1 | owner only |
| 6 `CMG Subscribers` | 0 | Crafty Mouse Gifts |

- Sign-ups land in **list 3**, not list 2, so `BREVO_LIST_ID` is very likely set to 3 in production (secret not readable).
- **Contacts with `PLAN = "Pay As You Go"`: 0.** Supabase agrees: no profile has `subscription_status = 'payg'`; profiles are 16 `trial/trialing` and 5 `free/cancelled`, **0 active subscribers**. So no real customer is affected today; every risk below applies to the **next** purchase.

## 4. Attributes — key finding

Attributes defined in Brevo: `PLAN`, `FIRSTNAME`, `LASTNAME`, `OPT_IN`, `DOUBLE_OPT-IN`, `SMS`, `EXT_ID`, etc.

**Not defined:** `CLPEASY_PLAN`, `CLPEASY_BETA`, `CLPEASY_TRIAL_ENDS`, `CLPEASY_SIGNUP_DATE`, `CLPEASY_USER_ID` (sent by `notify-signup`) and `SUBSCRIPTION_STATUS`, `CANCEL_REASON`, `DELETION_DATE`, `DISCOUNT_ACTIVE` (sent by `clp-account-events`).

Brevo drops values for attributes that do not exist: every sign-up contact holds only `FIRSTNAME`. Consequences:
- **`CLPEASY_PLAN = trial` is never stored**, so no workflow can use it as a condition, and there is no "trial" flag to update. The real question is whether workflow 1 has an exit rule (see §6.1).
- The cancel/save-offer attribute updates store nothing.
- No renewal or trial-end date exists anywhere in Brevo.

## 5. Templates

| # | Active | Workflow (from name) | Subject | Problems |
|---|---|---|---|---|
| 1 | yes | Onboarding step 2 | Welcome… build your first label | "14 days of full access — no restrictions" (trial is 10 watermarked downloads); "reply to this email" but reply-to is `noreply@` |
| 2 | yes | Onboarding step 4 | Day 2 Smart Paste tip | reply-to `noreply@` vs "just reply" |
| 3 | yes | Onboarding step 6 | Day 5 Knowledge Base | same |
| 4 | yes | Onboarding step 8 | Trial — 4 days left | **Retired pricing**: Easy Start £9.99 or £99/yr "10 downloads/month", Easy Pro £14.99/£149; promises a feedback questionnaire |
| 5 | yes | Onboarding step 10 | Trial ends in 2 days | **Retired pricing** (Easy Start 20 downloads, Easy Pro); no PAYG option |
| 6 | yes | Onboarding step 12 | Trial has ended | **Retired pricing**; "Share your feedback" links to `beta-feedback.html`, which `_redirects` returns as **404** |
| 7 | **no** | (sent by code) | Subscription is paused | **Inactive, yet `clp-account-events` sends it on every pause.** Brevo only sends active templates, so the pause email is most likely being rejected (logs not visible to confirm). Content also promises a "heads-up before the [3-month] window closes" — no such email exists — and says folders/versions/batch records are preserved server-side |
| 8, 9 | no | — | Cancel save offers | Retired prices (£4.99/£7.49 discounts on Easy Start/Pro). Not used; no workflow |
| 10, 12, 11 | no | — | Win-back day 14 / 3 / 28 | Claims library deletion after 30 days; top-ups. Not used; no workflow. #11's subject is the pause subject (copy error) |
| 13 | yes | Paid step 2 | "You're in — welcome" | Says "**Your subscription is confirmed. You're now on {{PLAN}}**", "monthly downloads reset on your billing date", "**Top-up packs** available". Wrong for PAYG, wrong for Unlimited, wrong for annual |
| 14 | yes | Paid (copy) | Getting the most out of CLPeasy | "You've had CLPeasy for a week"; footer "you subscribed". Mostly neutral |
| 15 | yes | Paid (copy) | One month — thank you / review | "you subscribed". Neutral otherwise |
| 16 | yes | Renewal step 5 | "Your CLPeasy subscription renews in 7 days" | "Your {{PLAN}} subscription renews… charged automatically". If sent to PAYG: "Your **Pay As You Go subscription** renews"; no date or amount; no unsubscribe (acceptable for a service message) |
| 17–22 | yes | [COPY] Onboarding | copies of 1–6 | Same content; workflow 4 is inactive |

Unsubscribe link: present in 7–15; **absent in onboarding 1–6 / 17–22** (4–6 promote paid plans) and 16.

## 6. Answers

### 6.1 Can paying customers keep receiving trial/onboarding emails?
**Yes, very likely, unless workflow 1 has an exit rule that the connector cannot show.**
- Entry: `notify-signup` adds the contact to list 3 and calls the automation trigger with `BREVO_AUTOMATION_ID`.
- On purchase, `stripe-webhook` only adds the contact to list 5 and sets `PLAN`. It never removes them from list 3, never touches workflow 1, and `CLPEASY_PLAN` does not exist to change.
- So a trial user who subscribes or buys PAYG on day 3 would still get day 10 "4 days left", day 12 "ends in 2 days — subscribe now" and day 14 "trial has ended", all with retired prices, **unless** workflow 1 has a condition like "exit if contact is in list 5" or "if PLAN is not empty".
- **Inaccessible:** workflow 1's trigger, steps and exit criteria. Owner check: Automations → CLPeasy Onboarding → workflow settings / "Exit" criteria and any condition steps before steps 8, 10 and 12.

### 6.2 What does a PAYG customer currently receive?
1. Stripe receipt (and invoice with the consent memo). Nothing from CLPeasy code.
2. Brevo: added to **list 5** with `PLAN = "Pay As You Go"` (skipped if they are a current subscriber). If workflow 2 is triggered by "added to list 5" (template names indicate it is the paid workflow; trigger not visible), they get template 13: "**Your subscription is confirmed. You're now on Pay As You Go** … monthly downloads reset on your billing date… Top-up packs", then 14 and 15.
3. If they started as a trial user: they also stay in the onboarding sequence (§6.1).

### 6.3 Are PAYG customers at risk of renewal/cancellation messaging?
- **Cancellation:** no. There is no cancellation, save-offer or win-back workflow, templates 8–12 are inactive, and PAYG has no cancel/pause action.
- **Renewal:** **possible, cannot be ruled out.** Workflow 3 sends template 16 at step 5. Brevo holds no renewal date, so its trigger must be list-based (e.g. "added to list 5" + wait ~358 days) or attribute-based on `PLAN`. If it is "added to list 5" without a `PLAN contains Annual` condition, then PAYG buyers, monthly subscribers and cancelled customers (who stay in list 5 with their old `PLAN` forever) would all get "Your {{PLAN}} subscription renews in 7 days". **Inaccessible:** workflow 3's trigger, wait and conditions.
- Also: renewal timing measured from list entry would drift for anyone who paused, cancelled or re-subscribed.

### 6.4 Other findings
- **Pause email is probably not being sent** (template 7 inactive).
- **Cancelling via the Stripe billing portal** does not call `clp-account-events`, and `stripe-webhook` never updates Brevo on cancel or deletion; so Brevo never learns that anyone cancelled.
- `PLAN` labels: monthly £9.99 → "Easy Start Monthly" (no "Unlimited"); annual £89 → "Easy Start Unlimited Annual" (only if `EASY_START_ANNUAL_PRICE_ID` is set). Template 13/16 print this label.

## 7. Recommended journeys (for approval — nothing changed)

General: every promotional/lifecycle email (not receipts or pause/cancel confirmations) gets an unsubscribe footer; reply-to `support@clpeasy.com` wherever the text says "reply"; prices only as currently released (Easy Start Unlimited £9.99/month, £8.99 until 31 Dec 2026; £89/year; PAYG £4.99 = 5 + 3 bonus downloads until 31 Dec 2026).

### 1. Trial / onboarding (workflow 1, keep)
- Trigger unchanged (sign-up → list 3 + automation).
- **Add exit criterion: "contact is in list 5 (Paid)"**, checked at entry and before every step. This uses list membership, which code already maintains, so no code change is needed.
- Day 0 welcome (fix: "14-day trial, 10 watermarked downloads, no card"); Day 2 Smart Paste; Day 5 Knowledge Base; Day 10 "4 days left" and Day 12 "ends in 2 days" with **current** Easy Start Unlimited + PAYG options; Day 14 "trial ended" (remove the 404 feedback link or point it to a live page).
- Leave the inactive [COPY] workflow alone or delete it later.

### 2. PAYG purchase (workflow 2, branch on PLAN)
- Stripe receipt (exists).
- Immediately after the list 5 trigger: **condition `PLAN = "Pay As You Go"`** → one PAYG email: "Your downloads are ready: 5 + 3 bonus = 8, one per download, no expiry, 7-day same-label re-download", link to the Builder, support reply-to. No "subscription", no "monthly reset", no top-ups.
- Optional day-7 tips email (template 14 is suitable once the footer says "you bought downloads" or is neutral).
- **Never** enters the renewal reminder.

### 3. Monthly subscription (workflow 2, other branch)
- Stripe receipt (exists). Day 0 welcome, rewritten 13: "You're on Easy Start Unlimited — unlimited clean downloads while your subscription is active"; no allowance reset; no top-ups.
- Day 7 tips (14), Day 30 thank-you/review (15).
- No Brevo renewal reminder (monthly receipts come from Stripe).

### 4. Annual subscription
- Same as monthly (welcome wording "annual"), plus the renewal reminder below.

### 5. Pause / cancellation
- **Pause:** fix template 7's content (remove the promised "heads-up" email unless one is built, and the server-side library/folder claims), then **activate** it so the code's existing send works. Transactional, so no unsubscribe needed (it has one; harmless).
- **Cancel:** send only a transactional cancellation confirmation (access until period end, PAYG credits kept). Simplest reliable source: Stripe's own cancellation email, as cancellation can happen in the Stripe portal where CLPeasy code is not involved. **No save-offer or win-back emails**, matching the Privacy Policy wording ("We do not send offers to stay or invitations to come back after you cancel"). Keep templates 8–12 inactive.
- Later code change (needs separate approval): on `customer.subscription.deleted`, remove the contact from list 5 (or set a `PLAN`/status value) so Brevo stops treating them as a subscriber.

### 6. Annual renewal reminder
- **Recommended: switch Brevo workflow 3 off and use Stripe's "Send emails about upcoming renewals"** (Stripe → Settings → Billing → Subscriptions and emails). Stripe knows the real renewal date and amount, skips cancelled and paused subscriptions, and never reaches PAYG buyers. The Privacy Policy already covers it under "subscription notifications".
- If you would rather keep Brevo's branded email: it can only be safe after (a) code sends a renewal-date attribute, (b) the attribute is created in Brevo, and (c) the workflow is limited to `PLAN contains "Annual"` and not cancelled. Not available today.

## 8. Owner checks still needed (connector cannot show them)
1. Workflow 1: trigger, every step's delay/template, and any exit criteria or conditions.
2. Workflow 2: trigger (list 5 added?) and whether it branches on `PLAN`.
3. Workflow 3: trigger, wait time, conditions (does it filter on `PLAN` or annual only?).
4. Transactional logs (Brevo → Transactional → Logs): whether template 7 sends are rejected as "template inactive".
5. Stripe: whether the "upcoming renewals" and "cancellation" customer emails are on.

## 9. Proposed Brevo changes (awaiting approval; none made)
1. Workflow 1: add exit "in list 5".
2. Templates 4, 5, 6 (and copies): current prices + PAYG; remove 404 link; template 1 trial wording; reply-to support@; unsubscribe footer.
3. Template 13: rewrite as subscription welcome; new PAYG welcome template; `PLAN` condition in workflow 2.
4. Template 7: correct content, then activate.
5. Workflow 3: deactivate (and turn on Stripe renewal emails), or keep inactive until a renewal-date attribute exists.

---

# Remediation plan (prepared 5 Oct 2026, awaiting approval)

**Status: plan and drafts only.** Nothing has been changed in Brevo, Stripe or Supabase. No email has been sent. PR #220 is untouched. §7's suggestion to switch off the renewal workflow is **withdrawn**: the owner has instructed that workflow 3 is not changed until its logic has been inspected (§R8).

Draft email HTML for review: `docs/brevo/templates/` (rendered at 640 px and 375 px in Chromium: no overflow, no errors; Brevo's own rendering not yet tested).

## Extra evidence gathered for this plan (read-only)

- **Stripe billing portal** (live `bpc_1TdoeKGZLILz5vqUMOlIzlgo`): cancellation is **at period end**, **pause is disabled**, customers **can change their email address**, and price changes are allowed.
- **Stripe webhook endpoint** (live) already receives `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.created`. No Stripe change is needed for anything below.
- **Account page:** `account.html` pause, cancel and reactivate all call `manage-subscription`, which changes the Stripe subscription. Each of these produces a `customer.subscription.updated` event, exactly as a portal cancellation does. The account page then separately calls `clp-account-events`, which is only reached from the account page.
- **Pause has no end date:** `manage-subscription` pauses with `pause_collection: mark_uncollectible` and no `resumes_at`. A pause continues until the customer reactivates.
- **PAYG pack size is already decided per purchase:** `create-checkout-session` puts `downloads` = 8 before 1 Jan 2027 and 5 after into the Stripe metadata. `stripe-webhook` credits that number, and `credit_payg_purchase` returns the new balance.
- **Stripe Checkout email:** `customer_email` is set to the signed-in user's email. Because portal customers can change their Stripe email, Brevo updates should use `profiles.email` (looked up by `userId`) rather than the Stripe customer email.

## R1. Brevo attributes: which are genuinely required

| Attribute | Exists in Brevo | Written by | Read by | Decision |
|---|---|---|---|---|
| `FIRSTNAME` | yes | all | all templates | **Keep** |
| `PLAN` | yes | `stripe-webhook` (subscription label, or "Pay As You Go") | template 16 (renewal) and possibly workflow 3 conditions | **Keep, unchanged.** Workflow 3 may depend on its values (§R8), so the labels are not renamed now. The rewritten welcome email (13) no longer prints it |
| `SUBSCRIPTION_STATUS` | **no** | `clp-account-events` ("cancelled", "active"); the plan adds `stripe-webhook` and `notify-signup` | the plan: onboarding safety condition, future renewal condition | **Create (Text).** This is the single lifecycle state. Values: `trial`, `payg`, `active`, `paused`, `cancelled` (cancellation scheduled, still in the paid period), `ended`. `cancelled` and `active` match what `clp-account-events` already writes, so that deployed function needs no change |
| `CLPEASY_PLAN` | no | `notify-signup` ("trial") | nothing | **Do not create.** It duplicates `SUBSCRIPTION_STATUS = trial`. Remove it from `notify-signup` |
| `CLPEASY_BETA`, `CLPEASY_TRIAL_ENDS`, `CLPEASY_SIGNUP_DATE`, `CLPEASY_USER_ID` | no | `notify-signup` | nothing (the workflow uses relative delays from sign-up) | **Do not create.** Remove them from `notify-signup` (data minimisation) |
| `CANCEL_REASON` | no | `clp-account-events` | nothing (no workflow); the reason is already stored in `profiles.cancel_reason` | **Do not create.** No email uses it, and keeping a copy in Brevo has no purpose |
| `DELETION_DATE` | no | `clp-account-events` (always empty) | inactive template 11 only | **Do not create.** The optional cancellation email receives the access-until date as a send parameter, not as a stored attribute |
| `DISCOUNT_ACTIVE` | no | `clp-account-events` (save offer, unreachable: `SAVE_OFFER_ENABLED = false`) | nothing | **Do not create** |

`clp-account-events` (deployed v38; **its source is not in the repo**) still sends `CANCEL_REASON`, `DELETION_DATE` and `DISCOUNT_ACTIVE`. Brevo drops values for attributes that do not exist. If Brevo rejects that whole update, the only loss is its `SUBSCRIPTION_STATUS` copy, which `stripe-webhook` will own anyway. No change to that function is needed. A tidy-up is recorded as a separate, optional item (§R9).

## R2. Stop trial-conversion emails after purchase (reliable mid-trial)

The workflow conditions are checked **at the moment each step is reached**, so this works whatever day the customer buys on, including partway through the 14 days.

1. **Brevo workflow 1 (dashboard, owner):** add a condition step **immediately before each of the trial-conversion emails**: template 4 (day 10), template 5 (day 12) and template 6 (day 14).
   - The condition: "Contact **is in list 5 (CLPeasy Paid Subscribers)** OR **is in list PAYG** (new, R4)" → **Yes: exit the workflow**. No: continue.
   - Optionally put the same condition before the day 2 and day 5 tips. They are not sales emails, but a paying customer does not need them either.
   - If the workflow editor offers workflow-level **exit criteria**, set the same rule there as well.
2. **Why list membership:** the current production code already adds every subscriber, and today every PAYG buyer, to list 5. This part therefore **works before any code change is deployed**.
   - `SUBSCRIPTION_STATUS` (R1) becomes a second safeguard once the code is live. The condition can then also be "SUBSCRIPTION_STATUS is not trial".
3. **Residual risk:** if a Brevo call fails during a purchase (it is non-fatal by design), the contact is not added to the list and would still get the trial emails. This is rare, and the Supabase logs show it (`Brevo … upsert failed`).

## R3. Onboarding templates 1–6 (drafts ready)

The drafts are `docs/brevo/templates/01…06-*.html`. Each is a copy of the live template with only the listed sentences changed, so the layout is identical.

| # | Changes |
|---|---|
| 1 | "14 days of full access — no restrictions" becomes "**14 days** and **10 label downloads** with a faint preview watermark. No card needed". "CLP-compliant label" becomes "label" (the project rule is to avoid unqualified compliance claims; **please confirm**). "Reply" text now also gives support@. Unsubscribe link added |
| 2, 3 | "Just reply" text now gives support@. Unsubscribe link added |
| 4 | The Easy Start / Easy Pro table (10/20 downloads, £99/£149) is replaced with **Easy Start Unlimited** (£9.99/month or £89/year; launch offer £8.99/month until 31 Dec 2026) and **Pay As You Go** (£4.99 for 5; 3 bonus with every pack bought by 31 Dec 2026; no expiry; free same-label re-download within 7 days). The promised "feedback questionnaire" (does not exist) is replaced by a support@ line. Unsubscribe link added |
| 5 | "You'll need to subscribe… lose access to the full builder" is replaced by "keep downloading clean labels with Pay As You Go or Easy Start Unlimited". Saved labels are described as "in your label library in this browser" (labels are stored in the browser). Same offer block as 4. Unsubscribe link added |
| 6 | Same offer block. The dead `beta-feedback.html` link (404) becomes `mailto:support@clpeasy.com?subject=CLPeasy trial feedback`. Unsubscribe link added |

The copies 17–22 belong to the **inactive** [COPY] workflow 4 and are left alone.

**Brevo settings for 1–6 (dashboard):**
- Set **reply-to `support@clpeasy.com`**, so "reply to this email" is true. The sender stays `noreply@clpeasy.com`.
- Unsubscribe uses Brevo's `{{ unsubscribe }}` tag. It shows the account's default unsubscribe page and works only in a real or test send, not in the editor preview.

**Dated content:** the two offer lines say "until 31 December 2026" and "bought by 31 December 2026". They stay literally true afterwards, but they should be removed in the first week of January 2027. **Diary item: 2 Jan 2027, edit templates 4–6.**

## R4. PAYG purchase journey (new; transactional)

**Design:** CLPeasy sends the PAYG email itself from `stripe-webhook` **immediately after the credit**, using a Brevo transactional template with the **actual numbers from that purchase**. It does not depend on any automation.

| Param | Value |
|---|---|
| `DOWNLOADS` | downloads credited (from Stripe metadata) |
| `PURCHASED` | 5 |
| `BONUS` | `DOWNLOADS − 5` |
| `BALANCE` | new balance from `credit_payg_purchase` |
| `FIRSTNAME` | from Stripe checkout name |

- The template shows "(5 purchased + 3 bonus)" only when `BONUS > 0`. A purchase on or after 1 Jan 2027 reads "5 clean downloads have been added", with **no edit needed and no stale promotion**. Both cases are rendered in the drafts check.
- Draft: `docs/brevo/templates/NEW-payg-purchase-confirmation.html`. Content:
  - downloads added;
  - one download = one exported file;
  - same-label re-download free within 7 days;
  - no expiry, no subscription;
  - Stripe receipt sent separately;
  - Refund Policy link;
  - buttons to the Builder and Account.
  - **No** subscription, renewal, monthly or top-up wording. No unsubscribe link (purchase confirmation).
- It is sent to **every** successful PAYG buyer, including paused or cancelling subscribers, because it confirms a purchase.

**List change (needs your decision; it changes approved decision D2):**
- **Recommended:** PAYG buyers go to a **new list "CLPeasy PAYG Customers"** instead of list 5, with `PLAN = Pay As You Go` and `SUBSCRIPTION_STATUS = payg`. List 5 then means "subscribers" only.
- Workflow 2 (subscriber welcome/tips/thank-you) and possibly workflow 3 (renewal) are triggered from list 5 in ways we cannot see. Taking PAYG out of list 5 is the only change that **guarantees** PAYG buyers get no subscription wording, without first editing those workflows.
- Current subscribers buying PAYG are still not moved (existing rule kept).
- **Alternative:** keep D2 (list 5) and add a `PLAN = Pay As You Go → exit` condition at the top of workflows 2 and 3. That requires editing workflow 3, which you have asked not to do yet.

## R5. Subscription welcome (workflow 2)

- **Template 13** (draft `13-paid-welcome-subscription.html`): "You're now on {{PLAN}}… full download allowance" becomes "You're now on **Easy Start Unlimited**". The three ticks become:
  - unlimited clean PNG/SVG/PDF downloads and Print Sheet Composer sheets while active;
  - label library saved in your browser;
  - manage your subscription, payment details and invoices from your account.
  - **Monthly reset and top-ups are removed.** It no longer prints `PLAN`, so the "Easy Start Monthly" label cannot show.
- **Template 14** (day 7 tips): one wording fix, "stored in your label library **in this browser**". Smart Paste, label library and Print Sheet Composer tips are kept.
- **Template 15** (day 30 thank-you/review request): **no change needed**.
- After R4, only subscribers enter list 5. Both new monthly and new annual subscribers get 13 → 14 → 15. This is correct for both, because none of them mentions billing frequency.

## R6. Template 7 (pause confirmation)

**Why it is inactive:**
- What the evidence shows: templates 7–12 were all created on 1 Jun 2026, never modified, all use sender id 4 (`michaela@clpeasy.com`), and are **all inactive**.
- Brevo creates templates inactive unless they are explicitly activated. The pattern fits a batch created through the API (the code comment "update these once you note the IDs from Brevo dashboard") that was never activated.
- Who created them, and whether that was deliberate, **cannot be confirmed** from the data available.
- Whether Brevo has been rejecting the pause sends can be confirmed in **Brevo → Transactional → Logs** (owner check).

**Content problems in the live template 7:**
- "Your pause lasts up to 3 months. We'll send you a heads-up before the window closes" is **false**: the pause has no end date and no heads-up email exists.
- "every label, folder, version and batch record is preserved" is not how the product works (labels are browser-saved).
- "QR safety codes stay live" is an unverified claim.

**Draft** `07-pause-confirmation.html`:
- no charges while paused;
- unlimited downloads pause too, and PAYG can be bought meanwhile (matches `entitlement.js`);
- saved labels stay in this browser;
- the pause continues until you reactivate from your account page.
- It uses `{{ params.FIRSTNAME }}`, which is what `clp-account-events` sends.

**How to apply (owner, dashboard):** replace template 7's content in place, keeping **ID 7** so no code change is needed. Then **send a test to a test contact**, and only then **activate** it.
- From that moment every account-page pause sends it. Portal pause is disabled, so the account page is the only pause route.

## R7. Templates 8–12

Kept **inactive**. No save-offer or win-back workflow is introduced. The code constants in `clp-account-events` are harmless: nothing sends those templates.

## R8. Annual Renewal Reminder: unchanged; what to inspect before deciding

The workflow and template 16 are **not changed**. Please capture (screenshots are fine) from Automations → CLPeasy Annual Renewal Reminder:
1. **Entry trigger:** the exact type ("contact added to list 5"? "attribute updated"? date-based? event?) and any entry filter.
2. **Steps 1–4 before the email (step 5):** the delays (for example "wait 358 days") and each condition (for example on `PLAN`).
3. **Re-entry setting:** can a contact enter more than once (needed for a second year)?
4. **Exit criteria**, if any.
5. Whether it filters on "Annual" in `PLAN`. If not, monthly and PAYG contacts in list 5 would qualify.
6. **Workflow statistics:** contacts currently in progress and emails sent so far.

**Facts that limit what it can do today:**
- No renewal date is ever sent to Brevo.
- `PLAN` labels are "Easy Start Annual", "Easy Start Unlimited Annual" (only if `EASY_START_ANNUAL_PRICE_ID` is set) and "Easy Pro Annual".
- After R9, `SUBSCRIPTION_STATUS` will let it skip `paused`, `cancelled` and `ended` contacts.
- With the evidence above, the choice is: **retain** (it is correct), **repair** (add an Annual and active condition, or a real renewal date sent by code), or **replace** (Stripe "upcoming renewal" emails).

## R9. Cancellation sync (smallest reliable solution)

**The problem:**
- Brevo is only ever told when someone **becomes** paid (`stripe-webhook` adds them to list 5).
- A portal cancellation never reaches CLPeasy code except through Stripe webhooks.
- The account-page cancellation writes attributes that do not exist.
- When a subscription ends, nothing removes the contact from list 5.

**The solution:** make `stripe-webhook` the **single owner** of `SUBSCRIPTION_STATUS`. It already receives every pause, cancel, reactivate, end and new-subscription event from **both** the account page and the Stripe portal, and its existing duplicate-event protection runs each one once.

| Stripe event (either route) | Brevo update |
|---|---|
| `checkout.session.completed` (subscription) | existing list 5 add + `SUBSCRIPTION_STATUS = active` |
| `customer.subscription.updated` → profile `active` / `paused` / `cancelled` (scheduled) | `SUBSCRIPTION_STATUS` = the same value |
| `customer.subscription.updated` with status `canceled`, or `customer.subscription.deleted` | `SUBSCRIPTION_STATUS = ended` (or `payg` if the account converted to PAYG) **and remove from list 5** |
| reactivation / price change (existing list 5 add) | + `SUBSCRIPTION_STATUS = active` |

- All Brevo calls stay **non-fatal**, matching the existing pattern, so they can never affect billing or credits.
- Every update looks up the contact's email from `profiles.email` (by `userId`).

**Optional, needs your yes or no:** a **cancellation confirmation** (service email, no offers; draft `NEW-cancellation-confirmation.html`). It would be sent by `stripe-webhook` when `cancel_at_period_end` turns on, with `ACCESS_UNTIL` from Stripe. It covers both the account page and the portal, and is consistent with the Privacy Policy ("We do not send offers to stay or invitations to come back after you cancel").

**Optional tidy-up, not needed for correctness:** add `clp-account-events` (deployed v38) to the repo and remove its no-op cancel and save-offer Brevo writes and the invalid `doubleOptinConfirmation` call. This is a separate change because the function's source is not under version control.

## R10. Implementation plan

### A. Brevo changes the connector can make (on approval)
The connector can **read** everything, **create new templates** (created inactive) and **send test emails** of a template to existing contacts. It **cannot** edit or activate existing templates, create attributes, create lists, change contacts, or see or edit workflows.

1. Create **"CLPeasy - PAYG Purchase Confirmation"** (inactive) from `NEW-payg-purchase-confirmation.html`. Sender `noreply@clpeasy.com` (id 2), reply-to `support@clpeasy.com`. Record its ID.
2. (If approved) create **"CLPeasy - Cancellation Confirmation"** (inactive) from `NEW-cancellation-confirmation.html`.
3. Test-send both, plus template 7 once you have edited it, **only to test contacts** (for example `craftymousegifts+clptest5@gmail.com`, already on a list).
   - A plain test send does not fill in `params`, so it shows blank numbers. The full check is the code QA in D.

### B. Brevo dashboard changes that need you
1. **Contacts → Settings → Attributes:** create `SUBSCRIPTION_STATUS` (Text). Create nothing else.
2. **Contacts → Lists:** create **"CLPeasy PAYG Customers"** (if R4 is approved). Tell me its ID.
3. **Workflow 1 (Onboarding):** add the R2 conditions before steps 8, 10 and 12 (templates 4, 5, 6). Paste the R3 HTML into steps 2–12 (templates 1–6). Set reply-to `support@clpeasy.com`. Keep the workflow active throughout: edit, save, then check.
4. **Workflow 2 (Paid):** paste the R5 HTML into templates 13 and 14. Trigger and steps unchanged.
5. **Template 7:** paste the R6 HTML (same ID), test, **then** activate.
6. **Activate** the new PAYG template (and the cancellation template, if approved) **only after** the code QA passes.
7. **Workflow 3:** **no change.** Collect the R8 evidence.
8. **Transactional → Logs:** check whether pause sends with template 7 were rejected.
9. Diary: **2 Jan 2027**, remove the dated offer lines from templates 4–6.

### C. CLPeasy code changes (one PR, separate from #220; no deploy without approval)
1. **`supabase/functions/stripe-webhook/index.ts`:**
   - non-throwing helpers to set `SUBSCRIPTION_STATUS`, add to or remove from a list, and send a transactional template, using `profiles.email`;
   - PAYG: list `BREVO_PAYG_LIST_ID` instead of `BREVO_PAID_LIST_ID`, plus `SUBSCRIPTION_STATUS = payg`; transactional `BREVO_PAYG_TEMPLATE_ID` with `DOWNLOADS/PURCHASED/BONUS/BALANCE/FIRSTNAME` to every PAYG buyer;
   - subscription status sync and list 5 removal (R9);
   - optional cancellation confirmation (`BREVO_CANCEL_TEMPLATE_ID`).
   - Every new behaviour is **skipped when its secret is unset**, so deploying the code before the Brevo setup is safe.
2. **`supabase/functions/notify-signup/index.ts`:** attributes become `FIRSTNAME` + `SUBSCRIPTION_STATUS = trial` (drops the five `CLPEASY_*`). The list, automation trigger and admin alert are unchanged.
3. **Tests:** extend the existing Deno tests for `stripe-webhook`. Cases:
   - PAYG with 8 and with 5;
   - subscriber buying PAYG;
   - Brevo HTTP 500 and network failure (the credit is kept, the event is not re-run);
   - pause, cancel, reactivate, portal cancel and end;
   - each secret unset.
   - Plus a `notify-signup` payload test.
4. **New Supabase secrets** (owner): `BREVO_PAYG_LIST_ID`, `BREVO_PAYG_TEMPLATE_ID`, optional `BREVO_CANCEL_TEMPLATE_ID`.
5. **No changes** to `account.html`, `manage-subscription`, `clp-account-events`, `create-checkout-session` or pricing.

### D. Stripe changes
**None required.** The portal and webhook configuration already cover every event. Renewal reminders: undecided (R8).

### Order and QA (test contacts only)
1. Approve the drafts (and the D2 list decision, the cancellation email, and the "CLP-compliant" wording).
2. B1, B2, then A1 and A2 (new templates stay inactive).
3. Code PR (C): local Deno tests. If the Brevo key setup allows, run it against the **CLPeasy Test** Supabase project and Stripe test mode, using `craftymousegifts+…` test contacts only.
4. B3–B5 (onboarding conditions and content; template 13/14; template 7). Run test sends to test contacts.
5. **End-to-end QA with test accounts:**
   - sign up → buy PAYG on day 1 → confirm the PAYG email and the PAYG list, and that the day 10 step exits;
   - a second test account subscribes → template 13 and the status change;
   - pause → template 7;
   - cancel in the portal → `cancelled`, then end → `ended` and removed from list 5.
6. Deploy the code and activate the templates only with your explicit go-ahead.

### Decisions needed from you
1. **PAYG list:** a new "CLPeasy PAYG Customers" list (recommended; replaces approved decision D2), or keep list 5 + `PLAN` conditions?
2. **Cancellation confirmation email:** yes or no?
3. **Template 1:** drop "CLP-compliant" (recommended under the project's compliance-wording rule)?
4. **For information, not changed:** the footers show "66 Paul Street, London", while the Brevo account address is in Duns. Please confirm which postal address the emails should carry.

---

# Round 3: decisions and implementation (5 Oct 2026)

## Owner decisions
| # | Decision | Result |
|---|---|---|
| 1 | Separate **CLPeasy PAYG Customers** list; PAYG never in subscriber or renewal journeys | **Approved**, implemented in code (replaces D2) |
| 2 | Plain transactional cancellation confirmation, with the access end date where reliable | **Approved**, template created (inactive) + code |
| 3 | Remove "CLP-compliant" from template 1; use the approved CLP Ready term | **Approved**: "Download your **CLP Ready** label as a PNG, PDF sheet, or Cricut-ready file" |
| 4 | Footer postal address | **Not approved yet.** Investigated below; footers unchanged |

Annual Renewal Reminder (workflow 3, template 16): **not touched.**

## What was done (no customer-facing change; nothing activated or sent)

### Brevo (through the connector)
| ID | Template | State | Check |
|---|---|---|---|
| **23** | CLPeasy - PAYG Purchase Confirmation | **inactive** | sender `noreply@clpeasy.com` ("Michaela at CLPeasy"), reply-to `support@clpeasy.com`; read back from Brevo: content identical to `docs/brevo/templates/NEW-payg-purchase-confirmation.html` |
| **24** | CLPeasy - Cancellation Confirmation | **inactive** | same sender and reply-to; content identical to `docs/brevo/templates/NEW-cancellation-confirmation.html` |

- No test emails were sent. A connector test send cannot fill in `params`, so it would show blank numbers. The real check is a send from the code to a test contact (see QA below).
- Brevo's handling of the `{% if %}` blocks has **not yet been tested in Brevo itself**. They follow Brevo's template language. In a browser render with sample values, all branches produce the intended wording.

### Final template content: `docs/brevo/templates/`
| File | Live template | Change |
|---|---|---|
| `01`–`06` | onboarding 1–6 (workflow 1) | as in R3. Template 1 now says "CLP Ready label" |
| `07-pause-confirmation.html` | 7 | as in R6. Generic "your CLPeasy subscription"; greeting "Hi {{ params.FIRSTNAME }}" |
| `13-paid-welcome-subscription.html` | 13 | as in R5 |
| `14-paid-day7-tips.html` | 14 | "label library in this browser" |
| `15-paid-day30-thank-you.html` | 15 | **reviewed, no change** (included for completeness) |
| `NEW-payg-…`, `NEW-cancellation-…` | 23, 24 | created in Brevo (inactive) |

- Every file renders at 640 px and 375 px in Chromium with no horizontal overflow and no errors. That includes the PAYG email with 8 (2026) and 5 (2027) downloads, and the cancellation email with and without a date.
- The live Brevo versions were **not** overwritten.

### Code (branch `claude/clpeasy-brevo-audit-ty30up`; separate from #220; not deployed)
**`supabase/functions/stripe-webhook/index.ts`:**
- **PAYG:** after a successful credit, the buyer goes to `BREVO_PAYG_LIST_ID` with `PLAN = Pay As You Go` and `SUBSCRIPTION_STATUS = payg`.
  - This happens only if they are not a current subscriber (existing rule).
  - It **never** uses the subscriber list. If the PAYG list is not configured, the list step is skipped rather than falling back to the subscriber list.
  - Every PAYG buyer (subscriber or not) gets template `BREVO_PAYG_TEMPLATE_ID` with `DOWNLOADS`, `PURCHASED`, `BONUS` and `BALANCE` taken from that purchase. A 2027 pack therefore reads "5 downloads" with no bonus line, and no copy change is needed.
- **Subscription bought:** the existing subscriber-list upsert now also sets `SUBSCRIPTION_STATUS = active`.
- **`customer.subscription.updated`** (Account page *and* Billing Portal):
  - On a pause, cancellation or status transition, `SUBSCRIPTION_STATUS` is set to `paused` or `cancelled`.
  - Reactivation re-adds the contact to the subscriber list as `active` (existing call + status).
  - Ordinary updates make **no** Brevo call.
- **Cancellation newly scheduled:** template `BREVO_CANCEL_TEMPLATE_ID` is sent with `ACCESS_UNTIL`.
  - The date comes from Stripe: `cancel_at`, otherwise the item's `current_period_end`, otherwise the subscription's `current_period_end`.
  - If Stripe gives no date, the field is empty and the email says "the end of your current billing period". A date is never guessed.
  - Duplicate deliveries never send twice (existing event claim).
- **Subscription actually ends** (`customer.subscription.deleted`, or `updated` with status `canceled`):
  - `SUBSCRIPTION_STATUS = ended`, or `payg` if the account already converted to Pay As You Go.
  - The contact is **removed from the subscriber list** (`unlinkListIds`).
- The Brevo contact key is `profiles.email` (Stripe email only as a fallback). Checked read-only: the live `profiles` table has an `email` column filled on all 21 rows.
- Every Brevo call is non-fatal and logged. Each new behaviour is skipped while its secret is unset.
- **No save-offer or win-back behaviour:** templates 8–12 are never sent, and `CANCEL_REASON`, `DELETION_DATE` and `DISCOUNT_ACTIVE` are never written.

**`supabase/functions/notify-signup/index.ts`:** the sign-up contact now carries only `FIRSTNAME` (the five `CLPEASY_*` attributes are removed). It deliberately does **not** write `SUBSCRIPTION_STATUS`, because the endpoint:
- is called from `auth.html` without sign-in, and
- runs again when someone submits the sign-up form with an email that is already registered.

Writing a status there could reset a paying customer to "trial".

**Not changed:** `account.html`, `manage-subscription`, `clp-account-events` (pause still sends template 7), `create-checkout-session`, pricing, Annual Renewal Reminder.

### Tests
- `tests/deno/stripe-webhook.test.ts`: 51 → **70 scenarios**. Existing PAYG expectations were updated to the PAYG list. New scenarios:
  - PAYG list missing never falls back to the subscriber list;
  - 2027 five-download pack;
  - account email used;
  - current subscriber buying PAYG (no list or status change, confirmation only);
  - pause;
  - cancellation via the Account page and via the Billing Portal (status + one email, duplicates ignored);
  - end date from the item period, or empty;
  - cancellation template unset;
  - reactivation;
  - ordinary update (no call);
  - deletion and `canceled` update (ended + removed from list 5);
  - ended-but-PAYG;
  - no email on file;
  - Brevo HTTP 500 or network failure (webhook still 200, profile changes kept);
  - a full PAYG journey that never touches the subscriber list or the `active` status;
  - no save-offer, win-back or cancel-reason writes.
- New `tests/deno/notify-signup.test.ts`: the sign-up contact has `FIRSTNAME` + list only, and no plan or status.
- **Mutation checks:** the new tests fail against the old code, and against each deliberate break:
  - PAYG sent to the subscriber list;
  - no list removal on end;
  - hard-coded bonus.
  - A redundant guard that no test could distinguish was removed.
- **`npm test` (full suite): exit 0.** Deno 2.9.6 was installed in the session. `download-entitlement-sql` was SKIPPED (no local PostgreSQL; that SQL is not changed).

### QA still needed after approval (test contacts only)
Deploy to the **CLPeasy Test** Supabase project / Stripe test mode, if its Brevo setup allows, and use `craftymousegifts+…` contacts:
1. A PAYG purchase in 2026 sends template 23 showing "8 … (5 purchased + 3 bonus)".
2. A subscription and an Account-page cancel send template 24 with the date.
3. A Billing Portal cancel does the same.
4. End the subscription: the contact leaves list 5 and its status is `ended`.
5. Pause sends template 7.

## Decision 4: postal address findings (no change made)

**What the repository shows:**
- "66 Paul Street, London, EC2A 4NA" is CLPeasy's published business address in many places. In `privacy.html` it is "Our registered business address is CLPeasy, 66 Paul Street…". It also appears in `terms.html` ("Michaela Feeley, trading as CLPeasy, of 66 Paul Street…"), `refund.html`, `faq.html`, `compliance.html`, `showcase.html`, `release-notes.html` (asserted by `tests/versioning-and-release-notes.js`), and in the email templates.
- `monitor.html` (an internal page) records it as a paid **virtual address service**: the card is titled "Horton Mix — Virtual Address", "London · 66 Paul Street, EC2A 4NA", "Monthly cost £26/month", **status "Verification in progress"**. Its live status and renewal date are kept only in your browser storage, so they are not visible here.
- `scrum.html` acceptance criterion: "Registered address 66 Paul Street London EC2A 4NA correct on all pages". It was first committed on 31 May 2026.
- The CLPeasy repo does not record whether that verification was completed, whether the service is still paid, or what the service plan permits (mail handling or acceptance of formal documents).

**What Brevo holds:**
- The Brevo account's company address (`accounts_get_account`) is the residential address in Duns. **None of the 22 templates contains it.** 12 templates print 66 Paul Street; templates 1, 2, 3, 5, 6 (and copies 17, 18, 20–22) print no postal address.
- Brevo can add a footer of its own when it sends, depending on account settings. Whether it currently adds the Duns address to sent emails **could not be checked**:
  - the connector shows only template HTML, not sent messages;
  - the Gmail connector needs signing in again, so the delivered copies to your `craftymousegifts+…` test aliases could not be read.
- **Before activating any template, open one delivered CLPeasy email and check its footer.**

**UK requirements** (summary for orientation, not legal advice; check against legislation.gov.uk / ICO / GOV.UK before relying on it):
- **PECR reg. 22–23 (marketing email):**
  - consent or soft opt-in;
  - the sender's identity must not be concealed;
  - a valid address must be given for opt-out requests. An unsubscribe link or email address meets this; a postal address is not specifically required.
- **Electronic Commerce Regulations 2002, reg. 6:** the provider's name, *geographic* address and email must be "easily, directly and permanently accessible". This is usually met on the website (the legal pages) rather than in every email.
- **Consumer Contracts Regulations 2013:** the trader's geographical address must be given before a contract. That is the website/checkout, not each email.
- **Companies Act 2006 ss. 1202–1204 (business names):**
  - A sole trader using a business name ("Michaela Feeley trading as CLPeasy") must show their name and a **UK address at which documents can be effectively served** on business letters, written orders, invoices, receipts and written demands for payment.
  - Whether a virtual address qualifies depends on it genuinely accepting service of documents.
  - Whether ordinary emails count as "business letters" should be confirmed.
- **Company trading disclosures (registered office in emails):** apply only if CLPeasy becomes a limited company.

**What is needed from you before any change:**
1. Confirm the virtual-address service is active, verification is complete, and its plan lets you publish the address as your business address and receive documents there.
2. If yes, the current footers can stay.
3. Check one delivered email for a Brevo-added footer showing the Duns address. If one is present, change the company address in Brevo's sender/company settings to the business address, so your home address is never shown.

## Round 4: owner Brevo setup reconciled (6 Oct 2026)

**Verified through the connector (read-only):**
- List **7 "CLPeasy PAYG Customers"**: folder 2, 0 contacts.
- Attribute **`SUBSCRIPTION_STATUS`**: normal, type **text**.
- No `CLPEASY_*` attributes exist.
- Templates **23** and **24** are still **inactive**.

**PR #221 reconciled:**
- The code reads list and template IDs from Supabase secrets. Nothing is hard-coded, so production needs `BREVO_PAYG_LIST_ID=7`, `BREVO_PAYG_TEMPLATE_ID=23` and `BREVO_CANCEL_TEMPLATE_ID=24` (`BREVO_PAID_LIST_ID` is already 5).
- The tests now use these live IDs (paid 5, PAYG 7, templates 23 and 24).
- **New misconfiguration guard:** if `BREVO_PAYG_LIST_ID` were ever set to the same ID as `BREVO_PAID_LIST_ID`, the PAYG list step is refused and logged, so a PAYG buyer still cannot reach the Paid Subscribers list. A test covers this.
- Deno suite: stripe-webhook **71**, notify-signup 1, create-checkout-session 50, billing-status 26, manage-subscription 8, all passing.
- **Attribute fit:** the code writes only `SUBSCRIPTION_STATUS` (text) with the values `payg`, `active`, `paused`, `cancelled` and `ended`.
  - `notify-signup` never writes it (test-enforced).
  - No `CLPEASY_*`, `CANCEL_REASON`, `DELETION_DATE` or `DISCOUNT_ACTIVE` writes occur from the PR code (test-enforced).

**Live side-effect of creating the attribute (production code unchanged):** the **deployed** `clp-account-events` (v38, not in the repo) already sends `SUBSCRIPTION_STATUS`.
- **What it sends:**
  - `"cancelled"` after an Account-page cancellation (authenticated, and only after `manage-subscription` has succeeded in Stripe);
  - `"active"` in the unreachable save-offer branch.
- **What changed:** before the attribute existed, Brevo dropped that value. From now on Brevo may store it.
  - The same request also carries the non-existent `CANCEL_REASON` and `DELETION_DATE`, so whether Brevo accepts the whole update cannot be confirmed without a live call.
- **Why it is harmless:** the value matches what the webhook writes for the same event, no workflow reads the attribute yet, and there are currently 0 active subscribers.
- **Optional, needs owner approval:** to make the webhook the *only* writer, add `clp-account-events` to the repo and remove its cancel and save-offer Brevo writes. The pause email send stays.

## Round 5: SUBSCRIPTION_STATUS has a single owner (6 Oct 2026, approved)

### `clp-account-events`
- **Added to the repo.** The first commit (`aaeadbb`) is the **deployed v38 source, unchanged**, so the change is reviewable as a diff. It was re-read from Supabase on 6 Oct; still v38, `verify_jwt: true`.
- **Change (second commit):** the function no longer makes any Brevo contact call.
  - **Cancel:** the `doubleOptinConfirmation` POST and the contact PUT are removed (`SUBSCRIPTION_STATUS`, `CANCEL_REASON`, `DELETION_DATE`). It now just returns `{ success: true }`, as before.
  - **Save offer:** the contact PUT (`SUBSCRIPTION_STATUS = active`, `DISCOUNT_ACTIVE`) is removed. The Stripe coupon, the profile flags and the `{ success, discountApplied }` response are unchanged. This branch is still unreachable from the Account page (`SAVE_OFFER_ENABLED = false`).
- **Unchanged:**
  - the pause confirmation (template 7 to the account email, `FIRSTNAME` param, `success` reflects the send);
  - JWT authentication and the account-email lookup;
  - the allowed events, CORS, and every response shape.
- `account.html` and `manage-subscription` are not changed, so the customer-facing Stripe pause and cancellation are exactly as before. The cancellation confirmation for both routes comes from `stripe-webhook`.

### Ownership, now enforced by tests
- `tests/deno/clp-account-events.test.ts` (6 scenarios):
  - pause sends only template 7 and no attribute;
  - a pause send failure still returns `success: false`;
  - cancel makes **no** Brevo call;
  - save offer is unchanged in Stripe and the profile, with no Brevo call;
  - authentication (401/400) is unchanged;
  - **repository check: outside comments, `stripe-webhook` is the only Edge Function containing `SUBSCRIPTION_STATUS`.**
- Verified to fail when expected:
  - against the deployed v38 code (cancel writes to Brevo);
  - when a `SUBSCRIPTION_STATUS` write is added to another function.
- `grep` of the whole repo (excluding docs and tests): `SUBSCRIPTION_STATUS` appears in code only in `stripe-webhook`. `notify-signup` and `clp-account-events` mention it only in comments.

### Deploy notes (when approved)
- Deploy `clp-account-events` with JWT verification **on** (Supabase CLI default; do not pass `--no-verify-jwt`), matching the current deployment.
- Deploy it together with, or after, `stripe-webhook`. Otherwise, between the two deploys, Account-page cancellations would get neither the old attribute write nor the new webhook update. Harmless while no workflow reads the attribute, but tidier.
