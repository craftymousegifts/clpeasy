# 06 — Product-Type Matrix

The renderer treats product type almost identically; the only rendering branch is `_isCandle` (6 exact strings). Builder adds burn-time enablement and guidance tips.

| Element / rule | Candle types (Scented, Soy, Votive, Tea Light, Pillar, Advent Calendar Candle) | Wax melt types (Wax Melt, Wax Tart, Snap Bar, Clamshell, Advent Wax Melt, Wax Melt Bouquet) | Reed / Electric / Car / Plugin Diffuser | Room / Car / Linen Spray | Sachet / Potpourri |
|---|---|---|---|---|---|
| Product type printed | yes (upper case) | yes | yes | yes | yes |
| EN 15494 icons | **yes** (≥40×40 mm, not hidden) | no | no | no | no |
| Footer padding | 1 % (trimmed for icons) | 6 % | 6 % | 6 % | 6 % |
| Footer band share | 19 % | 15 % | 15 % | 15 % | 15 % |
| Burn time field | enabled | **enabled** (wax melts print "Burn: …") ¹ | disabled | disabled | disabled (Wax Melt Bouquet: disabled ²) |
| Weight vs volume | single free-text "Net weight" field for all types; no g/ml validation | same | same (ml typed into "Net weight") | same | same |
| Automatic wording | none | none | none | none | none |
| Pictograms / H / P | from SDS only; no type-specific defaults | same | same | same | same |
| Guidance tip | FRAG_LOAD_TIPS | yes | yes | yes | yes |

¹ `BURN_TIME_TYPES` includes wax melts — a wax melt label can print "Burn: …". Deliberate? (DESIGN DECISION, LOW)
² `BURN_TIME_TYPES` lists "Wax Melt Bag" (not a dropdown option) but not "Wax Melt Bouquet" (a dropdown option). Looks accidental (C, LOW).

## Accidental vs deliberate

| Difference | Assessment |
|---|---|
| Candle icons only for the 6 candle strings | Deliberate (B) |
| Candle footer spacing constants differ from other types | Deliberate (candle-only redesign) |
| Wax melts allowed burn time | Unclear — confirm |
| Wax Melt Bag / Wax Melt Bouquet mismatch | Accidental |
| "Net weight" label used for liquids | Accidental wording (C) — label shows whatever is typed |
| Candle icon row silently dropped below 40 mm on either side (e.g. default 52×36 rectangle) | Deliberate but silent on the label itself; Step 1 notice covers it (B) |
| Stress results: same content fits identically across types except candles lose ~4 % of height to icons | Consistent |
