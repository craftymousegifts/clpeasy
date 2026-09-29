# M24, M51, M56, M57: signed off (29 Sep 2026)

**Status:** FIXED + QA PASSED + SIGNED OFF (Michaela, 29 Sep 2026). No further application-code work.

| M | Fix | Commit | Coverage |
|---|---|---|---|
| M24 | Duplicate H/P code handling (de-duplicated in the renderer) | `ee80aa0`, test `5e02c2a` | `tests/m24-deduplicate-codes.js` passes |
| M51 | Custom-height input limit aligned with the 150 mm renderer limit | `581085a` | Pre-audit vs current regression audit; Safety Baseline |
| M56 | XML-invalid control characters stripped | `0b4e039`, test `474802f` | `tests/m56-m57-output-sanitisation.js` passes |
| M57 | PDF popup title escaped | `e9116d5`, test `474802f` | `tests/m56-m57-output-sanitisation.js` passes |

All four are covered by the pre-audit vs current regression audit (no unexplained differences) and by the Builder Safety Baseline.
