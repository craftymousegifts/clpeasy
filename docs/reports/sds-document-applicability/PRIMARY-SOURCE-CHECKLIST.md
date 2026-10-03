# Primary-source checklist: supplier-document check (outstanding)

**Status (3 Oct 2026): PARTIALLY SUPPORTED by official guidance (supplied by the ChatGPT workstream).
Not all claims are verified, and the implementation is not legally approved.** See the update below.

**Original status:** NOT VERIFIED from this environment. This environment's network policy denies every primary
source:
- **Retried this session, all blocked:**
  - legislation.gov.uk (WebFetch `EGRESS_BLOCKED`; the proxy rejected the connection);
  - eur-lex.europa.eu, echa.europa.eu, hse.gov.uk, gov.uk, businesscompanion.info and
    britishcandles.org;
  - archive mirrors: web.archive.org, archive.org, publications.europa.eu, op.europa.eu and
    data.europa.eu.
- **Two ways to verify:**
  - someone checks the points below in a normal browser;
  - the cloud environment's network access is widened, under Allowed domains. See
    https://code.claude.com/docs/en/cloud-environments#network-access.

For each point, record: the exact text, the version date shown on the page, and whether CLPeasy's
wording needs to change.

| # | Claim used by CLPeasy | Where it is used | Primary source to check | Result |
|---|---|---|---|---|
| 1 | In GB, the business placing a mixture on the market must classify and label it under GB CLP | Customer notice; review doc A1–A2 | GB CLP (Regulation (EC) No 1272/2008 as retained), Art. 4 and Art. 9: https://www.legislation.gov.uk/eur/2008/1272/contents | ☐ |
| 2 | Candles, wax melts and diffusers are mixtures | Customer notice; review doc A1 | HSE CLP guidance; Trading Standards / BCF candle guidance (businesscompanion.info, britishcandles.org) | ☐ |
| 3 | A mixture is classified as a skin sensitiser when an ingredient is present at ≥1% (Cat. 1 / 1B) or ≥0.1% (Cat. 1A), unless an SCL applies | Review doc A3 | GB CLP Annex I, 3.4.3.3 and Table 3.4.5: https://www.legislation.gov.uk/eur/2008/1272/annex/I | ☐ |
| 4 | EUH208 applies to a non-sensitising mixture containing a sensitiser at ≥0.1% (Cat. 1 / 1B), ≥0.01% (Cat. 1A), or ≥ one tenth of an SCL | Review doc A4; Step 3 message mentions H317 → EUH208 (no figures) | GB CLP Annex II, 2.8, and Annex I Table 3.4.6. Check that the GB text includes the 1A / 1B split | ☐ |
| 5 | Specific concentration limits override generic limits | Review doc A3 | GB CLP Art. 10; GB mandatory classification list (HSE) | ☐ |
| 6 | A change of formulation requires the classification to be reviewed | Review doc A5 | GB CLP Art. 15 | ☐ |
| 7 | The SDS for a fragrance oil (100%) does not describe the finished product's classification | Step 3 message; customer notice | Follows from 1, 3 and 4; confirm with HSE or Trading Standards guidance | ☐ |

**Not legal claims, and no primary source needed** (CLPeasy policy, documented as such):
- the exact-% match;
- no rounding or tolerance;
- the candle and wax-melt split;
- range documents not used on their own;
- the written-confirmation route (pending the owner decision).

**Supplier guidance** (industry practice, not law):
- CLP % is calculated on total mass;
- the "over-estimate" practice. CLPeasy does not rely on it.

## Update: partial primary-source verification (ChatGPT workstream, 3 Oct 2026)
**Who opened the pages:** the ChatGPT workstream opened these official guidance pages in full and
reported the findings to the owner. **They were not opened from this environment**, which is still
blocked; the findings are recorded as reported.

| Source | Publisher | What it was reported to support |
|---|---|---|
| [Harmonised classification and self-classification](https://www.hse.gov.uk/chemical-classification/classification/harmonised-classification-self-classification.htm) | HSE (GB CLP agency) | Mixture classification: the supplier of a substance or mixture classifies it (self-classification), and harmonised classifications apply where they exist |
| [Candles, diffusers, oil heaters etc.](https://www.businesscompanion.info/en/quick-guides/product-safety/candles-diffusers-oil-heaters-etc) | Business Companion (Trading Standards) | Candles, diffusers and similar products are assessed as mixtures, and assessment is specific to the formulation |
| [Data requirements handbook: toxicology classification](https://www.hse.gov.uk/pesticides/data-requirements-handbook/toxicology-classification.htm) | HSE (**pesticides guidance**) | Sensitiser thresholds vary, and specific concentration limits apply. **Only its explicitly stated GB CLP provisions are relied on; none of its pesticide-specific requirements apply to CLPeasy.** |

**Claims after this update:**
| # | Claim | Status |
|---|---|---|
| 1 | The business placing a mixture on the market must classify and label it under GB CLP | **Partially supported** by HSE guidance (self-classification of mixtures). The legislation text (Art. 4) has not been checked |
| 2 | Candles, wax melts and diffusers are mixtures | **Supported for candles and diffusers** by Business Companion guidance (as reported). Wax melts are not named in this record, so that remains an inference |
| 3 | The ≥1% (Cat. 1/1B) and ≥0.1% (Cat. 1A) generic limits for classifying a mixture as a sensitiser | **Partially supported:** the guidance confirms that thresholds vary by category and that SCLs apply. The **exact figures** in Annex I Table 3.4.5 have **not** been checked against the GB legislation text |
| 4 | The EUH208 limits (≥0.1% Cat. 1/1B, ≥0.01% Cat. 1A, one tenth of an SCL) | **Partially supported:** variable thresholds and SCLs only. The exact Annex II 2.8 / Table 3.4.6 figures and the GB text are **not** checked. CLPeasy's on-screen text names no figures |
| 5 | SCLs override generic limits | **Supported** by HSE guidance (as reported). Art. 10 text not checked |
| 6 | A formulation change requires the classification to be reviewed | **Partially supported:** formulation-specific assessment (Business Companion). The Art. 15 review duty text has not been checked |
| 7 | A fragrance-oil SDS (100%) does not describe the finished product | **Supported as a consequence** of claims 1–3 (mixture-specific classification). No source states it in these words in this record |

**Still outstanding:**
- the GB CLP legislation text itself (Art. 4, 9, 10, 15; Annex I Tables 3.4.5 and 3.4.6; Annex II
  2.8), including the exact figures;
- whether wax melts are named in official guidance;
- an independent review if you want legal assurance.

**CLPeasy policy, not established by these sources:**
- the requirement for an **exact percentage match**;
- the **rejection of rounding and of range / "up to" documents**;
- the candle and wax-melt split;
- the **written-supplier-confirmation route** and its switch.

The sources support classifying the specific mixture and variable thresholds. They do not require
CLPeasy's particular matching rule, and they do not prohibit other approaches. These remain owner
decisions.

## Secondary evidence already recorded
Search-result summaries consistent with points 1–6 are summarised in
`docs/reports/SDS-FRAGRANCE-PERCENTAGE-REVIEW-2026-10-03.md` (section A). They are not a substitute
for the checks above.
