# Website & Link Health Monitor — implementation evidence (6 Oct 2026)

Branch: `feature/site-link-health-monitor` (from `main` @ `02b6c08`).
Status: **code + tests complete; NOT yet deployed to Supabase production** (see "Deployment").

## What it does

Once a week (Mondays 03:17 UTC) Supabase itself crawls the public clpeasy.com pages,
finds every link, checks each destination and stores the results. `monitor.html` shows
them in a new **🔗 Website & Regulatory Links** section, with a secure **Check links now**
button. It runs entirely on the existing Supabase project: no AI, no paid service, no
Netlify scheduled function, and it never edits the website.

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/20261006000000_site_link_health_monitor.sql` | Tables `site_links`, `link_check_runs`, `link_check_history`; RLS; run-lock + retention functions |
| `supabase/migrations/20261006000100_site_link_health_schedule.sql` | Enables `pg_cron`, creates the Vault token, token-check function, weekly job |
| `supabase/functions/site-link-health/index.ts` | Edge Function (auth, run, results, persistence) |
| `supabase/functions/site-link-health/checker.ts` | Crawler, link checker, SSRF guard, classification (pure logic) |
| `monitor.html` | New section + summary integration; Refresh also reloads link results |
| `tests/deno/site-link-health.test.ts`, `tests/deno/run-site-link-health.js`, `tests/deno/link-health-import_map.json`, `tests/deno/stubs/link-health-supabase.ts` | Offline Edge Function tests |
| `tests/site-link-health-sql.js`, `tests/sql/link-health-shim.sql` | Migrations applied to a throwaway local PostgreSQL |
| `tests/site-link-health-monitor-ui.js` | Real `monitor.html` in Chromium with network mocked; writes the screenshots here |
| `package.json` | Adds the three new tests to `npm test` |

## Edge Function: `site-link-health`

- `POST {"action":"run"}` — start a scan. Allowed for the weekly cron job (Vault token) or the admin.
- `GET ?action=results` — results for monitor.html. Admin only.
- The request body is never used for URLs. Only links discovered on clpeasy.com are checked.
- Returns 202 immediately and finishes in the background (`EdgeRuntime.waitUntil`).
- Deploy with **verify_jwt = true** (cron sends the public anon key so the gateway accepts it; the real check is the Vault token).

## Schedule

`pg_cron` job `site-link-health-weekly`, `17 3 * * 1` (Mondays 03:17 UTC), using `pg_net` to POST to the function.
The token is generated inside the database and stored in Vault (`site_link_health_cron_token`) — same
pattern as the existing `notify_beta_tester_email` trigger. It never appears in the repo or the browser.

Overlaps: a unique index allows only one `running` run. A run stuck for >15 min is marked `failed`
before the next one starts. Manual checks are limited to one per 10 minutes.

## Classification

| Result | Status |
|---|---|
| 2xx | HEALTHY |
| 3xx → 2xx, ordinary link, all hops 301/308 | REDIRECTED + "Safe replacement available" (shown, never applied) |
| 3xx → 2xx with a temporary hop (302/307) | REDIRECTED, no replacement suggested |
| 3xx → 2xx, regulatory link | REDIRECTED + review required ("Official redirect recorded — verify") |
| 404 / 410 (confirmed with GET) | BROKEN; regulatory → REVIEW_REQUIRED |
| timeout, network error, 403, 429, 5xx… | WARNING; after 3 consecutive weekly failures → BROKEN (regulatory → REVIEW_REQUIRED) |
| unsafe destination (private address etc.) | WARNING "Not checked — blocked", never requested |

Regulatory domains (host or subdomain): `gov.uk` (incl. HSE, OPSS on GOV.UK, legislation.gov.uk, IPO),
`ico.org.uk`, `businesscompanion.info`, `echa.europa.eu`, `eur-lex.europa.eu`, `unece.org`, `osha.gov`, `gov.au`, `canada.ca`.
Nothing searches for, guesses or writes a replacement regulatory URL.

## Crawl rules

Starts at `https://clpeasy.com/`; follows only `clpeasy.com` / `www.clpeasy.com` HTML pages; max 60 pages,
depth 4, 400 destinations, 120 s budget (a run that hits a limit is stored as `partial` and does not retire links).
Not crawled (still checked as destinations): builder, account, dashboard, my-labels, checkout, auth, print, plan-picker.
Never requested: `mailto:`, `tel:`, `javascript:`, fragment-only links, Stripe checkout/billing, Supabase endpoints,
`auth.clpeasy.com`, logout actions, images/media/archives/fonts. HEAD first, GET fallback; 10 s timeout; one retry
for network errors; max 5 redirects; 4 parallel requests, ≥400 ms between requests to the same host;
User-Agent `CLPeasyLinkHealth/1.0 (+https://clpeasy.com; weekly website link check)`.

