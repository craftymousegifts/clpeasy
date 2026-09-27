# PR #156 — v13 candidate QA report (26 Sep 2026)

Branch `feature/pay-as-you-go-downloads`. Code commit `6d3ea7f` (v13). Not merged; production,
live Stripe and live Brevo were not touched.

## v13 changes (on top of v12)

- **C4, expanded.** The hazard data's source is now the product name, product type and fragrance
  load recorded when it was extracted, entered or reopened.
  - **Name change:** unchanged "Same fragrance oil and SDS: keep" / "Different fragrance or SDS:
    clear" decision.
  - **Product type or fragrance load change** (including adding a load where none was entered):
    "I have re-checked it: keep hazard data", which also unticks the Step 3 and final Step 5
    confirmations so both must be given again; or "Clear hazard data and extract again".
  - Until dealt with: Save, every download, and leaving Steps 2/3 are blocked.
  - Cosmetic edits are not a change: name case/spacing/punctuation, or load formatting such as
    "10%" vs " 10 % ".
- **C1, backward compatibility** (migration `20260930000000_redownload_legacy_key_transition.sql`).
  - `consume_download(p_label_key, p_legacy_label_key default null)`; the Builder sends both keys.
  - A record under the label's old `name::type` key keeps its ORIGINAL 7 days for the first
    size-aware download of that label.
  - That record is claimed (removed), so no other size can use it and it can't be reused. It is
    never extended, and it is ignored unless it is exactly this label's own old key.
  - The path ends by itself 7 days after release, because the Builder no longer writes old-format
    keys.
  - The one-argument signature was dropped so PostgREST sees exactly one function. The Composer's
    `{p_label_key:null}` call is unaffected.

## Automated results (local, `6d3ea7f`)

- 60/60 Node test files pass (`evidence/logs/test-suite-run-4-v13.txt`). This includes 126 SQL
  groups on real migrations and the extended `hazard-source-integrity.js`.
- 83/83 Deno scenarios pass, and `npm test` passes.
- The one existing skip remains: an image sub-check that needs Python/Pillow.

## CLPeasy Test database

- Transition migration applied to CLPeasy Test only (`redownload_legacy_key_transition_pr156_v13`).
  The function matches the repo, and grants are unchanged.
- Rollback-only run 3: **42 PASS, 0 FAIL**, with no QA data left behind
  (`test-db-rollback/run-3-v13-legacy-transition.txt`).

## v13 deployment and smoke test

- Built from `6d3ea7f` with `build/build-v13.py`. The rewrite counts are identical to v12, and it
  has no production refs, live prices or clpeasy.com PAYG returns.
- Deployed to `clpeasy-pr156-payg-test-v10.netlify.app`, deploy `6ab8022b2dcca9d36238901a`.
- All 15 non-HTML files are byte-identical to the build. The HTML differs only by Netlify's
  existing pretty-URL link rewriting (also present on the v10 and v12 deploys).
- **Browser smoke test, desktop and mobile** (`evidence/v13/deployed-smoke-results.json`):
  - 7 pages: HTTP 200, `[TEST]`, noindex, no overflow, no console errors.
  - Builder: extraction and reopen lock, and the C4 name review.
  - C4 fragrance-load change: blocked, re-check wording, verification reset.
  - C4 product-type change: blocked; clear removes all hazard data.
  - PDF: pre-opened window, one charge, "✓ Label downloaded". Pop-up blocked: 0 charges.
  - The RPC receives both `p_label_key` (size-aware) and `p_legacy_label_key`.
  - The Composer serves "Print sheet downloaded".
- **Limitation:** the backend was stubbed in the browser, because this container can't reach
  `*.supabase.co`.

## Not done in this session (needs owner action or permission)

- **C7 webhook changes, the signed-in Sandbox E2E and the Stripe Test Clock** were not performed.
  - This container can't reach `api.stripe.com`, `checkout.stripe.com` or `*.supabase.co`.
  - The only route was a temporary, token-guarded Test function using the Sandbox Stripe secret
    (to update webhooks, create test users and complete Sandbox payments).
  - Preparing that harness was **blocked by the session's automated safety check**, so it was not
    attempted by any other means.
  - Endpoint facts verified earlier (read-only) are in `c7-sandbox-webhook-verification.md`.
- The `qa-sandbox-price-check` 410 stub is still in CLPeasy Test. It needs manual deletion in the
  dashboard; no delete tool is available here.

## Findings

- **Netlify HTML post-processing on the Test site** rewrites two `onmouseover`/`onmouseout`
  attributes with `\'` inside single quotes, which breaks those two hover effects (cosmetic only).
  It is existing behaviour: identical on the original v10 deploy. Check whether the production
  Netlify site has the same asset-optimisation setting.
- **Label-key transition:** only the first size downloaded after release inherits an old grace
  period (the conservative choice, so no extra downloads are granted).
