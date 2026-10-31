# Issue #349 — Ice Pixie 10% SDS: signal word not read (31 Oct 2026)

**Tier:** High (SDS interpretation feeding CLP label content). Draft PR only; founder approval required before merge or deploy.

**Source:** FizzyWhiz `133_Ice_Pixie_10_Non_Hazardous_Base_Wax_Melt_CLP_Safety_Data_Sheet_Banded_133NHB`. JasperReports 6.18 "Banded" template, Version 2, issue date 16/03/2026, 8 pages. Supplied by the founder; stored at `tests/fixtures/issue349/`.

## Root cause
- Section 2.2 is a two-column table, with labels at x≈31 pt and values at x≈141 pt.
- Some PDF viewers copy it column by column: all labels first ("Signal word:", "Hazard statements:" …), then all values ("Warning", "H317, …", "P261, …").
- `extractSdsSignalWord()` only accepted:
  - "Signal word: Warning" (value after the label), or
  - "Warning" on the line directly before an empty "Signal word:".
- In column order the value sits several lines away, so the signal word read as blank.
- H/P/EUH codes are on their own lines, so they were still extracted. The supplier-faithful gate then correctly stopped with "The signal word … could not be read". This matches the reported symptom.

**Reproduction (real Builder, jsdom, mocked services; main @ 3c27d2f):**

| Copy order | Result on main |
|---|---|
| PyMuPDF stream order | Warning |
| PDFium (Chrome) order | Warning |
| pdftotext raw | Warning |
| pdftotext layout | Warning |
| Section 2.2 column order | `sdsSignal=''`, issue "Signal word", everything else extracted |

**Caveat:** the column-order fixture is generated from the real PDF's line positions (real wording, reconstructed reading order). The founder's exact iPhone copy order has not been captured; one real-device check is needed.

## Fix (`builder.html`, `extractSdsSignalWord`)
- Accept "Signal words:" (plural) in the same-line form.
- New narrow rule. If the pasted Section 2.2 has an **empty** "Signal word:" label line and **exactly one** line that is nothing but "Warning" or "Danger", use that value.
- Otherwise return blank, so the existing review gate still stops. This covers:
  - no value line;
  - two value lines;
  - Warning + Danger;
  - a value line with no Signal word label.
- No change to:
  - scoping;
  - H/P/EUH extraction;
  - supplier wording;
  - the signal-word gate;
  - export blocking.

## Results with the fix
For all three real-text orders (stream, PDFium, Section 2.2 column):

| Element | Result |
|---|---|
| Signal word | Warning |
| H/EUH | H317 + EUH208 |
| EUH208 sensitisers (exact names) | (E)-1-(2,6,6-Trimethyl-2-cyclohexen-1-yl)-2-buten-1-one; Reaction Mass of (3E)-3-methyl-4-…-3-buten-2-one and (1E)-1-…-1-penten-3-one; omega-Pentadecalactone |
| Pictogram | GHS07 |
| P statements | P261, P272, P280, P302+P352, P333+P313, P363, P501, with supplier wording (including P272/P363) |
| Review issues | none |
| Ingredient hazards from Sections 3 and 16 (H315, H411, H302) | not on the label |

The column-order copy also continues past Step 3. Save, reopen and the Composer render all keep identical label text.

The whole-document column copy is genuinely garbled: Section 2.1 values land inside 2.2. Warning is now read, but H317 wording still stops for review. Fail-closed is kept.

## Historical label (21 Oct 2026, founder screenshot)
The label shows "snow fairy soy wax melt", WARNING, GHS07, "Causes skin irritation. May cause an allergic skin reaction. Contains: d-Limonene", and P261/P302+P352/P333+P313/P501.

- **d-Limonene:** does not appear anywhere in this Ice Pixie SDS.
- **H315:** appears in this SDS only in Section 3 (ingredient alpha-iso-methylionone, "H315-H317-H411") and Section 16. Section 2.2-only extraction was released on 18 Oct (v1.2.0, #261), before 21 Oct, so Ice Pixie's Section 3 H315 could not reach a 21 Oct label.
- **Conclusion:** the 21 Oct label was almost certainly made from a different SDS (the product name suggests a Snow Fairy fragrance). H315 and d-Limonene cannot be attributed to the Ice Pixie SDS or to a CLPeasy extraction fault without that SDS or the saved label record. **Unverified.**
- **P272, P280 and P363** were absent on 21 Oct because the legacy Smart Paste P-statement exclusion list was still active. It was removed on 26 Oct (#270). Current output keeps the supplier's statements.

## Other observations (not changed)
- **REVIEW (regulatory, not adjudicated):**
  - The SDS product identifier in Section 1.1 is "Ice Pixie 10% Non Hazardous Base (Contains:alpha-iso-Methylionone)".
  - The FizzyWhiz CLP Maker label shows "(Contains: alpha-isoMethylionone)" under the product name.
  - CLPeasy reads only Section 2.2, so this substance name does not appear on the CLPeasy label. The label still shows the three EUH208 names.
  - Whether GB CLP requires the substance responsible for the H317 classification to be named on the label (as part of the product identifier) needs checking against legislation.gov.uk / HSE before any change.
- **"for example 'candle'":** the suitability message uses this as a fixed example wording. Wax Melt maps correctly to the wax-melt document group (`sds-doc-check.js`). This is not a product-type error.
- **Pre-existing:** `guide-me-content-sync` fails on main (stale generated Guide Me content).

## Still to verify
1. iPhone Safari: copy the same PDF exactly as before and paste it into the draft PR's deploy preview. Confirm Warning, H317, EUH208, the seven P statements, and that continuation is allowed.
2. Founder decision on the REVIEW item above.
