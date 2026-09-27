# M64: a saved pictogram list of valid keys can disagree with the label's H-codes

| | |
|---|---|
| ID | **M64** (new; continues after M63) |
| Area | Saved labels → Builder (`loadLabelRecord()` in `builder.html`) and Composer (`print.html`): source of the pictogram list |
| Status | **OPEN**. Found during the Issue #7 (M38) investigation; recording approved by Michaela. **Not fixed as part of Issue #7.** |
| Origin | Pre-existing (the same behaviour on `main`). |
| Severity | Not yet assessed; to be reviewed in its own place in the audit order, alongside M04 (signal-word single source) and M37 (pictogram precedence). |

## Finding

A saved label stores its pictogram list (`pictograms`). When the label is opened:
- the Builder restores that stored list as it is (it only rebuilds the list from the H-codes when the stored list is empty);
- the Composer renders it directly.

Neither checks that the list matches what the label's own H-codes require under the existing H-code → pictogram mapping.

**Example:** a saved label with **H301** (toxic if swallowed) and `pictograms: ['exclamation']` contains only a *valid* key. It is **missing the skull** that the H-code mapping gives H301, yet it renders, fits and exports.

## Relationship to M38 (Issue #7)

M38 blocks **unknown / malformed / empty** keys, so none is ever substituted. M64 is the separate case where **every key is valid** but the list is incomplete or inconsistent with the H-codes. Issue #7 deliberately did not change this.

## Reach

- **Normal saves stay consistent.** Pictograms are rebuilt whenever the hazards change (Smart Paste extraction, H-statement chips).
- **A mismatch needs one of:** an older or corrupted record, a hand-edited stored record, or a future change to the H-code → pictogram mapping after labels were saved.

## Options to consider later (not decided)

- Always derive the pictograms from the H-codes: one source of truth, like the M04 signal-word question. This changes saved-label semantics.
- Detect a mismatch and block it, like M38, sending the maker to Step 3.
- Also consider it together with M37 precedence rules, which are not yet decided.

**Do not fix without approval.**
