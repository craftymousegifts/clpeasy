# Changelog

All notable changes to CLPeasy are documented here. Customer-friendly notes
covering the same releases live at `release-notes.html`. Versioning rules
and the release procedure are documented in `VERSIONING.md`.

## Documentation - 2026-10-23

- Expanded the existing printing page into full-width visual guides with 24 searchable printing Q&As. (#295)
- Linked help from Resources, Builder, Composer, FAQ, Support and Knowledge Base; retained existing printing URLs and added contextual return navigation.
- Refreshed Step 2 screenshot for grams/millilitres; net quantity and fragrance percentage are explicitly distinguished.
- Included the six existing-logo registered-mark corrections from #282 in the same production deployment.
- Documentation update: product version remains 1.4.0 under VERSIONING.md. No label generation, classification, payment or authentication behaviour changes.

## [1.4.0] - 2026-10-22

### Added
- Making Guides and Design Inspiration resource pages with category imagery.
- Visible grams/millilitres quantity selector, without automatic conversion. (#272)
- CLP history explanation with official source links. (#273)
- Shared fixed launch-offer header and 12-second winter light effect. (#293)

### Changed
- Approved homepage, live-site headline font, clearer maker benefit and real trial signup link. (#273)
- Homepage walkthrough link points directly to the video. (#284)
- Clear trial-watermark and paid-download wording on pricing and plan selection. (#274)
- Winter garland and full-width trees, snowmen and visible snowflakes; timed effects settle or stop after 12 seconds. (#283–#293)

### Fixed
- Unavailable analytics loader, preserving the event-queue fallback. (#276)
- Stray navigation newline text and seasonal banner placement. (#273, #283)

Version metadata reconciled after the production changes were verified.
Final binary PNG/PDF download check for #272 was waived by the founder,
not recorded as an executed test.

## [1.3.1] - 2026-10-19

### Fixed
- Smart Paste source confirmation and one-SDS guidance. (#265)
- Support, FAQ, Knowledge Base and transparency explanations, plus practical printing/cutting and mixed-fragrance guidance. (#264)

Version assigned retrospectively when reconciling the published release history.

## [1.3.0] - 2026-10-18

### Added
- Smart Paste guidance: suitability note after extraction, amber "Check your
  finished-product CLP information" box for concentrated fragrance-oil SDSs,
  and a list of precautionary-statement codes not added automatically. The
  exclusion list itself is unchanged. (#257)
- "Using more than one fragrance oil?" drop-down in Builder Step 3 linking to
  the Knowledge Base; knowledge.html opens the topic named in the address. (#259)
- Contact form: more than one topic can be selected. (#258)

### Changed
- Knowledge Base "Blended Fragrances" wording. (#260)

Customer release notes for 1.3.0 also describe the Smart Paste Section 2.2
correction (#261), live since 18 October and recorded under 1.2.0 below.

## [1.2.0] - 2026-10-16

### Added
- Net-weight dropdown (5–1000g in 5g steps) with exact custom quantities. (#247)
- Optional-item fit choices with individual selection, exact-value quantity/batch confirmations, retained saved values and restore controls. (#248)

### Changed
- Compact size warnings, conditional item explanations and simplified export review with unchanged fit/authorisation gates. (#248)
- Expandable file guidance, full SDS/fragrance-load responsibility declaration and Save/Composer actions. (#248)

### Fixed (added to 1.2.0 on 17 October, no new version number)
- Builder preview stays visible when a label needs more space; batch field
  full width with a normal keyboard on phones. (#251)
- Candle-care (EN 15494) icons kept at least 1 mm inside the circle cut edge;
  52–55 mm candles showing the icons need 56 mm or the existing "show on
  packaging" option, now offered at those sizes. (#252)

### Fixed (added to 1.2.0 on 18 October, no new version number)
- Smart Paste reads hazard data only from one Section 2.2 (Label elements)
  and stops with a message when it cannot identify exactly one, so codes
  from other SDS sections (e.g. Section 3 ingredients) can no longer reach
  the label. (#261)

Founder approved #247/#248 after iPhone checks on 16 October. #249 is a
combined QA preview only and is not part of the production merge.

## [1.1.1] - 2026-10-15

### Fixed
- Curved-name/business-name collision protection with hazard-text priority. (#236)
- Consistent measured and drawn font families for label output. (#237)
- Circle statement wrapping and edge containment. (#240)
- Balanced circle footer sizes, regular phone text and edge clearance. (#241)
- Fine-tune percentage references, cross-control refresh, decimal changes,
  limit button states and Reset. (#242)
- Mobile preview fine-tuning, edit-details navigation, shape/size editor
  overlap and supported-size wording. (#244)

Delivered together through #244, production commit `aa33efb`, Netlify deploy
`6ad133053abdc7febf967f53` (15 October 2026, 21:09 BST). The version number
and these notes were completed in a subsequent metadata-only update.

## [1.1.0] - 2026-09-22

### Added
- Print Sheet Composer: multi-label print sheets, ready-made UK sheet
  templates and custom grids, cutting-machine (Cricut-style) PNG export.
  (#105, #106, #107, #112, #113, #114)
- Customer-facing release-notes page (`release-notes.html`) and a single
  authoritative app version source (`version.js`).

### Changed
- Corrected customer-facing marketing and product copy to remove
  absolute compliance-guarantee wording. (#126)
- Homepage, showcase and product previews updated for accuracy and
  clarity. (#108, #109, #110, #111, #121, #122, #124)
- Improved Builder step navigation and responsive layout. (#118)
- Simplified hazard confirmation / blocked-label UX. (#102)

### Fixed
- Hazard/precautionary statement font sizing and text-fit issues across
  label shapes and sizes. (#70, #71, #76, #77, #78, #80, #81, #82, #83,
  #84, #85, #86, #87, #88, #90, #91, #92, #96)
- Smart Paste EUH208 sensitiser extraction and long substance-name
  horizontal overflow. (#116, #117)
- Smart Paste GB-CLP safety: unsupported-code blocking and signal-word
  resolution. (#119, #120)
- Builder workflow reliability regressions. (#98, #99, #101, #103, #104)

### Security
- The unpaid/trial live label preview now renders as a flattened raster
  image instead of an editable vector, closing a DOM-level
  watermark-removal issue. (#126)
- Export functions on both the Builder and Print Sheet Composer now
  re-verify account entitlement immediately before building a download.
  (#126)
- A residual client-side rendering gap remains open and tracked
  separately in Issue #127 — it is not resolved by this release.

## [1.0.0] - 2026-06-15

### Added
- Initial public launch of CLPeasy: Label Builder for CLP-style labels
  on candles, wax melts, reed diffusers and similar fragranced products.
- Smart Paste SDS Section 2.2 extraction.
- Automatic hazard statement, precautionary statement, signal word and
  GHS pictogram handling from SDS data.
- Saved-label library.
- Print-ready PNG and PDF export.
- Stripe billing (Easy Start / Easy Pro plans, top-up download packs)
  and Supabase-backed accounts, with a 14-day free trial.
