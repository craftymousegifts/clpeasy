# PAYG immediate-supply consent — release gate (2 Oct 2026)

Owner direction: use the "immediate supply of digital content" approach for Pay As You Go.
Implemented on `feature/pay-as-you-go-downloads` only. **Not deployed anywhere. No production
change.** This is software implementation, not legal advice.

## Checkout consent
- **Where:** `pricing.html`, on the Pay As You Go card, directly above "Buy 8 downloads — £4.99". This
  is the only place a PAYG purchase starts. Dashboard, Builder, Composer and account links all
  send people here.
- **Wording (checkbox label):** "I ask for my Pay As You Go download credits to be supplied
  immediately after payment. I understand that once supply begins, I lose my 14-day right to
  cancel this digital-content purchase."
- **Not pre-ticked.** There is no `checked` attribute.
- **Enforcement in the browser:** the page blocks checkout until the box is ticked. Without the
  tick there is no request, a prompt appears ("Please tick the box above to continue to payment."),
  and focus moves to the box.
  - A guest who ticked the box and was sent to sign up resumes with that consent (stored as
    `checkout_payg=consented` for the browser tab).
  - Any other pending purchase needs a fresh tick.
- **Enforcement on the server:** `create-checkout-session` refuses a PAYG checkout unless the request
  carries `immediateSupplyConsent: true` (boolean). It returns 400 `PAYG_CONSENT_REQUIRED` and creates
  no Stripe session, so calling the endpoint directly cannot skip the step.
  - Subscribers still get the existing 403 "not needed" first.
- **On Stripe's checkout page:** a reminder is shown next to the pay button (`custom_text.submit`).

## Evidence (durable, server-side, no new database migration)
- `create-checkout-session` stamps these fields on three Stripe objects:
  - `payg_immediate_supply_consent = "true"`
  - `payg_immediate_supply_consent_at` = server timestamp (ISO 8601)
  - `payg_consent_wording = "payg-immediate-supply-2026-10-02"` (wording version)
- **The three Stripe objects:**
  1. the **Checkout Session** metadata (also in the `checkout.session.completed` event the webhook
     receives);
  2. the **PaymentIntent** metadata (shown on the payment in the Stripe Dashboard);
  3. the paid **Invoice** metadata.
- Stripe keeps these records. They are not browser state.
- **Verified in the Sandbox:** a real Checkout Session created with these exact parameters
  (`cs_test_a1TweKXL…`, payment mode, £4.99) was accepted. Stripe echoed back all metadata, the
  invoice settings and the custom text. That session was never paid and expires by itself.

## Durable confirmation to the customer
- **How:** `invoice_creation[enabled]=true` on the PAYG Checkout Session.
- **What Stripe does after payment:** it creates a paid invoice and emails the customer an invoice
  summary with links to the invoice and receipt PDFs. Stripe documents that the invoice memo appears
  in invoice PDFs, invoice emails and the hosted invoice page.
- **The memo (`invoice_data.description`):** "Pay As You Go digital download credits. Before paying,
  you asked for these credits to be supplied immediately after payment and acknowledged that once
  supply begins you lose your 14-day right to cancel this digital-content purchase. This does not
  affect your statutory rights. Questions: support@clpeasy.com"
- **Conditions (owner checks before release):**
  1. The email is sent only when **Stripe Dashboard → Settings → Customer emails → "Successful
     payments"** is switched on, in the **Live** account.
  2. Stripe charges a separate small fee for post-payment invoices on one-time Checkout payments.
  3. The Sandbox never emails receipts or invoices automatically. The email itself can only be seen
     after a real (Live, or team-member-address) payment or by "Send receipt" in the Dashboard.
- **Not used as confirmation:** the CLPeasy success screen, which is transient. There is no
  CLPeasy-built confirmation email.

## Refund policy (`refund.html`)
- **Removed:** the "Top-Up Download Packs" section ("non-refundable and all sales are final").
- **Replaced by "Pay As You Go Downloads":**
  - credits added after successful payment;
  - the tick box asking for immediate supply and acknowledging loss of the 14-day right, without
    which payment cannot continue;
  - confirmation in the invoice email;
  - "This does not affect your statutory rights";
  - duplicate-charge, credits-not-added and technical-problem handling.
- **Kept:** "Nothing in this policy limits your statutory rights.", the Free Trial, Monthly, Annual
  and Exceptional Circumstances sections, and How to Request a Refund.

## Not affected
- **Free trial** (`auth.html`), **subscription checkout** (`checkout.html`, pricing "Get started"),
  **account** page and existing **Easy Pro** accounts: no consent box, no consent fields. This is
  tested.
- **Stripe webhook:** unchanged. Duplicate-event protection and PAYG crediting are untouched (51
  scenarios pass).

## "3 FREE Pay As You Go downloads": how it actually works
- **Where granted:** `create-checkout-session` stamps `metadata.downloads = "8"` on every PAYG
  Checkout Session created before 2027-01-01 00:00 UTC ("5" after). The webhook credits that number
  through `credit_payg_purchase` when payment succeeds (only 5 or 8 are accepted).
- **When:** only after a successful £4.99 PAYG payment. They are **not** free before or without a
  purchase. The trial's 10 watermarked downloads are separate.
- **How often:** on **every** PAYG purchase during the offer (repeat purchases allowed by owner
  decision). There is no once-per-customer limit, and each Stripe event credits once.
- **Wording vs behaviour (owner decision, nothing changed):**
  - The PR #202 offer bar says "+ 3 FREE Pay As You Go downloads" without saying a £4.99 purchase is
    needed. Elsewhere the homepage says "(£4.99 for 5 downloads + 3 FREE …)".
  - The homepage intro, the FAQ and the pricing card call it a "**one-off** launch bonus", but the
    code gives the 3 extra downloads on **every** pack bought in 2026.
  - Either the wording should say "with every pack" / "when you buy a pack", or the code should limit
    the bonus to the first purchase.
