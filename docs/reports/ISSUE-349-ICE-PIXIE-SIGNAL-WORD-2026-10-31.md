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

## Follow-up: product-identifier substances (GB CLP Article 18(3)(b))
The founder and ChatGPT verified Article 18(3)(b) against legislation.gov.uk: https://www.legislation.gov.uk/eur/2008/1272/article/18/data.xht. That site is blocked from the development session, so the article text was not re-read here.

**Problem:** Ice Pixie's SDS names alpha-iso-Methylionone (Section 3: 1–<5%, Skin Sens. 1B) only in its Section 1.1 product name. CLPeasy read Section 2.2 only, so that name was missing from the label. The three EUH208 names were present.

**Approach.** Supplier evidence, plus maker confirmation, fails closed. Nothing is assumed automatically.

- **`ProductIdentifierCheck`.** Added inside `sds-doc-check.js`, which every page and test harness already loads. It does four things:
  - Lists the H statements of the Art 18(3)(b) hazard classes. These are acute toxicity, skin corrosion, serious eye damage, mutagenicity, carcinogenicity, reproductive toxicity, respiratory/skin sensitisation, STOT SE/RE and aspiration.
    - The list is deliberately broad. A listed code only asks for confirmation; it never removes content.
    - **REVIEW:** the code mapping, especially H335/H336, should be confirmed against the verified text.
  - Parses Section 1.1 of the same pasted SDS for `(Contains:…)` or `Contains: …`. It handles names wrapped across lines, hyphen-wrapped names and nested brackets. Names are split only at a comma followed by a space, so internal chemical commas such as "2,6,6" are kept.
  - If Section 1.1 has none, a supplier "Contains:" line kept from Section 2.2 is offered as evidence instead.
  - Returns "found", "none", "no Section 1.1" or "unclear". The last three never guess.
- **Builder Step 3 panel:**
  - It appears only when the label has one of those H codes.
  - It shows the supplier's exact wording, with **"Use these names"** or **"Confirm typed names"** (typed exactly from supplier documents; empty is refused).
  - Until a confirmation exists, Step 3 Next, every Builder download and the Composer sheet are blocked with an explanation.
  - The confirmation is tied to the exact H statements. A changed H code or a new extraction needs a fresh confirmation.
  - Saved, reopened and Clear behave as expected.
- **Label (shared renderer, so Builder and Composer match).** Confirmed names print as "Contains: name, name." in the hazard text, ahead of the EUH208 sentence. Names already printed through the supplier's Section 2.2 "Contains:" line are not repeated. The normal fit check still applies.

**Ice Pixie result:**
- The panel shows "(Contains:alpha-iso-Methylionone)". After "Use these names", the label shows "Contains: alpha-iso-Methylionone." plus the full EUH208 sentence with all three names.
- Save, reopen and the Composer render are identical.

**Other layouts tested:**

| Layout | Section 1.1 result |
|---|---|
| NI Candle "Banded" (Hawaiian Honey Blossom; four names wrapped over two lines) | 4 names |
| A Word-generated SDS from another supplier (Pixie Dust) | 4 names, upper case kept |
| Library and Strawberry Fizz | "none" |
| Plain `Contains:` line with chemical commas | names found, commas kept |
| Unterminated list | "unclear" |
| Section 2.2-only paste | "no Section 1.1"; the maker must type the names |
| Whole-document column copy | not found; the maker must type the names (fail closed) |

**Test adjustments:**
- The shared test helpers that stand for "a maker who completed the Builder with supplier information" now also confirm names, through the real Builder action or the production module. These are `tests/helpers/sds-doc-answer.js` and `tests/helpers/sds-doc-verified.js`.
- Three Composer tests that build saved labels in the page do the same: `m55-bgcolour-validation`, `post-download-print-guidance` and `stage2-print-guidance`.

**Decisions for the founder:**
1. **Existing saved labels.** Every saved label with one of these H codes and no confirmation (all labels saved before this change) will be blocked from Builder download and Composer printing until reopened and confirmed in Step 3. This is fail-closed, as instructed, but it affects existing customers.
2. **Label wording and position.** "Contains: …" is printed in the hazard text block. FizzyWhiz prints it under the product name. Approve the wording and position, or specify an alternative.
3. **No "none" option.** A supplier SDS that gives no names leaves the maker blocked until they obtain them. There is deliberately no "my supplier names none" bypass.
4. **Hazard-code list.** Confirm the Art 18(3)(b) code list (REVIEW).
