# Fragrance percentage and supplier-document applicability (3 Oct 2026)

**Branch:** `fix/sds-document-applicability`, from production `main` `148334a`. **Not deployed.**
- PR #203 (`57789c1`) was inspected only. It stays frozen until this replacement is approved and
  deployed.
- No renderer change: `label-render.js` does not use the fragrance %. The approved homepage labels
  are unchanged, and the Builder Safety Baseline still matches its snapshot exactly.

This is a software safeguard, not legal advice or a classification service.

## The question
"I use 8% fragrance but have a 10% SDS, or use 12% fragrance with a 10% SDS. What can CLPeasy
safely do, and when must I obtain supplier information?"

## Evidence, in three separate categories

**Source status:** this environment's network policy blocks legislation.gov.uk, eur-lex.europa.eu,
echa.europa.eu, hse.gov.uk, businesscompanion.info, britishcandles.org and reachonline.eu. **No
primary text could be opened.** Every point in A below comes from search results quoting or
summarising those sources. Each is marked "to confirm against the primary text" and should be
checked before the wording is relied on. Whether the GB CLP text is identical to the EU text cited
in the summaries has not been confirmed.

### A. Legal requirements (GB CLP / Trading Standards) — reported by secondary sources, to confirm
1. **Candles, wax melts and diffusers are mixtures.** The person placing them on the market
   classifies the finished mixture (joint Trading Standards / British Candlemakers Federation
   advice; HSE is the GB CLP agency).
2. **The supplier SDS is an input, not the classification of the maker's product.** The maker
   assesses the final formulation placed on the market.
3. **Classification uses concentration thresholds, not proportions.**
   - Generic limits for classifying a mixture as a skin sensitiser: an ingredient that is a
     Category 1 or 1B sensitiser at ≥1%, or Category 1A at ≥0.1%.
   - A **specific concentration limit (SCL)** set for a substance replaces the generic limit.
   - So hazards change in steps at thresholds, and the thresholds can differ by substance.
4. **EUH208 ("Contains … May produce an allergic reaction") has no single threshold.** It applies
   to a mixture *not* classified as a sensitiser that contains a sensitiser at or above the
   elicitation limit (Annex I Table 3.4.6, referred to from Annex II 2.8):
   - Category 1 or 1B: ≥0.1%;
   - Category 1A: ≥0.01%;
   - a substance with an SCL: ≥ one tenth of that SCL.
   The earlier version of this report stated "≥0.1% (or one-tenth…)" as if it applied to all
   sensitisers. **That was wrong and is corrected here.**
5. **A formulation change means the classification must be reviewed.**

