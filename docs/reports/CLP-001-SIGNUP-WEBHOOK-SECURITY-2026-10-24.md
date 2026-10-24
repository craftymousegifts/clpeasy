# CLP-001 — Sign-up webhook credential fix and legacy key retirement plan

- **Date:** 24 Oct 2026 · **Tier:** High (auth, edge function, database trigger)
- **Branch:** `security/clp-001-signup-webhook-secret` (from `main` @ `5c6dd9d`)
- **Status:** prepared, locally tested and verified on CLPeasy Test (`wwjhvpphlbgtywxskqnf`, 24 Oct 2026). **Nothing** deployed, merged or applied in production.
- No secret value appears in this report, the code, the migration, the tests or the Git history.

## 1. Root cause

- The "on-user-signup" Database Webhook was created in the Dashboard with "add auth header with service key".
  - Supabase stored a `service_role` JWT **as plain text inside the trigger definition** on `auth.users` (first reported 25 Sep 2026, commit `5766e66`).
  - Anyone able to read trigger definitions, schema dumps or backups can read the key.
- **Second issue:** `notify-signup` (`verify_jwt: false`) did not authenticate callers.
  - Any request (for example with the public anon key, as `auth.html` sent) could create Brevo contacts, start the onboarding emails and send admin alerts.
- **Third issue (found during this task):** the webhook posted the **whole `auth.users` row**, and `notify-signup` logged the full request body.
  - Production function logs for the 21 Oct sign-up contain the `encrypted_password` field name; no bcrypt value was found in that line.
  - Confirmation-token and metadata columns are in the same row.

Read-only facts (24 Oct 2026, production `qvkosdqcryrcfbjtaxic`):
- The legacy keys are enabled.
- The legacy anon key's `iat` equals the project creation time (25 May 2026). So the legacy JWT secret has never been rotated.
- The embedded token is `role: service_role` for this project ref. Its `iat` (May 2025) predates the project, so its validity cannot be inferred and was not tested.
- No secret has ever been committed to Git (all 1,984 commits scanned). The migration history contains no JWT.

## 2. Fix (smallest secure change)

| File | Change |
|---|---|
| `supabase/migrations/20261024000000_secure_signup_webhook.sql` | New. See the list after this table. |
| `supabase/functions/notify-signup/index.ts` | Rejects every request without the correct `x-clpeasy-webhook-secret` header (401, before any Brevo call). It checks via the RPC and fails closed if the check errors. It logs only the `user_id`, never the body. Everything after the check is unchanged. |
| `auth.html` (separate commit) | Removes the browser call to `notify-signup`. The trigger already fires for every sign-up, including Google; the browser call would now get 401. |
| `tests/deno/notify-signup.test.ts`, `tests/deno/stubs/supabase.ts` | Adds 9 offline scenarios. |
| `tests/signup-webhook-sql.js`, `tests/sql/signup-webhook-shim.sql`, `package.json` | Adds a migration test on local PostgreSQL (11 groups). |

The migration does the following:
- **Secret:** generates a random 256-bit secret inside the database and stores it only in Vault as `notify_signup_webhook_secret`. Nobody ever copies or types it.
- **Check function:** adds `verify_notify_signup_secret(text)` (service_role only; digest comparison).
- **Trigger function:** adds `notify_signup_webhook()`, an AFTER INSERT trigger on `auth.users`.
  - It sends only `id`, `email` and `created_at`, plus the secret header, through `pg_net`.
  - It never raises, so it can never block a sign-up.
- **Old trigger:** drops "on-user-signup" in the same transaction. If the role isn't allowed to drop it, the migration warns and keeps going (Dashboard fallback in §5).

Why a dedicated webhook secret rather than an `sb_secret_` API key:
- Supabase's guidance (migrating-to-new-api-keys, "Database Webhooks and pg_net") is to never hardcode keys in SQL or webhooks, and to read them from Vault at call time. This fix follows that.
- The caller here only needs to prove it is the trigger. A secret API key bypasses RLS for the whole database. The dedicated secret grants nothing except this one function.
- It needs no Dashboard secret handling, and it does not depend on the legacy keys.

