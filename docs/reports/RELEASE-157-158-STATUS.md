# Release status — PR #157 and PR #158

**Status: RELEASE PASS.** Both PRs are merged and live.

| Item | Value |
|---|---|
| Production commit | `3380a88` (merge of #158; #157 merged as `210c397`) |
| Netlify production deploy | `6ab9af3f` (ready, 28 Sep 2026 00:05 UTC) |
| PR #157 | Checkout-already-in-progress dialog: merged and live |
| PR #158 | Checkout indicator, 2026 offer on checkout cards and summary, new PAYG and Easy Start icons: merged and live |

## Testing completed

**Live Stripe checkout testing, 27 September 2026** (owner-run, no payments completed):
- PAYG: £4.99 for 8 downloads (5 + 3 FREE during the 2026 launch offer).
- Easy Start monthly: £8.99 after the 2026 launch discount.
- Easy Pro monthly: £13.49 after the 2026 launch discount.

**Exact code released through #157 and #158:**
- The combined release code (main `fc5fd59` + #157 + #158) passed 65/65 test files. Its file tree is identical to the merged production commit.
- Deno Edge Function suites passed: 45 + 41 + 26 + 8.
- Public post-deployment production smoke tests passed: key pages and scripts return 200 and serve the released content.
- Production Edge Functions showed no new errors.
- No Sandbox/Test IDs or project references were found on the live public pages.

## Signed-in production QA: NOT RUN / ENVIRONMENT BLOCKED

The cloud QA environment could not reach the required production hosts (`clpeasy.com`, the production Supabase auth host, `checkout.stripe.com`), and it had no credentials for a production QA account.

These #157/#158 features were therefore verified automatically in a browser against the exact released code, but were **not re-tested in a signed-in live production session after release**:
- checkout-in-progress header indicator;
- "Checkout in progress" dialog;
- "Checkout already in progress" dialog;
- promotional prices on the checkout plan cards;
- promotional prices and discount in the checkout order summary.

This limitation does not represent a known production defect.

## Rollback points (Netlify deploys)

- `6ab954cf`: #157 only.
- `6ab945c4`: production state before #157/#158.

## Open follow-ups (not release blockers)

- The pricing page can show "Start free trial" to an already signed-in user.
- The account resubscribe flow still uses a generic error when a checkout is already in progress.
- A checkout started on another device cannot be shown by the local checkout indicator until the server reports the lock on a later attempt.
