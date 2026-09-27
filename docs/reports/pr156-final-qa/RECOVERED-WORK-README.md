# PR #156 final QA — recovered work (26 Sep 2026)

This folder preserves QA work from the original Claude session. The work existed
only locally (one unpushed commit plus scratch files) and was recovered and pushed
so it is not lost when the cloud container is reclaimed.

**This is evidence, not the final QA report.** The final PR #156 QA report had
not yet been written when the work was recovered.

## Git baseline

| Item | Value |
|---|---|
| GitHub branch head before recovery | `946ae8e` (`feature/pay-as-you-go-downloads`) |
| Printing-guidance implementation | commit `0a3b0a5` (local until this push) |
| This evidence | the commit after `0a3b0a5` ("Preserve recovered PR156 final QA evidence") |
| Merged to main | **No** |
| Deployed to production | **No** |

## What was implemented (commit 0a3b0a5)

The approved post-download printing guidance:

- **Builder** (`builder.html`): a small in-flow status panel under the Step 5
  download buttons (`role="status"`, `aria-live="polite"`, ✓ plus text). It is
  shown only once an export has genuinely handed over its file.
  - PNG/SVG heading: "✓ Label downloaded".
  - Print-window PDF heading: "✓ Label ready to print".
  - Body: "Now load your chosen label paper or sheet into your printer. Print at
    100% / Actual Size to preserve the label dimensions."
  - Signed-in customers only.
- **Composer** (`print.html`): shown after the A4 sheet is written to the print window.
  - Heading: "✓ Print sheet ready".
  - Body: "Load the matching label sheet or printable material into your printer.
    Check your paper size and printer settings, then print at 100% / Actual Size
    to preserve the label dimensions."
  - A "Printing tips →" link opens the existing in-page "Printing help" section.
  - Cutting-machine exports keep their own existing next-step text.
- The two headings for print-window paths ("Label ready to print", "Print sheet
  ready") differ from the approved wording, because nothing is downloaded at that
  point. **This needs owner visual approval.**
- No download or accounting behaviour changed. The guidance adds no charge.
- `tests/post-download-print-guidance.js`: real Chromium, **16/16 groups PASS**
  (last local run).
- `tests/sql/test-env-lifecycle-rollback.sql`: **34 lifecycle checks** run on
  CLPeasy Test inside a rolled-back transaction, **34/34 PASS** (+1 INFO). No data
  was left behind.
  - The first run showed T09/T12–T14 failing because of a test-method error: the
    role claim carried over inside one transaction.
  - They passed in a corrected re-run, and the committed file contains that
    correction.
- `tests/cutting-machine-tip-layout.js`: size ceiling raised for the deliberate
  addition.

## Evidence — where each item came from

| Folder | Source | Deployed? |
|---|---|---|
| `evidence/v10/` | Local copy of the **v10** build (commit `946ae8e`). The same package is deployed at `clpeasy-pr156-payg-test-v10.netlify.app`, but these runs were local with stubbed Supabase. | v10 deployed to its Test site by Michaela |
| `evidence/v11/` | Local **v11 candidate** (commit `0a3b0a5` = v10 + printing guidance), served locally with stubbed Supabase | **v11 was NOT deployed anywhere** |
| `evidence/printing-guidance-local-0a3b0a5/` | Printing-guidance test screenshots from the local working tree at `0a3b0a5` | Not deployed |
| `evidence/logs/` | Local test-suite output (JS suite before/after the guidance change; SQL + Deno offline tests) | n/a |
| `build/` | Build scripts, build reports, v11 file checksums and zip checksums. The v11 zip itself is **not committed**; it can be rebuilt from `0a3b0a5` with `build/build-v11.py`. | v11 not deployed |

### Recovered results

- **Browser matrix:** 137 page visits each on v10 and v11. Covers 10 account
  states × 6 pages × desktop and mobile, plus signed-out redirects, pricing PAYG
  routing and return URLs. **0 console errors and 0 horizontal overflow** on both.
- **Section 2.2 / saved-label matrix (v11):** 23 PASS, 1 FAIL (SDS-06, below).
  - The v10 run shows one extra FAIL (SDS-02). That was a test regex error: it
    matched `sdsSignal`. It was corrected before the v11 run.

## Findings still open (not fixed)

- **Reopen lock (SDS-06).** A reopened saved label shows an empty Section 2.2 box.
  Its hazard fields and the Extract button are unlocked, unlike straight after
  Extract. The raw SDS text is not stored, by current design (`main` behaves the
  same). **This remains a finding; no fix has been implemented.**
- **B1 — watermarked re-download after upgrade.** A label first downloaded
  watermarked during the trial is re-issued free but still watermarked for
  7 days after the customer buys downloads.
  - `proposed-fixes/B1-redownload-after-upgrade.sql` is **PROPOSED ONLY — NOT
    APPLIED, NOT DEPLOYED, requires owner approval.**
  - The current behaviour is unchanged.
  - `proposed-fixes/b1-regression-verification.js` records the local PostgreSQL
    check: 93 existing groups pass except the one deliberately changed rule, plus
    4 new scenarios. It uses absolute paths from the original session.
- **Stripe webhooks:**
  - The Sandbox webhook to CLPeasy Test subscribes only to
    `checkout.session.completed` and `invoice.created`.
  - The Sandbox also has an enabled endpoint pointing at the **production**
    Supabase `stripe-webhook`. Owner review is needed.
  - Because of that, the test-clock / renewal E2E was not run.
- **Safari/WebKit: untested.** No WebKit engine was available; only Chromium with
  an iPhone user agent and viewport.
- **Other findings** were reported in the session: pop-up-blocked PDF uses a
  download, ex-Pro accounts shown as "Easy Start (Cancelled)", saved labels are
  browser-only, and reuse-as-template carries old SDS data. All of these are
  already on `main`.

## Harness scripts

`harness/` holds the browser-matrix, Section 2.2 and reproduction scripts, plus
the source of the temporary CLPeasy Test QA function.

- That function's access token is replaced by a placeholder.
- The deployed function was retired to a 410 stub afterwards and still needs
  manual deletion in the Test dashboard.
- The scripts use absolute paths from the original container.

## Environments

- **Production:** Supabase, live Stripe, live Brevo and the production site were
  untouched.
- **CLPeasy Test:**
  - Temporary users were created and then deleted.
  - `pg_net` was enabled temporarily and then dropped.
  - Michaela's QA account was not modified (Pay As You Go, 5 downloads at
    recovery time).
- **Stripe Sandbox:**
  - Only Checkout Sessions were created.
  - Each one was expired straight away.
  - No payments were made.
