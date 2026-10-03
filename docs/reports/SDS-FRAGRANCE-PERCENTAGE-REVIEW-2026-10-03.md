# Fragrance percentage and supplier-document applicability (3 Oct 2026)

**Branch:** `fix/sds-document-applicability`, from production `main` `148334a`. **Not deployed.**
- PR #203 (`57789c1`) was inspected only. It stays frozen and is not merged.
- No renderer change: `label-render.js` does not use the fragrance %. The approved homepage labels
  are unchanged, and the Builder Safety Baseline still matches its snapshot exactly.

This is a software safeguard, not legal advice or a classification service.

## The question
"I use 8% fragrance but have a 10% SDS, or use 12% fragrance with a 10% SDS. What can CLPeasy
safely do, and when must I obtain supplier information?"

## What each input represents
| Input | Meaning |
|---|---|
| **Fragrance in the finished product (% by weight)** (Step 2) | Fragrance weight ÷ total weight of the finished product (wax or base + fragrance) × 100. GB CLP classifies the finished mixture by the concentration of each ingredient *in that mixture*. |
| **What the supplier document describes** (Step 3) | Either the **concentrated fragrance oil** (an oil SDS, effectively 100%), or a **finished product at a stated %** (a supplier "CLP document" / SDS for, for example, "candle at 10%"). |
| **Fragrance % the document covers** (Step 3) | The fragrance concentration in the finished product that the supplier's classification was prepared for. Typed in by the maker; never guessed. |
| **Product the document covers** (Step 3) | Wax (candles and wax melts), diffuser base, or spray base. The base changes the hazards (for example an alcohol spray base is flammable; some diffuser bases are hazardous). |

## Evidence
**Network limitation:** this environment blocks legislation.gov.uk, businesscompanion.info,
britishcandles.org and reachonline.eu. Primary texts could not be opened. The points below come
from search results that quote or summarise those sources, and each should be re-confirmed against
the primary text.

**Authoritative points (GB CLP / Trading Standards):**
1. **Candles are mixtures.** Candles, wax melts and diffusers are mixtures under GB CLP and UK
   REACH (joint Trading Standards / British Candlemakers Federation advice pack).
2. **The supplier SDS is an input; the maker classifies.** The maker must assess the final
   formulation placed on the market and apply the mixture classification rules to the fragrance
   load (Trading Standards / BCF advice; HSE is the GB CLP agency).
3. **Classification is concentration-threshold based, not proportional.**
   - Annex I uses generic and specific concentration limits. For example, skin sensitisers
     classify a mixture at ≥1% (Cat. 1/1B) or ≥0.1% (1A), and an irritant ingredient at ≥10%
     generally classifies the mixture as an irritant.
   - The mixture's hazards therefore change in steps at thresholds, not in proportion to the
     fragrance %.
4. **EUH208 depends on concentration.** A mixture not classified as a sensitiser but containing a
   sensitiser at ≥0.1% (or one-tenth of a specific limit) must carry "EUH208 Contains … May
   produce an allergic reaction" (Annex II 2.8).
   - So the same fragrance can give H317 at 10% and EUH208 at a lower %.
5. **Formulation change means review.** A change of formulation requires the classification to
   be reviewed (HSE / CLP guidance on mixture classification).

