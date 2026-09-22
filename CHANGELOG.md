# Changelog

All notable changes to CLPeasy are documented here. Customer-friendly notes
covering the same releases live at `release-notes.html`. Versioning rules
and the release procedure are documented in `VERSIONING.md`.

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
