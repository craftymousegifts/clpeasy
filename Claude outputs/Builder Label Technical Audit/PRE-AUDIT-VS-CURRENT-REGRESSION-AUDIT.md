# Pre-audit vs current Builder regression audit (29 Sep 2026)

**ACCEPTED by Michaela (29 Sep 2026):** RESULT: EXISTING AUDIT CHANGES REGRESSION-CHECKED — NO UNEXPLAINED BUILDER BREAKAGE FOUND.

- **Pre-audit:** `e8c1f25`, the commit the audit branch starts from, directly before the first audit fix `79b0cd3`.
- **Current:** `fix/circle-per-line-text-fit` at `d7a0ec2`; the application code is unchanged since.
- **Method:** the same 16 labels driven through the real Builder journey (Smart Paste, Steps 1–5, SVG/PNG/PDF, save, reopen, Composer A4 PDF, cutting PNG) on both versions, compared field by field. Every difference was then bisected: each label's exact renderer input was rendered through `label-render.js` at the base and after every one of the 15 audit commits that touched it. For the bisect only, the three commits carrying the broken M55 line (`6f70631`, `0b4e039`, `ee80aa0`) had that one line's formatting corrected.

## Result
**No unexpected or uncertain differences.** Every difference traces to an approved, signed-off fix.

| Difference | Labels | Cause |
|---|---|---|
| P-statement wording: P501 now the supplier's wording, not the invented "Dispose of contents and container in accordance with local regulations."; P302+P352, P333+P313 and P301+P310 capitalisation and wording now the verified GB text | all 16 (all contain P501) | `b88fad2`, Issue #5 (M19/M20) |
| P261 "Avoid breathing vapours and dust." becomes "Avoid breathing vapours." (the supplier's wording as given) | medium/heavy | `b4c412b`, Issue #5 P260/P261 decision |
| Hazard-block font size changes that follow from the wording length | 12 labels | `b88fad2` / `b4c412b` |
| Circle hazard text slightly smaller (per-line chord fit) | circle 52/63 cases | `79b0cd3`, Issue #1 (M44) |
| Circle product-name size changes (arc cleared of the business name) | circle cases | `b321c33`, Issue #2 (M45) |
| "Midnight Blackberry & Bay Leaf Luxury Soy" at 63 mm circle: exportable becomes **blocked** (product name too small), suggestion 83 mm. Its blocked render also shows the minimum 10 mm pictogram and a larger type/signal word. | circle-63-long-name | `b321c33`, Issue #2. The signed-off evidence documents that long names which cannot clear the business name at the 1.2 mm minimum are now blocked with a larger-size suggestion. A minimum pictogram on a non-fitting render is pre-existing behaviour. |

## Unchanged, for every label
- **Label content:** H statements, EUH208 text, sensitiser names, signal word, product name and type, supplier name, address and telephone, weight/burn-time/batch line, and pictogram identities.
- **Behaviour:** Smart Paste extraction, fit state (apart from the one case above), export dimensions (SVG, PDF page, PNG), save/reopen, and Composer placement, A4 PDF render size and cutting PNG.
- **Accounting:** guest exports never touch download accounting.

## Harness-only non-differences
- `_downloadBlockedMessage()` and the Composer's `sheetContentIssues` do not exist at `e8c1f25`.

## Happy path, click-driven (current and pre-audit)
- **Coverage:** circle 63, square 63 and rectangle 76×51, typed and clicked through the real controls, including the approved bottom navigation bar, Smart Paste, confirm, verify, SVG/PNG/PDF, save, reopen, and the Composer listing, A4 PDF and cutting PNG.
- **Result:** desktop 21/21 and mobile 23/23 checks for each shape, on **both** versions. Mobile also covers "View label" and no horizontal overflow.
- **Observation (not a regression, identical before and after):** on mobile the fixed bottom navigation bar can cover a form field until the field is scrolled up; tapping the covered area hits the bar's "← Back". An automated tap reproduced this; it disappears when the field is scrolled to mid-screen.

## Suite
Full suite at `d7a0ec2`: 61 pass, 5 fail. The 5 are the long-standing audit-branch baseline failures. The Builder Safety Baseline passes.
