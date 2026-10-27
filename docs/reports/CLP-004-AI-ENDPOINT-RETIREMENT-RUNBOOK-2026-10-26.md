# CLP-004 — Retiring the paid AI endpoints and containing the beta email relay

Prepared 26 Oct 2026. Each production step needs separate founder approval.

**Status (27 Oct 2026, 11:35 UTC):**
- Step A (`beta-tester-email`) is done; see section 4a.
- Step C (#311) is released.
- **`finn-chat` is preserved by founder decision and is out of scope.**
- Step E (`clp-wizard`, `clp-search`) is done, with founder approval on 27 Oct to skip the rest of the 7-day observation. See section 4a.
- Still open:
  - E2 (final Privacy Policy wording, separate approval);
  - F (Anthropic spend limit, alerts and October costs: founder console check). CLP-004 stays open until F is verified.

## 1. What is being retired and why

| Edge Function (live version) | What it does | Called by | Risk while live |
|---|---|---|---|
| `clp-wizard` v40 | Forwards any system prompt and messages to Anthropic (Haiku 4.5 / Sonnet 4.6 allowed; 2,000-token cap) | Builder Guide Me (`builder.html`) — replaced by the local guide | Anyone can script paid calls with a faked Origin; the per-IP limit keys on a caller-supplied header and is skipped if the counter fails |
| `clp-search` v47 | Sends a question of any length to Haiku 4.5 | Knowledge Base search (`knowledge.html`) — replaced by the local search | Same gating; unlimited input length; its fixed prompt also makes regulatory statements CLPeasy has not reviewed |
| `finn-chat` v21 — **PRESERVED, not in scope** | Sonnet 4.6, 4,096 tokens | No page today | Kept by founder decision (26 Oct) for possible future development. Do not delete, retire, overwrite or redeploy it. Any cost-containment change needs separate approval |
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

## 2a. Pre-retirement re-check for `beta-tester-email` and `finn-chat` (26 Oct, later the same day, read-only)

| Check | Result |
|---|---|
| Live versions | `beta-tester-email` v40 and `finn-chat` v21. Bundle hashes are unchanged since the first check (`50c4f443…` and `997976de…`). Both have `verify_jwt: false` |
| Rollback copies | Live source re-downloaded and compared: `rollback/beta-tester-email/index.ts` and `rollback/finn-chat/index.ts` are **identical** to production. `finn-chat` has no `deno.json`, which matches production |
| Database | The only object that refers to either function is `notify_beta_tester_email()`. Its trigger `on_beta_tester_insert` is **disabled** (0 enabled). No queued `pg_net` requests to either. No `finn:` usage records |
| Traffic (last 24 h) | None to `beta-tester-email` or `finn-chat` |
| Site pages | None call either function. `beta-archived.html` only reads `beta_testers`, and the public site already blocks it (404) |
| Other functions | No function in the repo calls another function by URL. Sign-up (`notify-signup` v54: 8 normal calls today), support (`send-support-email` v10) and feedback (`send-feedback-email` v24) are separate deployments. They keep `BREVO_API_KEY`, which the stub never reads |
| Replacement | `stub/index.ts` has no imports, never calls fetch, reads no secrets and creates no client (`tests/retired-endpoint-stub.js`). It cannot send email or make an AI request |

Verdict: ready for steps A and B, subject to founder approval. **No production change has been made.**

## 3. Method: a 410 stub, not deletion

> The stub's header comment still lists `finn-chat` among possible targets and says "NOT deployed". It is kept byte-identical to what was deployed as `beta-tester-email` v41, for traceability. `finn-chat` is out of scope (section 1).

`supabase/retirement/stub/index.ts` answers every request with **410 Gone** and a plain-English message. It makes no AI call, sends no email, and reads no secret or database (`tests/retired-endpoint-stub.js`).

Deploying it over an existing slug is instantly reversible. Deleting a function is not: the slug's history and settings are lost. Deletion can follow later if wanted.

Rollback copies of the four live sources are in `supabase/retirement/rollback/<slug>/`. They were transcribed from the Supabase connector's `get_edge_function` output on 26 Oct. Before any change, download the live source again and compare it with the copy.

> Repository warning: `clp-wizard-edge-function.ts` (repo root) and `supabase/functions/finn-chat/index.ts` are **older, unprotected versions**: no Origin check, no sign-in for Finn, 8,192 tokens. Never deploy from them. Remove them once retirement is complete (approval needed).

## 4. Release sequence

| # | Step | Approval | Depends on |
|---|---|---|---|
| A | **Contain `beta-tester-email` now:** deploy the stub to slug `beta-tester-email` (keep `verify_jwt: false` so the response is the 410 message, not a gateway error) | Founder | Nothing: it has no live caller |
| B | ~~Retire `finn-chat`~~ **Removed from scope (founder decision, 26 Oct): `finn-chat` is preserved unchanged** | — | — |
| C | Merge and release the local Guide Me / Knowledge Base PR (#311). On release day, set the Privacy Policy "Last updated" date. #311 keeps the Anthropic disclosure for pages opened before the release | Founder | Its own tests and visual approval |
| D | Watch edge logs for `clp-wizard` and `clp-search` for 7 days. Expect only cached pages or bots | — | C |
| E | **Retire `clp-wizard` and `clp-search`:** deploy the stub to each. **Done 27 Oct 2026** (founder approved skipping the rest of D: no live caller and no traffic since C) | Founder | D, plus #311 verified on production |
| E2 | Same day as E: publish the final Privacy Policy wording (section 7) with a new "Last updated" date | Founder | E |
| F | **While `finn-chat` is preserved, `ANTHROPIC_API_KEY` must stay** (Finn uses it). Set a low monthly spend limit and email alerts in the Anthropic Console. Removing or revoking the key is a separate founder decision | Founder (Console access) | E |
| G | Optional, after 30 quiet days: delete the retired functions (`beta-tester-email`, `clp-wizard`, `clp-search`) and remove the stale `clp-wizard-edge-function.ts`. `finn-chat` and its source are kept | Founder | E |

## 4a. Deployment record

**Step A: `beta-tester-email` (26 Oct 2026, 18:17 UTC, founder-approved)**
- **Before:**
  - v40, bundle `50c4f443…`, `verify_jwt: false`.
  - The live source was re-downloaded and matched `rollback/beta-tester-email/` byte for byte.
- **Deploy:**
  - `stub/index.ts` (sha256 `97e0e707559a8a33…`) plus an empty `deno.json` as the import map. The function's stored settings require an import map, and the first attempt without one was refused with no change made.
  - Result: **v41**, bundle `883dd48e…`, `verify_jwt: false`.
- **Verified:**
  - `OPTIONS` → 204.
  - `POST {}` → **410** "This CLPeasy service has been retired…". No email can be sent: the function has no network call and reads no secret.
  - The deployed source matches the stub.
- **Unaffected (same versions and bundle hashes before and after):**
  - `notify-signup` v54, `send-support-email` v10, `send-feedback-email` v24, `stripe-webhook` v68;
  - `clp-wizard` v40, `clp-search` v47, **`finn-chat` v21 (`997976de…`)**;
  - all other functions.
- **Rollback (ready):** deploy `rollback/beta-tester-email/index.ts` and `rollback/beta-tester-email/deno.json` (`import_map_path: deno.json`, `verify_jwt: false`). The result is a new version with the v40 behaviour. Check with `OPTIONS` only: a `POST` with a record would send a real email.

**Step C: #311 (26 Oct 2026, 18:18 UTC)**
- Squash commit `c90c726`; Netlify production deploy `6adf99714c54f3e27367feac`.

**Step E: `clp-search` and `clp-wizard` (27 Oct 2026, 11:32–11:33 UTC, founder-approved)**
- **Before:**
  - `clp-search` v47 (bundle `56eb1e66…`) and `clp-wizard` v40 (`c22f2cb2…`), both `verify_jwt: false`.
  - Each live source was re-downloaded and matched `rollback/<slug>/index.ts` and `deno.json` byte for byte.
  - **Usage:** no site page called either function (production pages and `main` checked). There were no calls after step C. The last calls were the 26 Oct read-only probes.
- **Deploy:** the same `stub/index.ts` (sha256 `97e0e707559a8a33…`) as `beta-tester-email`, plus an empty `deno.json` as the import map, `verify_jwt: false`.
  - `clp-search`: **v48**, bundle `49fa4f01…`, at 11:32:44 UTC.
  - `clp-wizard`: **v41**, bundle `29dcae48…`, at 11:33:10 UTC.
- **Verified (zero cost):**
  - Both: `OPTIONS` returns 204; `POST {}` with `origin: https://clpeasy.com` returns **410**; `GET` without an origin returns **410**.
  - Both return the plain "This CLPeasy service has been retired…" message.
  - The deployed source equals the stub. It has no imports and no `fetch`, and reads no secret, so it cannot call Anthropic or read `ANTHROPIC_API_KEY`.
  - The edge logs show only start-ups and the 204/410 responses. `api_rate_limits` is unchanged, so the old code path did not run.
- **Unaffected (same versions and bundle hashes before and after):**
  - **`finn-chat` v21 (`997976de…`, own sign-in check unchanged)**;
  - `notify-signup` v54, `stripe-webhook` v68, `send-support-email` v10, `send-feedback-email` v24;
  - `beta-tester-email` v41;
  - all other functions.
- **Not changed:** `ANTHROPIC_API_KEY` (still used by `finn-chat`) and `BREVO_API_KEY`.
- **Rollback (ready):** deploy `rollback/<slug>/index.ts` and `rollback/<slug>/deno.json` to the same slug (`import_map_path: deno.json`, `verify_jwt: false`). That returns the slug to its v47/v40 behaviour. Check it with `OPTIONS` only, so no paid request is made.

## 5. How each deploy step is done

For each approved slug (via the Supabase connector or CLI):

1. Re-download the live source (`get_edge_function <slug>`). Confirm it still matches `supabase/retirement/rollback/<slug>/`.
2. Deploy `supabase/retirement/stub/index.ts` as `index.ts` to that slug. Keep the slug's current `verify_jwt` setting (all are `false`). If the slug has an import map (`clp-wizard` and `clp-search` do), also deploy an empty `deno.json` (`{"imports": {}}`) with `import_map_path: deno.json`.
3. Verify:
   - **Zero-cost check:** an `OPTIONS` request returns 204, and a `POST` with the header `origin: https://clpeasy.com` and body `{}` returns 410 with the retired message. A request to the stub cannot reach Anthropic or Brevo.
   - **Logs:** the function's edge logs show a 410, and no `api.anthropic.com` or `api.brevo.com` call appears.
   - **Unaffected services:** `notify-signup`, the Stripe functions and `send-support-email` are untouched (`list_edge_functions`: same versions as before).
4. Record the new version number in the tracker.

## 6. Rollback

- **Redeploy:** deploy `supabase/retirement/rollback/<slug>/index.ts` (plus its `deno.json`) to the same slug, with the same `verify_jwt: false`. The function returns to its 26 Oct behaviour. Re-check with an `OPTIONS` request only. No paid request is needed to confirm a rollback.
- **After step F:** a rolled-back AI function also needs `ANTHROPIC_API_KEY` set again. Until it is, it returns an Anthropic authentication error and costs nothing.
- **Site:** rolling back the local Guide Me / Knowledge Base release is a normal Netlify rollback to the previous deploy. That restores the old AI calls, so do it only while the AI functions are still live.

## 7. Final Privacy Policy wording (after step E only)

Apply this to `privacy.html` in a small follow-up PR **after** `clp-wizard` and `clp-search` have been retired. Before then, the release-day wording in #311 must stay, because an open page can still reach Anthropic.

- **§2 "Questions you type…" row:**
  - Remove the sentence starting "A Builder or Knowledge Base page that was already open before this change…".
  - Change the lawful-basis cell to "Not applicable (not collected)".
- **§2 IP address row:** change to "Security and fraud prevention". The per-IP question limits belonged to the retired functions.
- **§4:** remove the bullet "**Anthropic** (United States): transfers are covered by the Standard Contractual Clauses…".
- **§5:** remove the bullet "Questions sent to Anthropic: under Anthropic's standard terms…".
- **§6:** remove the bullet "**Anthropic** — AI service used by earlier versions of Guide Me…".
- **Keep the microphone row unchanged.**
- **Update "Last updated" and "Effective"** to that day's date.

## 8. Merge note

#311 and #312 both edit the `"test"` line in `package.json`. Whichever merges second needs a one-line conflict fix that keeps both sets of tests.

## 9. Not done

- No function deleted. Only the steps recorded in section 4a were deployed.
- No secret changed or revoked (`ANTHROPIC_API_KEY` stays for `finn-chat`).
- No paid or email-sending request made.
