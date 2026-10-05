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
