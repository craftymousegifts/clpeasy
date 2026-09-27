# PR #156 — Live Stripe objects to create (owner instructions; nothing created by Claude)

Source of truth:

- the verified Sandbox setup (`acct_1TdczqKF3jvQfgEa`: PAYG £4.99; coupon `gWcEql0d` =
  10 %, Forever; both promotion secrets pointed at that one coupon);
- the PR #156 code (`create-checkout-session`, `stripe-webhook`, `billing-status`).

Create everything in **Live mode**, in the same Stripe account as the existing Live CLPeasy prices
(`price_1TdoE…`, `price_1Tdpd…`).

## 1. Pay As You Go product and price

| Field | Value |
|---|---|
| Product name | `CLPeasy Pay As You Go downloads` |
| Product description (until 31 Dec 2026) | `5 downloads for £4.99, plus 3 FREE until 31 December 2026 (8 in total). Purchased downloads do not expire.` |
| Price | **£4.99**, currency **GBP** |
| Price type | **One-off** (NOT recurring) |
| Pricing model | Standard / flat |
| Tax behaviour | Same as the existing Live top-up prices (5 for £3.99 / 10 for £7.99) |
| Metadata | **None required** (product and price) |

- **After creating it:** copy the new **Price ID** (`price_…`, not the product ID) into the
  production Supabase secret `PAYG_5_PRICE_ID`.
- **The 5 + 3 offer is controlled in code, not in Stripe.**
  - For every PAYG checkout, `create-checkout-session` stamps `metadata.downloads`: **8** before
    1 Jan 2027 00:00 (UK = UTC in winter), **5** from then on.
  - `stripe-webhook` credits only 5 or 8.
  - The Stripe price stays £4.99 throughout.
- **Owner diary item for 1 Jan 2027:** change the product description to
  `5 CLPeasy label downloads. Purchased downloads do not expire.` It is only customer-facing text
  and nothing in code changes it.

## 2 and 3. 2026 Easy Start / Easy Pro monthly promotion

- **One coupon is enough and is exactly what was tested.**
  - The code reads two secrets, `PROMO_2026_EASY_START_MONTHLY_COUPON_ID` and
    `PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID`, and they may safely hold the same coupon ID.
  - In the Sandbox both held `gWcEql0d`, and every lifecycle test passed, including removal at the
    first 2027 renewal (removal treats the two secrets as a set).
- **Two separate coupons also work** if you want separate redemption reporting. Use identical
  settings except the name.

| Field | Value |
|---|---|
| Name (shown to customers on Checkout and invoices) | `2026 launch offer – 10% off monthly plans`. If two coupons: `2026 launch offer – Easy Start monthly` and `2026 launch offer – Easy Pro monthly`. |
| ID (optional custom ID) | e.g. `CLPEASY_2026_MONTHLY_10` (or leave Stripe's generated ID) |
| Type | **Percentage discount, 10 %** |
| Duration | **Forever** |
| Apply to specific products | Leave unrestricted (as in the Sandbox). If restricted, it must include both the Easy Start **monthly** and Easy Pro **monthly** products. |
| Redemption limits / "redeem by" date | **None** |
| Promotion codes | **Do not create any.** The coupon is applied server-side only. |

- **Why Forever:** the code applies the coupon only to monthly checkouts started before 1 Jan 2027.
  `stripe-webhook` then removes it at each subscriber's first renewal for a period starting on or
  after 1 Jan 2027. "Once" or "Repeating" would end the discount too early for people who join in
  2026.
- **Resulting prices** (confirmed in the Sandbox): Easy Start **£9.99 → £8.99**, Easy Pro
  **£14.99 → £13.49**. Annual plans are never discounted.
- **Only these two Live monthly prices receive the coupon:** `price_1TdoEYGZLILz5vqUIqlEsf4X`
  (Easy Start monthly) and `price_1TdoEXGZLILz5vqUvZKB1RQw` (Easy Pro monthly). They must be the
  Live £9.99 / £14.99 GBP monthly prices in this same account.
- **After creating it:** put the coupon ID into both production secrets (the same ID twice, or one
  each).
- **If a promotion secret is missing while the offer is running,** monthly checkout deliberately
  fails closed (503 "offer not available") rather than charging full price.

## Still to confirm before the release restarts

- Production `STRIPE_SECRET_KEY` is the **Live** secret key of this account (see
  PRODUCTION-RELEASE-GATE-1 §2).
- `BREVO_PAID_LIST_ID` is present in production (owner-confirmed).
