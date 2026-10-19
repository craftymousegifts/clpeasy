# Builder SDS source confirmation — review candidate

Base: main `3a9524e8184538bdd1ead12b0cbe1ac867e7a913`. Owner approved the small implementation/preview scope on 19 October 2026. No production release approval. High tier: compliance-facing wording; existing release gates apply.

## Behaviour

A mandatory, initially unticked source acknowledgement sits above Extract hazard data, with the approved proposed wording and a visible statement that it does not validate the SDS or extracted result. Knowledge Base (`knowledge.html#blended`, existing topic) and support links provide an unsure route. The new acknowledgement checks source suitability; the existing Step 3 and final checkboxes still review extracted/label results.

The guard runs before extraction and does not mutate existing hazards if acknowledgement is missing. Confirmation is tied to exact paste, product type and fragrance percentage; input/change events reset it, and current values are compared at extraction and updateLabel to catch calculator/programmatic changes. Clear and loading a saved label reset it. An unchanged retry retains it. No persistent acknowledgement, timestamps, source logging, database, privacy policy or retention changes.

Extraction scope, unsupported-code handling, P-statement exclusions, wording libraries, classification/selection, rendering and export gates are unchanged. Multiple bare extracts without recognisable structure remain an existing limitation; a checkbox does not repair or conceal that limitation. The separate P-statement investigation remains open.

## Verification

- `tests/sds-source-confirmation.js`: 7 checks passed against real Builder functions (no automatic confirmation helper). Missing acknowledgement, unchanged retry, edits, programmatic changes, multiple-document stop, existing excluded-code warning/later checkboxes, Clear/load reset and help link.
- `tests/smart-paste-section-scope.js`: all 8 checks passed, including multiple documents, page continuations, no stale data and scoping-file load failure. Tests now explicitly perform the new confirmation.
- `tests/smart-paste-guidance-release-c.js`: all 14 checks passed, including suitability states, excluded-P-code warnings, unsupported codes and unchanged extraction results.
- `tests/gb-wording-and-mixed-code-correction.js`: passed.
- Shared legacy test helper now performs the actual acknowledgement before extraction rather than bypassing the guard. Both guidance/wording tests re-run and passed after the helper update. New negative tests deliberately do not install this helper.
- Focused independent diff review: no concrete defects found in enforcement, resets, warning preservation or wording.
- `git diff --check`: passed.

## Outstanding before release

Full repository suite, desktop/mobile visual and interaction checks on the preview, and actual iPhone checks have not been completed. Local Chromium was unavailable and its download failed; no browser QA is claimed. No signed-in production actions or customer data touched. A review preview is not production approval.

## Rollback

Revert this isolated change. No data migration or stored acknowledgement to remove.

## iPhone feedback follow-up — general SDS help link

Owner reported that the broad “Unsure?” link opened the blended-fragrance topic. It now targets `compliance.html#sds-guidance`, the existing “Documentation the Builder can use” section from merged #263, covering product type, concentration, neat oil, blends and unclear documentation. A heading anchor with scroll margin avoids the fixed navigation. The separate blended-fragrance help link is unchanged. No regulatory wording or extraction logic changed. Current main `1925764` merged into this review branch; both project-history additions preserved. Production is not changed.