Unchanged: sign-up itself, `handle_new_user` (profile seeding), the Brevo contact (list + FIRSTNAME), the onboarding trigger, the admin alert and duplicate protection (`signup_notifications`), and Stripe and every other function.

## 3. Tests

| Check | Where | Result |
|---|---|---|
| Unauthorised: no header, wrong secret, anon Bearer, secret in `Authorization` → 401, no Brevo call, no claim | Deno, real function code | PASS |
| Secret check errors or Vault secret missing → 401, nothing sent | Deno | PASS |
| Authorised trigger payload → Brevo contact (list + FIRSTNAME only) + exactly one admin alert | Deno | PASS |
| Duplicate delivery → no second admin alert; contact upsert idempotent | Deno | PASS |
| Logs contain neither the secret nor the request body | Deno | PASS |
| New tests fail against the old function (negative control) | Deno | PASS |
| Old trigger dropped, new trigger added, `handle_new_user` kept | Local PostgreSQL 16, real migration | PASS |
| One sign-up → profile seeded + one pg_net call: id/email/created_at only, secret header, no JWT, no password hash/token/metadata | Local PostgreSQL | PASS |
| Secret check: exact match only; anon/authenticated denied; service_role allowed | Local PostgreSQL | PASS |
| pg_net failure, or missing Vault secret → sign-up and profile still succeed | Local PostgreSQL | PASS |
| Re-running the migration keeps the same secret and a single trigger; Test URL override works | Local PostgreSQL | PASS |
| Non-owner role: old-trigger drop warns instead of aborting | Local PostgreSQL | PASS |
| `auth.html` sign-up, desktop 1280 and mobile 390 | Chromium, Supabase mocked | PASS on both. Main called notify-signup 2×; the branch calls it 0×. "Check your email" screen shown; no page errors. |
| All other Deno suites (stripe-webhook 74, checkout 50, billing-status 26, account-events 6, manage-subscription 8) | Deno | PASS (unchanged) |
| No JWT or API key in the branch diff or the migration | grep and test | PASS |

Verified on CLPeasy Test (real Supabase), 24 Oct 2026. Test has no `BREVO_API_KEY` (checked as a boolean only), so no live Brevo data could be touched:

| Check | Result |
|---|---|
| Migration applied as `postgres`: old "on-user-signup" (stand-in) **dropped without needing the Dashboard fallback**; `notify_signup_webhook` + `on_auth_user_created` remain | PASS |
| Vault secret created (64 hex chars); anon/authenticated cannot execute the check; service_role can; wrong secret false, right secret true | PASS |
| `notify-signup` (branch, `dfc7477`) deployed to Test, `verify_jwt: false` | done |
| No header / wrong secret / legacy anon Bearer + apikey / publishable apikey / secret sent in `Authorization` → 401 each, no claim, no Brevo call | PASS |
| Real sign-up through Auth API → user + profile created → trigger → notify-signup authenticated → 200, one claim, reached the Brevo step (Brevo 401: no key in Test, expected) | PASS |
| Same authorised payload re-sent → 200, admin alert skipped as duplicate, still one claim | PASS |
| Function logs: only `user_id` lines; no request body, no `encrypted_password`, no secret header captured in edge-log attributes | PASS |
| Existing auth: password sign-in returned a session; JWT-protected `billing-status` accepted it (200) | PASS |
| Cleanup: test user, profile, claim, pg_net responses and stand-in trigger function removed; Test back to 3 users | done |

Left in Test on purpose: the migration, Vault entries `notify_signup_webhook_secret` and `notify_signup_function_url` (Test URL, not secret), `notify-signup` v1 and a boolean-only `qa-clp001-env-check` function (the connector cannot delete functions; delete it in the Dashboard when convenient).

