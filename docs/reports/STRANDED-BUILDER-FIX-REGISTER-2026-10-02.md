# Stranded Builder fix register — definitive (2 Oct 2026, read-only)

This supersedes `STRANDED-BUILDER-FIXES-RECONCILIATION-2026-10-02.md` for approval status.

**Scope and method**
- This is historical reconciliation only. No Builder code was changed, cherry-picked, merged or
  deployed.
- **Sources:** branch `audit/m37-m64-pictogram-precedence` (`8f0812c`; it contains
  `fix/circle-per-line-text-fit` `cd4ab86`), its commits, and its evidence folder
  `Claude outputs/Builder Label Technical Audit/`.
- **Current main:** `727804e`. **None** of these commits is an ancestor of main. A reverse-apply
  check confirms none of the changes is already in main.
- **Approval rule used:** an item is marked **APPROVED BUT STRANDED** only where an evidence
  document **names Michaela** as having signed off or approved it.
  - Code existing, tests passing, or "SIGNED OFF" with no named approver does not count; those are
    **NEEDS OWNER REVIEW**.
  - `REMAINING-AUDIT-CLASSIFICATION.md` (29 Sep) lists "Signed off: M03, M09/M31, M10, M19/M20,
    M21, M38, M43, M44, M45, M55" without naming an approver.
  - `PRE-AUDIT-VS-CURRENT-REGRESSION-AUDIT.md` records "ACCEPTED by Michaela (29 Sep 2026)" for
    the *regression check*. It says every difference "traces to an approved, signed-off fix", but it
    is not a per-fix sign-off. Items whose only approval evidence is these two documents are marked
    NEEDS OWNER REVIEW (likely approved — please confirm).
- **"Applies cleanly" check:** `git apply --check` of the item's own app-code commits
  (`builder.html`, `print.html`, `label-render.js`, `index.html`) against main in isolation.
  - Many audit commits build on earlier audit commits. So "conflicts" often means it depends on
    earlier stranded work, not only on main's changes.
  - "Clean" does not prove it is safe without the full regression run.

**Change type key:** A = rendering/fit only · B = CLP content · C = CLP logic · D = export/blocking
behaviour · E = other.

