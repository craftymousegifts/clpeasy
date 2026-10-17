# CLPeasy® — 100-SDS QA: defect plan for approval (read-only reconciliation, 9 Oct 2026)

**Status:** proposals only. Nothing below has been implemented. Production code, settings and data are unchanged, and PR #225 stays a draft.

**Evidence base:** `docs/reports/SDS-100-E2E-QA-2026-10-09.md` and `qa-artifacts/sds-e2e/` on `qa/smart-paste-sds-corpus`. The builder tested is byte-identical to `main` at `85af515`.

**Final verdicts (report and CSV agree):** 8 PASS, 50 FAIL, 28 REVIEW, 14 SUPPLIER REVIEW. Total 100.

## Reconciliation corrections

| Item | What was wrong | Corrected finding |
|---|---|---|
| D6 (046, 061, 084) | My new legibility check reported "1.20 mm < 1.2 mm" under the heading "export/preview mismatch" | Not a mismatch, and not a defect. The renderer computes exactly 1.2 mm (3.6706 px at 85 mm / 260 px) and writes `toFixed(2)` = 3.67 px = **1.1998 mm**, a 0.0002 mm rounding artefact. Export-vs-preview agreement holds for all **183** files. D6 = 0. |
| Stage counts | 6 + 24 + 7 = 37, but 38 cases stopped | Case **073** stops on P310 alone. The builder then says "the following **code**" (singular), which my analysis did not match. **D3 = 7**, so 7 + 24 + 7 = **38**. Case **014** is separate: it reaches the preview and fits at the recommended size, but export is **correctly** blocked by the existing EUH208 check because Smart Paste extracted no names (root cause D1). |
| 068 | — | The supplier's own EUH208 lists "Nikura \| Niaouli Essential Oil - 100% Pure" as a substance. Now recorded as a supplier anomaly, in addition to its D2 defect. |
| Text size | Earlier wording implied the x-height could be read straight from the font size | All figures are **font size**. The x-height (measured from the DM Sans font file, 0.504 em) is about **0.60–0.67 mm**. There is no 1.2 mm x-height claim. |

## Defects — root cause and smallest safe correction

### D1 / D2 / D4 — EUH208 sensitiser names (46 cases; D4 = 32 printed on downloaded labels)

**Root cause.** Nikura's SDS is a two-column table. A typical PDF copy puts the left-column label **"Information:"** (from "Supplemental Information:") at the start of the EUH208 sentence's second line.
- **Path A (25 cases)** — the label lands inside "May produce an allergic reaction". `EUH208_CLAUSE_RE` (builder.html:3817) then fails to match, and `extractSDS()` (builder.html:4100–4104) falls back to scanning the whole text against the built-in `SENSITISERS` table:
  - unknown names are dropped (Terpinolene, p-Mentha-1,3-diene, Citronellal…);
  - prefixed names collapse to the table entry ("d-/dl-Limonene" → "Limonene").
  - Cases: 010, 011, 013, 014, 023, 027, 031, 032, 035, 036, 040, 046, 053, 056, 061, 062, 066, 069, 072, 073, 077, 078, 079, 085, 096.
- **Path B (21 cases)** — the label lands inside the substance list. `parseBoundedSubstanceList()` (builder.html:3823) turns line breaks into spaces, so "Information:" (and a space inside hyphen-wrapped names) becomes part of a name.
  - Cases: 015, 021, 026, 033, 034, 038, 039, 045, 054, 055, 060, 067, 068, 071, 083, 084, 087, 088, 089, 092, 097.

