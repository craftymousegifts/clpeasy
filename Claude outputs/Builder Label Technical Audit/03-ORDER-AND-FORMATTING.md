# 03 — Order and Formatting

## 1. Actual render order (all product types, all shapes)

Fixed in `renderLabel()`; there is **no conditional reordering** between product types or shapes. Empty elements are simply skipped.

1. Product name (curved arc on circles; straight, possibly wrapped, on squares/rectangles)
2. Business / supplier name
3. Website (if any)
4. Product type (upper case)
5. Signal word (upper case; DANGER in red)
6. GHS pictograms (row(s), centred)
7. H statements (+ EUH066/EUH071/EUH210 inline, in input order)
8. "Contains: …" sensitiser names
9. "May produce an allergic reaction." (EUH208 only)
10. P statements
11. EN 15494 candle icons (candles only, ≥ 40 × 40 mm, not hidden)
12. Address
13. Phone
14. Net quantity · Burn: … · Batch: …

### Representative examples (verified in rendered output)

| Candle (15-long-candle, 80×100) | Wax melt (16) | Reed diffuser (17) | Room spray (18) |
|---|---|---|---|
| Christmas Spiced Orange & Cinnamon / Crafty Test Studio / SCENTED CANDLE / WARNING / ⚠ + 🐟 / H315, H317, H319, H411 text / Contains: Linalool … Citral / P101 … P501 / 5 candle icons / address / phone / 220g · Burn: 45 hours · Batch: B001 | same, product type WAX MELT, **no candle icons**, "80g · Batch: B002" | same, REED DIFFUSER, DANGER, 4 pictograms, no icons | same, ROOM SPRAY, DANGER, 2 pictograms, no icons |

Screenshots: `screenshots/15-long-candle__rect-80x100__preview.png`, `16-long-wax-melt__circle-63__*`, `17-long-diffuser__rect-80x100__*`, `18-long-room-spray__square-63__*`.

## 2. Ordering observations

| # | Observation | Source | Flag |
|---|---|---|---|
| O1 | Pictograms, signal word, H and P statements are grouped together in the mid band. | A (grouping — verify) | PASS as implemented |
| O2 | Supplier identity is split: business name at top, address/phone at the bottom. | B/C — no documented rule | Confirm with Michaela (design) |
| O3 | Order of H statements = order of the input string: Smart Paste = order of appearance in the SDS (H codes first, then EUH codes); manual chips = click order. Order of P statements likewise. | C — depends on extraction/input order | DESIGN DECISION (should statements be sorted?) |
| O4 | EUH066/EUH071/EUH210 print inside the H sentence stream rather than as a separate supplemental block. EUH208 is special-cased into the "Contains" block. | C; whether CLP requires a separate supplemental-information section needs verification (D) | UNCERTAIN |
| O5 | Product identifier ("Contains:") appears after hazard statements, not next to the product name. | B/C | Confirm (design) |
| O6 | No difference preview vs export in order (same SVG). | — | PASS |

## 3. Typography

| Item | Implementation |
|---|---|
| Families | Product name & business name: `Georgia,serif` 700 (straight) / `DM Sans` 700 (arc). Everything else `DM Sans,sans-serif`. The SVG embeds `@import` of Google Fonts DM Sans 400/700/900. Builder page loads DM Sans 300–600 only. Georgia is **not** web-loaded (system font only). |
| Weights | type 700, signal 800, phone 600, hazard/footer 400. No italics anywhere. |
| Bold rules | Fixed per element; none content-driven. |
| Font size | Every element auto-fits between its own min/max; all mandatory elements then clamped up to the floor. Hazard H/sens/P share one binary-searched size. |
| Floor | `GB_ACTIVE_MIN_FS_MM = 1.2` **nominal font-size mm**, not x-height (explicit decision 2026-09-08). Real DM Sans x-height ratio measured here 0.47 (renderer comment says 0.516) ⇒ physical x-height at the floor ≈ 0.56–0.62 mm. At large sizes the 3.2-unit minimum dominates (150 mm label → 1.85 mm). |
| Line height | H 1.25, sensitisers 1.25, P 1.15 (explicit GB revert), footer rows ≥ 1/0.82 ≈ 122 %, product name 1.2. |
| Gaps | H→sens 0.3 line, sens→P 0.2 line. |
| Alignment | Everything centred (`text-anchor="middle"`). No indentation, no bullets. |
| Edge margin | Hazard text: fixed 2 mm each side — **computed once per block at the block's first line only** (root cause of M48). |
| Punctuation | H/P descriptions joined with ". " and a final "."; "Contains:" uses a colon; names joined ", "; no full stop after the last name before "May produce an allergic reaction." (separate line). Footer parts joined " · ". |
| Capitalisation | Product type & signal upper-cased; statements use library text as-is (P "IF SWALLOWED:" etc. upper-case prefixes from library). |
| Word breaking | Wraps at whitespace; a single word wider than the line is split at character level (no hyphen) — e.g. long IUPAC names. Nothing is truncated. |
| Parentheses / commas | Passed through. Smart Paste splits sensitiser lists on `;` or `, ` (comma+space), so internal IUPAC commas survive. |
| Unicode | Rendered as-is (é, ü, ø, ’ tested OK). C0 control characters break the SVG XML (M60). Newlines collapse to spaces. |

## 4. x-height / legibility enforcement — trace

1. `_mandatoryMinFS = max(1.2 × pw/mmW, 3.2)` (layout units).
2. Product name, business name, type, signal: auto-fit → if below floor, clamp **up** to floor → if the text still exceeds its width at the floor → `*-too-small` flag → `fits:false`.
3. Hazard block: binary search between floor and ceiling; if it doesn't fit at the floor → `hazard-text-overflow`.
4. Footer: `fitFont(..., floor)`; horizontal overflow at the floor or row height < floor/0.82 → `footer-clipped`.
5. Manual fine-tune overrides are clamped to `[floor, max]` — cannot go below the floor.

**Can automatic fitting reduce mandatory text below the floor?** No — verified: minimum rendered mandatory font across all 52 fitting stress labels = 1.199 mm (floor). The website line (not mandatory) can go below.

**But:** (a) the floor measures width with generic fonts, not the drawn font (see 09); (b) the vertical fit test does not check horizontal fit per line on circles (M48) — text can be at a legal size yet cut off by the label edge.
