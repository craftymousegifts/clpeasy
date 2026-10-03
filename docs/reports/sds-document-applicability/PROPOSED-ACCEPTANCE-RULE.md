# Supplier-coverage acceptance rule (decided 3 Oct 2026; implemented on Test)

**Owner decisions (3 Oct 2026):**
- **D1 approved:** explicit finished-product coverage ranges are accepted when the supplier states
  that the supplied hazard and label information applies throughout that range and to the maker's
  product. Ingredient ranges and recommended usage ranges are not accepted.
- **D2:** coverage is **not** inferred from "up to X%". Clarification is required, defining
  coverage for the actual product and percentage.
- **D3:** the written-confirmation route stays enabled.
- **D4:** an optional document date or version field is added.

**Correction:** "a lower-% document is never accepted" is replaced by "**a document for a different
percentage does not, on its own, establish coverage**". A supplier clarification can establish it,
and that clarification must explicitly identify the applicable finished-product hazard information.

These are **CLPeasy evidence-recording rules, not legal certification.** They are implemented on
`fix/sds-document-applicability`, on the Test preview only. Nothing is deployed to production or
legally approved.

The proposal text below is kept for the record; the decisions above take precedence.

## Basis (official guidance, as reported by the ChatGPT workstream)
**These pages were not opened from this environment**, which is still blocked; they are recorded as
reported.