**Examples (supplier → today → proposed):**
- 011: *Terpinolene, d-Limonene, dl-Limonene, p-Mentha-1,3-diene* → **Limonene** → identical to supplier.
- 015: *… l-.β.-Bisabolene* → **"l-.β.- Information: Bisabolene"** → **"l-.β.-Bisabolene"**.
- (039's downloaded PDF prints "…l-.β.-Bisabolene. Information:".)

**Smallest safe correction (one change in `extractSDS`, sensitiser step only).** Match the clause against a lightly normalised copy of the pasted text; H/P/signal extraction keeps using the original text:
```js
const _euhText = text
  .replace(/(^|\n)[ \t]*(?:Supplemental[ \t]+)?Information:[ \t]*/gi, '$1') // SDS column label wrapped into the sentence
  .replace(/-[ \t]*\r?\n[ \t]*/g, '-');                                     // name broken at a hyphen across lines
const _euh208Match = _euhText.match(EUH208_CLAUSE_RE);
```
**Offline proof** (`scripts/e2e-sds-simulate-euh208-fix.js`, which uses production's own regex and parser):

| | Correct EUH208 cases |
|---|---|
| Today | 40 of 86 |
| With this change | **86 of 86** |

No case that is correct today becomes wrong. The existing EUH208 regression tests must also pass. Afterwards, only the 46 affected cases would be re-run through the browser harness. No new UI or warnings.

### D3 — valid precautionary statements rejected (7 cases: 004, 005, 053, 073, 095, 097, 100)

**Root cause.** builder.html:4300 treats any P code missing from `P_LIB` (builder.html:1643, with an identical copy in label-render.js:328) as "CLP code not recognised" and blocks Step 3. **P202, P308+P313 and P310** are missing from the table. All three are in CLP Annex IV as retained in GB CLP; the supplier text matches it, for example 097: "P308/313, IF exposed or concerned: Get medical advice/attention."

**Example.** Case 004 (Bay Laurel, H341/H351): today the customer is stopped by "did not recognise the following codes: P308+P313, P202". After the change, extraction completes and both statements print.

**Smallest safe correction.** Add three entries, with identical wording, to **both** `P_LIB` copies:
- `P202` "Do not handle until all safety precautions have been read and understood"
- `P308+P313` "IF exposed or concerned: Get medical advice/attention"
- `P310` "Immediately call a POISON CENTRE or doctor"

Verify the exact wording against the GB CLP consolidated Annex IV before release. The extra text may need a larger recommended label size; the existing fit checks handle that. **Alternative (policy):** add P202 to the consumer exclusion list instead of printing it. That is an owner decision, like R1.

### D5 — pictogram precedence (1 case: 097)

**Root cause.** `syncPictogramsFromH()` (builder.html:3617) adds every pictogram mapped from each H code in `H_PICTO_MAP` (builder.html:3586). No CLP Art. 26(1) precedence is applied anywhere in the builder or renderer.

**Example.** Case 097 (H315 + H318 + H361):
- the supplier shows GHS05 + GHS08;
- the builder selects GHS07 + GHS05 + GHS08;
- with the fix: GHS05 + GHS08.

Cases 073 and 100 (H317 + H318) correctly keep GHS07, because of H317.

**Smallest safe correction.** In `syncPictogramsFromH()`, after building `needed`, drop `exclamation` when every H code that brought it in is covered by a precedence rule:
- GHS06 present → drop GHS07;
- GHS05 present → drop GHS07 where it came only from H315/H319;
- GHS08 from H334 → drop GHS07 where it came only from H315/H317/H319.

Add unit tests for 097, 073 and 100.

### R4 — P305+P351+P338 printed incomplete (11 cases: 021, 046, 054, 061, 067, 084, 085, 087, 088, 089, 092)

**Root cause.** The wording entry for this code in `P_LIB` (builder.html:1643 and label-render.js:328) reads *"IF IN EYES: rinse cautiously with water for several minutes"*. It leaves out *"Remove contact lenses, if present and easy to do. Continue rinsing."* All 11 downloaded labels print the short form. None contains "contact lenses".

**Smallest safe correction.** Replace that wording entry in both copies with the full Annex IV text. The labels become longer, and some may need a larger recommended size.

**Other P wordings.** Presence was checked for all 287 placements, and completeness was checked against Annex IV:

| Code | CLPeasy wording | Assessment |
|---|---|---|
| P261, P273, P302+P352, P333+P313, P337+P313, P391, P501 | — | Complete, or a permitted Annex IV selection (e.g. "vapours and dust", "plenty of water", "local regulations") |
| P305+P351+P338 | "IF IN EYES: rinse cautiously with water for several minutes" | **Incomplete** (R4) |
| P210 *(not in this corpus)* | "Keep away from heat and ignition sources. No smoking" | Shortened. Annex IV: "Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking." |
| P370+P378 *(not in this corpus)* | "use appropriate media for extinction" | Annex IV requires the specific extinguishing media to be stated |

The two codes outside this corpus were found by reading the table, not by a label test. They should be reviewed together with R4.

## Owner decisions (product unchanged)

### R1 — supplier P statements withheld without notice (81 cases)

**Current behaviour.** `extractSDS()` (`_pExclude`, builder.html:4000) silently removes **P272, P264, P270, P280, P303+P361+P353, P362, P362+P364, P363, P405**. The code comments call them "not applicable to finished consumer home fragrance products". The customer is not told which supplier statements were omitted; there is no notice element.

**Regulatory considerations.**
- Under CLP Art. 28, P statements are chosen per Annex IV, are normally limited to six, and may leave out ones that are clearly unnecessary for the product and its users. For consumer products, statements aimed at workplace handling (P272, P362/P363, P405, P264, P270) are often omitted.
- P280 (gloves/eye protection) is more debatable for the general public.
- The maker placing the candle on the market remains responsible for the final selection.
- The blanket list has not been professionally verified for every formulation.

**Options:**
1. Keep the policy as is (status quo).
2. Keep it, and show an informational list of omitted codes at Step 3. This would be a new notice, so it needs your approval and design.
3. Let the maker opt to re-add an omitted code.
4. Have the exclusion list reviewed by a GB CLP specialist, especially P280 and P405.

**Recommended:** 4, then 2.

### R2 — supplier states "unclassified" (7 cases: 001, 006, 009, 012, 042, 063, 064)

**Current behaviour.** Smart Paste correctly finds no hazards. Step 3 then cannot continue: `toggleHazardNext()` (builder.html:4510) refuses the confirmation with "Please extract hazard data from your SDS before confirming." That message is inaccurate, because extraction did run. No label can be made, including the EN 15494 candle-safety pictograms and supplier details.

**Regulatory considerations.**
- A mixture that is not classified needs no CLP hazard pictograms, signal word, or H/P statements. It needs EUH208/EUH210 only if the supplier lists them; these 7 do not.
- General product-safety duties and candle safety information (EN 15494, which is voluntary) still apply.

**Options:**
1. Keep the block, but give an accurate message ("Your supplier SDS shows no CLP hazard classification…").
2. Allow a confirmed "supplier states not classified" path that produces a label with product, supplier and EN 15494 content and no CLP hazard elements.
3. Status quo.

**Recommended:** 2, after owner/legal confirmation; 1 as an interim step.

## What needs approval before any production change

1. **D1/D2/D4:** the two-line normalisation before the EUH208 clause match.
2. **D3:** add P202, P308+P313 and P310 to both `P_LIB` copies, or choose the policy alternative.
3. **D5:** Article 26 precedence in `syncPictogramsFromH()`.
4. **R4:** full P305+P351+P338 wording, plus review of P210 and P370+P378.
5. **R1:** your choice of option.
6. **R2:** your choice of option.

**Suggested order:** D1/D2 first (largest impact, proven offline), then D3, then R4 and D5. Each change would be tested only on the affected cases: 46, 7, 11 and 1.
