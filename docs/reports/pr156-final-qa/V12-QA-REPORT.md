# PR #156 — v12 candidate QA report (26 Sep 2026)

Branch `feature/pay-as-you-go-downloads`. Code commit `a86d0b8` (v12). Not merged; production,
live Stripe and live Brevo were not touched.

## What v12 contains (owner decisions C1, C3–C6)

| Decision | Change | Where |
|---|---|---|
| C1 | A watermarked (trial) download is not re-issued free once the customer can download clean: charged once, clean. The 7 days are fixed from the last charged download. The annual refill runs before the re-download decision (fixes the corner case in the unapplied B1 proposal). The Builder label key now includes shape and physical size. | `supabase/migrations/20260929000000_redownload_upgrade_and_fixed_window.sql`, `builder.html` `computeLabelKey()` |
| C3 | A reopened label restores the post-extraction Step 3 lock. Evidence: the saved `hazardFromExtraction` flag, or for older labels a non-empty saved `sdsSignal` (written only by a successful extraction and emptied by Clear). Manual hazard data stays editable, and the lock never carries over to another label. | `builder.html` |
| C4 | The Builder has no separate fragrance/SDS identity field (the supplier grid is not populated and `S.supplier` is never set by the UI), so the product name is the identity checked. Renaming a label that carries hazard data requires an answer: "Same fragrance oil and SDS: keep hazard data" (one click), or "Different fragrance or SDS: clear hazard data". Clearing removes every H/EUH/EUH208, P, P280, pictogram, signal word and sensitiser entry, and the SDS must be extracted again. Until answered, Save, every download and leaving Steps 2/3 are blocked. Case, spacing and punctuation-only edits, and naming the product for the first time, do not trigger it. | `builder.html` |
| C5 | Headings "✓ Label downloaded" (all Builder exports) and "✓ Print sheet downloaded" (Composer). "Printing tips →" kept. | `builder.html`, `print.html` |
| C6 | Builder PDF opens its print window inside the click, before consuming a download (the Composer's approach). A blocked pop-up costs nothing and shows the existing pop-up warning. A refused download closes the window. Failed-generation accounting is unchanged. | `builder.html` |
| Housekeeping | Removed the stale root copies `create-checkout-session.ts` and `stripe-webhook.ts`. Nothing referenced them, and `_redirects` already 404s `*.ts`. Canonical sources: `supabase/functions/*`. | repo root |

## Tests

- **Local, at `a86d0b8`:**
  - 60/60 Node test files pass (`evidence/logs/test-suite-run-3-v12.txt`). One sub-check of
    `correction-batch-ghs-asset-framing.js` is SKIPPED because Python/Pillow isn't available here;
    that is an existing limitation.
  - 83/83 Deno Edge Function scenarios pass, and `npm test` passes.
  - New `tests/hazard-source-integrity.js` covers C3 and C4.
  - `tests/download-entitlement-sql.js` has 109 groups, including the C1 scenarios and the annual
    corner case.
  - `tests/post-download-print-guidance.js` has 19 groups, including the C6 cases: pop-up blocked,
    retry, no label key, and refused download.
- **Real Chromium with a genuine `window.open`:** with pop-ups allowed, the pre-opened window
  receives the label (blob URL) and is charged once. With pop-ups blocked: 0 charges and the
  warning is shown.
- **CLPeasy Test database (rollback-only):**
  - Run 1, baseline: 32 PASS + 1 INFO, 0 FAIL.
  - Run 2, after the C1 migration: 38 PASS, 0 FAIL.
  - No QA data persisted.
  - Raw outputs: `test-db-rollback/`.

## CLPeasy Test environment changes made

- Migration `redownload_upgrade_and_fixed_window_pr156_c1` applied to CLPeasy Test only. The
  function body matches the repo migration, and grants are unchanged.
- `qa-sandbox-price-check`: temporarily redeployed as a read-only C7 check (see
  `c7-sandbox-webhook-verification.md`), then returned to the 410 stub. **It can't be deleted with
  the available tools; delete it in the Supabase Test dashboard.**
- `pg_net` was enabled for a single C7 call, then dropped again.

## v12 deployment and smoke test

- Built with `build/build-v12.py` from `a86d0b8`. The rewrite counts are identical to v11. It
  contains no production project reference, no live price IDs and no clpeasy.com PAYG return
  addresses. Checksums are in `build/`.
- Deployed to the isolated Test site only: `clpeasy-pr156-payg-test-v10.netlify.app`, deploy
  `6ab7f62ca041424c0e1209c8`, 16:43 UTC. Netlify reports that only `builder.html`, `print.html`
  and `TEST-ENVIRONMENT.txt` changed against the previous v10 deploy (`6ab7c6b1658a62c12b9d37a7`,
  still reachable by permalink for rollback).
- Every deployed JS and asset file matches the v12 build byte-for-byte. Netlify's pretty-URL
  processing rewrites HTML link `href`s (e.g. `/dashboard`); the previous v10 deploy has the same
  rewriting, so this is existing site behaviour.
- **Browser smoke test of the deployed site** (desktop 1366 and mobile 390):
  - 7 pages × 2 viewports: HTTP 200, `[TEST]` title, noindex, no horizontal overflow, no console
    errors.
  - Builder: extraction lock; saved flag; reopen lock; the size-based label key; the C4 review
    (three notices, download blocked, keep resolves it); PDF delivered into the pre-opened window
    with one charge and the "✓ Label downloaded" guidance.
  - Pop-up blocked: 0 charges and the warning is shown.
  - The Composer serves "Print sheet downloaded".
  - Results: `evidence/v12/deployed-smoke-results.json`.
- **Limitation:** this container can't reach `*.supabase.co`, so the smoke test used the deployed
  page code with a stubbed backend in the browser. It is **not** a signed-in end-to-end test
  against CLPeasy Test auth and the database. Deployed files were fetched with TLS verified by
  curl against the agent proxy CA; Chromium's own trust store is not set up for the proxy.

## Remaining before release

- **Sandbox end-to-end testing, signed in, on the Test site:**
  - PAYG purchase;
  - both subscriber top-ups;
  - Easy Start and Easy Pro monthly with the 2026 coupon, plus the annual plans;
  - return pages;
  - C1 upgrade re-download;
  - C4 on real saved labels;
  - C6 pop-up behaviour in Safari.
- **Renewal / test-clock end-to-end:** first add `invoice.paid`,
  `customer.subscription.updated` and `customer.subscription.deleted` to the Test Sandbox
  endpoint (C7 proposal B).
- **C7 proposal A (owner):** decide what to do with the Sandbox endpoint that points at the
  production `stripe-webhook`.
- **Real Safari/WebKit:** not available here.
- **Production configuration (not started):**
  - the migrations up to `20260929000000`;
  - the Edge Functions;
  - `entitlement.js` deployed with the pages;
  - secrets: the PAYG price, the two coupons and the paid Brevo list.
- **C2, overdue payments:** recorded as a separate, existing billing-policy issue, unchanged
  (Stripe's `past_due` state never reaches `profiles`).
- **Ex-Pro "Easy Start (Cancelled)" label:** low severity, existing, unchanged.
- **Label-key change:** existing labels get a new re-download key (it now includes size), so each
  existing label's first download after release is charged, then the normal 7-day rule applies.