Not verified: the real production Brevo contact, welcome email and admin alert (Test has no Brevo key) — covered by §5 step 5. `npm test` as a whole stops at an unrelated suite needing `jsdom`, which this sandbox could not install (same on main).

## 4. Test-environment plan (completed 24 Oct 2026, see §3)

1. In Test, deploy a boolean-only env check and confirm whether `BREVO_API_KEY` is set. If it is live, use a dedicated test email, or stop.
2. In Test, apply the migration. Then create the Vault entry `notify_signup_function_url` pointing at Test's own URL (this is not a secret). Deploy `notify-signup` from the branch with `verify_jwt: false`.
3. Through `pg_net` from Test SQL:
   - POST with no header, with a wrong secret, and with the anon Bearer. Expect 401 each time.
4. Create one Test user and expect all of the following:
   - A profile row.
   - One 200 notify-signup call in the logs.
   - One `signup_notifications` row.
   - No custom header value in the edge logs.
5. Re-send the same authorised payload. Expect no second alert.
6. Sign in with an existing Test user, and run a billing-status call to confirm auth is unaffected.
7. Clean up the Test users. Leave the Test notify-signup in place.

## 5. Production release steps (each needs owner approval)

Order matters: the migration first, the function second. The old function ignores the new header, so there is no gap.

1. **Merge.** Merge the PR to `main` with `[skip netlify]` in the title for commit 1. Batch the `auth.html` commit with the next approved front-end release, or include it; it is safe either way.
2. **Apply the migration** to production (`supabase db push`, or apply via MCP). Check that it logged no warning.
3. **Verify, read-only.**
   - Run `select tgname, tgenabled from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;`
   - Expect `notify_signup_webhook` and `on_auth_user_created` only.
   - If "on-user-signup" is still listed, delete it in **Dashboard → Database → Webhooks**. Both triggers firing briefly is harmless: one admin alert, an idempotent Brevo upsert.
4. **Deploy the function:**
   `supabase functions deploy notify-signup --project-ref qvkosdqcryrcfbjtaxic --no-verify-jwt --use-api`
5. **Smoke test.**
   - One real trial sign-up with an address you control. Expect a Brevo contact, a welcome email and one admin alert.
   - Logs should show one `notify-signup` 200 from `pg_net`, and no 401s.
   - A curl POST to notify-signup without the header must return 401.
6. **Confirm the old key is gone from the database:**
   - Run `select count(*) from pg_trigger where pg_get_triggerdef(oid) ~ 'eyJ';`. Expect 0.
   - Do not print any definitions.

## 6. Rollback

- **Function:** redeploy the previous version (`main@5c6dd9d` copy of `supabase/functions/notify-signup/index.ts`) with `--no-verify-jwt`. It ignores the header, so it works with either trigger.
- **Trigger:**
  - Run `drop trigger notify_signup_webhook on auth.users;`. Sign-ups keep working; only the notifications pause.
  - To restore notifications without reinstating a hardcoded key, recreate the webhook in Dashboard → Database → Webhooks. Point it at notify-signup with **no** auth header; the old function accepts it.
  - Do **not** recreate it with "add auth header with service key".
- **auth.html:** revert the commit (it is self-contained).
- The Vault secret can stay; it is unused if the trigger is removed.

## 7. Legacy credential retirement plan (nothing rotated, revoked or disabled yet)

Supabase is deprecating the legacy `anon` and `service_role` keys by the end of 2026. Do not "roll the JWT secret": that would sign every user out and break all pages at once. Instead, move everything to the new keys, then deactivate the legacy keys. That step is reversible.

**Still depending on legacy keys (24 Oct 2026):**

