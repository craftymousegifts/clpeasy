# 12 — Master Audit Matrix

Source of rule: **A** external GB CLP requirement (not verified against the primary text in this session) · **B** CLPeasy product/design rule · **C** implementation behaviour with no established source · **D** uncertain.
Coverage: TESTED / PARTIALLY TESTED / NOT TESTED (existing suite). Evidence: files 01–11 and `screenshots/`.

| ID | Area | Input/Element | Current rule | Source | Current implementation | Test coverage | Status | Risk | Recommended action |
|---|---|---|---|---|---|---|---|---|---|
| M01 | Pipeline | All outputs | One shared renderer | B | `LabelRenderer.renderLabel` used by Builder preview, PNG/SVG/PDF, My Labels, Composer | TESTED | PASS | LOW | Keep |
| M02 | Pipeline | Layout | Resolution-independent layout | B | canonical 260-unit space; verified identical inner SVG | TESTED | PASS | LOW | Keep |
| M03 | Consistency | Fine-tune overrides | Composer should print what Builder shows | B | Composer omits 6 saved override options | NOT TESTED | ISSUE | MEDIUM | Pass saved overrides in `renderSheetPosition` |
| M04 | Consistency | Signal word | Same source in all views | B | Builder recomputes from H codes; Composer/My Labels use saved value | NOT TESTED | ISSUE | LOW | Decide single source |
| M05 | Consistency | Font metrics | Fit measured with the drawn font | C | measured with generic `sans-serif`/`serif`; drawn DM Sans/Georgia; drawn font varies by path | NOT TESTED | UNCERTAIN | MEDIUM | Real-device check (Win/macOS/iOS); consider measuring with the drawn font or embedding it |
| M06 | Consistency | Download gate | Gate = renderer `fits` | B | own OR list omits `bcfTooSmall` | NOT TESTED | ISSUE | LOW | Use `result.fits` |
| M07 | Exports | Legacy sheet / print-ready / Cricut | — | C | no button; width-only Avery layout; "300 DPI" wording | NOT TESTED | ISSUE | LOW | Remove or fix when touched |
| M08 | Exports | Blocked label | Never export non-fitting content | B | overlay + disabled buttons + click guard | TESTED | PASS | LOW | Keep |
| M09 | Supplier | Business name | Must be the real supplier name | A | not required; empty → **"Your Brand"** printed and exportable | NOT TESTED | ISSUE | HIGH | Require business name; never print placeholder |
| M10 | Supplier | Postal address | Supplier address on label | A | optional; label exports with no address | NOT TESTED | DESIGN DECISION REQUIRED | HIGH | Verify requirement; decide whether to gate |
| M11 | Supplier | Phone | Required | A/B | Step 4 gate | PARTIALLY TESTED | PASS | LOW | Keep |
| M12 | Product | Product name | Required | A/B | Step 2 gate | PARTIALLY TESTED | PASS | LOW | Keep |
| M13 | Product | Nominal quantity | Required for general public unless elsewhere on pack | A | optional | NOT TESTED | DESIGN DECISION REQUIRED | MEDIUM | Verify; decide gate or guidance |
| M14 | Product | Fragrance load | Not a label element | B | collected, saved, not rendered | NOT TESTED | PASS | LOW | Confirm intended |
| M15 | Product type | Burn time / weight field | Type-appropriate fields | C | wax melts can print "Burn:"; "Wax Melt Bag" vs "Wax Melt Bouquet" mismatch; "Net weight" used for ml | NOT TESTED | DESIGN DECISION REQUIRED | LOW | Decide lists/wording |
| M16 | Header | Website | Optional, not mandatory CLP text | B | shrinks without floor (1.46 mm seen) | NOT TESTED | PASS | LOW | Optional: minimum size |
| M17 | Codes | Unknown / GB-unsupported codes | Block with explanation, never print raw code | B | implemented | TESTED | PASS | LOW | Keep |
| M18 | Codes | H statement wording | Statutory text | A | spot-check matches common published text | PARTIALLY TESTED | UNCERTAIN | LOW | Verify full library against legislation.gov.uk |
| M19 | Codes | P305+P351+P338 | Full statutory text | A | omits "Remove contact lenses, if present and easy to do. Continue rinsing." | NOT TESTED | ISSUE | HIGH | Verify and correct wording |
| M20 | Codes | P210, P260, P261, P313 family, P370+P378, P501 | Statutory/selected text | A | abbreviated/paraphrased | NOT TESTED | UNCERTAIN | MEDIUM | Verify each against Annex IV |
| M21 | Smart Paste | Suffixed H codes (H360F, H361f, H360FD) | Capture or block | B | regex silently misses them — no block | NOT TESTED | ISSUE | MEDIUM | Capture suffixes; block if unknown |
| M22 | Smart Paste | Excluded P codes (9) | — | B | silently dropped, not reported | NOT TESTED | DESIGN DECISION REQUIRED | MEDIUM | Confirm list; show what was excluded |
| M23 | Codes | Number of P statements | "≤ 6 unless necessary" | A | no limit/warning | NOT TESTED | DESIGN DECISION REQUIRED | LOW | Decide warning |
| M24 | Codes | Duplicate codes | De-duplicate | C | renderer prints duplicates twice | NOT TESTED | ISSUE | LOW | De-dupe in renderer |
| M25 | Order | H / P order | — | C | input/extraction/click order | NOT TESTED | DESIGN DECISION REQUIRED | LOW | Decide canonical order |
| M26 | Order | EUH066/071/210 placement | Supplemental-info placement | A | inline in H sentences | NOT TESTED | UNCERTAIN | LOW | Verify |
| M27 | Codes | P280 | Selectable items only | A | picker; empty blocks | TESTED | PASS | LOW | Keep |
| M28 | Codes | Adjacent P codes | Combine to official combined statement | B | auto-combined | TESTED | PASS | LOW | Keep |
| M29 | EUH208 | Extraction & order | Bounded clause, supplier order | B | implemented | TESTED | PASS | LOW | Keep |
| M30 | EUH208 | Names never lost | Wrap, never truncate; block if no fit | B | verified in real Chromium: 0 missing | TESTED (fake metrics) | PASS | LOW | Add real-browser test |
| M31 | EUH208 | EUH208 with no names | Must name the substance | A | prints "Contains: sensitising substance", exportable | NOT TESTED | ISSUE | HIGH | Block until a name is given |
| M32 | EUH208 | H317 + EUH208 together | — | D | one merged list + EUH208 sentence | NOT TESTED | DESIGN DECISION REQUIRED | MEDIUM | Verify & decide |
| M33 | EUH208 | Punctuation | "Contains <name>. May produce…" | A | "Contains: a, b" + separate line, no full stop | NOT TESTED | ISSUE | LOW | Verify exact wording |
| M34 | Identifier | Non-sensitiser classifying substances (e.g. H304) | Name substances causing classification | A | no field | NOT TESTED | UNCERTAIN | MEDIUM | Verify product-identifier rule |
| M35 | Pictograms | Size floor / target | ≥10 mm square side; 16 mm bbox if possible | A/B | searched 10–11.31 mm; blocks otherwise | TESTED | PASS | LOW | Keep |
| M36 | Pictograms | Size vs label area | Area-proportional rule (1/15) | A | not implemented | NOT TESTED | UNCERTAIN | HIGH | Verify applicability before any change |
| M37 | Pictograms | Precedence (GHS06/05/08 over GHS07) | Precedence rules | A | not implemented; both drawn | NOT TESTED | UNCERTAIN | HIGH | Verify; implement if confirmed |
| M38 | Pictograms | Unknown key | Block | C | silently drawn as GHS07 | NOT TESTED | ISSUE | MEDIUM | Block/flag |
| M39 | Pictograms | Dedupe, placement, inside shape, no overlap | B | measured OK on 144 renders | PARTIALLY TESTED | PASS | LOW | Keep |
| M40 | Candle icons | EN 15494 floor & visibility | 5 mm floor; candle types; ≥ 40 mm | B | implemented | TESTED | PASS | LOW | Keep |
| M41 | Candle icons / footer | 52 mm circle edge | Inside label | B | icon corners clipped; phone 0.11 mm from edge | NOT TESTED | ISSUE | LOW | Include in circle fix |
| M42 | Typography | Mandatory text floor | 1.2 mm nominal font size (decided 2026-09-08) | B | enforced; min observed 1.199 mm | TESTED | PASS | LOW | Keep (decided) |
| M43 | Typography | Product name wrapping | Keep legible size | C | `slot.scent = 0` ⇒ wrapping name drops straight to the floor (3.39 → 1.23 mm on a 100 mm square) | NOT TESTED | ISSUE | MEDIUM | Fix wrap sizing |
| M44 | Layout | **Circle hazard/P text** | Never clip mandatory text; fail visibly | B | wrap width set once per block; lower lines exceed chord; clipped while `fits:true` | NOT TESTED | ISSUE | **CRITICAL** | Per-line chord width + horizontal fit check |
| M45 | Layout | Curved product name vs business name | No overlap | B | overlaps for names ≳ 15 chars, all circle sizes | NOT TESTED | ISSUE | HIGH | Re-position/measure arc vs header |
| M46 | Layout | Address wrapping | — | B | single line only; long addresses blocked at every size | NOT TESTED | DESIGN DECISION REQUIRED | MEDIUM | Decide multi-line footer |
| M47 | Layout | Small rectangles (52×36 default, 63×44) | — | B | simplest realistic candle label blocked | PARTIALLY TESTED | DESIGN DECISION REQUIRED | MEDIUM | Decide supported minimum / layout |
| M48 | Layout | Fail-closed on overflow | Block rather than truncate | B | vertical + footer + header; 0 content lost | TESTED | PASS | LOW | Keep |
| M49 | Layout | Line spacing | H/sens 1.25, P 1.15, footer ≈ 122 % | B | implemented | TESTED | PASS | LOW | Keep |
| M50 | Sizing | Size recommendation text | Only suggest selectable sizes | B | refers to "built-in 63mm preset" — no preset buttons exist | NOT TESTED | ISSUE | LOW | Wording |
| M51 | Sizing | Height input | — | C | `max="200"`, silently clamped to 150 | NOT TESTED | ISSUE | LOW | Align |
| M52 | Sizing | Legacy presets < 52 mm | — | C | exempt from custom minimum (fit still applies) | NOT TESTED | UNCERTAIN | LOW | Decide |
| M53 | Sizing | Custom minimum | circle/square ≥ 52; rect long ≥ 52, short ≥ 36 | B | shared function | TESTED | PASS | LOW | Keep |
| M54 | Security | Text escaping | Escape all user/SDS text | B | `xe()` everywhere | PARTIALLY TESTED | PASS | LOW | Keep |
| M55 | Security | `bgColour` attribute | Validate/escape | B | unescaped; Composer takes it from stored record | NOT TESTED | ISSUE | MEDIUM | Validate `#rrggbb` in renderer |
| M56 | Security | Control characters | Strip | C | break SVG XML | NOT TESTED | ISSUE | LOW | Strip C0 chars in normalise |
| M57 | Security | `printToPDF` title | Escape | C | raw product name in HTML | NOT TESTED | ISSUE | LOW | Escape |
| M58 | Tests | Real-browser rendering | Must exist for layout rules | B | none; all jsdom fake metrics | — | ISSUE | HIGH | Add Playwright render tests (harness here is a starting point) |
| M59 | Tests | Suite health | Green on main | B | 5 copy-text tests fail (pre-existing, unrelated) | — | ISSUE | LOW | Update separately |
| M60 | Order | Element order preview vs export | Identical | B | identical (same SVG) | PARTIALLY TESTED | PASS | LOW | Keep |
| M61 | Order | Supplier split top/bottom; identifier after H | — | B/C | as implemented | NOT TESTED | DESIGN DECISION REQUIRED | LOW | Confirm |

## Totals

| Status | Count |
|---|---|
| PASS | 21 |
| ISSUE | 22 |
| UNCERTAIN | 8 |
| DESIGN DECISION REQUIRED | 10 |
| **Total** | **61** |

CRITICAL: M44. HIGH: M09, M10, M19, M31, M36, M37, M45, M58.
