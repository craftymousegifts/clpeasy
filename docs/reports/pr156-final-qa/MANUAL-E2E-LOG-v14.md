# PR #156 — manual signed-in E2E on the v14 Test site (26 Sep 2026)

- **Site:** `clpeasy-pr156-payg-test-v10.netlify.app`, with the v14 build (commit `9e00b40`)
  uploaded by Michaela.
- **Backend:** CLPeasy Test (`wwjhvpphlbgtywxskqnf`) and Stripe Sandbox (`acct_1TdczqKF3jvQfgEa`).
- **Account:** `payg-browser-qa@example.com`, Easy Start monthly, active.
- **Who did what:** Michaela performed the tests. Backend checks were read-only SQL on CLPeasy
  Test.
- **Untouched:** production, live Stripe and live Brevo.

| # | Test | Result | Evidence |
|---|---|---|---|
| M1 | Active Easy Start → Pricing → Annual → Easy Pro £149 "Get started" | **PASS** | Stripe Checkout did not open. The server's message was shown: "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout." The generic "Something went wrong" is gone (fix `9e00b40`). |
| M2 | Account "Next payment" for a `billing_mode=flexible` Sandbox subscription | **PASS** | Shows "£8.99 on 26 Oct 2026 · 2026 offer applied" (fix `51447d5`, Test `billing-status` v2). Also shows 0 / 20 monthly used, 24 purchased, 44 total in the sidebar. The refresh used no downloads. |
| M3 | V13 C1: first size-aware download of a label last downloaded under the old `name::type` key within 7 days | **PASS** | See M3 below. |
| M4 | Print Sheet Composer "Print / Save as PDF" as an active Easy Start subscriber (v13 two-argument `consume_download`, Composer sends no label key) | **PASS** | See M4 below. |
| M5 | V13 C4: changing the fragrance load on a reopened saved label forces a hazard re-check | **PASS** | See M5 below. Used no downloads. |

## M3 details

Michaela opened **iugigig EDITED** from My Labels and downloaded it once. On Account the balance
was unchanged: 0 / 20 used, 24 purchased, 44 total.

**Read-only backend check (20:25 UTC):**

- `profiles` is unchanged: `downloads_used` 0, `downloads_limit` 20, `topup_credits` 24. No
  download was charged.
- The old record `iugigig edited::scented candle` is gone: it was claimed and removed, so it
  can't be used again.
- A new record `iugigig edited::scented candle::rectangle::80x95mm` was created at 20:23:01 UTC.
  - Its `last_downloaded_at` is 13:58:58 UTC, the ORIGINAL old-record time. The 7-day grace was
    inherited, not extended.
  - `clean_export` is true.
- No other records changed:
  - `gfxgfxx::…::76x77mm` and `gfxgfxx::…::76x72mm` are unchanged.
  - `iugigig::scented candle` is unchanged. It's a different label name, so it was correctly not
    claimed.

## M4 details

Michaela exported **iugigig EDITED** once from Print Sheet Composer with "Print / Save as PDF".
Account afterwards showed 1 / 20 monthly used, 24 purchased (unchanged), 43 total.

**Read-only backend check (20:29 UTC):**

- `profiles`: `downloads_used` went from 0 to 1, `downloads_limit` is 20, and `topup_credits`
  stays at 24.
  - Exactly one download was charged, from the monthly allowance first, as designed.
  - The purchased balance was untouched.
- `label_downloads` still has 4 records, and the newest is still the M3 record from 20:23:01.
  - As designed, a Composer sheet export records no label and has no free re-download.
- This confirms the Composer's call works against the v13 function signature on the real Test
  database: `consume_download(p_label_key text default null, p_legacy_label_key text default
  null)`.

## M5 details

Michaela opened **iugigig EDITED** (saved fragrance load: blank), changed the fragrance load to
`8%` in Step 2, and tried to continue.

- The v13 warning appeared, and she couldn't continue, save or download until she chose an
  option.
- She chose "I have re-checked it: keep hazard data".
  - The processed hazard data stayed.
  - The Step 3 hazard confirmation reset to unticked.
- She left without saving and reopened the label. The fragrance load was blank again, so the
  temporary change was not saved.

## UX finding F1 (recorded, not changed)

**Reopened labels: the Smart Paste box is blank, so the Step 3 confirmation wording is
inaccurate.**

**What happens:**

- A reopened saved label shows an empty Smart Paste "Paste SDS Section 2.2 text here" box, while
  the processed hazard data is restored and shown.
- This is by design:
  - A saved label stores only the processed results: signal word, SDS signal word, H/P
    statements, P280 choices, pictograms, sensitisers, `hazardFromExtraction`, and fragrance
    load.
  - It never stores the raw Section 2.2 text (`builder.html` `saveLabel()` / `loadLabelRecord()`).
  - The same on `main`.

**Why the wording is a problem:**

- The Step 3 confirmation says: *"I confirm the hazard data shown in the Smart Paste section above
  is correct and matches my fragrance supplier's SDS sheet at my actual fragrance load."*
- The hazard data is actually shown in the Signal word, Hazard pictograms, H Statements, P
  Statements and EUH208 Sensitisers sections, and in the preview.
- On a reopened label the Smart Paste box is empty, so the sentence points to a blank field.
- No note explains that the original SDS text isn't stored.
- The wording is identical on `main`, so this is not a PR #156 regression.
- It matters more after v13, which unticks this confirmation after a product-type or
  fragrance-load change.

**Status and options:**

- **Status:** recorded only. The wording has not been changed, as Michaela instructed.
- Options for a later decision:
  - Reword the checkbox to refer to "the hazard data shown in this step".
  - Optionally add a short note on reopened labels that the original SDS text isn't stored.