| Item | Short description | Commit(s) (app code) | Original status (evidence doc) | Michaela explicitly approved? | On main? | Change type | Test / evidence | Expected impact if ported | Old code applies cleanly? | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **M03** | Composer applies the label's saved fine-tune adjustments | `ff16261` (evidence `4bff2da`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-composer-fine-tune-overrides/README.md`) | **Yes** — "SIGNED OFF (Michaela, 28 Sep 2026). Approved implementation `ff16261`". Final integration QA with PR #159 still required | No | A | README + before/after comparison; Stage 1 size-integrity test to be run on integration | Composer sheets match each label's fine-tuned Builder output | Yes (`print.html` only) | **APPROVED BUT STRANDED** |
| **M04** | Composer prints the saved signal word instead of the resolved one; shared GB resolver | `59cb129` `253e852` `e94739c` `9a1905b` `7656555` `ed87afa` (+ tests `8efffcb` `0021139`; QA `693fe5c`, `ec0a9cc`) | "FIXED + QA PASSED + SIGNED OFF" (`M04-IMPLEMENTATION-CHATGPT-CONTINUATION.md`); classification Group 1 "must address before production" | **No named approver** | No | C | Composer signal-word regression (GitHub Actions QA 29 Sep) | Composer signal word can change on some saved labels | No (6 conflicts) | **NEEDS OWNER REVIEW** |
| **M10** | Require supplier address on hazardous labels (Builder, shared gate, Composer message) | `6f70631` `21a83d1` `9eff958` (+ tests `efa09c1` `b5ad2db` `82fa124`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-supplier-address/README.md`) | **Yes** — "SIGNED OFF (Michaela, 29 Sep 2026)"; "Michaela's decision", GB CLP Art. 17 | No | D (+C required-content rule) | Supplier-address tests; required-content-export-blocking expectation updated | Labels without an address become blocked from export | No (3 conflicts) | **APPROVED BUT STRANDED** |
| **M21** (Issue #6) | Support verified suffixed H-codes (e.g. H360FD) in Smart Paste/renderer | `fbdae72` `a762538` (QA `b8c2764`, `55874c8`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-suffixed-hazard-codes/README.md`) | **Yes** — "SIGNED OFF (Michaela, Sept 2026)"; wording verified by Michaela on legislation.gov.uk | No | B + C | `issue-6-suffixed-hazard-codes-output.txt`; signed-out test-site QA | 4 FIT → NOT FIT (52 mm square, longest codes) | No (2 conflicts) | **APPROVED BUT STRANDED** |
| **M24** | De-duplicate H and P codes in the renderer | `ee80aa0` (test `5e02c2a`) | FIXED + QA PASSED + SIGNED OFF (`SIGNED-OFF-M24-M51-M56-M57.md`) | **Yes** — "SIGNED OFF (Michaela, 29 Sep 2026)" | No | B (duplicate statements no longer printed twice) | M24 duplicate-code test | Duplicates removed; may free space | No (1 conflict) | **APPROVED BUT STRANDED** |
| **M38** (Issue #7) | Block unknown pictogram keys instead of drawing GHS07 | `e1c0a32` (QA `edcfe4f`, `9be7b2d`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-unknown-pictogram-keys/README.md`) | **Yes** — "signed off by Michaela; recorded 28 Sep 2026" | No | D + C | `issue-7-unknown-pictogram-keys-output.txt`; real-browser recovery test | Labels with unknown pictogram keys are blocked, not mis-drawn | No (2 conflicts) | **APPROVED BUT STRANDED** |
| **M43** (Issue #3) | Keep product names on one line instead of collapsing to the minimum | `a092f05` `0102247` | README: "Accepted for TEST REVIEW ONLY"; classification: "Signed off" (no approver) | **Not named** (indirect only) | No | A | `issue-3` sizing outputs, before/after | 3 FIT → NOT FIT (52 mm square, 128-character name) | No (1 conflict) | **NEEDS OWNER REVIEW** (likely approved — confirm) |
| **M51** | Height input aligned with the renderer's 150 mm limit | `581085a` | FIXED + QA PASSED + SIGNED OFF (`SIGNED-OFF-M24-M51-M56-M57.md`) | **Yes** — "Michaela, 29 Sep 2026" | No | E (input validation) | Signed-off doc | Heights above 150 mm can no longer be entered | Yes | **APPROVED BUT STRANDED** |
| **M55** | Validate saved background colour in the renderer | `70a4392` `6865d89` (tests `10921b5` `b192a9c`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-bgcolour-validation/README.md`). An earlier paragraph in the same file says "must NOT yet be recorded as signed off"; superseded by the later status and commit `95446a6` | **Yes** — "SIGNED OFF (Michaela, 29 Sep 2026)" | No | E (output integrity) | Real-renderer test | Invalid saved colours fall back safely | Yes | **APPROVED BUT STRANDED** |
| **M56/M57** | Strip XML-invalid control characters (M56); escape PDF pop-up title (M57) | `0b4e039` `e9116d5` (test `474802f`) | FIXED + QA PASSED + SIGNED OFF (`SIGNED-OFF-M24-M51-M56-M57.md`) | **Yes** — "Michaela, 29 Sep 2026" | No | E (security / output sanitisation) | Output-sanitisation test | No visible change for normal text | Yes | **APPROVED BUT STRANDED** |
| **M63** | Smart Paste fails closed when a CLP code is joined to its statement text (instead of silently dropping it) | `210b07d` (test `2353f9c`) | "FIXED + QA PASSED + SIGNED OFF" (`M63-...md`); the same doc says "Do not fix without approval"; classification Group 1 | **No named approver** | No | D + Smart Paste behaviour (C) | Joined-code Smart Paste regression | Some pastes stop with an error instead of dropping codes | No (1 conflict) | **NEEDS OWNER REVIEW** |
| **M09/M31** (Issue #4) | Block export of labels with missing required content | `cc3c9f8` `cc772c4` (evidence `859333f`) | README: "Accepted for TEST REVIEW ONLY"; classification: "Signed off" (no approver) | **Not named** (indirect only) | No | D | `issue-4-required-content-export-blocking-output.txt`; Step 5/Composer screenshots | Incomplete labels can't be downloaded | No (3 conflicts) | **NEEDS OWNER REVIEW** (likely approved — confirm) |
| **M44** (Issue #1) circle per-line clipping | Circles reported FIT while text was clipped | `79b0cd3` (evidence `59faa0c`) | README: "Accepted for TEST REVIEW ONLY"; classification: "Signed off" (no approver) | **Not named** (indirect only) | No | A | `circle-per-line-text-containment.js` (38 FIT verified, 27 NOT FIT blocked; 1,062-render sweep) | 10 FIT → NOT FIT, 0 NOT FIT → FIT | Yes | **NEEDS OWNER REVIEW** (likely approved — confirm) |
| **M45** (Issue #2) curved name / business name overlap | Curved product name overlapped the business name | `b321c33` `8529c4b` | README: "Accepted for TEST REVIEW ONLY"; classification: "Signed off" (no approver) | **Not named** (indirect only) | No | A | `circle-product-name-business-name-clearance.js`, pixel tests, `fit-changes-vs-pre-fix.txt` | Some FIT → NOT FIT (e.g. a long name at 63 mm circle now blocked, suggests 83 mm) | Yes | **NEEDS OWNER REVIEW** (likely approved — confirm) |
| **M19/M20** (Issue #5) P-statement wording | Verified GB P-statement wording; supplier-completed P-codes must be completed | `b88fad2` `b4c412b` (evidence `acc7ba9` `5cc1962` `b9bda4c`) | FIXED + QA PASSED + SIGNED OFF (`post-fix-precautionary-statement-wording/README.md`) | **Yes** — "SIGNED OFF (Michaela, Sept 2026)" | No | B + D | `precautionary-statement-wording.js` (not on main); legacy-v1 end-to-end; test-site QA | 36 FIT → NOT FIT; saved labels with incomplete P-codes blocked until completed | No (7 conflicts) | **APPROVED BUT STRANDED** |
| **M37/M64** | Article 26 pictogram precedence; saved pictograms disagreeing with H-codes blocked | `9a95678` … `4cf7083` (handover `8f0812c`) | Implementation + QA PASS (run `36606596767`); handover requests an independent "Friday review"; "do not merge/deploy merely because this handover says PASS" | **No** | No | C + D | `m37-m64-pictogram-precedence.js`, Builder Safety Baseline | Pictograms change on some labels; mismatched saved labels blocked | No (depends on the stack above) | **NEEDS OWNER REVIEW** |

**Totals**
- **APPROVED BUT STRANDED (9):** M03, M10, M21, M24, M38, M51, M55, M56/M57, M19/M20.
- **NEEDS OWNER REVIEW (7):** M04, M63, M43, M09/M31, M44, M45, M37/M64.
- ALREADY COMPLETE, SUPERSEDED, UNCLEAR: none.

**Notes for any later integration (not started)**
- The branch must never be merged wholesale. It predates PR #156 (PAYG): `entitlement.js` −153
  lines against main.
- Integration would mean porting the approved items onto a new main-based branch, in dependency
  order, with the full Builder regression and Builder Safety Baseline.
- Composer final integration QA with PR #159 is still required for M03.
- **PR #203** (SDS fragrance percentage): OWNER DECISION REQUIRED. Frozen.

**Manual browser test (Phase B):** NOT RUN as of this document. No new non-QA Test accounts,
subscriptions or downloads in the last 24 h.
