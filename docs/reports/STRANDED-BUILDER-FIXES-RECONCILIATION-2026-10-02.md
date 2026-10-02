> **Superseded for approval status** by `STRANDED-BUILDER-FIX-REGISTER-2026-10-02.md`. The circle and overlap fixes (M44/M45) are listed as "signed off" in the branch's classification document (approver not named), so they are NEEDS OWNER REVIEW rather than "not owner-approved".

# Stranded Builder fixes — reconciliation (2 Oct 2026, read-only)

**Context**
- Current main: `727804e`. No Builder code was changed, cherry-picked or reimplemented.
- **Where the fixes live:** all four groups are on `audit/m37-m64-pictogram-precedence` (`8f0812c`).
  That branch contains `fix/circle-per-line-text-fit` (`cd4ab86`).
- **Branch age:** it branched from main at `e8c1f25` (24 Sep), before PR #156 (PAYG) and later
  main work. It is 136 commits behind main.
- **Do not merge it whole:** a wholesale merge would revert PAYG. Against main, the branch shows
  `entitlement.js` −153 lines, `builder.html` ±1,247 lines and `print.html` ±533 lines.
- Evidence folders below are under `Claude outputs/Builder Label Technical Audit/` on that branch.

| | Circle per-line clipping (Issue #1) | Curved product name overlapping business name (circle) | Precautionary-statement wording (M19/M20, Issue #5) | M37/M64 pictogram precedence + saved-pictogram mismatch |
|---|---|---|---|---|
| **Original issue** | Circle labels reported FIT while hazard/P text lines were clipped by the circle edge | On circles, the curved product name could overlap the business name. A follow-up stopped "+" fine-tune shrinking the name | Some P-statements printed with wrong or invented completions | Pictogram precedence (GB CLP Art. 26) not applied. Saved pictograms could disagree with the H-codes and still export |
| **Code commit(s)** | `79b0cd3` (evidence `59faa0c`) | `b321c33`, `8529c4b` (related: `a092f05` message wording, `0102247` M43 one-line name) | `b88fad2`, `b4c412b` (P260/P261 correction). Evidence `acc7ba9`, `5cc1962`, `b9bda4c` | `9a95678` … `4cf7083` (resolver, fail-closed, Step 3 repair, Composer message). Handover `8f0812c` |
| **Approved as a fix?** | **Not owner-approved.** README status: "Accepted for TEST REVIEW ONLY. Not merged" | **Not owner-approved.** Same "TEST REVIEW ONLY" status | **Yes.** README: "FIXED + QA PASSED + SIGNED OFF (Michaela, Sept 2026)", final code `b4c412b`, "Not merged to main" | **Not owner-approved.** Handover asks for an independent "Friday review" and says "do not merge/deploy merely because this handover says PASS" |
| **Tests / evidence** | New `circle-per-line-text-containment.js` (fails on main, passes on branch). 38 FIT renders geometrically verified, 27 NOT FIT blocked. 1,062-render boundary sweep. Screenshots (`post-fix-circle-per-line-text-fit/`) | `circle-product-name-business-name-clearance.js` + font fixtures. Before/after screenshots, `fit-changes-vs-pre-fix.txt`, pixel tests (`post-fix-circle-arc-business-name/`) | `tests/precautionary-statement-wording.js` (not on main). Baseline/fit-flip proof JSON, legacy-v1 end-to-end, signed-out test-site screenshots (`post-fix-precautionary-statement-wording/`) | `tests/m37-m64-pictogram-precedence.js`. GitHub Actions run `36606596767` SUCCESS. Builder Safety Baseline PASS. GB investigation docs (M37-*.md) |
| **Difference from main** | Main has none of it; main still has the clipping behaviour | Main has none of it | Main has the old P-statement wording; the test file is absent | Main has no precedence resolver and no mismatch blocking |
| **CLP content/logic, or rendering/fit only?** | **Rendering/fit only.** Text size and line containment; no CLP wording | **Rendering/fit only**, plus a size-block message reworded without a CLP claim (`a092f05`) | **CLP content.** Printed P-statement wording changes; supplier-specific P-codes block until completed | **CLP logic.** Which pictograms show and export; adds export blocking |
| **Expected regression impact** | 10 FIT → NOT FIT (0 NOT FIT → FIT) in a 1,062-render sweep. Fitting labels' hazard text about 0.02–0.1 mm smaller, never below the 1.2 mm floor | FIT → NOT FIT changes listed in evidence; 0 NOT FIT → FIT | 36 FIT → NOT FIT (longer wording). Saved labels with supplier-completed P-codes block until completed | Some saved labels/fixtures change pictograms or are blocked. Composer shows a mismatch reason |
| **Reapply to current main?** | Code **applies cleanly** (`git apply --check`). Could be cherry-picked, then full regression run | Code **applies cleanly**. Same approach, kept as one group with the circle fix (they touch the same renderer area) | **Does NOT apply cleanly** (7 conflicting hunks across builder/label-render/print/index). Needs a careful port on top of main, not a blind cherry-pick | Built on top of the P-statement and other audit commits (33 app-code commits on the branch). **Port after the P-statement work, or reimplement** against main |

**Other signed-off audit fixes on the same branch, also not on main**
- M03, M04, M10, M21 (#6), M24, M38 (#7), M43, M51, M55, M56/M57, M63, M09/M31.
- Their status is recorded in `SIGNED-OFF-M24-M51-M56-M57.md`, `REMAINING-AUDIT-CLASSIFICATION.md`
  and the per-item evidence.
- They need the same reconciliation before any integration.

**OWNER DECISION REQUIRED — PR #203 (SDS fragrance percentage):** frozen. Not merged, not modified,
not implemented. The competitor and percentage-SDS investigation is research only.
