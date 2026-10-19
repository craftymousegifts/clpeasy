# Smart Paste Section 2.2 scope — production release record (18 Oct 2026)

PR #261. Founder approval for production: 18 Oct 2026 (Michaela), based on
the completed verification evidence. Squash-merged to `main` in the
out-of-hours window; the production commit and Netlify deploy are recorded
in the PR's release comment.

## Scope

Only the approved Section 2.2 safety correction, based on production `main`
`a42d1f1`:

- `sds-section-scope.js` (new): decides which part of the pasted text Smart
  Paste may read: one Section 2.2 block, the text as pasted (no SDS
  headings), or stop.
- `builder.html`: `extractSDS()` scopes the text first; stop message box;
  load-failure message; message cleared on Clear and on loading a saved label.
- Tests: `tests/smart-paste-section-scope.js` (new, in `npm test`); 48 test
  harnesses load the new script; one EUH208 fixture updated.
- Records: `docs/context/PROJECT_HISTORY.md`, `CHANGELOG.md`, this file.

No change to hazard classification, statement wording, pictograms, label
sizes, authentication, billing, downloads or stored data. #257–#260 are not
included.

## Evidence

| Check | Result |
|---|---|
| 100 real Nikura whole SDSs × 2 reading orders × 5 layout variants (1,000 runs) | 0 wrong codes, 0 false stops |
| Real `extractSDS()` on the same 100, both reading orders | 100/100 match the Section 2.2 paste |
| By eye vs rendered PDFs (DCS, NI Candle Supplies, Nikura 004/059) | Exact |
| 9 founder-supplied documents (5 Nikura full SDSs neat / 10% in wax; 2 Supplies for Candles advice sheets; allergen list; IFRA certificate) | 9/9 PASS; allergen list and IFRA certificate cannot produce a label; EUH208 on page 2 kept |
| Synthetic multi-SDS (800) and GB/US samples | All stop (synthetic only) |
| Stale data, Step 3 block, load failure (preview, desktop and iPhone width) | PASS |
| Targeted release tests at the release head (11 files) | PASS |

## Known limitations

1. **Unfamiliar SDS layouts.** Real full-SDS coverage is one layout family.
   No real reed diffuser, room spray or other full-SDS template tested.
   Expected failure is a false stop (safe). A Section 2.2 cut short by an
   unrecognised in-section heading is possible in theory; not seen.
2. **Unstructured pastes** (no SDS headings) are read as pasted, as before.
   The "SDS SECTION 2.2 LABEL ELEMENTS" heading is not recognised as a
   heading; those advice sheets are read whole, correctly.
3. **P-only continuation exception.** A repeated Section 2.2 heading adding
   only P statements is joined to the previous block, so a second document
   holding only P statements could be combined.
4. **H401 (separate regulatory issue).** Nikura Positivity (neat) lists H401,
   not a GB CLP hazard statement; Smart Paste carries it through as printed.
   Unchanged by #261; needs separate review.
5. **Labels saved before this release** may contain codes from outside
   Section 2.2. No customer notice or saved-label check is part of this
   release (awaiting founder decision).

CLPeasy helps makers prepare labels from their supplier's information. It
does not guarantee regulatory compliance; makers remain responsible for
their labels.

## Rollback

`git revert <squash sha>` on `main` (VERSIONING.md). No database or
configuration change is involved.
