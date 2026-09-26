# 02 — Label Element Inventory

Legend for "Rule source": **A** = external GB CLP requirement (not verified against primary text in this session — legislation.gov.uk and hse.gov.uk were blocked by the network policy); **B** = CLPeasy product/design rule; **C** = implementation behaviour with no documented source; **D** = uncertain, needs verification.

Font sizes are declared SVG font-size in mm on the physical label. "Floor" = `max(1.2 mm × px/mm, 3.2 layout units)` (label-render.js `_mandatoryMinFS`).

| # | Element | Source / Step | Req? (enforced where) | Appears when | Transformation | Render position | Typography | Wrap | Overflow behaviour |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Product name (`scentName`) | Step 2 `#scent-name` | Required (Step 2 gate) | always; placeholder "Your Scent Name" if empty | none | header top; **circles: curved on arc** | Georgia/serif 700 (rect/square), DM Sans 700 on arc | rect/square wraps; arc single line | floored; `scent-name-too-small` block. **Bug: jumps to floor size as soon as it wraps (M46)**; arc overlaps business name (M47) |
| 2 | Business name | Step 4 `#biz-name` | **Not required** | always; placeholder **"Your Brand"** if empty | none | header, under product name | Georgia/serif 700 | no (single line) | floored; overlap guard shrinks to ≥50 % then floor; `business-name-too-small` |
| 3 | Website | Step 4 | optional | if set | none | header, 3rd line | DM Sans 400 | no | **not floored** (non-mandatory); shrinks freely (1.46 mm seen) |
| 4 | Product type | Step 2 select | Required (Step 2) | always (blank if missing) | upper-cased | mid band, first | DM Sans 700, letter-spacing 0.6 | no | floored; `product-type-too-small` |
| 5 | Signal word | derived from H codes | auto | if resolver returns a word | upper-cased; DANGER red `#cc0000` | under product type | DM Sans 800 | no | floored; `signal-word-too-small` |
| 6 | GHS pictograms | H_PICTO_MAP (auto) | auto | per mapped H code | de-duplicated (Set); unknown key → **exclamation** | under signal word, rows centred | JPEG diamonds | wrap to more rows | size searched 10–11.31 mm red-square side; below 10 mm never; block if not fit |
| 7 | H statements | Smart Paste / chips | ≥1 code required at Step 3 | codes in H_LIB | descriptions joined ". ", trailing "." | under pictograms | DM Sans 400, shared hazard size, LH 1.25 | word wrap, char-split for long words | shared binary-search size ≥ floor; block `hazard-text-overflow` |
| 8 | EUH066 / EUH071 / EUH210 | Smart Paste / chips | as input | codes present | printed **inside the H sentence stream** | with H | as H | as H | as H |
| 9 | "Contains:" + sensitiser names | Smart Paste | auto | ≥1 sensitiser, or EUH208 present | `"Contains: a, b, c"` | after H | as H, LH 1.25 | yes | as H — never truncated (verified) |
| 10 | EUH208 sentence | EUH208 code | auto | EUH208 in H list | `"May produce an allergic reaction."` on its own line; with no names → **"Contains: sensitising substance"** | after Contains | as H | yes | as H |
| 11 | P statements | Smart Paste / chips / P280 picker | optional | codes in P_LIB | adjacent combos merged, joined ". ", "." | after sensitisers | DM Sans 400, LH 1.15 | yes | as H; **circle clipping bug (M48)** |
| 12 | EN 15494 candle icons | automatic | candle types only, not hidden, both dims ≥ 40 mm | 6 candle product types | 5 fixed icons | top of footer band | JPEG, 5–8 mm | no | `candle-safety-symbols-too-small` (latent); silently absent < 40 mm |
| 13 | Address | Step 4 | **Not required** | if set | newlines collapse to spaces | footer line 1 | DM Sans 400 | **never wraps** | floored; `footer-clipped` block |
| 14 | Phone | Step 4 | Required (Step 4 gate) | if set | none | footer line 2 | DM Sans 600 | no | floored; `footer-clipped` |
| 15 | Net quantity | Step 2 `#net-weight` | optional | if set | free text | footer line 3 (joined with ·) | DM Sans 400 | no | as footer |
| 16 | Burn time | Step 2 | optional; disabled for non-burn types | if set | prefixed "Burn: " | footer line 3 | as footer | no | as footer |
| 17 | Batch number | Step 5 `#batch-num` | optional | if set | prefixed "Batch: " | footer line 3 | as footer | no | as footer |
| 18 | Watermark | automatic | non-Pro | `!S.isPro` | "CLPeasy / PREVIEW ONLY / clpeasy.com" | centre, rotated | DM Sans | — | — |
| 19 | Blocked overlay | automatic | when `!fits` | any block reason | replaces whole label | full label | DM Sans 800/400 | yes | — |
| 20 | Dashed border | toggle | optional | `showBorder` | — | shape outline | 0.8-unit grey dash | — | printed in exports too (C) |

## Inputs collected but not rendered

| Input | Stored | Rendered | Comment |
|---|---|---|---|
| Fragrance load (`fragLoad`) | saved | no | Used only for guidance tips. Not a CLP label element — **PASS** (confirm intended). |
| `supplier` | saved | no | internal |
| `sdsSignal` | saved | indirectly (signal resolver) | — |
| Label language (`label-lang`) | hidden input fixed `en` | dormant multilingual code for signal/"Contains:" only | H/P text is English-only; dormant path would produce mixed-language labels if re-enabled |

## Rendered content with no direct user input

"Your Brand", "Your Scent Name" (placeholders), "sensitising substance" (placeholder), "Contains:", "May produce an allergic reaction.", "Burn: ", "Batch: ", "·" separator, EN 15494 icons, watermark, blocked overlay.
