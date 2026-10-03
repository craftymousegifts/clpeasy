# Release handover: fragrance-% supplier-document check (3 Oct 2026)

**Status:** on the Test preview only, for owner review. **Not approved for production.**
- PR #203 is frozen and must not be closed until this work is approved and deployed.
- No database, Stripe or Supabase function change is involved.

Detailed design and evidence: `docs/reports/SDS-FRAGRANCE-PERCENTAGE-REVIEW-2026-10-03.md`.

## Identifiers
| Item | Value |
|---|---|
| Branch | `fix/sds-document-applicability` |
| Code under review | `d6b9c54` (this handover is committed on top and changes docs only) |
| Base | production `main` `4bc3e9a`, merged in at `c9975fb` (keeps the published pricing wording) |
| Test preview | https://clpeasy-pr156-payg-test-v10.netlify.app, site `7824da4f-aed8-43ba-845c-bd214c1bbf38`, deploy `6ac14d2596159176471b3ab9` (v28, built from `d6b9c54`) |
| Previous Test deploys | v27 `6ac1456c4f568ac9bc95e171` (`f6fa629`); v26 `6ac14130e4bf167177470af5` (`1e328d7`) |
| Production now | `main` `4bc3e9a`, Netlify deploy `6ac14342948ac900080a6c9c` |
| **Rollback after a release** | Republish Netlify production deploy `6ac14342948ac900080a6c9c` (`main` `4bc3e9a`) |

## Release scope (only after approval)
- **Fast-forward `main`** from `4bc3e9a` to the approved branch head.
- **Site files changed:**
  - `builder.html`
  - `print.html`
  - `my-labels.html`
  - the new `sds-doc-check.js`
- **Everything else is tests and docs.** Netlify publishes the site from `main`.
- **Unchanged:**
  - `label-render.js` (byte-identical);
  - the approved homepage labels and artwork;
  - Supabase, Stripe and the database;
  - prices.

## 1. Written-confirmation switch (decision required before release)
- **Where:** `SUPPLIER_CONFIRMATION_ACCEPTED` in `sds-doc-check.js`. It is `true` at `d6b9c54`, for
  review on Test.
- **When `true`:** Step 3 offers "My supplier has confirmed in writing … at the exact percentage I
  use".
  - **What the maker records:**
    - the confirmed %, which must **exactly** equal the maker's % (no tolerance; ranges and "up to"
      are refused);
    - the product, which must cover the maker's product group (candles and wax melts are separate);
    - the supplier, the date (valid, not in the future) and the document it refers to.
  - **Saved with the label:** the record is saved and restored, and is part of the export
    confirmation. A change means going through Step 3 again.
  - **Not presented as proof:** the screen says CLPeasy can't see or check the confirmation.
  - **Messages:** the rounding and range messages point to this route.
- **When `false`:**
  - the answer is hidden, and a saved one is not accepted;
  - the rounding and range messages say only "Ask your supplier for GB CLP information for your
    [product] at X%", so no message gives an instruction the form can't support.
- **Both settings are tested:** `tests/sds-document-applicability.js`, in the "written supplier
  confirmation" group, which evaluates the module with the switch set to `false`.
- **Decision:** whether a supplier's written statement is acceptable evidence under CLPeasy's
  policy. It has not been checked by a legal adviser. **If you want advice first, set the switch to
  `false` before release.** Nothing else depends on it.