### B. Supplier guidance (industry practice, not law)
- **% of total, not % of wax.** Supplier CLP templates express fragrance as a % of the total
  product mass (wax or base + fragrance), not % of the wax (for example Candle Shack's guidance).
- **"You can over-estimate but never under-estimate".** Several supplier blogs advise using, for
  example, a 10% CLP document for a 9% product. No legal source was found for this. Because of A3
  and A4, a different % can lead to different label elements.

### C. CLPeasy's conservative product policy (owner decisions, 3 Oct 2026)
CLPeasy's **evidence requirement** is this: hazard information is only used for a label when the
maker confirms that it comes from a **finished-product document** that:
- covers **their type of product**; and
- states the **same fragrance percentage** they use.

This is CLPeasy's own policy. **It is not a claim that the law requires an exact match.** Anything
else is blocked, and the maker is told to ask the supplier for GB CLP information for their product
at their percentage.

## How it works (as implemented)
| Situation | What CLPeasy does |
|---|---|
| Finished-product document for your product group at **exactly** your % | ✓ Use it (Smart Paste, then review against the document) |
| **12%** product, **10%** document | ⛔ Blocked; supplier guidance shown |
| **8%** product, **10%** document | ⛔ Blocked (owner decision 1). The message calls this CLPeasy's requirement and gives H317 / EUH208 as an example of a threshold effect, with no threshold figure |
| **9.0909%** product (from the calculator), **9.1%** document | ⛔ Blocked: the numbers are not rounded to make a match |
| Concentrated-oil SDS (100%) | ⛔ Blocked; CLPeasy does not calculate mixture classifications |
| Not sure what the document describes | ⛔ Blocked, with how to check (title and Sections 1–2) |
| Document % missing, a range ("8–10%") or not a number | ⛔ Blocked |
| Your % missing, a range or not a number | ⛔ Blocked at Step 2 and Step 3 |
| Document for another product group | ⛔ Blocked |
| "Something else / not stated" | ⛔ Blocked |

### Product groups (owner decision 4)
Each group needs a document for that group.

| Group | Covers |
|---|---|
| Candles | Scented, soy, votive, tea light, pillar, advent candle |
| Wax melts | Wax melt, wax tart, snap bar, clamshell, advent wax melt (and bag / bouquet if used) |
| Reed diffusers | |
| Electric or plug-in diffusers | |
| Car diffusers | |
| Room or linen sprays | |
| Car air freshener sprays | |
| Scented sachets | |
| Potpourri | |

- **Candles and wax melts are not interchangeable.** A document covers both only when the maker
  chooses "Candles and wax melts (the document names both)", which means the supplier document
  explicitly names both.
- **Sachets and potpourri:** these were listed Builder product types with no document group in the
  previous version of this branch, so those makers could not pass Step 3. Both are now their own
  groups.
- **Answers saved by the earlier version of this branch** (combined "wax"/"diffuser"/"spray"
  choices) are not accepted, and the maker is asked to choose again. These answers never reached
  production.

### Precision and rounding
- **Exact comparison.** Both percentages are compared exactly as numbers. 10 and 10.0 are equal;
  10.04 and 10 are not; 9.0909 and 9.1 are not.
- **Single figures only.** Both fields accept a single number (optionally with "%"; a decimal comma
  is accepted). Ranges, words and "about" are rejected.
- **Calculator.**
  - It no longer rounds the applied value to 1 decimal place. 20 g of fragrance in 200 g of wax
    gives **9.0909%** (the exact value is 9.0909…%), shown as "9.0909% (rounded to 4 decimal
    places)".
  - It tells the maker that CLPeasy compares this figure exactly and never rounds to make a match.
  - Exact values (180 g + 20 g → 10%) are shown without the rounding note.
- **Supplier-stated coverage.** CLPeasy uses only the single % the document states. If a supplier
  says a document covers a range or "up to" a %, CLPeasy does not interpret that. The maker must
  ask the supplier for information at their exact %, or enter the % the document states.

### Confirmation and export (owner decision 2)
1. **When the check is confirmed.** It is confirmed only when the maker successfully leaves Step 3
   (Next to Step 4). Leaving Step 3 already requires a matching document, extracted or reviewed
   hazards, and the "I confirm" tick.
2. **What the confirmation is tied to:**
   - the fragrance %;
   - the product type;
   - the hazard information (H and P statements, pictograms, signal word and named sensitisers;
     the order of the codes is ignored);
   - the document answers.
3. **When it stops counting.** If any of these changes afterwards, the label shows **needs
   re-check**, and every export is blocked until the maker goes through Step 3 again.
4. **Saved with the label.** The confirmation is saved with the label (in the browser, like the
   rest of My Labels). Reopening a label restores it, and it counts only if nothing has changed.

**Builder:**
- **The gate.** The single export gate (`_downloadAllowed()`) now also requires the confirmation.
  It covers all six export functions (PNG, SVG, PDF sheet, print-ready PDF, cutting-machine PNGs,
  print to PDF) and every button that calls them.
- **Reopened labels.** A label reopened from My Labels goes straight to Step 5, where the same gate
  applies.
