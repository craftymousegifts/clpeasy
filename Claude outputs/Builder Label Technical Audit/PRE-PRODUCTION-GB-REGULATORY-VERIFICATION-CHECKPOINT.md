# Pre-production GB regulatory verification checkpoint

**Status:** OPEN — must be completed before the label-audit branch is approved for production.
**Recorded:** 27 Sep 2026, on the owner's instruction (see "Regulatory scope" in `docs/context/CLPEASY_PROJECT_CONTEXT.md`).

Issues #1–#7 are **not** reopened by this checkpoint.

## Requirement
Before production approval, verify that every regulatory wording/mapping introduced or changed during this audit is supported by the **current GB CLP position** (GB CLP legislation on legislation.gov.uk, then HSE / GB CLP Agency guidance). EU CLP, ECHA, NI/EU and UN GHS material is context only and must not be used to add or expand requirements.

## Specific re-check: Issue #6 suffixed H-codes
For each code, verify against GB CLP/HSE sources, where applicable:
the exact GB hazard-statement wording, the GB classification/category, the signal word and the pictogram(s).

| Code | GB wording | GB class/category | Signal word | Pictogram(s) | Result |
|---|---|---|---|---|---|
| H350i | | | | | not yet verified |
| H360F | | | | | not yet verified |
| H360D | | | | | not yet verified |
| H360FD | | | | | not yet verified |
| H360Fd | | | | | not yet verified |
| H360Df | | | | | not yet verified |
| H361f | | | | | not yet verified |
| H361d | | | | | not yet verified |
| H361fd | | | | | not yet verified |

## Rules
- Do not change these mappings unless GB verification shows something is wrong.
- Record any discrepancy here and **stop for owner review** before changing application code.

## Final integration QA (recorded 28 Sep 2026)
**Status: OPEN.** The audit branch is deliberately isolated from `main` (PAYG PR #156, Stage 1 PR #159 and later). Before production, the completed audit work must be integrated with current `main` and re-tested there, including:
- the PR #159 Composer size-integrity protections (`tests/print-sheet-size-integrity.js`) together with M03's Composer fine-tune overrides;
- the full suite on the integrated result.
