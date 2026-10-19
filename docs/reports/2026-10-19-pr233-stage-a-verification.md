# PR #233 Stage A: precautionary-statement verification (19 Oct 2026)

**Tier:** High (CLP wording). **Status:** draft, local only. Not pushed, merged or deployed.
**Scope (coordination record on #233, 19 Oct 2026):** verify P202, P240, P241, P242, P243, P308+P313, P310 and P403+P235. Print a code only when its verified wording is complete without a supplier choice the SDS doesn't make. Otherwise leave it unrecognised, which blocks the download as production does today. Unchanged: the nine Smart Paste exclusions, P280, unknown-code blocking and the fit/export gates.

## Evidence anchors

| What | Anchor |
|---|---|
| Code | Stage A change `18386e7` (on top of `42123e5`, main `1925764`). Later merged with `main` `b233631` (#264, #265) with no conflicts. After #264, extraction needs the SDS source confirmation, so `tests/d3-r4-precautionary-statements.js` now ticks it before extracting (a test-only change). |
| GB wording | legislation.gov.uk, Regulation (EC) No 1272/2008, Annex IV, https://www.legislation.gov.uk/eur/2008/1272/annex/IV (data `dc:modified` 2026-06-10, retrieved 19 Oct 2026). Part 1 Tables 6.1, 6.2 and 6.4 give columns (2) and (5); Part 2 gives the English rows. |
| GB amendments after 17 Oct 2020 | The same page says "There are currently no known outstanding effects by UK legislation for … ANNEX IV". Its version timeline ends at 17/10/2020 and 31/12/2020 (end of the implementation period). |
| Wording rule | Article 22(4), https://www.legislation.gov.uk/eur/2008/1272/article/22: statements "shall be worded in accordance with Part 2 of Annex IV". |
| Annex IV conventions | Annex IV introduction: "/" means a choice must be made "in accordance with the indications provided in column (5)"; "…" means information must be supplied; "[…]" text is "not appropriate in every case". |
| Genuine SDS | Nikura, "Nag Champa Fragrance Oil (10% in Candle Wax)", issue date 21/07/2025, version 1, 9 pages (owner's copy, `Downloads/Nag Champa SDS.pdf`). Section 2.2 text extracted with `pdftotext -layout`. |

## Verification per code

The Part 1 and Part 2 English wording is identical for all eight codes.

| Code | GB Annex IV wording | Column (5) | Result |
|---|---|---|---|
| P202 | Do not handle until all safety precautions have been read and understood. | none | **Print**: complete |
| P240 | Ground and bond container and receiving equipment. | selection conditions only ("if…") | **Print**: complete |
| P241 | Use explosion-proof [electrical/ventilating/lighting/…] equipment. | bracketed text "may be used… if necessary and as appropriate" | **Print** "Use explosion-proof equipment." The bracket is optional, so the text without it is complete. *Note:* if a supplier does specify equipment inside the brackets, CLPeasy prints the shorter text. |
| P242 | Use non-sparking tools. | selection conditions only | **Print**: complete |
| P243 | Take action to prevent static discharges. | selection conditions only | **Print**: complete |
| P403+P235 | Store in a well-ventilated place. Keep cool. | selection conditions only | **Print**: complete |
| P308+P313 | IF exposed or concerned: Get medical advice/attention. | none | **Not added**: "/" is defined as a choice, and column (5) gives no indication, so complete wording can't be verified. Stays unrecognised (blocks). **Decision/REVIEW.** |
| P310 | Immediately call a POISON CENTER/doctor/… | "…Manufacturer/supplier to specify the appropriate source of emergency medical advice." | **Not added**: the supplier must complete it. The previous #233 text, "POISON CENTRE or doctor", isn't statutory wording. Stays unrecognised (blocks). **REVIEW.** |

**Change from `42123e5`:** P308+P313 and P310 are removed from both P_LIB copies. The other six stay as #233 had them. No existing library entry changes.

## Real-case results (jsdom Builder harness; desktop emulation, not a device)

| Case | v1.3.0 `3a9524e` | #233 Stage A (local) |
|---|---|---|
| Genuine Nikura Nag Champa 10% in candle wax, 90 mm circle, Scented Candle, 10% | H317, H412, **H316**, EUH208; five sensitisers; P261, P273, P302+P352, P333+P313, P501 added; P272, P280, P363 not added (note shown). **Blocked by H316** (GB-unsupported). | Identical |
| Samantha's reported codes (P202, P240–P243, P308+P313, P310, P403+P235, as recorded in #257) on a **synthetic** Section 2.2 with H226/H304/H317 | All eight unrecognised; Step 3 and download blocked | P202, P240–P243 and P403+P235 recognised and printed; **P308+P313 and P310 still block** Step 3 and the download |

Samantha's genuine SDS isn't available in the repository or the owner's records, so her case was checked only with the reported codes.

**Nag Champa finding:** the genuine SDS's Section 2.2 lists "H316, Causes mild skin irritation." H316 isn't a GB CLP code, so this label stays blocked in production and in Stage A whatever happens with the P-statements. The 19 Oct production report on #233 didn't mention H316. That difference wasn't reproduced here and may come from how the text was copied.

## Tests

Run locally on the Stage A working tree (Node 24, jsdom), 19 Oct 2026: **32 of 32 pass**.
- **The `npm test` list (except `tests/deno/run.js`):** smart-paste-section-scope, png-generation-before-credit, live-builder-export-hotfix, site-scroll-accessibility, app-static-audit, builder-regression, payg-download-accounting, payg-account-display, payg-pricing-checkout (about 313 s, the same on v1.3.0), payg-immediate-supply-consent, plan-checker-decision, account-next-payment, pause-duration-wording, preview-watermark-and-export-authorization, download-entitlement-sql, post-download-print-guidance, stage2-print-guidance, hazard-source-integrity.
- **P-statement and safety suites:** d3-r4-precautionary-statements (updated, 7 checks), smart-paste-guidance-release-c, p280-precautionary-statement, slash-p-code-normalisation, p-statement-wording-correction-a, renderer-block-reason-messaging, h316-h401-gb-unsupported-removal, circle-hazard-line-width, label-render-fit-contract, blocked-overlay-and-download-guard-parity, builder-safety-baseline, gb-wording-and-mixed-code-correction, euh208-bounded-substance-extraction, pictogram-parity.

**Not run:** the Deno edge-function tests (no edge function changed). **Not separately tested:** PNG, PDF and Composer files, a real browser, an iPhone. Those outputs are built from the renderer SVG that the updated test checks for both preview and export.

## Open

- P308+P313 "advice/attention": founder decision or authoritative confirmation needed. Existing library entries P313 and P332+P313 also print "advice/attention"; that's tracked in `docs/reports/P-LIBRARY-WORDING-AUDIT-2026-10-19.md` (on `fix/p-statement`).
- P310 completion: REVIEW. Evidence needed on what counts as an appropriate GB source of emergency medical advice, or a supplier SDS that specifies one.
- H316 on the genuine Nag Champa SDS: supplier confirmation needed (an existing, unchanged block).
- Unrelated and separate: `tests/smart-paste-user-guidance-wording.js` already fails on `main` `b233631`. #263 changed the Smart Paste troubleshooting wording in `support.html`, so the test's "approved replacement wording" check no longer finds its expected text. This PR doesn't touch `support.html` or that test.
