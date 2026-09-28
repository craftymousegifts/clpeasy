# Account page: checkout already in progress — evidence

Screenshots from `node tests/account-checkout-in-progress.js`: real account.html in Chromium, with Supabase stubbed and Edge Function requests intercepted.

| File | Shows |
|---|---|
| `account-in-progress-desktop.png` | Reactivate → `CHECKOUT_IN_PROGRESS`: the shared "Checkout already in progress" dialog (checkout-notice.js) above the resubscribe window, with focus on "Back to plans" |
| `account-in-progress-mobile.png` | The same on iPhone (390×844): 16px gutters, full-width button |

**Behaviour.** Account reuses the dialog from pricing.html and checkout.html unchanged. A started, or refused-as-in-progress, subscription checkout is recorded with the shared `markStarted()`. The existing header indicator then shows on checkout.html, where Stripe's cancel link returns the customer, and on pricing.html. Account itself has no header, so it shows no indicator.
