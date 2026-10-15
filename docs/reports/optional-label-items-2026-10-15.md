# Optional label items — draft implementation, 15 October 2026

Base: main 37b0ff33cf5e820782ee9f6405053db792875729. Founder requested work on remaining items at 22:04 BST; no merge or production permission for this change.

## Behaviour

Only after a fit failure at a supported size, try subsets of the optional content actually shown. Retain at most two minimal passing combinations, batch last. The existing larger-size action is first. No required statement, supplier contact field, pictogram, size floor or export gate changes. No automatic removal.

Show actual values and hazard font-size comparison with the suggested larger layout. Each option is checked using the current overrides and full shared renderer; the larger-size comparison uses the same automatic layout as the existing larger-size action. A fit check is explicitly not confirmation of legal compliance.

Website/burn time need no confirmation. Net quantity and batch require separate unticked confirmations that the exact value is elsewhere on packaging (batch: product or packaging). Confirmation is stored with that value. An edit invalidates it, returns the item immediately and rechecks fit. Product-reference substitution is not offered.

Saved raw values remain intact. `showOnLabel` and `omissionConfirmations` persist per label. Normalization applies display choices once for Builder, all exports and Composer. Badges at the actual fields and a download summary support restoration; nothing restores automatically except the approved invalid-confirmation safeguard. Existing labels default to displaying all data. No backend or payment change.

## Verification

- New offline test: 42 synthetic fixtures, circle/square/rectangle, candle/wax melt, 52–90 mm; 10 blocked and 5 rescued using deterministic text-width measurements. Every offered option fits and is inclusion-minimal; unsupported codes/undersized dimensions offer none.
- Tests also cover exact-value confirmations, inability to apply without checks, unchanged raw data, restoring choices, legacy SVG equality and shared-renderer export resolutions.
- Existing renderer resolution invariance, Builder regression, F3 capitalisation and versioning/release-notes checks pass.
- These are not the historical 324-label results; those were not rerun or claimed as current.
- Browser preview, actual PNG/SVG/PDF delivery, real iPhone and physical print remain to be checked/reported separately.

## Regulatory review

Customer advice remains draft. Primary legislation Article 17/31 URLs could not be read through web retrieval (unsupported XHTML). GOV.UK's General Product Safety Regulations 2005 GB guidance was read: section 5(3) discusses product reference/batch traceability on product or packaging, where reasonable. This does not resolve every product's quantity/traceability obligations. Do not merge until the conditional quantity wording and traceability confirmations are reviewed.

https://www.gov.uk/government/publications/general-product-safety-regulations-2005/general-product-safety-regulations-2005-great-britain

F4 Article 18 substance identities remains separate pending authoritative interpretation. F3 capitalisation is already present on released main and its regression passes; earlier outstanding lists were stale.
