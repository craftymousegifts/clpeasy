# 05 — H / P / EUH / EUH208 Audit

## Libraries

- `H_LIB` (66 entries) and `P_LIB` (29 entries incl. P280) exist in label-render.js and builder.html; **verified byte-identical** today (node comparison). Two hand-synced copies remain a drift risk (existing test covers P280 only).
- Unknown H/P codes → not printed, `unrecognised-code` block with explanation; H316/H401/H402 → `unsupported-gb-clp-code` block. PASS (probe 6, existing tests).

## Wording check (spot-check against commonly published GHS/CLP texts — primary GB text NOT reachable, so all "D")

| Code | CLPeasy text | Commonly published full text | Status |
|---|---|---|---|
| P305+P351+P338 | IF IN EYES: rinse cautiously with water for several minutes | IF IN EYES: Rinse cautiously with water for several minutes. **Remove contact lenses, if present and easy to do. Continue rinsing.** | ISSUE HIGH (likely truncated statutory text) — [msds-europe.com P-statements](https://www.msds-europe.com/p-statements/), [Wikipedia GHS P-statements](https://en.wikipedia.org/wiki/GHS_precautionary_statements) |
| P210 | Keep away from heat and ignition sources. No smoking | Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking. | UNCERTAIN (may be a permitted selection) |
| P260 / P261 | Do not breathe vapours or dust / Avoid breathing vapours and dust | …dust/fume/gas/mist/vapours/spray (supplier selects) | UNCERTAIN ("and"/"or" wording) |
| P337+P313, P333+P313, P313 | "get medical advice" | "Get medical advice/attention." | UNCERTAIN |
| P370+P378 | In case of fire: use appropriate media for extinction | In case of fire: Use … to extinguish (supplier specifies media) | UNCERTAIN |
| P501 | Dispose of contents and container in accordance with local regulations | Dispose of contents/container to … (supplier specifies) | UNCERTAIN |
| H statements | spot-checked H225–H413, EUH066/071/210 | match commonly published text | PASS (pending primary check) |

## Extraction (Smart Paste)

| Rule | Behaviour | Status |
|---|---|---|
| H regex `\bH\d{3}\b` | **Silently misses suffixed codes** — `H361f`, `H360FD`, `H361d` etc. are not captured and not flagged (node test). | ISSUE MEDIUM |
| EUH regex | OK | PASS |
| P regex | handles `P302+P352`, `P302 + P352`, `P302/352` → canonical. | PASS (tested) |
| P exclusions | 9 codes silently dropped (P264, P270, P272, P280, P303+P361+P353, P362, P362+P364, P363, P405) as "occupational". Toast doesn't list them. | DESIGN DECISION (B) |
| De-duplication | Smart Paste de-dupes; **renderer does not** — a duplicated code in the field prints twice (probe 4). | ISSUE LOW |
| P count | no maximum / no "more than six" warning | DESIGN DECISION |
| Adjacent P codes | `P403, P233` → printed as combined P403+P233 text (probe 7). | PASS |

## Sensitisers / EUH208

| Rule | Behaviour | Status |
|---|---|---|
| Bounded EUH208 clause | authoritative, supplier order kept, table names normalised in place, no max count | PASS (tested) |
| Fallback table scan | 36-name table, longest-match, boundary-anchored | PASS (tested) |
| Truncation | none; long IUPAC names char-split onto more lines; if it can't fit → blocked | PASS (verified in real Chromium: cases 07, 08 on all geometries — every name present in output markup; no fitting label lost a name) |
| Multiple long names | case 08 (5 long IUPAC names) fits on 63 mm circle, 63 mm square, 80×100, 100 circle; blocked on smaller | PASS (fails visibly) |
| **EUH208 with no names** | prints `Contains: sensitising substance` + "May produce an allergic reaction.", `fits:true`, no Step 3 gate (probe 2) | ISSUE HIGH |
| H317 + EUH208 together | one merged list "Contains: Linalool, Citral" + "May produce an allergic reaction." (probe 3) — substances causing H317 classification and EUH208 substances are not distinguished | DESIGN DECISION (D) |
| Punctuation | "Contains: a, b" (colon, no full stop) then separate line "May produce an allergic reaction." | ISSUE LOW / verify exact EUH208 wording |
| Other product-identifier substances | Only sensitisers can be named. Substances that drive other classifications (e.g. H304 aspiration hazard in diffuser bases) have no field. | UNCERTAIN MEDIUM (verify the product-identifier rule) |
| Candle warnings | No automatic candle warning **text**; only EN 15494 icons. | — |
| P280 | Selectable items, built only from the picker; empty → blocked | PASS (tested) |
