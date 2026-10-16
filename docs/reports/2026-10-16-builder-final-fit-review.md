# Builder final-fit workflow review — 16 October 2026

Base: production v1.2.0, `8a675d00790135b7654c86fee1817d57ce8232aa`.
Scope approved by Michaela: review the complete Builder workflow, defer fit advice until SDS and business details are entered, collapse supplier guidance, investigate/fix clipped candle-care icons. Subsequent request: repair the homepage How it works anchor and review the pricing consent placement.

## Findings and changes

- Partial entry could trigger the final blocked-label overlay, size recommendations and optional omissions before Business/batch entry. Retained address/phone plus weight or burn time reliably reproduce footer overflow at 52 mm. Fit checks remain active, but layout advice is now shown in final Step 5 only. Earlier blocked previews use neutral “Preview in progress / Complete all steps to check fit” wording. Code/SDS errors remain immediate and cannot advance past Step 3.
- The five care icons were checked against full shape width rather than the circular chord at the icons' lowest corners. At 52 mm the two outer boxes crossed the cut edge by about 0.47 mm while reporting fits:true. Circle-aware spacing now narrows gaps when necessary, preserves icon sizes and row height, and blocks if the row cannot fit at the existing minimum gap. The emitted rounded corners are checked in regression tests. No text-size or legal-floor policy change.
- Builder previously reconstructed only part of the renderer's blocking conditions. It now also propagates the renderer's full `blocked` result, preserving all blocking reasons across download controls.
- Supplier guidance is a closed native details disclosure with an explicit closed-content CSS rule and stable ID. User expansion is retained during ordinary form updates/navigation.
- The homepage link used `#features`, but the target was missing. The existing five-step How it works section now has that ID and a sticky-header scroll offset.
- PAYG's immediate-supply request and cancellation information is not moved or rewritten. Its timing/wording is a separate payment/regulatory concern, outside this implementation. Government consumer-contract guidance distinguishes advance information/request from post-contract confirmation; the screenshot alone does not settle legal classification of download credits.

## Verification

- New complete DOM workflow: Step 2 weight/burn with retained business details; Step 3 extraction and unsupported-code rejection; Step 4 business/batch; Step 5 warning, real larger-size action, partial-choice rejection, exact-value omissions, save/reopen, quantity edit invalidation and restore/reblock. Preview/export-size render paths preserve mandatory statements and omit exactly the selected optional content. Supplier disclosure starts closed and remains user-expandable; homepage target exists exactly once.
- New geometric matrix: 594 renders, 52–150 mm, with/without weight/burn/batch, final/export/draft; 564 fitting, 2,970 emitted icon boxes checked, no corner outside the circular cut edge.
- Independent focused review: no blocker. Separate old/new comparison of 792 circle fixtures: 728 fit in both, identical font-size metrics, no newly blocked labels in that fixture set. Checked draft presentation cannot alter fit or export guards.
- Existing suites passed: Builder regression and navigation/layout; optional items; net-weight dropdown; hazard-source integrity; supplier-document applicability and Composer gate; fit contract; supported-size boundaries; GB signal-word resolution; pictogram parity; resolution invariance; preview/export authorisation (23 assertions); print-sheet workflow and fit blocking; label identity wiring for Builder/Composer; live export hotfix; Smart Paste guidance wording.

## Limits and release status

The automated DOM suites use deterministic substitute font widths; geometric icon containment is independent of those font widths. Browser-driven suites are not launched from the shell. Real browser visual checks and source parity are recorded in the draft PR after preview deployment. Native iPhone Safari, physical printing and authenticated paid exports are not newly certified by these tests. No Supabase, Stripe, auth, schema or pricing changes. Draft only; no production merge or deployment authorised for this patch.
