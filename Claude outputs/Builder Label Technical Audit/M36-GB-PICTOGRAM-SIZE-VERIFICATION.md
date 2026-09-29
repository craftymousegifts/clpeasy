# M36: GB pictogram size regulatory verification

**Status (29 Sep 2026): BLOCKED, primary GB sources not accessible from the audit environment.** No application code changed.

The environment's network policy denies:
- `www.legislation.gov.uk`
- `www.hse.gov.uk`
- `www.businesscompanion.info`
- `echa.europa.eu`
- `reachonline.eu`

Only web-search summaries (not verbatim pages) were obtainable. Those are **leads, not verified GB text**, and no interpretation has been adopted.

## Leads from search summaries (to verify against legislation.gov.uk)
- **Annex I 1.2.1 (reported wording):** each hazard pictogram "shall cover at least one fifteenth of the minimum surface area of the label dedicated to the information required by Article 17", and its minimum area "shall not be less than 1 cm²". Pictogram: a square set at a point, black symbol, white background, red frame.
- **Table 1.3 (reported), capacity bands:**
  - ≤3 L: label "if possible at least 52×74 mm"; pictogram "not smaller than 10×10 mm, if possible at least 16×16 mm".
  - >3–50 L: 74×105 / 23×23.
  - >50–500 L: 105×148 / 32×32.
  - >500 L: 148×210 / 46×46.
  - Whether a separate ≤0.5 L row exists in the GB text was **not confirmed**.
- **ECHA labelling guidance (reported; EU guidance, background only):** the Table 1.3 dimensions refer to the sides of the pictogram's red frame, not the diamond's bounding box. The summaries also quote an ECHA example of a 1500 mm² minimum label area derived from a 10×10 mm pictogram × 15. An HSE page (search summary) says ECHA's labelling guidance is "still helpful in explaining the requirements in CLP".
- **Business Companion (search summary):** minimum pictogram 1 cm²; each pictogram at least one fifteenth of the label surface area dedicated to the required information.
- **Contamination risk:** search results mix in the EU 2024/2865 font-size/label-format rules, which do **not** apply in GB.

## Unresolved questions (need the verbatim GB text)
1. **Denominator:** the Table 1.3 minimum label area for the package capacity (e.g. 52×74 = 3848 mm², so 1/15 ≈ 256 mm² ≈ 16×16), or the actual label area dedicated to Article 17 information?
2. **Is "16×16" a red-frame side** (ECHA reading)? CLPeasy currently treats 16 mm as the diamond's outer bounding box (red square 11.31 mm, 128 mm²), per an earlier recorded decision (label-render.js:1016–1038).
3. **Non-CLP content:** does it matter to the denominator? This only arises under the actual-label-area reading.

## Current CLPeasy behaviour (verified in code and probe)
- Red-square floor: 10 mm side (100 mm² = 1 cm²).
- Preferred target: 16 mm outer bounding box, i.e. 11.31 mm red-square side (128 mm²), for every label size.

## Next step
Allow the hosts above (or supply verbatim extracts / PDFs), then complete the verification. **Do not change the renderer until then.**
