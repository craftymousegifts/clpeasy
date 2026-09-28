# Plan Checker: 3-question model (Sep 2026)

Replaces the old 5-question points system in `plan-picker.html`. That system
recommended Easy Pro in 86 of its 108 answer combinations, including very light
use, and could never recommend Pay As You Go.

## What changed

- `plan-checker.js`: new, pure rules module (same pattern as `entitlement.js`).
  - `decide(answers)` returns the plan from the three answers only. There are no
    scores and no ties, and permanent prices drive every rule.
  - `ctas(result, CLPEntitlement summary)` changes only the call-to-action for the
    visitor's account state. It never changes the plan.
- `plan-picker.html`: three questions (downloads, months of the year, payment
  preference) and one result card:
  - the reasons for the recommendation
  - cost warnings and alternatives
  - a separate "Current offer" box, hidden from 1 Jan 2027 (the same boundary the
    server uses)
  - calls-to-action that depend on the account state
- `pricing.html`:
  - "3 quick questions" copy, and Pay As You Go added to the trial FAQ.
  - Approved Easy Pro support wording.
  - `id="easy-start"` / `id="easy-pro"` anchors on the plan cards (markup only).
- `index.html`, `builder.html`, `support.html`: "3-question" copy and the approved
  standard-support wording ("We aim to respond as soon as possible.").
- Tests:
  - New `tests/plan-checker-decision.js`, added to `npm test`.
  - The retired "reduce risk ... confidence" assertion in
    `tests/footer-and-compliance-wording.js` is replaced.

## Decision rules (evaluated in order)

1. **Pay only when needed**: Pay As You Go. For regular use above 10 a month, show
   what a subscription would cost instead.
2. **Prefers a subscription**:
   - Not sure yet: Easy Start, with a lower-commitment note.
   - Occasional: Easy Start, with a warning that Pay As You Go usually costs less.
   - Ongoing:
     - up to 20 a month: Easy Start (with a warning or note at up to 10)
     - 21–30 a month: Easy Pro, with the Start + top-up comparison (£13.98)
     - more than 30: Easy Pro plus top-ups
3. **No preference**:
   - Not sure yet: Pay As You Go, with the trial emphasised.
   - Occasional: Pay As You Go.
   - Ongoing:
     - up to 10 a month: Pay As You Go (6–10 also mentions Easy Start)
     - 11–20 a month: Easy Start
     - 21–30 a month: Easy Pro, with the comparison
     - more than 30: Easy Pro plus top-ups

Distribution over the 36 combinations: Pay As You Go 21, Easy Start 11, Easy Pro 4.

## Subscriber plan changes

A current subscriber whose result is the other subscription plan is sent to
`support.html`. This is a temporary fallback, because self-service Start ↔ Pro
switching through the Stripe portal is unverified. That is tracked separately and
is not part of this change.

## Evidence

The screenshots in this folder come from a local server with a mocked Supabase
session.

- Google Fonts were blocked in the test environment, so the headings use fallback
  fonts in the screenshots.
- No checkout, payment or Edge Function request was made during QA.
