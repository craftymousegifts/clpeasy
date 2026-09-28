# Post-fix evidence: Composer ignores saved fine-tune overrides (audit finding M03, Issue #8)

| | |
|---|---|
| Branch | `fix/circle-per-line-text-fit`, on top of Issues #1–#7 |
| Implementation | `ff16261` (print.html only, plus a new test) |
| Status | **FIXED + QA PASSED**. Awaiting Michaela's sign-off. Not merged to `main`. Not deployed to production. `main` was **not** merged into this branch. |
| Classification | CLPeasy consistency/technical defect (source B). Not a GB CLP regulatory issue. |

## Defect (M03, MEDIUM)
The Builder passes the label's saved "Fine-tune your label" adjustments to the shared renderer for its preview, PNG, SVG and PDF, and saves them with the label. The Print Sheet Composer's single render function, `renderSheetPosition()`, passed none of them. A fine-tuned label therefore printed on sheets at the automatic text sizes, not the sizes the maker saved.

Measured before the fix (60 mm circle candle, five overrides; mm):

| | hazard | product name | business | type | signal |
|---|---|---|---|---|---|
| Builder | 1.551 | 2.949 | 2.760 | 3.310 | 3.781 |
| Composer | 1.529 | 3.203 | 3.000 | 3.676 | 4.194 |

## Fix (Option A, approved 28 Sep 2026)
`renderSheetPosition()` passes six saved options when the stored value is a finite number:
- `hazardFSOverride`
- `scentFSOverride`
- `bizNameFSOverride`
- `typeFSOverride`
- `sigFSOverride`
- `hazardYOffset` (no live on-screen control, but part of the saved schema; kept for older records)

Missing, `null`, `undefined`, text (including numeric text such as `'7'`), `NaN`, `±Infinity`, objects and booleans are not passed, so the renderer uses its automatic behaviour. Every Composer path goes through this one function: preview cells, thumbnails, the fit check, the A4 PDF and the cutting-machine PNGs.

Not changed:
- `label-render.js` and Builder behaviour;
- the saved-label schema (no migration);
- label outer dimensions, Composer grid/placement, PDF page size and cutting PNG size;
- download accounting and any GB CLP wording or logic.

## Regression proof
`tests/m03-composer-fine-tune-overrides.js`: real Chromium; the Builder creates and saves the label, the Composer renders it. 8 groups pass:
1. **Requirements 1–6:** each of the six overrides on its own is passed, changes the output, and equals a direct render with that option.
2. **Requirement 7:** all overrides together: Composer font sizes equal the Builder export exactly (hazard, product name, business, type, signal, footer).
3. **Requirement 8:** no-override label: byte-identical SVG to the pre-M03 call.
4. **Requirements 9–10:** invalid values are not passed; output identical to automatic sizing; no `NaN` in Composer output.
5. **Requirements 11–12:** the fit check uses the overridden render. A label that does not fit with its saved override is listed, export is blocked, and nothing is written or charged; it does not fall back to automatic sizing.
   - This uses a test double that marks one label NOT FIT only when its override is applied, because no natural case exists. Across 96 label/size combinations × 8 override combinations (every override at its maximum, and both vertical-offset extremes), the renderer's clamps always kept the label fitting.
6. **Requirement 13:** the preview, A4 PDF and cutting-machine PNG renders all receive the same saved overrides; the cutting PNG stays 709×709 px at 300 dpi.

Mutation check: with the pre-M03 `print.html` the browser checks fail ("hazardFSOverride passed to the renderer").

### Before vs after, same audit branch (A4 PDF sheet + cutting PNGs)

| Sheet | Positions / template / PDF page | Sheet image | Cutting PNG |
|---|---|---|---|
| 60 mm circles, no overrides (6) | identical (209.89×297.01 mm) | identical | identical bytes (709×709) |
| 63×44 wax melt, no overrides (3) | identical | identical | identical bytes (744×520) |
| 60 mm square, all overrides `null` (3) | identical | identical | identical bytes (709×709) |
| 60 mm circle, fine-tuned (3) | identical | changed (content only, as intended) | same size, content changed |

- **Builder:** unchanged (no Builder code touched).
- **Stage 1 (PR #159):** not on this branch (main was not merged in), so its size-integrity test does not exist here. Geometry was instead proven unchanged by the comparison above.

## Suite
- Full suite: 56 pass, 5 fail. The 5 are the audit-branch baseline failures already recorded for Issue #7: builder-desktop-scroll-model, builder-step-navigation-layout, footer-and-compliance-wording, lifecycle-reminder-accuracy, smart-paste-user-guidance-wording. **No new failures.**
- Issues #1–#7 tests all pass.

## Related, not fixed here
**M66 (OPEN):** a stored non-numeric override makes the shared renderer produce `NaN` sizes while still reporting FIT. M03 only stops the Composer passing such values; M66 remains open.