## 2. Range-coverage decision (unresolved)
- **What CLPeasy does now:** a document stating a range or "up to" % ("8–10%", "up to 10%", "max
  10%") is **not accepted** as a document percentage (`doc-pct-range`). CLPeasy does not decide
  whether a range covers a product.
- **The only current route:** a written supplier confirmation naming the maker's **exact** %, and
  only if the switch above is `true`.
- **Still open:**
  - whether an explicit supplier statement of range coverage should ever be accepted directly;
  - if so, how it would be recorded.
- **Unchanged rule:** a maker's own assumption that a higher-% document covers a lower % is always
  blocked. No acknowledgement or override exists.

## 3. Primary-source / legal verification (outstanding)
- **Not opened:** this environment's network policy blocks the official texts:
  - legislation.gov.uk;
  - eur-lex.europa.eu;
  - echa.europa.eu;
  - hse.gov.uk;
  - businesscompanion.info;
  - britishcandles.org;
  - reachonline.eu.
- **The legal points are reported by secondary sources** and must be confirmed against the primary
  text. They include:
  - mixture classification by concentration thresholds;
  - specific concentration limits;
  - the EUH208 elicitation limits: 0.1% for Category 1/1B, 0.01% for 1A, one tenth of an SCL.
- **GB text not compared:** whether the GB CLP text matches the EU text cited has not been checked.
- **Retried in a later session, still blocked:** the same official sites plus the archive mirrors
  (web.archive.org, archive.org, publications.europa.eu, op.europa.eu, data.europa.eu).
  - The point-by-point checklist, with links and article numbers to confirm, is in
    `PRIMARY-SOURCE-CHECKLIST.md`.
  - **Status: NOT VERIFIED.**
- **What the implementation is:** CLPeasy's conservative evidence policy. It is **not legally
  verified**, and consistent answers do not prove that a supplier document or confirmation is
  suitable.

## 4. Impact on existing saved labels
- **Every label saved before this release is a draft** until the maker completes Step 3 once,
  because it has no document confirmation. That includes all current customers' labels.
- **Saved designs are not modified.**
- **Drafts can be** opened, edited and saved (the button confirms "✎ Draft saved"). They **cannot
  be** downloaded or printed in the Builder or the Composer until the check is done.
- **Guidance shown:**
  - **Builder:** a Step 5 notice with a "Go to Step 3 (Hazards)" link.
  - **My Labels:** a "Draft: document check needed" tag.
  - **Composer:** a list marker, plus a sheet notice naming the labels.
- **Recovery, verified in real Chromium:**
  1. open the label;
  2. Step 3;
  3. Step 4, then Step 5;
  4. save (it updates the same label);
  5. reopen it (it is ready to download);
  6. add it to the Composer.

  Design and fine-tune settings are kept.
- **Also blocked for new labels:**
  - a document for a different, rounded or range %, a different product, or a concentrated oil;
  - lifted only by supplier information for the exact %, or by a written confirmation if accepted.
- **Customer notice:** a draft email and in-app banner are in `CUSTOMER-NOTICE-DRAFT.md`. It
  separates what the law requires from CLPeasy's policy, and has version A or B of the
  written-confirmation section depending on the switch. It has not been sent or published.

## 5. Untested: the real signed-in journey
- **Not reachable:** this environment cannot reach CLPeasy Test Supabase (`*.supabase.co`).
  - **Retried in a later session:** `wwjhvpphlbgtywxskqnf.supabase.co` and `cdn.jsdelivr.net`
    (which serves the Supabase library) were both rejected by the egress proxy.
  - **Credentials:** even with network access, a real sign-in needs a Test account login. None is
    available to the agent, and none should be invented.
- **How it was tested instead:**
  - The Builder and Composer were tested as a **signed-out guest**, with Supabase stubbed.
  - My Labels was tested with a **simulated signed-in account**.
  - Downloads were not counted against a real account.
- **Not performed:**
  - real sign-in;
  - a signed-in Builder save, reopen and recovery;
  - a signed-in Composer export;
  - download accounting with the document gate.
- **Suggested owner check on the Test preview, signed in:**
  1. Open an existing saved label. Step 5 should say "Not ready to download yet".
  2. Click Save. It should confirm "Draft saved".
  3. Follow "Go to Step 3", answer the check, and continue to Step 5. Download should now be
     enabled.
  4. Save. It should confirm "Label saved".
  5. Reopen the label, then add it to the Composer. There should be no draft marker, and the
     export should be enabled.

## 6. Test results at `d6b9c54`
- **Full suite:** 74/79 Node test files pass. The 5 failures are the known baseline, and also fail
  on `main`:
  - `homepage-mobile-nav-signin`;
  - `lifecycle-reminder-accuracy`;
  - `payg-download-accounting`;
  - `pricing-checkout-ux`;
  - `pricing-signed-in-cta`.
- **Labels and artwork unchanged:**
  - the Builder Safety Baseline passes (10 labels, identical to the snapshot);
  - `decorative-labels-renderer-derived` passes (the homepage templates are unchanged).
- **Focused tests:**
  - `tests/sds-document-applicability.js` (11 groups);
  - `tests/sds-document-composer-gate.js`;
  - `tests/sds-document-recovery-journey.js` (real Chromium, 7 groups).
- **Test preview v28:**
  - **Served files:** `sds-doc-check.js` and `label-render.js` are byte-identical to the repo.
  - **Shared script:** loaded on `builder.html`, `print.html` and `my-labels.html`.
  - **Builder, at 360, 390 and 1366 px:**
    - calculator layout correct;
    - written-confirmation answer works;
    - the older label is blocked with guidance, the draft save works, recovery works, and a %
      change blocks export again;
    - 9.0909% is shown;
    - no sideways scrolling.
  - **Composer:** a sheet with an unconfirmed label is blocked and the label is named.
  - **QA script:** `docs/reports/sds-document-applicability/preview-browser-qa.js`.

## Separately recorded issues (not in this branch)
- **Cut-short hover code (pre-existing in production):** the served Builder page cuts short the
  "Print Sheet Composer" link's inline hover handler. Hovering over it logs "Invalid or unexpected
  token", and the hover colour doesn't change. The repo file is correct.
- **Phone stacking rule:** in `builder.html`, the general `.form-row` rule for phones comes before
  the base rule, so other two-column rows don't stack on phones. Only the fragrance-% row is fixed on
  this branch.

## Resuming this work
1. `git fetch origin && git checkout fix/sds-document-applicability`
2. Run `node tests/sds-document-applicability.js`, `node tests/sds-document-composer-gate.js` and
   `node tests/sds-document-recovery-journey.js`.
3. Run the full suite with `for f in tests/*.js; do node $f; done`. Expect only the 5 baseline
   failures.
4. **Test build:** copy the pages and shared files into a build folder, and swap the production
   Supabase ref and key for the Test ones.
   - The previous sessions' build scripts were kept only in the session scratchpad and have to be
     recreated.
   - `sds-doc-check.js` must be in the copied files.
   - Never commit or print the Test key.