- **On-screen guidance.** Step 5 shows a notice with the reason and a "Go to Step 3 (Hazards)"
  link.
- **Labels saved before this change** are not checked yet. They can be reopened and edited, but
  not exported until the maker completes Step 3. The saved design itself is not changed.
- **Saving the label (btn-save)** shares this gate, as it already did for the Step 5 tick.

**Print Sheet Composer:**
- **The gate.** The single export gate (`getSheetFitBlockMessage()`) and the button state now
  refuse a sheet that contains any label without a current confirmation. This covers:
  - Print / Save as PDF;
  - every cutting-machine PNG and ZIP path.
- **Guidance.** A notice lists the label names, and tells the maker to open each one in Create
  Label, complete Step 3 and save. Saved designs are kept.

## Review of the original implementation (production `148334a`)
| Found | Problem | Change |
|---|---|---|
| "Fragrance load % (optional)" | Unclear basis, and optional | "Fragrance in the finished product (% by weight)", required, with the formula |
| Calculator applied **% of wax** (20 g in 200 g → "10%") | Supplier information uses % of the finished product | Applies 9.0909% of the finished product; % of wax shown for reference |
| Tip "overestimate but never underestimate"; "Use 25% CLP…"; "may not need/require CLP" | Unsupported assurances | Replaced |
| No document check | Smart Paste accepted any Section 2.2, including a 100% oil SDS | Step 3 check plus export confirmation (above) |

**Unchanged:**
- the approved GB note;
- the Step 3 and Step 5 confirmations;
- the C4 stale-hazard review;
- the renderer and labels;
- Supabase, Stripe and the database.

## PR #203 (frozen) compared with this branch
| PR #203 | This branch |
|---|---|
| Exact % match at Smart Paste; blocks a 100% SDS | Same, plus product-group match and an explicit document type |
| Hand-entered hazards not gated; saved labels not gated | Gated at Next / leaving Step 3, and at every Builder and Composer export |
| Auto-filled the document % from the pasted text | Never auto-filled |
| Kept the %-of-wax calculator and the misleading tips | Fixed |
| Based on `727804e` | Based on production `148334a` |

## Tests
- **`tests/sds-document-applicability.js`** (real `builder.html` in JSDOM, 9 groups) covers:
  - **Step 3 check:**
    - every blocking case above, including 9.0909 vs 9.1 and ranges;
    - candle ≠ wax melt, with "both" covering both;
    - every listed product type is mapped;
    - old combined answers are asked again;
    - enforcement at Smart Paste, Next and leaving Step 3.
  - **Step 2 and calculator:** the Step 2 % requirement and the calculator precision.
  - **Export confirmation:**
    - an unconfirmed label is blocked at all six export functions, with no file produced;
    - leaving Step 3 confirms the label;
    - the confirmation is invalidated by a change to the %, product type, H, P, pictogram, signal
      word, sensitiser or document answer;
    - saved and restored;
    - the Composer gate is wired to the same module.
- **Existing Builder harnesses:**
  - They answer the check through `tests/helpers/sds-doc-answer.js`, using the label's **real**
    product type only.
  - The earlier version substituted "Scented Candle" for blank or fake types. **That substitution
    has been removed.**
  - Fixtures now use real Builder product types.
- **Composer harnesses:** saved fixtures carry a real confirmation made by the shared module, and a
  dedicated case checks that an unconfirmed label blocks the sheet.

## Limitations
- **Primary legal texts not opened** (network policy). Category A is reported by secondary
  sources and is to be confirmed.
- **CLPeasy cannot read the document.** The check relies on the maker's answers about the document
  type, % and product. It blocks known-insufficient evidence; it cannot detect a wrong answer.
- **Local storage only.** The confirmation is stored with the label in the browser, like My Labels.
  Clearing browser data loses it along with the label.
- **Smart Paste** still extracts from Section 2.2 text, and the maker must still review the result.
