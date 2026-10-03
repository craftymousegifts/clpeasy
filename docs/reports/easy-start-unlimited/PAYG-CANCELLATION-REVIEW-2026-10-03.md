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
- **Rounding:** the refund is the amount paid × unused credits ÷ credits in the pack (bonus
  included), rounded **up** to the nearest penny, and never more than the amount paid. For
  £4.99 / 8: 8 unused → £4.99, 5 → £3.12, 1 → £0.63.
- **Which pack a download uses:**
  - credits are one balance, so downloads that used a purchased credit are counted against packs
    in purchase order, oldest first, and the newest pack is treated as used last;
  - trial downloads, Easy Start Unlimited downloads and free 7-day re-downloads use no credit and
    are not counted.
- **Faulty or undelivered downloads:**
  - the credit is restored or the file replaced, and otherwise refunded, whenever the credits
    were bought;
  - this is independent of the 14 days and keeps the customer's statutory rights;
  - the checkbox and invoice note say used downloads are not refunded "unless they were faulty"
    / "faulty or not delivered".
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

## Support procedure: calculating a PAYG cancellation refund
**Records available:**
- **Purchases:** Stripe (Live) Checkout Sessions with `metadata.type = payg`. For each pack:
  - payment date;
  - amount paid;
  - credits in the pack (`metadata.downloads`, 8 in 2026, 5 from 2027).
  - Legacy top-up purchases (5 or 10 credits) are packs too.
- **Current balance:** `profiles.topup_credits` for the customer, read on the day of the
  cancellation request.
- **No per-download ledger exists.** `label_downloads` keeps only the latest time per label, and A4
  sheet exports are not recorded. The rule below does not need one.

**Why the balance is enough:** the balance only goes up when a pack is credited, and only goes down
when a download uses a purchased credit (`consume_download` source `purchased`). Trial downloads,
Easy Start Unlimited downloads and free 7-day re-downloads never touch it. Because used credits are
counted oldest pack first, the credits still in the balance are always the newest ones.

**Calculation** for pack P, bought within the last 14 days:
1. newer = total credits in packs bought **after** P that have not been refunded.
2. unused(P) = min(credits in P, max(0, balance − newer)).
3. refund = min(amount paid for P, ceil(amount paid for P × unused(P) ÷ credits in P)), in pence.
4. Refund that amount in Stripe, then remove unused(P) credits from the balance.

**Example:**
- A customer buys pack A (8 credits) on 1 Oct and pack B (8 credits) on 5 Oct, then makes 10
  credit-using downloads. The balance is 6.
- Cancel B: newer = 0, unused = min(8, 6) = 6, refund = ceil(499 × 6 ÷ 8) = 375p = **£3.75**.
- Cancel A instead: newer = 8, unused = max(0, 6 − 8) = 0, so no refund for A, because A was used
  first.

**Caveat:** a credit added back by hand (for example a goodwill restore for a faulty download) also
raises the balance.
- Record any manual adjustment, with its date, in the support notes.
- Treat it as a pack of that size on that date, so the balance arithmetic stays exact.
- A small credit ledger table would make this automatic. That is a possible future improvement,
  not part of this change.
