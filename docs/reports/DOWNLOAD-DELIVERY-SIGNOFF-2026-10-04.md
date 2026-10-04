# Download delivery and credit sign-off record (4 Oct 2026)

**Production:**
- `main` `9743528`, Netlify deploy `6ac2b20eab9f2c0008a79615`.
- #207–#212 are merged and live; the Step 3 work `e8b8f19` is included.

**This work:**
- branch `fix/generate-before-credit-svg-pdf` (`3e5172b` fix, `e2e5d75` test refresh);
- Test preview deploy `6ac2be0e4e7ec9c4a575cae4`;
- **not in production** (awaiting approval).

## 1. Repository reconciliation
- **PNG fix:** the PNG "generate first, charge second" change (the handover's local-only work) is
  **merged and live as #209** (`fcfdc2f`).
- **Recent branches:** `fix/png-generation-before-credit`, `fix/live-builder-export-controls-business-details`,
  `fix/smart-paste-suffixed-hazard-codes`, `fix/final-label-content-guards-20261004` and
  `fix/homepage-signed-in-final-qa` each match their squash merge (#209, #208, #210, #211, #212)
  exactly. Nothing is left unmerged.
- **Open PRs:** the 10 open PRs (#204, #203, #201, #184, #174, #171, #162, #161, #155, #148) are
  as recorded in `FINAL-PR-SIGNOFF-2026-10-04.md`. None carries unmerged download or export fixes.
- **Phase 2 port superseded:** my Phase 2 port (`fix/builder-phase2-required-content`) is
  superseded by #210/#211. It is kept as history and will not be merged.

## 2. Root cause of "success message but no file"
**Real files are delivered.** Chromium was told to save downloads to disk (CDP
`Browser.setDownloadBehavior`). Every Builder and Composer export produced a completed download.
The bytes were inspected, and the same files were produced on:
- production (signed-out guest);
- the Test preview;
- a local copy of `main` (guest and simulated paid account).

The earlier QA browser was recorded in the #212 audit as one that "returns no download file" and
blocks blob print tabs. **The missing files were a limitation of that QA browser, not a CLPeasy
delivery defect.** No browser API reports whether a file reached the device, so the on-screen
wording stays "Download started… Check your browser's Downloads list".

**The genuine defect found:** in the Builder, **SVG and the PDF print view still charged the credit
before generating the file** (only PNG had been fixed). A generation failure would therefore use a
credit with nothing delivered. It is fixed in `3e5172b`:
- both versions (clean and watermarked) are prepared before the atomic `consume_download` call;
- a failure shows "No download credit was used", and the PDF window is never opened;
- the server still decides clean or watermarked;
- an accounting refusal delivers nothing;
- guests are unchanged;
- output files are byte-identical.

The Composer A4 sheet, ZIP and one-by-one PNGs already generated before charging. The unused
`downloadPDFSheet`, `downloadPrintReadyPDF` and `downloadCricutPNGs` functions have no button and
are unchanged.

## 3. Download evidence (real files saved to disk and inspected)
| Export | Where | Result |
|---|---|---|
| Builder PNG | production (guest), Test preview (guest), local `main` (guest, paid) | **PASS.** 2362×1654 PNG (100×70 mm at 600 dpi). All mandatory text, GHS07 and EN 15494 icons present. Guest watermarked; paid clean |
| Builder SVG | same | **PASS.** Valid XML, `width="100mm" height="70mm"`, 6 images. Guest watermarked; paid clean |
| Builder PDF (print view) | same | **PASS.** Opens the print view (label SVG at 100 mm). Saved through Chromium print: one page, 99.8×69.8 mm (Chromium rounds the page box to whole pixels; print at Actual Size) |
| Composer A4 sheet | local `main` (paid) | **PASS.** 2480×3508 image (A4 at 300 dpi), 2 clean labels at the saved 100×70 mm, 10 mm margins. Printed to PDF: 1 page, 209.9×297.0 mm |
| Composer ZIP | local `main` (paid) | **PASS.** Valid ZIP containing 2 PNGs, each 1181×827 (100×70 mm at 300 dpi) |
| Composer one-by-one PNGs | local `main` (paid) | **PASS.** 2 completed PNG downloads, each 1181×827 |
| Phone width (390 px, Chromium touch emulation) | local fix branch (paid) | **PASS.** View label sheet shows enabled PNG, PDF and SVG on screen, no sideways scroll. PNG and SVG delivered; PDF view opened |

**Not covered:** the Composer was not exercised on production. It needs a signed-in account with
credits; production QA must not consume customer credits, and no live payment is allowed.

## 4. Credit accounting (simulated `consume_download` server, plus automated tests)
| Scenario | Result |
|---|---|
| One Builder PNG, SVG or PDF export | Exactly 1 charge each |
| Composer A4 sheet / ZIP | 1 charge each, made after the file was complete |
| Composer one-by-one | 1 charge per finished PNG (existing design) |
| PNG / SVG / PDF generation failure | **0 charges** (`png-generation-before-credit`, new `svg-pdf-generation-before-credit`) |
| Accounting refused or out of credit | Nothing delivered; the print window is closed |
| Reload / reopen a saved label in the Builder, Composer, My Labels | **0 charges** |
| Signed-out guest | Never charged; watermarked |
| Server-authorised paid output | Clean; trial output keeps the watermark |

**Real database accounting** (balances, the 7-day same-label free re-download) is not exercised from
here, because CLPeasy Test Supabase is blocked by the network policy. The #212 audit records an
isolated Test PAYG run (27→26 PNG, the same-label SVG staying at 26, ZIP 26→25). The Sandbox
£4.99 → 8 credits purchase with no duplicate on refresh was also recorded earlier. Neither was
re-run here.

## 5. Builder → save → reopen → Composer journey (local `main`, real Chromium)
1. **Create:** a 100×70 mm rectangle, Scented Candle, Smart Paste (H317, H412, EUH208 with
   Linalool, Citral and Coumarin), business details, Step 5, then a hazard-text fine-tune.
2. **Save and reopen:** shape, size, text, hazards, sensitisers, pictogram, business details and
   the fine-tune setting are all identical.
3. **Composer:** the label is found and added (qty 2). The gate is clear, the placements are
   100×70 mm (not resized), and the A4 sheet, ZIP and PNGs were all delivered as real files.

Oversize and invalid layouts remain blocked: `print-sheet-fit-blocking`, `print-sheet-size-integrity`,
`custom-rect-grid-geometry` and `required-content-export-blocking` all pass.

## 6. Test suite at `e2e5d75`
**Full suite:** 80/83 pass. The 3 failures are pre-existing, fail identically on `main`, and are
**obsolete expectations, not product defects**:
| Test | Classification |
|---|---|
| `homepage-mobile-nav-signin` | **Obsolete.** It looks for menu markup removed from `index.html` in `cc8750c`; the menu now comes from shared `public-nav.js`. On production at 390 px with touch emulation, tapping Sign in reaches `auth.html?mode=signin`, with no fixed scroll-container ancestor. The test should be re-targeted at `public-nav.js`, not deleted (it guards an iPhone structure). |
| `pricing-checkout-ux` | **Obsolete.** It expects the phrase "8 downloads for £4.99"; the page says "£4.99 for 8 downloads" (price and count correct). The checkout-indicator sub-checks need the same review before any change. |
| `pricing-signed-in-cta` | **Obsolete.** It expects four trial CTAs on `pricing.html`; one moved to the shared navigation. Signed-in CTA routing for that link needs re-checking when the test is refreshed. |

**Fixed in this branch:**
- three expectations made obsolete by released changes, all failing identically on `main`:
  - `stage2-print-guidance` (guidance wording);
  - `post-download-print-guidance` C6 (a label with no product name is now blocked and never
    charged);
  - the Builder Safety Baseline snapshot.
- **Snapshot detail:** exactly 12 differences, all from approved live changes: 10 × the new
  `requiredComplete` field (#211) and 2 × the overlay wording "Adjust size below the preview"
  (#207). No fit, size, pictogram or safety-wording change.

**Previously listed as baseline failures:** `lifecycle-reminder-accuracy` and
`payg-download-accounting` now pass on `main`.

## 7. Not verified / outstanding
| Item | Status |
|---|---|
| **iPhone / Safari** (navigation, SDS entry, View/Hide label, shape and size, burn time, fit warning, PNG/PDF/SVG, save/reopen, Composer, real file handling) | **NOT VERIFIED.** No iPhone or WebKit is available here, and installing browsers is not permitted. The Chromium phone emulation passed but is not Safari. **Safari-specific risks to check:** (a) the PNG/SVG download starts after asynchronous preparation and charging, outside the original tap; (b) SVG is handed over as a `data:` link, which iOS may open in a tab instead of saving; (c) the PDF print view relies on a pop-up opened in the tap |
| Real paid path with this fix on the CLPeasy Test database | Not run from here (Test Supabase unreachable). Test preview `6ac2be0e4e7ec9c4a575cae4` is ready for an owner check with a Test PAYG account |
| Physical actual-size print, Cricut Print Then Cut | Not performed (no hardware) |
| First genuine live purchase, invoice email, live duplicate delivery | Awaits a genuine customer purchase; no live payment |
| Production deployment of `3e5172b` | **Awaiting approval** |

## Decision
**NOT READY FOR MARKETING.** Blockers:
1. iPhone/Safari customer journey and real file handling not verified on a real device.
2. The SVG/PDF generate-before-credit fix is not yet in production (approval needed). Until then, a
   rare SVG or PDF generation failure could still use a credit.
3. The paid path with this fix has not been exercised against the CLPeasy Test database
   (owner check on preview `6ac2be0e4e7ec9c4a575cae4`).

**Desktop Chromium:** real-file delivery, content and credit ordering pass on production
(guest), the Test preview and local `main`.
