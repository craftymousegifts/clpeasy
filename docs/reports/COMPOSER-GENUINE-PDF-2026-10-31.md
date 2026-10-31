# Print Sheet Composer — genuine A4 PDF (31 Oct 2026)

**Tier:** High (export + download accounting). **Status:** draft PR, Test environment only. Not merged, not deployed to production. Founder approval required before release.

## Why
- **Symptom:** printed from an iPhone, the CLPeasy size test's 50 mm line measured about 44 mm (founder, same iPhone/printer/settings as a FizzyWhiz PDF that printed exactly).
- **Simulation (Chromium, main @ 3c27d2f):** the effect is reproduced when the print engine ignores CSS `@page { margin: 0 }` and applies 12.7 mm margins with shrink-to-fit. The line then measures 44.03 mm, and the Composer A4 sheet shrinks to 88.1%. Single-label print pages are not shrunk in that simulation.
- **Physical result (founder, 31 Oct):** a genuine A4 vector PDF printed from the iPhone measured about 50 mm.
- iOS Safari's internal behaviour is inferred, not observed. The simulation and both physical prints are consistent with it.

## Change
- New `pdf-sheet.js` (dependency-free, about 90 lines). It wraps a finished canvas in a one-page PDF:
  - MediaBox exactly 210 × 297 mm (595.2756 × 841.8898 pt);
  - the image fills the page exactly;
  - lossless 8-bit RGB, FlateDecode via the browser `CompressionStream`;
  - `/PrintScaling /None`.
- `print.html` `downloadPDF()`: after the existing 300 DPI sheet canvas is drawn, the PDF is built **before** `consumeComposerDownload()`. On success the already-open holding window shows the PDF.
  - Generation failure: holding window closed, "No download has been used", no charge.
  - Browsers without `CompressionStream` (iOS < 16.4, old browsers) keep the previous HTML print page unchanged.
- Guidance panel: existing text kept. One paragraph added: "Your sheet is an A4 PDF file. Print it from the PDF. On iPhone or iPad, tap Share, then Print." It includes a "Download the PDF again" link to the same file, which uses no download.
- Printing help: one line added for iPhone or iPad (Share → Print, A4 paper).
- Unchanged:
  - placements, sizes, renderer, watermark logic, fit gate and entitlement checks;
  - the button label;
  - SVG/PNG/ZIP cutting-machine exports;
  - Builder single-label exports and the size test.

## Evidence (branch vs main @ 3c27d2f)
| Check | Result |
|---|---|
| PDF page (PyMuPDF, pdfinfo, pypdf strict) | 210.0000 × 297.0000 mm, 1 page, valid |
| Image placement | x 0, y 0, 210.0000 × 297.0000 mm; 2480 × 3508 px (300 DPI) |
| Pixels vs main's HTML print page PNG | **identical** (numpy array_equal, same sheet: 6 × 60 mm circles) |
| PDF image vs finished canvas (in-test SHA-256) | identical: desktop, iPhone 13, iPhone 13 landscape |
| Label centres (1200 dpi render) vs `getSheetPlacementsMM()` | within 0.10 mm. This comes from the existing 300 DPI whole-pixel rounding and is identical on main. |
| Pictogram red-border extent | 16.00–16.02 mm on all six labels |
| Credit: success / generation failure / accounting error / no downloads / pop-up blocked | 1 / 0 / no file / no file / 0 |
| Re-open link | no further charge |
| File size | 192 KB for the test sheet |

## Regression
**Targeted tests:** 31 Composer, export and download test files.
- On main, all pass.
- On the branch, all pass after updating four Chromium tests that detected the old HTML print page:
  - `m03-composer-fine-tune-overrides`, `m55-bgcolour-validation` and `builder-safety-baseline` now accept either hand-over. Their render and override checks are unchanged.
  - `stage2-print-guidance` switches PDF support off, so it keeps covering the HTML fallback page and its print note.

**Full `npm test`, run step by step on the branch:** 35 of 36 steps pass.
- The one failure is `guide-me-content-sync` ("guide-me-content.js is out of date"). It fails identically on main @ 3c27d2f, because of FAQ and blending-guide text changes from earlier releases.
- It is not caused by this change and is not fixed here.
- The Deno Edge Function step was skipped because Deno is not installed. No Edge Function was changed.

**New test:** `tests/composer-genuine-pdf.js` (real Chromium, mocked account, no network), added to `npm test`. It has 9 groups and all pass:
- desktop, iPhone 13, and iPhone 13 landscape;
- a real (unstubbed) pop-up;
- PDF generation failure;
- accounting error;
- no downloads remaining;
- pop-up blocked;
- no PDF support (HTML fallback).

## Not verified / remaining risks
- **Real iPhone Safari printing of a Composer sheet PDF:** needs one physical print. Measure a 60 mm label, its pictogram and the A4 edge offsets.
- **WebKit:** not available here. Delivery to the holding window (blob URL navigation) and the "Download the PDF again" link need checking in real iOS Safari.
- **Older iPhones (iOS < 16.4):** stay on the old HTML print page and are still affected by the margin shrink. Not testable here.
- **Fonts inside the raster:** unchanged from today (pixel-identical). Whether that raster uses DM Sans is a separate, pre-existing question.
- **Duplicate clicks:** there is no in-flight guard (pre-existing). Each completed click is a separate export and charge, as on main.

## Follow-ups (not in this change)
- The free blank size test and alignment test still print through the browser, so on an iPhone they can still show about 44 mm while the Composer PDF prints correctly. A genuine PDF size test is recommended next.
- Single-label print accuracy on iPhone: investigation only, as approved.
- Pre-existing, seen during screenshots: low-contrast "Blank outlines only · no download credit" text and "Step-by-step printing guide & Q&A" link on the dark export panel.
- Version number, CHANGELOG and release notes: to be set at release (VERSIONING.md).
