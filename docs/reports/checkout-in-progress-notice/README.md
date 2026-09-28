# Checkout-in-progress notice — evidence

Screenshots from `node tests/checkout-in-progress-notice.js` (real pages in Chromium; Supabase stubbed; the server's 5-minute subscription-checkout lock emulated, and proven against the real Edge Function in `tests/deno/create-checkout-session.test.ts`):

- `pricing-desktop.png`, `checkout-desktop.png`: 1366×900
- `pricing-mobile.png`, `checkout-mobile.png`: iPhone 390×844

What the backend stores for the lock (`public.checkout_locks`): only `user_id` and `created_at`. It has RLS with service-role access only, and the 409 response carries only `code` and `error`. So the previous plan, price, Stripe session and exact remaining time are not shown: they are not stored, and the browser cannot read the lock.
