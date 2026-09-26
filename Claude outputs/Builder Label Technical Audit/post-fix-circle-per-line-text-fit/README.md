# Post-fix QA evidence — circular-label text clipping (audit finding M44)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit` (from `main` @ `e8c1f25`) |
| Implementation commit | `79b0cd3` — "Fix circular labels reporting FIT while hazard/P text is clipped" |
| Status | Accepted for TEST REVIEW ONLY. Not merged to `main`. Not deployed to production. |
| Original pre-fix audit evidence | Unchanged, on branch `claude/awesome-meitner-va8zlq` (`Claude outputs/Builder Label Technical Audit/`) |

## Defect tested

On circular labels, `label-render.js` wrapped each hazard, sensitiser/EUH208 and precautionary block to one width, taken at the centre of the block's first line. The fit check was vertical-only. In the lower half of the circle, later lines ran past the label edge and were hidden by the circle clip. The label still reported FIT and could be downloaded.

The fix gives every line on a circle its own safe width: the chord at the edge of that line's band farther from the centre, minus the existing 2 mm margin. Every line is checked against it. The fit check, the manual-override ceiling, re-centring and the overflow flag all require it. Squares and rectangles use the unchanged code path.

## Before / after clipping result

| Measurement | Before (`main`) | After (fix) |
|---|---|---|
| Audit harness, 54 circle renders (FIT labels with text outside the circle) | **12** | **0** |
| Wider comparison, 90 circle renders (52 default, 52, 63, 75, 100 mm × 18 fixtures) | **14** | **0** |
| Text ink pixels outside any FIT circle (new automated test) | — (test fails on `main`) | **0** |
| New test `tests/circle-per-line-text-containment.js` | fails on `main` | passes (38 FIT renders verified, 27 NOT FIT verified blocked) |

## FIT → NOT FIT boundary changes

The audit harness and 90-render comparison had no FIT → NOT FIT changes. Labels that still fit mostly get slightly smaller hazard text (typically 0.02–0.1 mm), never below the 1.2 mm minimum.

The boundary sweep (18 fixtures × circles 52–110 mm, 1 mm steps, 1,062 renders) found **10 FIT → NOT FIT changes, 0 NOT FIT → FIT** (`data/boundary-sweep-52-110mm.txt`):

| Fixture | Smallest fitting circle before → after |
|---|---|
| 02 long product name | 56 → 58 mm |
| 05 max P statements | 82 → 83 mm |
| 09 one pictogram | 56 → 58 mm |
| 10 two pictograms | 56 → 58 mm |
| 13 special characters | 56 → 57 mm |
| 18 long room spray | 66 → 68 mm |

What was wrong with those 10 labels before the fix (`data/fit-to-not-fit-clearance-check.txt`):
- 3 were visibly clipped: 05 at 82 mm, and 18 at 66 and 67 mm.
- 7 were inside the circle but closer than the existing 2 mm margin at the line edge (1.0–1.29 mm).

## Squares and rectangles

- **Unchanged.** All 90 square/rectangle audit-harness renders have identical fit results, warnings and measured text lines.
- All 108 square/rectangle renders in the wider comparison are byte-identical.
- The 63 fingerprints in `tests/fixtures/square-rect-render-baseline.json`, generated from `main`'s renderer before the fix, match.

## Other results

- Existing suite: 49 pass (including the new test). The same 5 pre-existing wording/copy tests fail as on `main`, with identical messages.
- Homepage: the renderer-derived Vanilla circle thumbnail and its lifecycle copy were regenerated. One P-statement line re-wraps; the wording, font size and line count are the same.
- Out of scope, not changed:
  - **M05**: the browser draws small text ≈0.35 % wider than the renderer measures, so drawn text can reach ≤0.16 mm into the 2 mm margin. It is never outside the circle.
  - **M41**: candle icon corners on 52 mm circles.
  - Remaining harness flags on fitting labels are only M41.

## Folder contents

| Path | What |
|---|---|
| `before-after-screenshots/` | 14 images, 4 panels each: BEFORE as exported, BEFORE clip removed (red = label edge), AFTER as exported, AFTER clip removed. light/medium/heavy/EUH208+sensitisers at **52, 63, 75 mm**; heavy and full-P at **100 mm** |
| `harness-screenshots-after/` | Post-fix preview / export-PNG pairs from the audit harness (same combinations as the pre-fix audit `screenshots/`) |
| `data/audit-harness-results-after-fix.json` | Full post-fix audit-harness output (144 renders) |
| `data/circle-comparison-90-renders-main-vs-fix.json` + `circle-comparison-summary.txt` | `main` vs fix, per render: fits, hazard font size, worst edge distance |
| `data/boundary-sweep-52-110mm.txt` | Smallest fitting circle per fixture, before and after |
| `data/fit-to-not-fit-clearance-check.txt` | Pre-fix clearance of each FIT → NOT FIT case |
| `data/circle-per-line-text-containment-test-output.txt` | New automated test output on the fix branch |

Evidence was produced in headless Chromium 141 in the Claude Code cloud container. Georgia is not installed there, and Google Fonts were blocked for the automated test, so text is drawn in the same generic font the renderer measures with.
