# Five-PR combined label QA — 15 October 2026

## Candidate and scope

Base: `64bd3ee53608c66b035bfaef8b863ceabf5311d6`. Initial four-fix code/test commit: `9d0083a15ed1a357de3b4cdef24d1a2684b1e1a5`. Revised five-fix code/test commit: `d51d7c22c437e17ecbc1fbc577e31c3cfd2dfdd8`.

- #236: `e3f0cdbf5e83838423c34bb8cc1028aac446f3da` — curved-name collision protection (added at Michaela's request).
- #237: `12462b4eebc66cbc703e845d696126d5ee4d51c9` — measured/drawn font parity.
- #240: `f3c62c9bd37dba460138b6b16dd9ae07348a696d` — circular statement wrapping and horizontal overflow gate.
- #241: `98e3a5863c8bbdd9963f597f3785f60c1d45094e` — circular footer balance and edge clearance.
- #242: `93679c468e2e7855f9257993023379507ff0a77d` — fine-tune percentages.

Integration is isolated from main. `label-render.js` and `builder.html` merged without manual logic edits. Conflicts in the generated homepage circle/lifecycle examples were resolved by regenerating all five sample symbols and the lifecycle copy from the combined renderer using the existing canonical fixtures. Both homepage identity tests pass. New test `tests/combined-label-release-qa.js` is offline QA only, with synthetic data and all external services mocked/intercepted.

## Results

| Check | Status | Evidence |
|---|---|---|
| Five-way integration | PASS | No unresolved conflicts; application delta limited to builder, renderer and generated homepage examples |
| Circle statement pixels and word preservation | PASS | Existing real-Chromium matrix: 116 fitting auto/manual-max cases, no statement ink outside the circle; all words retained; existing font floors retained |
| Circle footer | PASS | 66 fitting cases: common font size, regular phone, every line present and >=1 mm edge clearance; 52 mm preset retained; both dense 58 mm fixtures block and recommend 60 mm |
| Fine-tune | PASS | All five controls, automatic/minimum/maximum/Reset/resize; 160 cross-control checks; panel refresh leaves SVG output unchanged |
| Font measurement parity | PASS | Existing structural test, four fitting labels, drawn statement families match measured families; no DM Sans import in downloaded SVGs |
| Safety baseline | PASS | Existing 10-label invariants and saved snapshot, including expected blocked rectangles |
| Regression checks | PASS | 13 targeted tests covering renderer, GHS/candle symbol sizes, P280, Composer physical size/export fidelity/fit gate, rectangle geometry, shared-renderer identity, resolution and homepage samples |
| Square/rectangle isolation | PASS | 90 SVG/fit/warning comparisons byte-identical to the #237 font-corrected baseline |
| Package test command | PASS with harness cleanup | `npm test` exit 0 using a temporary Node preload that closes jsdom windows after each test's final success log; assertions/production code unchanged. Unmodified runs retain UI timers. 16 front-end test scripts pass; download-entitlement SQL explicitly SKIP because local PostgreSQL is unavailable, and Deno Edge Function tests explicitly SKIP because Deno is unavailable |
| Real account/payment operations | NOT TESTED | Offline stubs only; no production account or credit usage |
| Real iPhone Safari and paper measurement | NOT TESTED | Founder checks still required |

## Exact requested content and sizes

All cases use Synthetic Test / Scented Candle, synthetic business/address/phone, `https://example.invalid`, batch TEST-001; H317/H411/EUH208, Linalool/Limonene, GHS07/GHS09. No net weight/burn time. Two input routes are kept separate:

| Route | 52 mm | 63 mm | 75 mm | Smallest tested fitting circle |
|---|---|---|---|---|
| Smart Paste: existing P280 exclusion, five remaining P statements | BLOCKED, PASS | Exports, PASS | Exports, PASS | 62 mm |
| Manual entry: all six requested P statements, P280 gloves selected in the picker | BLOCKED, PASS | BLOCKED, PASS | Exports, PASS | 68 mm |

Blocked cases refuse SVG/PNG/PDF before starting a download. For all three fitting cases, real SVG/PNG buttons downloaded files and the PDF button opened the actual print view, saved with Chromium `preferCSSPageSize: true`. All expected hazard/precautionary phrases are present in both SVG text and extracted PDF text. The three PNGs and PDF rasters were visually inspected. No statement clipping was found in these specimens; the pre-existing header collision below remains visible.

