# PAYG refund wording — options for owner decision (2 Oct 2026)

> **Superseded 2 Oct 2026:** the owner chose the immediate-supply consent approach (Option A, with consent captured at checkout). See `PAYG-IMMEDIATE-SUPPLY-CONSENT-2026-10-02.md`.

Status: **OWNER DECISION. Nothing published.** `refund.html` on `feature/pay-as-you-go-downloads`
has a hidden HTML comment marking where the approved section goes, directly above the existing
"Top-Up Download Packs" section. No customer-visible change has been made.

This is software and wording preparation, not legal advice.

## Current state
- `refund.html` has sections for: 14-Day Cancellation Rights, Free Trial, Monthly, Annual,
  **Top-Up Download Packs**, Exceptional Circumstances, How to Request a Refund, Contact.
- The policy contains "Nothing in this policy limits your statutory rights." Keep it.
- There is **no section for Pay As You Go packs**.
- The Top-Up section says the packs are "non-refundable and all sales are final" because the
  credits can be used straight away. Top-ups are retired from new sales but past buyers may exist.

## Point to check before choosing (important)
- UK consumers usually have a 14-day right to cancel. For digital content supplied immediately,
  that right is normally lost only if the customer **expressly agreed** to immediate supply **and
  acknowledged** they lose the right to cancel, and that is confirmed to them.
- **Neither `checkout.html` nor `create-checkout-session` currently records that agreement.**
  Stripe Checkout can collect it (a required tick box or custom text), but that is a code change
  to checkout and needs your approval.
- Without it, a blanket "all sales final" statement may not be enforceable. Please check with
  your own legal source.

## Option A — mirror the Top-Up wording, with consent captured at checkout
> **Pay As You Go Downloads**
> Pay As You Go packs are one-off purchases of digital content. When you buy a pack, you ask us
> to make the downloads available straight away and you agree that you lose your right to cancel
> once they are added to your account. Purchased Pay As You Go downloads do not expire.
> Because the downloads can be used immediately, packs are not refundable once added, except for
> a duplicate charge or a technical fault that stopped the downloads being added. Contact
> support@clpeasy.com and we will put it right.

Requires: a consent tick/text at checkout (code change, needs approval).

## Option B — refund unused packs within 14 days (no checkout change)
> **Pay As You Go Downloads**
> Pay As You Go packs are one-off purchases. Purchased downloads do not expire. If you change
> your mind within 14 days of purchase and **have not used any downloads from the pack**, contact
> support@clpeasy.com for a full refund. Once any download from a pack has been used, the pack
> is not refundable, except for a duplicate charge or a technical fault that stopped the
> downloads being added.

Requires: no code change to checkout, but a manual process.
- Refunds are issued from the Stripe dashboard.
- **There is no automatic step that removes the refunded downloads.** The webhook does not
  handle refunds. Someone would have to reduce the account's PAYG balance by hand (8 during the
  launch offer, 5 after). Without that, the customer keeps the downloads.
- The launch bonus (3 free) is part of the same pack, so an unused pack is refunded at £4.99 and
  all 8 downloads are removed.

## Also decide
1. Keep the legacy "Top-Up Download Packs" section for past buyers, or remove it?
2. Should the Free Trial or Exceptional Circumstances wording mention PAYG? Currently the trial
   paragraph already names "Pay As You Go or Easy Start Unlimited".
