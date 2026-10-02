# Release gate C — PAYG / Easy Start Unlimited (2 Oct 2026, evening)

Supersedes the status lines in `RELEASE-GATE-B.md`. Nothing here was merged or deployed, apart
from the production webhook hotfix already approved and reported.

| | Item | Status |
|---|---|---|
| A | Webhook hotfix | **Production `stripe-webhook` v61 = `ae03748`** (byte-verified). Main **not yet protected**: main still has the old code. `fix/webhook-claim-fail-closed` is a 1-commit fast-forward of main (webhook + its tests only). The PAYG branch already carries the identical claim fix (it differs only by the £89 price mapping). **Needs approval to merge into main.** First real Stripe event after v61: check for HTTP 200 in the Stripe dashboard. |
| B | PAYG branch | `feature/pay-as-you-go-downloads` (this commit). |
| C | Production DB migration | `20261002000000_easy_start_unlimited` **not applied** to production (applied to Test only). |
| D | Live £89 Stripe price | **Not created.** Sandbox price `price_1UM5UwKF3jvQfgEa5A5F3ac5` only. |
| E | Easy Pro new sales | Removed from all customer pages on the PAYG branch (sweep: 0 new-sale mentions). Checkout refuses Easy Pro and the old £99 price server-side (400). |
| F | Legacy Easy Pro | Kept, no migration. Still recognised in: `consume_download` (unlimited), `entitlement.js` (plan name), `plan-checker.js`, account/dashboard plan label, Builder sidebar label, webhook price maps (historic Easy Pro price IDs). The account "save offer" screen that quotes £14.99 is switched off (`SAVE_OFFER_ENABLED = false`); it must not be turned on without new wording. |
| G | Homepage Phase C | Prepared as one commit on top of PR #202 (`3c19940`): `build/homepage-phase-c-on-202.patch`. Copy only. **Not pushed to #202** (needs permission to push to that branch). See notes below. |
| H | Pricing page | Done on the PAYG branch. Needs owner visual approval. |
| I | Checkout | Done. Monthly shows "Due today £8.99/month" (offer), annual £89.00, `?billing=annual` pre-selects annual. Needs owner visual approval. |
| J | Plan picker | Done. Needs owner visual approval. |
| K | Refund wording | **Owner decision.** Hidden insertion marker added to `refund.html`; options in `PAYG-REFUND-WORDING-OPTIONS.md`. Checkout does not currently record consent to immediate supply. |
| L | Automated tests | 71 files: 66 pass, 5 fail, all 5 matching main's baseline. Refund-related tests pass after the marker. Phase C: the 21 homepage-related tests give identical results before and after the change (the failures there are #202's existing ones). |
| M | Browser E2E | **Blocked** by this cloud environment's network policy (Test Supabase, Stripe Checkout/JS/billing, jsDelivr). Not evidence of a CLPeasy fault. |

## Homepage Phase C — what changed (on top of #202)
- Offer bar: "10% off Easy Start & Easy Pro" → "10% off Easy Start Unlimited monthly". Bar position and
  height unchanged at 360/390/1366 px.
- Intro paragraph: Easy Start/Easy Pro prices → Easy Start Unlimited £8.99/mo (then £9.99) or £89/year.
- FAQ "difference between plans" and "download limits": Easy Pro, £99/£149, 20/30 downloads a month and
  top-up packs removed; Easy Start Unlimited described.
- Signup guide: Easy Pro tab and panel removed (including its embedded screenshots, about 626 KB). Easy
  Start panel says Unlimited and £89/yr. "cancel or upgrade" → "cancel".
- Unchanged: hero artwork, layout, mobile spacing, social image, "From £9.99/month" in the cost
  comparison (still the standard monthly price).

## Release sequencing (important)
- PR #202 with Phase C describes the new model. It must **not go live before** the PAYG/Unlimited
  production release.
- Main's current homepage still advertises Easy Pro and top-ups, so the PAYG release must **not go live
  without** the Phase C homepage.
- They must be released together.
