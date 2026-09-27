# Pricing / checkout UX — evidence

Screenshots from `node tests/pricing-checkout-ux.js`: real pages in Chromium, Supabase stubbed, server lock emulated. Desktop is 1366×900; iPhone is 390×844.

| File | Shows |
|---|---|
| `pricing-desktop.png`, `pricing-mobile*.png` | Card icons: Easy Trial ✨ and Easy Pro ⚡ unchanged; new inline-SVG Pay As You Go (contactless card) and Easy Start (clipboard with tick) |
| `checkout-plan-cards-monthly-{desktop,mobile}.png` | Plan-choice cards during the 2026 offer: Easy Start £8.99/month and Easy Pro £13.49/month, "Normally £9.99/month" / "Normally £14.99/month · 10% launch offer until 31 December 2026" |
| `checkout-plan-cards-annual-desktop.png` | Annual cards £99/yr and £149/yr, no 2026 offer |
| `checkout-summary-easy-start-monthly-{desktop,mobile}.png` | £9.99/mo standard price, "2026 offer – 10% off" −£1.00, due today £8.99/month |
| `checkout-summary-easy-pro-monthly-desktop.png` | £14.99/mo standard price, −£1.50, due today £13.49/month |
| `indicator-pricing-desktop.png`, `indicator-pricing-mobile.png`, `indicator-checkout-mobile.png` | Header "Checkout in progress" indicator |
| `indicator-dialog-{desktop,mobile}.png` | The indicator's explanation dialog |

**What the indicator is based on.** The server lock (`checkout_locks`) stores only `user_id` and `created_at`, and the browser cannot read it. The indicator therefore uses only what the browser itself saw: a subscription Checkout Session created for the signed-in account, or a `CHECKOUT_IN_PROGRESS` refusal. It hides 5 minutes after that moment, the latest the lock can still exist. It never shows a plan, price, Stripe session or countdown. A checkout started on another device is still explained by the PR #157 dialog when the customer tries again.
