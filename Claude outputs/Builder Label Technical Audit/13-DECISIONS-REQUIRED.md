# 13 — Decisions Required from Michaela

Nothing has been changed. Items marked **verify** need checking against the current GB legislation / HSE guidance first — I could not reach legislation.gov.uk or hse.gov.uk from this environment, so I have not treated any of them as settled law.

## Regulatory questions (verify first)

1. **Supplier address** (M10) — should the label be blocked without a postal address? At the moment only the phone is required. (verify)
2. **Business name placeholder** (M09) — I recommend never printing "Your Brand": require a business name before download. Agree?
3. **Nominal quantity** (M13) — keep optional (with guidance "if not shown elsewhere on the pack"), or require it? (verify)
4. **P305+P351+P338 and other P wordings** (M19, M20) — please confirm the exact GB wording to use; the current text omits the contact-lens sentence.
5. **EUH208 with no named substance** (M31) — I recommend blocking. Agree?
6. **H317 + EUH208 on one label** (M32) — keep one merged "Contains:" list, or separate the substances causing H317 from the EUH208 ones? (verify)
7. **Other substances in the product identifier** (M34) — e.g. aspiration-hazard (H304) substances in diffuser bases: should CLPeasy let the maker name them? (verify)
8. **Pictogram precedence** (M37) — e.g. no exclamation mark when the skull appears. Implement if confirmed? (verify)
9. **Pictogram size vs label area** (M36) — does the "one fifteenth of label area" rule apply, and is "10 × 10 mm" the red square side (current interpretation)? (verify)
10. **Supplemental EUH statements** (M26) — keep inline with H statements, or show as a separate block? (verify)
11. **More than six P statements** (M23) — add a warning?

## Product / design decisions

12. **Smart Paste P exclusions** (M22) — keep silently removing P264, P270, P272, P280, P303+P361+P353, P362, P362+P364, P363, P405? At least show the maker which ones were removed?
13. **Statement order** (M25) — keep SDS/click order, or sort numerically?
14. **Long addresses** (M46) — allow the address to wrap onto two lines? Currently a long address blocks at every size.
15. **Small rectangles** (M47) — the default 52 × 36 rectangle and the historic 63 × 44 mm cannot hold even a simple candle label. Accept that (they fail visibly), change the layout, or change the default?
16. **Layout order** (M61) — business name at top with address/phone at the bottom, and "Contains:" after the H statements: confirm this is the intended design.
17. **Product-type fields** (M15) — should wax melts show "Burn:"? Fix "Wax Melt Bag"/"Wax Melt Bouquet"? Rename "Net weight" to "Net quantity" for liquids?
18. **Legacy preset sizes below 52 mm** (M52) — should reopened old labels be held to today's minimum?
19. **Signal word source** (M04) — Composer should recompute like Builder, or Builder should respect the saved value?

## Recommended fix order (after your review)

1. M44 circle clipping (CRITICAL) — plus a real-browser test.
2. M45 arc overlap, M43 product-name wrap size.
3. M09 / M31 placeholders — block instead of printing.
4. M19 / M20 wording once verified.
5. M21 suffixed H codes, M38 unknown pictogram key, M03 Composer overrides, M55 bgColour.
6. Test infrastructure (M58): promote the audit harness into a real-font test.
