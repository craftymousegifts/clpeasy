# M65: the Composer's blocked-label heading says "doesn't fit" even when the block is a data/content problem

| | |
|---|---|
| ID | **M65** (new; continues after M64) |
| Area | Print Sheet Composer (`print.html`), the sheet issues panel (`.fit-issues-panel`) |
| Status | **OPEN**. Recorded only; **not fixed**. First observed during the Issue #7 (M38) QA (see `post-fix-unknown-pictogram-keys/README.md`, "Observed, pre-existing and unchanged"). Recording approved by Michaela on 28 Sep 2026. |
| Origin | Pre-existing. |
| Severity | Low (wording/UX). Export is still correctly blocked, and the per-label reason under the heading is specific and correct. |

## Finding

Every label placed in `sheetFitIssues` gets one generic heading:

> ⚠ N label(s) on this sheet doesn't/don't fit and must be fixed before you can print or download this sheet.

(`print.html`, the `panel.innerHTML=` line that builds the `fip-head` for `sheetFitIssues`.)

`sheetFitIssues` holds physical-fit problems (hazard-text overflow, footer clipped, text too small, and so on), but also blocks that have nothing to do with size:
- an unrecognised hazard/precautionary code ("Contains a hazard/precautionary code CLPeasy doesn't recognise: …");
- an unrecognised pictogram key ("Pictogram '…' was not recognised…", Issue #7).

For those, the heading tells the maker the label "doesn't fit", which is misleading. No label size fixes a data problem. The per-label reason underneath is accurate, and for unrecognised codes/pictograms it correctly gives no size advice.

Missing required content (M09/M31) already has its own separate, accurate heading ("…missing required label content…").

## Not in scope of this record
No fix proposed or made. A future fix would be wording/UX only (for example a neutral heading, or grouping data problems under their own heading). It must not change which labels are blocked.
