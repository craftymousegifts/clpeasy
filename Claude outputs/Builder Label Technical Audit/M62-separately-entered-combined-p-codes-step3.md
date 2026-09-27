# M62: separately entered combined P-codes rejected at Step 3

| | |
|---|---|
| ID | **M62** (new; continues the audit matrix M01–M61) |
| Area | Builder: Step 3 code validation |
| Status | **OPEN**, recorded at Issue #5 sign-off. Not fixed as part of Issue #5. |
| Origin | Pre-existing. The check is byte-identical before Issue #5 (`859333f`), on `main` (`e8c1f25`, i.e. production) and on the Issue #5 branch. |
| Severity | Not yet assessed; to be decided in its own audit item. |

## Finding

When a label's P-statement codes list the parts of a combined statement **separately** (e.g. `P370, P378`), the existing Step 3 unrecognised-code check in `builder.html` (`canLeaveApprovedBuilderStep(3)`) rejects them. The message is "CLP code not recognised … P370, P378".

The same codes entered **combined** (`P370+P378`) are recognised. The shared renderer (`label-render.js`, `normalisePCodes()`) also combines adjacent codes into their combined statement. So the label itself prints the combined statement, but Step 3 won't continue.

**Cause:** the Step 3 check compares each comma-separated code with the library individually, without first combining adjacent codes as the renderer does.

## Reach

- Smart Paste and the P-statement chips always store the combined form (`P370+P378`), so the normal flows don't produce split codes.
- It affects codes entered or saved separately, e.g. older saved labels or hand-edited code lists.
- The download gate doesn't use this check, so the Step 3 result and the renderer disagree for such labels.

## Reproduction

`post-fix-precautionary-statement-wording/data/closure-scripts/M62-separate-p-codes-step3.js`, with output in `post-fix-precautionary-statement-wording/data/closure-3-M62-separate-p-codes-step3-reproduction.txt`:
- a saved label with `P102, P261, P305+P351+P338, P370, P378, P501` stays at Step 3 with the "not recognised" alert;
- the identical label with `P370+P378` passes Step 3.

## Next step

Investigate as a separate audit item: decide whether Step 3 should normalise adjacent codes exactly as the renderer does. **Do not fix without approval.**