| Dependency | Legacy key | Migrate to |
|---|---|---|
| 14 pages embed the legacy anon JWT (see list below) | anon | `sb_publishable_` key (already exists, enabled) |
| GitHub Actions secret `SUPABASE_ANON_KEY` (`daily-health-check.yml`) | anon | publishable key |
| Edge functions reading `SUPABASE_SERVICE_ROLE_KEY` (see list below) | service_role | `JSON.parse(SUPABASE_SECRET_KEYS)['<name>']`, ideally one named secret key per function group |
| Edge functions reading `SUPABASE_ANON_KEY` (see list below) | anon | `SUPABASE_PUBLISHABLE_KEYS` |
| "on-user-signup" webhook | service_role (embedded) | removed by this fix |
| Netlify env vars, the local ai-review tooling, Codex/Claude Code configs, local scripts | not yet checked | owner to check |

The 14 pages:
- account, auth, beta-feedback, builder, checkout, dashboard, index, knowledge, monitor, my-labels, packagemonitor, plan-picker, pricing, print.

Edge functions reading `SUPABASE_SERVICE_ROLE_KEY`:
- In the repo: notify-signup, stripe-webhook, create-checkout-session, manage-subscription, clp-account-events, billing-status, create-portal-session.
- Deployed only (not in the repo): clp-search (confirmed). clp-wizard, finn-chat, beta-tester-email, admin-package-monitor, diag-stripe-price-lookup and send-* still need checking.

Edge functions reading `SUPABASE_ANON_KEY`:
- manage-subscription, clp-account-events, billing-status, create-checkout-session, create-portal-session.

Not dependent on the CLPeasy legacy keys:
- Crafty Mouse Gifts pages use CMG's own project key. `cmg-checkout` and `cmg-contact` are called without CLPeasy keys.
- User sign-in sessions: user JWTs keep working when the legacy API keys are deactivated.

**Separate item:** Vault holds `beta_tester_email_token`.
- It is an `sb_secret_` key stored on 24 Jul 2026, read only by `notify_beta_tester_email()`, whose trigger is disabled. This is the key from the July audit.
- With owner approval: check in Dashboard → API Keys whether that secret key is still active. If it is, revoke it, delete the Vault entry, and drop the unused function. Nothing live uses it.

**Order:**
1. Release this fix (§5). This removes the only database-held legacy key.
2. Front end: swap the anon JWT for the publishable key on all 14 pages in one batched release, and update the GitHub Actions secret.
   - Callers of `verify_jwt: true` functions already send the user's `session.access_token`, so they are unaffected.
   - `builder.html` sends the key as Bearer to `clp-wizard` (`verify_jwt: false`). Test that call specifically.
   - Test, then deploy.
3. Edge functions: create named secret keys and switch each function to `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS`. Do this per function in Test first, then production.
   - Retire unused functions instead of migrating them: finn-chat (Finn was retired), diag-stripe-price-lookup, beta-tester-email.
4. Check every other holder: Netlify env, local tools, CI.
5. Deactivate the legacy keys in Dashboard → Settings → API Keys (reversible). Watch the logs for 401 / "Invalid API key" for 48 hours.
6. Later and separately: migrate to JWT signing keys.

**Test per dependency:**
- Pages: sign-up, sign-in, Google sign-in, Builder load/save/download, My Labels, Account billing panel, Pricing checkout to the Stripe page (no purchase), Knowledge search, Support form.
- Functions: one representative call each, checking the logs.
- CI: a manual run of the health-check workflow.

**Recovery:**
- If anything breaks after step 5, re-activate the legacy keys in the same Dashboard screen, fix the missed caller, and repeat step 5.
- Steps 2 and 3 are code reverts.

**Owner actions in the Dashboard (all need approval):**
- Approve the Test deployment (§4).
- Approve the production migration and function deploy (§5), plus webhook deletion only if the migration could not drop it.
- Create named secret keys.
- Revoke the July `sb_secret_` key if it is still active.
- Deactivate the legacy keys.

## 8. Unrelated findings (not changed)

- `finn-chat` is still deployed and ACTIVE although Finn was retired.
- `new_user_alert.sql` (repo root) refers to a non-existent `notify-new-user` function.
- `npm test` stops at a suite needing `jsdom`, which this sandbox could not install (same on main).
