# Post-fix evidence: precautionary-statement wording (audit findings M19 / M20, Issue #5)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1–#4 (`859333f`) |
| Status | For TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. |
| Regulatory source | GB Regulation (EC) No 1272/2008 Annex IV, statement and conditions for use. Checked against legislation.gov.uk and supplied by Michaela (Sept 2026). CLPeasy's build environment cannot reach that site, so no wording was inferred from `/` or `…` punctuation. |

## Defect

CLPeasy printed its own fixed text for every P-code:
- **P305+P351+P338** was truncated (M19). The contact-lens sentences were missing.
- **Several statements were abbreviated:** P210, P314, P333+P313 and P337+P313.
- **CLPeasy invented generic completions** where the supplier must select or complete the wording:
  - P370+P378: "appropriate media for extinction";
  - P501: "in accordance with local regulations";
  - P321: "see label";
  - P260/P261: fixed "vapours and dust" wording;
  - P301+P310/P301+P312/P312: fixed "POISON CENTRE or doctor";
  - P302+P352: fixed "water".

Smart Paste kept only the codes and discarded the supplier's wording.

## Fix

- **One library** (`P_DEFS` in `label-render.js`) is used by the renderer, the Builder and the Composer. `builder.html`'s separate copy was removed. `P_LIB` is derived from `P_DEFS` for its existing uses.
- **Fixed statements** print their verified wording automatically.
- **Supplier-selection and supplier-completion statements** print **only** from a valid structured choice in the new `pChoices` field. There is no CLPeasy default. Without a valid choice the statement is not drawn, and the label is incomplete (`checkRequiredContent` → `'p-statement'`). That blocks:
  - Step 3;
  - every export route, re-checked on every attempt (Issue #4 pattern);
  - the Composer, which names the statement and never repairs or guesses.
- **Smart Paste** now also checks the text next to each supplier-specific code against its GB wording (`extractPChoicesFromText`):
  - only a clean, unambiguous match becomes a choice;
  - raw SDS text is never printed;
  - it rejects, with a reason: page headers, addresses, company or document details inside a statement, unrecognised trailing text, column layouts, hyphenated line wraps, codes without wording, and wording that doesn't match.

  Recognised page furniture on separate lines *after* a complete statement is ignored (real Nikura Snow Pixie layout).
- **Step 3 completion cards** use the P280 picker's styles. Each one shows the GB wording and asks the maker to copy the completion from the matching statement in their SDS Section 2.2. Nothing is pre-filled with a CLPeasy answer. A choice filled by Smart Paste is labelled "From your pasted SDS — check it matches".
- **P280** is unchanged.
- **Saved labels (option (a)):**
  - labels are now saved as schema v2 with `pChoices`;
  - v1 labels have no `pChoices`: their fixed statements re-render with the corrected wording, and their supplier-specific statements are incomplete and blocked until completed;
  - the saved record is never changed;
  - saved labels live in browser storage only, so there is no database change; download credits are unaffected (the re-download key is product name + type).

## The 29 supported P-codes

All 29 are kept.

| Code | Classification | Implemented behaviour |
|---|---|---|
| P101 | Fixed | "If medical advice is needed, have product container or label at hand." |
| P102 | Fixed | "Keep out of reach of children." |
| P103 | Fixed | "Read label before use." |
| P210 | Fixed | "Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking." (was abbreviated) |
| P211 | Fixed | "Do not spray on an open flame or other ignition source." |
| P233 | Fixed (conditional use) | "Keep container tightly closed." The condition is not asked of the maker. |
| P260 | Supplier selection | "Do not breathe ___." The supplier's validated exposure-form wording is printed as given (see the P260/P261 correction below). Blocked until completed. |
| P261 | Supplier selection | "Avoid breathing ___." The supplier's validated wording is printed as given, e.g. "Avoid breathing vapour or dust." Blocked until completed. |
| P271 | Fixed | "Use only outdoors or in a well-ventilated area." |
| P273 | Fixed (conditional use) | "Avoid release to the environment." |
| P280 | Supplier selection | Existing P280 picker, unchanged |
| P301+P310 | Supplier completion | "IF SWALLOWED: Immediately call ___." (source of emergency medical advice). Blocked until completed. |
| P301+P312 | Supplier completion | "IF SWALLOWED: Call ___ if you feel unwell." Blocked until completed. |
| P302+P352 | Supplier completion | "IF ON SKIN: Wash with plenty of ___." ("water" or the supplier's cleansing agent). Blocked until completed. |
| P304+P340 | Fixed | "IF INHALED: Remove person to fresh air and keep comfortable for breathing." (was abbreviated) |
| P305+P351+P338 | Fixed | "IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing." (**M19**, was truncated) |
| P312 | Supplier completion | "Call ___ if you feel unwell." Blocked until completed. |
| P313 | Fixed | "Get medical advice/attention." |
| P314 | Fixed | "Get medical advice/attention if you feel unwell." ("/attention" restored) |
| P321 | Supplier completion | "Specific treatment (see ___ on this label)." Blocked until completed; the old "see label" is gone. |
| P330 | Fixed | "Rinse mouth." |
| P331 | Fixed | "Do NOT induce vomiting." |
| P332+P313 | Fixed (conditional use) | "If skin irritation occurs: Get medical advice/attention." Never removed automatically. |
| P333+P313 | Fixed | "If skin irritation or rash occurs: Get medical advice/attention." ("/attention" restored) |
| P337+P313 | Fixed | "If eye irritation persists: Get medical advice/attention." ("/attention" restored) |
| P370+P378 | Supplier completion | "In case of fire: Use ___ to extinguish." (extinguishing media). Blocked until completed. |
| P391 | Fixed | "Collect spillage." |
| P403+P233 | Fixed (conditional use) | "Store in a well-ventilated place. Keep container tightly closed." |
| P501 | Supplier completion | "Dispose of [contents / container / contents/container] to ___." Blocked until both are given. |

The totals are 19 fixed, 3 supplier selection and 7 supplier completion.

**Implementation choice, not an Annex IV wording decision:** for P501, when the maker picks "both", CLPeasy prints Annex IV's own "contents/container".

`data/p-code-before-after.json` lists every code's old CLPeasy wording beside the new behaviour.

## Smart Paste results (`tests/precautionary-statement-wording.js`, 18 cases)

- **Real Nikura Nag Champa and Positivity:**
  - P261 → "vapour or dust", printed as "Avoid breathing vapour or dust.";
  - P302+P352 → "soap and water";
  - P501 → both + "approved disposal site, in accordance with local regulations".
- **Real Nikura Snow Pixie:** P501 accepted. The company address, "Page 2 (8)", issue date and version that follow it on separate lines are recognised as page furniture and never used.
- **Rejected:**
  - a page header inside a statement, or an address inside one → *contaminated*;
  - unrecognised text after a statement, a column layout, a hyphenated line wrap, or the same code with conflicting wording → *ambiguous*;
  - codes only, or wording without codes → *not found*;
  - "in accordance with…" without "to", "Wash with water" without "IF ON SKIN:", the template copied with "…", or P260/P261 wording that isn't only exposure forms and plain separators → *not matching*.
- **Accepted:** real supplier completions for P370+P378, P301+P310, P321 and P260, and a spaced combined code ("P370 + P378").

## P260/P261 correction (after final review)

Michaela rechecked Annex IV: "dust/fume/gas/mist/vapours/spray" is the list of alternatives; the supplier specifies the applicable conditions. So CLPeasy now preserves the supplier's validated completed wording instead of rebuilding it from tokens.

| | Real Nikura Section 2.2 (Positivity, Nag Champa) | Stored | Printed |
|---|---|---|---|
| Before the correction (`acc7ba9`) | `P261, Avoid breathing vapour or dust.` | `{forms:["dust","vapours"]}` | Avoid breathing dust/vapours. |
| After the correction | same | `{text:"vapour or dust"}` | **Avoid breathing vapour or dust.** |

- **Validation stays strict.** The wording must be only exposure forms (dust, fume, gas, mist, vapour/vapours, spray, singular or plural) joined by "/", a comma, "or" or "and". Anything else is refused: "&", "smoke", "vapour or or dust", "vapours dust", "…". The page-header, address and ambiguity checks are unchanged. Raw SDS text is never printed, and wording that can't be validated still needs the maker to complete it.
- **The Step 3 card** for P260/P261 is now a text box, like the other supplier cards. The maker copies the wording from their SDS.
- **P280** is unchanged.
- **Baseline effect:** only the Issue #1 square/rectangle baseline changed (56 cases containing P261), proven to differ solely in the P wording, with no fit change. The other three baselines are byte-identical. `data/p260-p261-correction-before-after.json` has the exact before/after.

## Saved-label migration results

- **Renderer:** a schema-v1 record prints the corrected P305+P351+P338. P261 and P501 are reported incomplete, and no generic wording is printed. The record is byte-identical after rendering and checking.
- **Builder:** opening a v1 label lands at Step 5 blocked, with the note "Complete the supplier wording for P261, P501". 8 export attempts were refused. Its Step 3 cards show both statements as incomplete.
- **Composer:** a v1 P501 record, a P370/P378 record and a two-code record are blocked with the statement named. A fixed-only record and a completed-P501 record print. The saved records are unchanged.

## Baselines and FIT → NOT FIT

`data/baseline-change-proof-and-fit-flips.json` covers four baselines, all regenerated:

| Baseline | Issue | Cases | Changed | Changed for any reason other than P wording | FIT → NOT FIT |
|---|---|---|---|---|---|
| square-rect-render-baseline | #1 | 63 | 63 | **0** | 1 |
| circle-non-arc-render-baseline | #2 | 343 | 343 | **0** | 21 |
| product-name-sizing-baseline | #3 | 360 | 360 | **0** | 14 |
| required-content-render-baseline | #4 | 33 | 33 | **0** | 0 |

**How the proof works:** the pre-Issue-5 renderer, with only its P wording replaced by the corrected wording and the fixtures' supplier completions, produces byte-identical output to the new renderer for all 799 cases. The fixtures now carry realistic supplier completions (`tests/fixtures/p-statement-choices.js`, using the real Nikura wording). That P501 wording is longer than the old invented text, which causes most of the flips. **No wording was shortened to make anything fit**; the existing NOT FIT behaviour applies.

**Other documented flips:**
- the real saved label "eryryrty" at 63 mm fits with the shortest legitimate completions, but not with the Nikura-length ones (it fits from 67 mm);
- the homepage 63 mm "circle-candle" thumbnail behaves the same way (with the Nikura-length completions it fits from 64 mm);
- the Issue #1 boundary sweeps moved: onePictogram now fits from 61 mm, multiP from 88 mm, heavy from 73 mm.

**Homepage (`index.html`):** the five decorative label thumbnails and the lifecycle centre label are genuine renderer output (enforced by existing tests). They were regenerated so they show the corrected wording. Nothing else on the page changed.

## Tests changed (test data only, where fixtures relied on the invented wording)

- **Fixtures given supplier completions:** 4 fixture files and 9 tests.
- **Expected-text checks** now use the printed wording instead of the `P_LIB` description (Issue #1 test, `print-sheet-composer`).
- **The P280 drift check** now pins the single library.
- **The Issue #4 test's pasted SDS** now includes the P501 wording.
- **`builder-regression`:** the maker completes P302+P352 with "water".

## Folder contents

| Path | What |
|---|---|
| `data/p-code-before-after.json` | Every code: classification, old CLPeasy wording, new behaviour |
| `data/baseline-change-proof-and-fit-flips.json` | Per-baseline proof and the full list of FIT → NOT FIT cases |
| `data/issue-*-output.txt` | Test outputs on the combined code |
| `screenshots/local__*.png` | Step 3 cards (desktop and mobile, codes-only and Nikura paste) and the label preview, from local Chromium |
| `screenshots/live__*.png` | Signed-out QA on the test deployment |