| File | SVG dimensions | PNG pixels | Saved PDF page | Smallest PDF font size |
|---|---|---|---|---|
| Extracted five, 63 mm | 63 x 63 mm | 1488 x 1488 | 63.161 x 63.161 mm | 1.197 mm |
| Extracted five, 75 mm | 75 x 75 mm | 1772 x 1772 | 75.099 x 75.099 mm | 1.494 mm |
| Manual six, 75 mm | 75 x 75 mm | 1772 x 1772 | 75.099 x 75.099 mm | 1.359 mm |

PNG pixel sizes are consistent with nominal 600 dpi but contain no embedded DPI metadata. Chromium adds small paper-size rounding; these are page measurements, not cut-guide diameter. The existing circle radius is 128.5 within a 260-unit viewBox, so the circle/cut guide is inset: approximately 62.273 mm at nominal 63 mm and 74.135 mm at nominal 75 mm. No 67.2 mm output was reproduced. The earlier physical 67.2 mm cause remains REVIEW, requiring the original viewer/printer settings and a paper measurement. These font sizes are not measured x-heights and establish no legal-compliance conclusion.

## Remaining issues outside these five fixes

1. **Curved name/business-name contact: FIXED in the revised candidate by #236.** The exact Synthetic Test/website fixture was exported again, and the curved-name pixel-gap test passes. The original #236 test incorrectly assumed Fig & Cassis was clear on every font set: standalone #236 and the integrated build both failed only those three classification assertions. Independent rasterisation of main 64bd3ee on this Chromium 153/Linux runtime measured only 0.25 units of clearance at 52/63/97 mm, versus Mint 8.75 and Lavender 3.75. Fig & Cassis was therefore moved to the near-collision cases, which require at least 1 unit after adjustment; renderer logic was not changed to satisfy the test.
2. **Mobile Website/Batch layout:** at 375/390/430 px, document width stays within the viewport, but the Website and Batch fields share one row. Batch input widths are only 43/51/71 px; its label wraps and text is cramped. Baseline and combined field rectangles are identical at all three widths. The five PRs do not repair it. Recommended separate small CSS correction: stack these fields on phones and preserve room for clear/increment controls. Actual iPhone Safari remains NOT TESTED.
3. **P280 exclusion:** intentional existing extraction rule, with extracted hazard fields locked. The unlocked picker works. Earlier claims of a broken picker were incorrect. The appropriateness of blanket P-code exclusions remains separate regulatory/policy REVIEW; no such rule changed.

## Release and rollback

No merge or production deployment is authorised by this report. The candidate needs founder review of the known unchanged issues, real-iPhone verification and an Actual Size/100% paper check, followed by explicit approval of an out-of-hours window. The scheduled reminder is only a readiness checkpoint.

Release the exact combined tree in one production update, rather than triggering five intermediate production builds. A combined draft release-candidate PR contains the same five fixes plus homepage conflict resolution and QA evidence; it is not a fifth product fix. Preserve the original PRs until the candidate is accepted. If merging separately, the final generated samples and application blob hashes must match this tested candidate and intermediate production publishing must not occur.

Before release: recheck main and all five PR heads; if any changed, rebase/review and rerun affected checks. Record the currently published Netlify deploy ID as the rollback target. There are no dependency, server-function, database, auth, billing or environment-variable changes. Preserve active user work and in-flight payments; no planned downtime or session invalidation is needed for this frontend-only tree.

Post-release: signed-out synthetic production smoke check for preview, size gate and percentage display; verify deployed builder/renderer blob hashes match the candidate. If a regression occurs, restore the recorded previous Netlify deploy, verify its published source, and follow with a reviewed Git revert so repository/deploy state cannot drift. Do not overwrite customer data, alter billing, or reset browser storage as rollback steps.

## Handover

Task: five-PR integration QA. Tier: High (label geometry); focused diff review and independent tests by Codex against the existing PR implementations.
Files: builder.html, label-render.js, generated index.html examples, existing PR tests, one offline integration harness and this report/evidence.
Result: combined technical checks PASS within tested scope; SQL and Deno tests SKIP; actual Safari/printer, original scaling cause and unrelated policy items remain open. The independently run pricing-checkout-ux test still fails on untouched pricing/checkout source; signed-in pricing CTA browser checks pass. See OUTSTANDING-FIXES-2026-10-15.md for the reconciled inventory.
Release: HOLD pending founder physical/device checks, decision on unchanged visual issues, exact-head approval and agreed window.
