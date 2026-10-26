# CLP-004 — Retiring the paid AI endpoints and containing the beta email relay

Prepared 26 Oct 2026. **Nothing in this runbook has been carried out.** Each production step needs separate founder approval.

## 1. What is being retired and why

| Edge Function (live version) | What it does | Called by | Risk while live |
|---|---|---|---|
| `clp-wizard` v40 | Forwards any system prompt and messages to Anthropic (Haiku 4.5 / Sonnet 4.6 allowed; 2,000-token cap) | Builder Guide Me (`builder.html`) — replaced by the local guide | Anyone can script paid calls with a faked Origin; the per-IP limit keys on a caller-supplied header and is skipped if the counter fails |
| `clp-search` v47 | Sends a question of any length to Haiku 4.5 | Knowledge Base search (`knowledge.html`) — replaced by the local search | Same gating; unlimited input length; its fixed prompt also makes regulatory statements CLPeasy has not reviewed |
| `finn-chat` v21 | Sonnet 4.6, 4,096 tokens | No page (Finn retired) | Low: only one signed-in email is allowed, but it is an unused paid endpoint |
| `beta-tester-email` v40 | Sends a Brevo email from noreply@clpeasy.com to **any address in the request** | Nothing: its only caller, trigger `on_beta_tester_insert` on `public.beta_testers`, is **disabled** | Unauthenticated email relay (spam, sender reputation, Brevo quota) |

## 2. Dependency check (read-only, 26 Oct 2026)

- **Site pages:** `clp-wizard` is called only by `builder.html` and `clp-search` only by `knowledge.html`. Both calls are removed by the local-guide PR. No page calls `finn-chat` or `beta-tester-email`. `tests/retired-endpoint-stub.js` re-checks this.
- **Database:**
  - `public.notify_beta_tester_email()` is the only database function that calls any of the four. Its trigger `on_beta_tester_insert` is DISABLED. It contains no key literal. `public.beta_testers` has 4 rows.
  - `notify_signup_webhook` (CLP-001) calls `notify-signup` only, which is unaffected.
  - pg_cron is not installed.
- **Traffic (edge logs, last 24 h):**
  - `clp-wizard`: 5 requests, all from the 26 Oct read-only probes (403/400).
  - `clp-search`, `finn-chat`, `beta-tester-email`: none.
  - `api_rate_limits` shows 2 wizard requests (26 Oct) and 1 search request (4 Oct) in the retained window.
- **Shared resources to keep:**
  - The `ANTHROPIC_API_KEY` secret is used only by these three AI functions.
  - `increment_rate_limit` and `api_rate_limits` are used only by them too. They are harmless and can stay.
  - `BREVO_API_KEY` is also used by `notify-signup`, `send-support-email` and `send-feedback-email`, so it must **not** be removed.
- **Functions that must not be touched:**
  - `notify-signup`, `stripe-webhook`, `create-checkout-session`, `create-portal-session`, `manage-subscription`, `billing-status`;
  - `clp-account-events`, `admin-package-monitor`, `send-support-email`, `send-feedback-email`, `plausible-proxy`, `diag-stripe-price-lookup`;
  - `cmg-*` (Crafty Mouse Gifts).

## 3. Method: a 410 stub, not deletion

`supabase/retirement/stub/index.ts` answers every request with **410 Gone** and a plain-English message. It makes no AI call, sends no email, and reads no secret or database (`tests/retired-endpoint-stub.js`).

Deploying it over an existing slug is instantly reversible. Deleting a function is not: the slug's history and settings are lost. Deletion can follow later if wanted.

Rollback copies of the four live sources are in `supabase/retirement/rollback/<slug>/`. They were transcribed from the Supabase connector's `get_edge_function` output on 26 Oct. Before any change, download the live source again and compare it with the copy.

> Repository warning: `clp-wizard-edge-function.ts` (repo root) and `supabase/functions/finn-chat/index.ts` are **older, unprotected versions**: no Origin check, no sign-in for Finn, 8,192 tokens. Never deploy from them. Remove them once retirement is complete (approval needed).

## 4. Release sequence

| # | Step | Approval | Depends on |
|---|---|---|---|
| A | **Contain `beta-tester-email` now:** deploy the stub to slug `beta-tester-email` (keep `verify_jwt: false` so the response is the 410 message, not a gateway error) | Founder | Nothing: it has no live caller |
| B | **Retire `finn-chat`:** deploy the stub | Founder | Nothing |
| C | Merge and release the local Guide Me / Knowledge Base PR | Founder | Its own tests and visual approval |
| D | Watch edge logs for `clp-wizard` and `clp-search` for 7 days. Expect only cached pages or bots | — | C |
| E | **Retire `clp-wizard` and `clp-search`:** deploy the stub to each | Founder | D |
| F | Remove the `ANTHROPIC_API_KEY` Edge Function secret. In the Anthropic Console, revoke that key, and set a low monthly spend limit and email alerts on the workspace | Founder (Console access) | B and E |
| G | Optional, after 30 quiet days: delete the four functions. Remove the stale sources from the repo | Founder | F |

## 5. How each deploy step is done

For each approved slug (via the Supabase connector or CLI):

1. Re-download the live source (`get_edge_function <slug>`). Confirm it still matches `supabase/retirement/rollback/<slug>/`.
2. Deploy `supabase/retirement/stub/index.ts` as `index.ts` to that slug. Keep the slug's current `verify_jwt` setting (all four are `false`).
3. Verify:
   - **Zero-cost check:** an `OPTIONS` request returns 204, and a `POST` with the header `origin: https://clpeasy.com` and body `{}` returns 410 with the retired message. A request to the stub cannot reach Anthropic or Brevo.
   - **Logs:** the function's edge logs show a 410, and no `api.anthropic.com` or `api.brevo.com` call appears.
   - **Unaffected services:** `notify-signup`, the Stripe functions and `send-support-email` are untouched (`list_edge_functions`: same versions as before).
4. Record the new version number in the tracker.

## 6. Rollback

- **Redeploy:** deploy `supabase/retirement/rollback/<slug>/index.ts` (plus its `deno.json`) to the same slug, with the same `verify_jwt: false`. The function returns to its 26 Oct behaviour. Re-check with an `OPTIONS` request only. No paid request is needed to confirm a rollback.
- **After step F:** a rolled-back AI function also needs `ANTHROPIC_API_KEY` set again. Until it is, it returns an Anthropic authentication error and costs nothing.
- **Site:** rolling back the local Guide Me / Knowledge Base release is a normal Netlify rollback to the previous deploy. That restores the old AI calls, so do it only while the AI functions are still live.

## 7. Not done

- No function deployed, disabled or deleted.
- No secret changed.
- No paid or email-sending request made.