## Security / RLS

- RLS enabled on all three tables with **no policies**; all privileges revoked from `anon` and `authenticated`.
  Customers cannot read or list anything. Only the service role inside the Edge Function can.
- Admin check is server-side: a valid Supabase sign-in whose email is on the same allowlist as the existing
  `admin-package-monitor` function (`michaela.feeley@googlemail.com`; overridable with the optional
  `LINK_HEALTH_ADMIN_EMAILS` function secret). The monitor's existing client-side password gate is unchanged
  and is *not* relied on for this data.
- monitor.html contains only the public anon key (already published in the site). No service-role key, no token.
- SSRF: http/https only, ports 80/443 only, no credentials in URLs, rejects localhost/`.local`/`.internal`/metadata
  hostnames, loopback, RFC1918, CGNAT, link-local (incl. 169.254.169.254), multicast/reserved, IPv6 loopback/ULA/link-local/
  v4-mapped. Checked for literal IPs and for every DNS-resolved address, on every redirect hop.
  Known limitation: the DNS check and the fetch resolve separately (theoretical DNS-rebinding window); impact is
  limited because only links found on clpeasy.com are ever requested and no response body is returned to the caller.
- CORS `*` is safe here because authorisation is a bearer token, not a cookie (monitor.html is opened locally —
  `_redirects` deliberately 404s it on clpeasy.com).

## Data growth

`site_links`: one row per (page, destination) — roughly 100–200 rows, updated in place.
`link_check_history`: only status *changes* (≈ first run's rows, then a handful a week); pruned after 400 days.
`link_check_runs`: 52 rows/year; pruned after 400 days. Retired links deleted after 180 days.

## Invocation volume

Weekly: 1 Edge Function call (+ 1 pg_cron job run). Monthly: ~4–5, plus any manual checks (max 6/hour).
Outbound requests per run: ~15 page GETs + ~1–2 requests per destination (≈ 60–150 total).
monitor.html: 1 results call per open/refresh, plus one every 5 s only while a manual check is running.
Well inside the Supabase free-tier Edge Function allowance (500k invocations/month).

## Tests (all offline)

- `node tests/deno/run-site-link-health.js` — 102 checks (crawler, normalisation, HEAD→GET, 301/308, 302, 404, 410,
  timeout/retry/threshold, duplicates, relative/fragment/mailto/tel, loop prevention, max-page guard, regulatory review,
  regulatory redirect not replaced, SSRF incl. redirect-to-private, auth 401/403 for anon/customer/anon-key/wrong token,
  cron cannot read results, browser-supplied URLs ignored, rate-limit 429, overlap 409, stuck-run recovery, persistence,
  first-failed preserved, transition-only history).
- `node tests/site-link-health-sql.js` — 36 checks on a local PostgreSQL 16 (RLS, privileges, run lock, Vault token,
  cron job definition, idempotent re-apply, retention).
- `node tests/site-link-health-monitor-ui.js` — 34 checks in Chromium (existing monitor intact, sign-in, results,
  filters, healthy toggle, escaping, summary integration, Check links now states, 403 handling, mobile no-overflow).

## Screenshots (mocked data)

`monitor-links-desktop.png`, `monitor-summary-desktop.png`, `monitor-links-mobile.png`, `monitor-summary-mobile.png`.

## Deployment (not yet done — needs owner approval)

1. Apply `20261006000000_site_link_health_monitor.sql`, then `20261006000100_site_link_health_schedule.sql`.
2. Deploy Edge Function `site-link-health` (files `index.ts`, `checker.ts`), verify_jwt = true.
3. Open monitor.html locally, sign in with the admin account, press **Check links now**, review results.

## Rollback

```sql
select cron.unschedule('site-link-health-weekly');
drop function if exists public.site_link_health_verify_cron_token(text);
drop function if exists public.site_link_health_begin_run(text);
drop function if exists public.site_link_health_prune();
drop table if exists public.link_check_history, public.site_links, public.link_check_runs;
delete from vault.secrets where name = 'site_link_health_cron_token';
-- optional, only if nothing else uses it: drop extension pg_cron;
```
Then delete the `site-link-health` Edge Function in the Supabase dashboard and revert the PR
(monitor.html returns to its previous state). No other table, function or page is affected.
