# Builder Phase 1 QA: M03, M51, M55, M56/M57 (3 Oct 2026)

**Branch:** `fix/builder-approved-batch-1`.
- The QA record is committed on top of `63919f3`. The code under test is unchanged since
  `63919f3`.
- The branch contains main `6ae8de5`: the approved hero and docs, already in production.
- **Not merged or deployed.**

**Excluded:** M09/M31, M44/M45 and every other audit item. PR #203 stays frozen.

## Evidence types
- **AUTOMATED:** tests run here in real Chromium against the branch code. Composer exports use an
  in-page signed-in stand-in account, with no network.
- **BROWSER (preview):** checks on the deployed Test preview
  https://clpeasy-pr156-payg-test-v10.netlify.app (deploy `6ac11a7a55a8943d9000a59a`, built
  from `63919f3`).
- **OWNER:** Michaela's own checks on the preview.

## Results
| Check | Result | Evidence |
|---|---|---|
| Full suite | PASS (71/76; the only failures are the 5 known baseline ones) | AUTOMATED |
| Offline function checks | PASS (checkout 50, webhook 51, manage-subscription 8, billing-status 26) | AUTOMATED |
| Builder Safety Baseline | PASS. All 10 labels identical to the snapshot of unmodified main `ae070b6` (fit, wording, pictograms, sizes, exports, Composer) | AUTOMATED |
| **M51:** height above 150 mm | PASS as specified (see the observation below) | BROWSER (preview) and production comparison |
| **M03:** fine-tune carries to the Composer sheet and exported files | PASS (automated) | AUTOMATED: `m03-composer-fine-tune-overrides`, 8 groups |
| M03: Composer loads and adds a saved label | PASS | OWNER |
| **M55:** invalid saved colour falls back safely; Composer exports still generated | PASS | AUTOMATED: `m55-bgcolour-validation`, 4 groups |
| **M56/M57:** output sanitisation | PASS | AUTOMATED |
| Preview pages | PASS (Builder 390/1366 px and Composer 1366 px load with no page errors and no horizontal overflow; served `label-render.js` matches the build) | BROWSER (preview) |
| Signed-in Test journey | **BLOCKED (environment)** | This environment cannot reach CLPeasy Test Supabase (`*.supabase.co`, connection refused by the network policy), so sign-in, a saved cloud library and a signed-in Composer export cannot be driven from here |

### M51 detail (deployed preview, Rectangle, width 80 mm)
| Typed height | Preview (Phase 1): field validity | Label made at | Production (main): field validity | Label made at |
|---|---|---|---|---|
| 180 | **invalid** (range overflow, max 150) | 150 mm | valid (max 200) | 150 mm |
| 151 | **invalid** | 150 mm | valid | 150 mm |
| 150 | valid | 150 mm | valid | 150 mm |
| 100 | valid | 100 mm | valid | 100 mm |

- **Above 150 mm:** M51 makes the input's own limit match the renderer, so the browser treats 151
  and above as out of range and the arrow keys stop at 150.
- **No label taller than 150 mm can be produced,** on main or on this branch: the label is clamped
  to 150 mm, and the preview shows "Print size: 80 × 150mm".
- **Valid heights (100, 150)** work unchanged.

**Observation (not a defect of the approved fix, decision needed if you want it):**
- When a user types a value above 150 the field shows no visible message, and the label is
  silently made at 150 mm.
- This silent clamp is pre-existing (identical on production).
- A visible "maximum 150 mm" message would be a new UX change outside the approved M51. It is not
  included.

### M03 detail (automated, real Chromium)
- **Builder:** the label was saved with its user-set fine-tune overrides.
- **Each setting applied in the Composer:** all six saved settings (hazard text size, product name
  size, business name size, product type size, signal word size and hazard position).
- **Text sizes match exactly** between the Builder export and the Composer: hazard text, product
  name, business name, product type, signal word and footer.
- **No-override labels** are byte-identical to before.
- **Invalid saved values** (text, NaN, ±Infinity, objects) are ignored, and automatic sizing is
  used.
- **Fit check:** it uses the saved settings. A label that does not fit with them is blocked, with
  no fallback and no download used.
- **One render everywhere:** the Composer preview, A4 PDF and cutting-machine PNG all use the same
  overridden render, and the cutting PNG's outer size is unchanged.

## Remaining limitations
- **Signed-in journey not driven from here:** sign-in, the cloud library and a real signed-in
  Composer export on the preview were not performed (BLOCKED by environment).
- **Covered instead by:**
  - the automated M03 / M55 / baseline tests (stand-in account);
  - your own Composer check on the preview.
- **Optional owner check on the preview, while signed in:**
  1. In the Builder, fine-tune a label (for example "+" on the product name) and save it.
  2. Add it to a Composer sheet and download the A4 PDF.
  3. Confirm the product name size matches the Builder download.

## Deployment scope (on your approval)
- **Fast-forward `main`** from `6ae8de5` to this branch's head. Netlify then publishes:
  - `builder.html`: M51 field limit; M57 PDF pop-up title escaping;
  - `print.html`: M03;
  - `label-render.js`: M55 and M56.
  - The branch also adds four test files, one fixture and docs, which do not change the site.
- **Unchanged:** Supabase functions, the database, Stripe, prices and secrets.
- **Rollback:** republish Netlify production deploy `6ac11ba1592825000890984f` (main `6ae8de5`).