| Source | Reported point |
|---|---|
| [HSE: How does classification work?](https://www.hse.gov.uk/chemical-classification/classification/how-does-classification-work.htm) | HSE directs GB businesses to the ECHA classification guidance |
| [ECHA poison centres: identify available information](https://poisoncentres.echa.europa.eu/web/guest/support/mixture-classification/identify-available-information) | Supplier SDSs and other supplier safety information are recognised sources of information for classifying a mixture |
| [ECHA: examine available information](https://echa.europa.eu/en/support/mixture-classification/examine-available-information) | Available information must be examined for **relevance, reliability and sufficiency** before it is used |

Earlier sources (`PRIMARY-SOURCE-CHECKLIST.md`) support classifying the specific mixture,
formulation-specific assessment, and thresholds that vary, including specific concentration limits.

**What this changes:** the guidance is about whether information **actually covers** the mixture
being placed on the market. It does not require the same digits to be printed on the document. So
the proposed rule moves from "identical percentage digits" to **"explicit supplier coverage of the
actual product and percentage"**, while still never letting CLPeasy infer, extrapolate or round.

## The proposed rule in plain language
CLPeasy uses supplier hazard information for a label only when **the supplier itself has explicitly
said** that the information covers:
1. **the maker's type of finished product** (for example candles, wax melts, reed diffusers); and
2. **a fragrance percentage that includes the maker's actual percentage.**

There are three accepted ways the supplier can say this. CLPeasy never works it out itself.

### Accepted case 1: a finished-product document stating the exact percentage
- **Example:** "Lavender Fields – CLP for candles at 10%", and the maker uses 10%.
- **Rule:** the stated figure equals the maker's figure (10 = 10.0 = 10%). This is the same as
  today.

### Accepted case 2: a finished-product document explicitly covering a stated range that contains the actual percentage
- **Example:** "CLP information for candles – valid for fragrance loads of 6% to 10%", and the maker
  uses 8%.
- **Rule:**
  - **The range is the supplier's statement of what the classification covers.** It must be
    written on a finished-product document (for example "valid for", "applies to", "covers").
  - **The maker's percentage must be inside the range as written:** lower ≤ actual ≤ upper.
  - **The maker records the range exactly as written,** plus where it is stated (section, page or
    heading).
- **"Up to X%" wording** ("valid for loads up to 10%"): accepted under the same rule only if the
  wording explicitly says the classification **applies to** loads up to X%. See decision D2 for the
  open question about the missing lower limit.

### Accepted case 3: written clarification from the supplier
- **Example:** the supplier emails "our 9.1% candle CLP applies to your candle at 9.0909%". Another
  example: "this document covers your wax melts at 8%".
- **Rule:**
  - the clarification names the maker's product and the maker's exact percentage;
  - the maker records who, when, and which document it refers to.
- This is the existing written-confirmation route. It covers rounding and other "does this apply to
  me?" questions, and the supplier makes that call, not CLPeasy.

### Never accepted (unchanged or made explicit)
| Situation | Why |
|---|---|
| A document for a **higher** % with no explicit coverage statement for the maker's % | Does not, alone, establish coverage of a lower %, which is never inferred. A supplier clarification can establish it |
| A document for a **lower** % (on its own) | Does not, alone, establish coverage. Hazards can be more severe or additional at a higher %. A supplier clarification identifying the applicable finished-product hazard information can establish it |
| **Ingredient ranges in an oil SDS** (Section 3 composition, for example "linalool 10–25%") | These describe the **concentrated oil's composition**, not the finished product's coverage. CLPeasy never uses them and never calculates a classification from them |
| An oil SDS (100%) used as if it were the finished product | It describes the oil, not the product |
| **Maximum usage rates** (for example an IFRA certificate maximum or a "max load 10%" product note) | A recommended or allowed usage limit is not a statement of what the CLP classification covers |
| A figure that is "close" (9.0909 against 9.1, 10.04 against 10) | No numerical tolerance. Only an explicit range containing the %, or a written clarification, covers it |
| Another product group, unless the document names it | As today (candles and wax melts are separate) |
| Any calculation, scaling or extrapolation of hazards | CLPeasy never does this |

## How it would look in the Builder (for review; not built)
1. **Step 3, "A finished product made with this fragrance…".** A new question asks how the document
   states the percentage it covers:
   - one percentage;
   - a range (from / to);
   - "up to" a percentage (only if decision D2 accepts it).
2. **Structured fields.** The range uses separate "from" and "to" boxes, not free text, so CLPeasy
   never interprets wording. A required "Where is this stated?" box (section, page or heading) is
   added.
3. **Short reminder beside the range option:** "Only use this if the supplier says the hazard
   information is valid for this range. Ingredient ranges in an oil SDS, and maximum usage rates,
   don't count."
4. **Unchanged:** the written-confirmation answer (case 3).
5. **What the message says when the % is inside the range:** "Your answers are consistent: your
   supplier's document states it covers candles at 6–10%, and you use 8%. CLPeasy can't read the
   document, so check it says this."
6. **Also unchanged:**
   - export gates;
   - draft saving;
   - existing-label recovery;
   - re-check when anything changes (range fields would be part of the confirmation);
   - fine-tune settings;
   - renderer and approved artwork.

## Decisions needed before implementing
- **D1: accept case 2 (explicit ranges)?** Recommendation: yes, under the rule above. The supplier
  explicitly states the coverage, and CLPeasy only checks that the maker's number is inside it.
- **D2: accept "up to X%"?** An "up to" statement has no stated lower limit. Some label elements
  change below concentration thresholds (for example H317 against EUH208), so using it at a much
  lower % may give a different label from the one a supplier would produce for that %. Options:
  - (a) accept only when the supplier explicitly says the classification **applies to** all loads
    up to X%;
  - (b) require a stated lower limit, otherwise use case 3;
  - (c) treat every "up to" as case 3.

  Recommendation: (b) or (c) until advised.
- **D3: keep the written-confirmation switch?** With D1 in place, case 3 is mainly for rounding and
  unusual cases. Recommendation: keep it, still behind the switch.
- **D4: record the document's date or version?** Recommendation: add an optional "document date or
  version" field. It is not used to block anything; it is for the maker's records.

## Assumptions not supported by the sources (precisely)
1. **GB vs EU guidance:** that the ECHA guidance HSE points to applies in GB without GB-specific
   differences on this point. This is reported, not checked.
2. **Relevance, reliability and sufficiency:** that an explicit supplier range or clarification is
   relevant, reliable and sufficient for the maker's exact formulation. This is the maker's
   assessment under the guidance. CLPeasy only records consistent answers; it cannot assess the
   document.
3. **"Up to" wording:** that an "up to X%" statement is meant as classification coverage for all
   lower loads (decision D2).
4. **Accurate answers:** that the maker's answers (document type, percentages, stated range, where
   stated) match the real document. CLPeasy cannot read it.
5. **Measured %:** that the maker's entered percentage reflects their actual formulation, including
   batch-to-batch variation. CLPeasy takes the entered figure.
6. **Current document:** that the supplier document is current. CLPeasy has no version or expiry
   check (decision D4).
7. **Candles vs wax melts:** that this split is needed. It is CLPeasy policy, kept as a conservative
   choice; no source in this record requires it.
8. **Exact thresholds:** the exact figures (Annex I Tables 3.4.5 / 3.4.6, Annex II 2.8) are not
   checked in the GB legislation text. On-screen wording names no figures.
9. **Written confirmations:** that a supplier's written confirmation is acceptable evidence
   (decision D3). It has not been checked by a legal adviser.

## Not changed by this proposal
- Production (`main` `4bc3e9a`).
- PR #203 (frozen).
- The Test preview (still v28 / `d6b9c54`).
- The customer notice draft. If D1/D2 are adopted, its "CLPeasy's own rule" section will need
  updating before sending.
