# M10: supplier address required. Regression investigation and test repair

| | |
|---|---|
| Implementation | `6f70631` (shared content gate), `21a83d1` (Builder), `9eff958` (Composer message); pushed separately. Not changed here. |
| Status | **Regression investigation COMPLETE; automated QA PASSED** (29 Sep 2026). Awaiting Michaela's review. No M10 application defect found. |
| Decision basis | GB CLP Article 17 requires the supplier's name, address and telephone number. An exportable hazardous label must not omit the address (Michaela's decision). |

## The 12 failures from `6f70631`
Every failure was an outdated test fixture: a label meant to be complete/exportable, written before the address was required, with `bizAddress: ''` or none. Each now has a legitimate address (`12 Mill Lane`, as other fixtures already use); what each test checks is unchanged. Commit `82fa124`.

| Test | Category | Cause |
|---|---|---|
| blocked-overlay-and-download-guard-parity | A (outdated fixture) | the "allowed" state fills product and business name but not the address |
| checkpoint-c-composer-identity | A | 52 mm fixture and EU30009 fixture have no address, so the positions are blocked |
| custom-rect-grid-geometry | A | three complete fixtures with `bizAddress: ''` |
| p280-precautionary-statement | A | "valid P280" fixture with `bizAddress: ''` |
| precautionary-statement-wording | A | Composer base fixture with `bizAddress: ''` |
| preview-watermark-and-export-authorization | A | "minimal complete label" sets no address |
| print-sheet-composer | A | fixtures have no address field (the fit expectations still pass once one is added) |
| print-sheet-export-fidelity | A | export fixture with `bizAddress: ''` |
| print-sheet-fit-blocking | A | "fits" fixture with `bizAddress: ''` |
| suffixed-hazard-codes | A | Composer base fixture with `bizAddress: ''` |
| unknown-pictogram-keys | A | Composer base fixture with `bizAddress: ''` |
| required-content-export-blocking | B (expectation legitimately changed) | `checkRequiredContent(undefined)` now also lists `business-address`, the approved M10 result. Its Composer base fixture also gets an address so each case still isolates its own missing item. |

No failure was category C (an M10 implementation regression).

## M10 test repair (`b5ad2db`)
The previous `tests/m10-supplier-address-required.js` threw `document is not defined`: it `require()`d `label-render.js` in plain Node, where the renderer needs a DOM. Beyond that it only checked source text. It now runs the real code:
- **Renderer (jsdom):** a valid address passes; blank, whitespace-only and missing (old saved label) fail with `business-address`; the record is not changed.
- **Builder (Chromium):** Step 4 refuses blank and whitespace-only addresses; a valid address continues; clearing it after confirming at Step 5 blocks PNG, SVG and PDF.
- **Composer (Chromium):** an old saved label with no address is listed ("No supplier address…") and blocked (A4 PDF and cutting ZIP refused); a label with an address prints; the saved record is unchanged.

Verified to fail when the M10 address rule is removed from `label-render.js`.

## Suite
Full suite at `82fa124`: 60 pass, 5 fail. The 5 are the long-standing audit-branch baseline failures, with no new failures.
