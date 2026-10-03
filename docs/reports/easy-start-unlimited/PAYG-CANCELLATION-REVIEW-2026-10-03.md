# PAYG 14-day cancellation review (3 Oct 2026)

**Status:** correction prepared on `fix/payg-cancellation-policy`. **Not deployed.** Production is still on
`cfe025c`.

This is a software and policy review, not legal advice. The classification question below should
go to a qualified adviser or Trading Standards (Business Companion / Citizens Advice business
line).

## What the released code (`cfe025c`) says
- **Checkbox (`pricing.html`):** "I ask for my Pay As You Go download credits to be supplied immediately
  after payment. I understand that once supply begins, I lose my 14-day right to cancel this
  digital-content purchase."
- **Server (`create-checkout-session`):** refuses PAYG without `immediateSupplyConsent: true`.
- **Stripe metadata:** wording version `payg-immediate-supply-2026-10-02`, stamped on the Session,
  PaymentIntent and invoice.
- **Invoice memo:** says the right to cancel is lost once supply begins.
- **Stripe checkout note:** says the same.
- **Refund Policy:** "acknowledge that once supply begins you lose your statutory 14-day right to
  cancel that purchase".
- **Terms:** say nothing about PAYG cancellation.

## The legal position (as far as could be checked)
**Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013**
- **Reg 37, digital content not on a tangible medium:**
  - The right to cancel is lost only once *supply of the digital content has begun*, after the
    consumer's express consent and acknowledgement.
  - The confirmation must record both.
  - Without that consent, the consumer bears no cost for content supplied during the period.
- **Reg 36, services:**
  - Supply may start within the 14 days only at the consumer's express request.
  - The right to cancel is lost only once the service is *fully performed*, and then only if the
    consumer acknowledged that.
  - If the consumer cancels after partial performance, they pay a proportionate amount.

**Consumer Rights Act 2015 and Trading Standards guidance (Business Companion)**
- Digital content is "data which are produced and supplied in digital form".
- Digital content is *not* "services delivered online".

Primary sources (legislation.gov.uk, businesscompanion.info) are blocked by this environment's
network policy. These points come from search summaries of those pages and need confirming
against the current official text.

## What CLPeasy actually sells and supplies
| Item | What it is | Likely classification | When it is supplied |
|---|---|---|---|
| PAYG credits (unused) | A prepaid balance (`topup_credits`) | Not itself data supplied to the customer; a right to future downloads | Added at payment, but nothing is delivered yet |
| A downloaded label file (PNG/PDF/SVG) | A file generated from the customer's own input | Arguably digital content | When the customer downloads it (one credit each) |
| The Builder / label tool | An online tool used to create labels | Arguably a service delivered online | Ongoing, while the account has access |

**Conclusion:** adding credits to a balance is not clearly the "beginning of supply" of digital
content.
- If PAYG is a service (reg 36), the right to cancel is lost only once all credits are used, and
  partial use gives a proportionate refund.
- In either reading, telling customers they lose the right as soon as credits are added is not
  established, and could misstate their rights.

**Also note:** most customers buy for their making business. A business buyer is not a "consumer",
so CCR rights may not apply to them at all. For simplicity and fairness, the conservative policy
treats every buyer the same.

## Conservative policy prepared (pending clarification)
- **The checkbox stays (required, never pre-ticked).** It is now a request for the credits to be
  added straight after payment. That request is needed under either regulation, because supply
  starts inside the 14 days.
- **Cancellation:**
  - Within 14 days of payment, a customer can cancel.
  - If no credits from that purchase are used, they get a full refund.
  - If some are used, unused credits are refunded at price ÷ pack size (for example £4.99 ÷ 8) each.
  - Downloads already made are not refunded.
- **Refund mechanics:** refunds go to the original payment method within 14 days of the
  cancellation, and refunded credits are removed from the balance.
- **No wording anywhere says the right to cancel is lost when credits are added.**

### Files changed
- `pricing.html`: checkbox text and code comment.
- `supabase/functions/create-checkout-session/index.ts`:
  - wording version `payg-immediate-access-unused-refund-2026-10-03`;
  - invoice memo, Stripe checkout note, error message and comments.
  - Unchanged: the request field `immediateSupplyConsent`, the metadata keys, the rule that PAYG
    is refused without the tick, the server timestamp, the invoice creation, and all other checkout
    logic.
- `refund.html`: the PAYG section now states the 14-day refund of unused credits.
- `terms.html` (Clause 9): one sentence pointing to the PAYG 14-day refund of unused credits.
- Tests: `tests/payg-immediate-supply-consent.js`, `tests/payg-pricing-checkout.js`,
  `tests/deno/create-checkout-session.test.ts`. They now require the new wording and fail if
  "lose … 14-day right to cancel" returns.

### Deploying it (after owner approval)
1. Redeploy `create-checkout-session` (production v51 → next). This is needed because the memo,
   checkout note and wording version are server-side.
2. Fast-forward `main` to publish `pricing.html`, `refund.html` and `terms.html`.

Deploy both before the first real Live PAYG purchase. No live PAYG purchase has been made yet, so
no customer has the old wording on record.

## Separate observations (not changed)
- **Terms Clause 7:** limits liability to "subscription fees paid … in the 12 months". A PAYG-only
  customer pays no subscription fees.
- **DMCC Act 2024 subscription regime:** reported start January 2027. It adds a 14-day cooling-off
  period at renewal and at the end of a free or discounted period. Easy Start's 2026 promotional
  monthly price and its auto-renewal should be reviewed before then.