**Industry (supplier) guidance, not authoritative:**
- **% of total, not % of wax.** Supplier CLP templates are prepared for fragrance content as a % of
  the **total** product mass (wax + fragrance), not % of wax (for example Candle Shack, "Is CLP
  based on fragrance content or fragrance load?").
- **"Over-estimate" practice.** Several supplier blogs say a maker "can over-estimate but never
  under-estimate" (use a 10% CLP for 9%). No authoritative source was found for this, and point 4
  shows it can produce a different, incorrect label.

## Answer to the user's question (as implemented)
| Situation | What CLPeasy does |
|---|---|
| Supplier finished-product document for the **same kind of product** at **exactly** your % | ✓ Use it (Smart Paste, then review against the document) |
| **12%** product, document for **10%** | ⛔ Blocked: hazards can be more severe or additional at a higher %. Obtain supplier GB CLP information for your product at 12% |
| **8%** product, document for **10%** | ⛔ Blocked: a lower % is not automatically covered, and some warnings depend on thresholds (for example H317 vs EUH208). Obtain supplier information for 8% |
| SDS for the **concentrated oil** (100%) | ⛔ Blocked: it describes the oil, not your product, and CLPeasy does not calculate mixture classifications |
| Not sure what the document describes | ⛔ Blocked, with how to check (title and Section 1/2 should name a finished product and %) |
| Document % missing or not a number ("see section 3") | ⛔ Blocked |
| Your own % missing or uncertain ("about 10") | ⛔ Blocked at Step 2 and Step 3 |
| Document for a different base (wax document for a spray or diffuser) | ⛔ Blocked |
| Product or base CLPeasy cannot match ("something else") | ⛔ Blocked |

**Where the check is enforced:**
- Smart Paste extraction;
- the Step 3 confirmation and Next button;
- leaving Step 3, so hazards typed or edited by hand are covered too.

**Other implementation details:**
- The answers are saved with the label and restored.
- The fragrance % comparison is exact: 10.04% is not treated as covered by 10%.

## Review of the existing implementation (production `148334a`)
| Found | Problem | Change |
|---|---|---|
| "Fragrance load % (optional)" | Unclear basis, and optional, so nothing could be checked | Now "Fragrance in the finished product (% by weight)", required, with the formula shown |
| Calculator applied **% of wax** (20 g in 200 g → "10%") | Supplier CLP information uses % of the finished product (9.1%) | Applies 9.1% of the finished product; % of wax shown for reference only |
| Tip: "you can overestimate but never underestimate" | Unsupported assurance | Replaced with "must be for the exact % you use" |
| Tip: "Use 25% CLP if your load is between 15–25%" | Unsupported assurance | Replaced |
| Tips: "may not need CLP" / "may not require CLP if fragrance load is low" | Treats a lower % or base as automatically safe | Replaced (the sachet tip now says a lower % does not automatically mean no CLP) |
| No document applicability check (only a general note) | Smart Paste accepted any Section 2.2, including a 100% oil SDS | New Step 3 check (above) |

**Unchanged:** the approved GB note ("Use your supplier's CLP information for the percentage you
actually use, not the information for the undiluted oil"), the Step 3 and Step 5 confirmations,
the C4 stale-hazard review, and the renderer and labels.

## PR #203 (frozen) compared with this branch
| PR #203 | This branch |
|---|---|
| Requires an exact % match at Smart Paste; blocks a 100% SDS | Same principle, plus a product/base match and an explicit concentrate / finished / unsure choice |
| Hand-entered hazards were not gated | Gated at the confirmation, Next and leaving Step 3 |
| Auto-filled the document % from the first "oil … N%" in the pasted text | Never auto-filled; the maker types the % stated on the document |
| Kept the %-of-wax calculator and the misleading tips | Fixed |
| Based on `727804e` (pre-PAYG/hero/Phase 1) | Based on current production `148334a` |

**Recommendation:** close PR #203 as superseded once this branch is approved. That is your
decision; it stays frozen until then.

## Tests
- **New:** `tests/sds-document-applicability.js` (real `builder.html` in JSDOM; 7 groups) covers:
  - 8% and 12% against 10%; exact match; 10.04 vs 10;
  - concentrate, unsure, missing or uncertain own %, missing or non-numeric document %;
  - base mismatch and unmatched base;
  - the wax melt / diffuser / spray mapping;
  - enforcement at Smart Paste, Next and leaving Step 3 (manual entry);
  - the Step 2 requirement, the calculator (9.1%) and saving with the label.
- **Existing Builder journey harnesses (13):** these predate the check. They now answer it through
  `tests/helpers/sds-doc-answer.js`, as a maker with a matching document would. The helper does
  not change or bypass any production check.
  - For tests that use a fixture product type that is not a Builder option (`'Candle'`, or blank),
    the helper substitutes "Scented Candle" only while the check runs.
- **Builder Safety Baseline:** identical to its snapshot (10 labels).

## Limitations
- **Primary legal texts not opened** (network policy); evidence is from search results. Confirm
  the cited points against legislation.gov.uk and the Trading Standards / BCF advice pack before
  relying on the wording.
- **Labels saved before this change** have no document answers. They are checked when the maker
  goes back through Step 3, but they are **not** blocked from download when reopened directly.
  Retro-blocking saved labels would be an owner decision, similar to M09/M31.
- **Not verified:** CLPeasy cannot verify that the maker's answers match the document. It checks
  consistency and blocks known-insufficient evidence; it does not read the document's % or base.
- **Smart Paste** still extracts from Section 2.2 text; the maker must still review the result.

## Decisions for you
1. **Lower-% use of a higher-% document** (for example 8% with a 10% document): currently
   **blocked**. Some suppliers advise it is acceptable ("over-estimate"), but no authoritative
   source was found, and threshold effects can make the label wrong. Keep the block, or allow it
   with an explicit acknowledgement, pending advice.
2. **Saved labels without document answers:** leave as is (checked on edit), or block download
   until answered.
3. **PR #203:** close as superseded once this branch is approved.
4. **Product groups:** candles and wax melts are grouped as "wax". Confirm that a supplier "candle"
   document may be used for a wax melt at the same %, or split them.
