# Primary-source checklist: supplier-document check (outstanding)

**Status (3 Oct 2026): NOT VERIFIED.** This environment's network policy denies every primary
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

## Secondary evidence already recorded
Search-result summaries consistent with points 1–6 are summarised in
`docs/reports/SDS-FRAGRANCE-PERCENTAGE-REVIEW-2026-10-03.md` (section A). They are not a substitute
for the checks above.
