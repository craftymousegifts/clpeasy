# Smart Paste SDS QA — 8 October 2026

Status: **INCOMPLETE — DO NOT MERGE**

## Scope

The user requested 100 genuine supplier SDS documents exercised through the complete Smart Paste browser workflow, defect fixes on an isolated branch, and retesting. The current branch is `qa/smart-paste-sds-corpus`.

## Evidence

- Eight synthetic hazard-code formatting regression cases passed locally using the patched `label-render.js` (not the same as testing actual supplier SDS documents). Four further synthetic cases were committed to the GitHub test file; their GitHub CI outcome is not yet verified.
- The M63 patch is committed to this isolated GitHub branch in `label-render.js` and visible in draft PR #225. It inserts a space before known hazard-phrase openings when PDF text joins the phrase directly to a recognised H-code.
- The regression test `tests/sds-pdf-text-joins.js` is committed to this branch.

## Mandatory gates before merging

1. Verify the committed M63 patch in GitHub CI, all twelve synthetic regression cases, and the existing test suite. GitHub's initial run failed 3/8 on the unpatched source; the subsequent run is not verified.
2. Obtain at least 100 authentic supplier SDS documents, preserve URLs, supplier, revision dates, concentration scope, and Section 2.2 evidence.
3. Run the complete Smart Paste UI workflow in an isolated browser against each document's relevant SDS text. Record extraction, hazard codes, sensitiser names, signal words, pictograms, required statements, review gates, and export-blocking behaviour.
4. Manually compare every output against the applicable source and investigate discrepancies. Do not infer compliance from a successful parse.
5. Re-run every failing case after a fix; document the before/after results.
6. Confirm no production deployments, database mutations, or live customer interactions occurred during testing.

**No claim of 100-document completion is made.**
## QA audit trail

- Draft pull request: https://github.com/craftymousegifts/clpeasy/pull/225 (must remain unmerged).
- First GitHub Actions run: dependency installation passed; joined-text cases `H317May`, `H412Harmful`, `H350iMay` failed 3/8 before M63 was committed.
- The QA branch now contains the M63 `label-render.js` fix and a 12-case synthetic test file.
- GitHub workflow updated with PR trigger, dependency checks, and Chrome installation; no successful completed run has been independently verified.
- Local environment: `jsdom` and `puppeteer` package directories exist but are incomplete; SDS applicability and composer tests fail to load `jsdom`, and browser recovery test skips Puppeteer. This is an environment issue, not a product defect finding.
- Supplier-document sample count actually verified through Smart Paste browser: **0 / 100**. No supplier SDS correctness claims can be made.
- Netlify deploy preview status was reported successful for PR #225; this is not equivalent to passing QA.

## Verified GitHub Actions evidence (run #37807585041)

The post-fix isolated GitHub Actions run reached and **passed** these steps: dependency installation, browser installation, PDF joined-text regression, SDS document applicability, SDS document recovery, and SDS document composer gate. The existing full repository suite was still **in progress** at the latest check; no overall CI pass is claimed. This run uses synthetic/existing automated fixtures, not the 100 real supplier SDS corpus. Link: https://github.com/craftymousegifts/clpeasy/actions/runs/37807585041

## Authentic-document collection pipeline (added; unverified)

- Added `scripts/collect-public-sds-corpus.js` and `.github/workflows/sds-supplier-corpus.yml` on QA branch. The runner is designed to discover public Nikura SDS PDF links, download up to 100 original PDFs, extract Section 2.2 with `pdftotext`, calculate SHA-256 checksums, and retain a provenance manifest and source PDFs as a short-lived GitHub Actions artifact.
- **This is a collector, not the full Smart Paste browser runner.** Until the workflow finishes and artifacts are reviewed, verified supplier documents tested through the UI remain 0/100.
- The Nikura supplier page explicitly says its separate CLP templates are at 10%; these are not interchangeable with the fragrance-oil SDS for finished-product classification. Treat raw fragrance SDS and concentration-specific label documents as different source categories.
- The collector has no production credentials, makes only public-document GET requests, and cannot write to CLPeasy production systems.

## Verified authentic SDS Chromium test — run 37808920128

**PASS: 100/100 genuine Nikura supplier SDS Section 2.2 documents processed through actual `builder.html` Smart Paste `extractSDS()` in an isolated, network-blocked Chromium browser.** Supplier page exposed 199 SDS links; runner attempted 104 URLs, downloaded 102 PDFs, selected 100 successfully extracted Section 2.2 records, and completed browser checks with `extracted: 100`, `needs_review: 0`, `errors: 0`. The CI artifact preserves PDF originals, Section 2.2 text, source URLs, SHA-256 digests, and per-document browser results. CI job `authentic-supplier-corpus` succeeded. Evidence: https://github.com/craftymousegifts/clpeasy/actions/runs/37808920128 .

**Limits:** This checks matching extracted H codes and browser execution, not independent GB CLP regulatory accuracy, final product concentration classification, supplier CLP template equivalence, complete sensitiser/P-code accuracy, or export readiness. Do not describe it as a compliance certification. The separate full-repository `npm test` stage was still running when this section was added.

## Supplier-content comparison (verified run 37811347161)

**PASS: 100/100 authentic Nikura SDS Section 2.2 browser comparisons** after fixes, `needs_review: 0`, `errors: 0`. The stronger independent check compares supplier H-codes with the builder, detects extra H/EUH codes, flags unexpected selected P-codes, compares explicit supplier Warning/Danger words, checks EUH208 sensitiser presence and rejects PDF header/footer contamination in extracted names. The original run exposed 80 review cases from PDF column artefacts; normalisation reduced that to one, then the remaining Coco Mademoiselle SDS (#050, SHA-256 `08764218a1e24f4dafc8c103e11591165c3a9ddbe866733d8b10f32c81f329d1`) revealed a supplier page footer/header embedded in the hyphenated name `beta-Pinene`. The guarded page-break cleanup resolved that issue. Verified logs: https://github.com/craftymousegifts/clpeasy/actions/runs/37811347161 .

**Important interpretation:** The comparison permits the builder to select a *subset* of supplier P-codes, so it does **not** prove every supplier P-code was retained. For example, Coco Mademoiselle listed P272, P280 and P363 in its SDS but they were not among selected P-codes; whether they must appear on a particular finished-product label requires separate assessment. Supplier sensitiser *presence* and contamination are checked, but a complete exact-name-by-name independent EUH208 audit, concentration-dependent finished-product classification, supplier-specific label requirements, final layout/export, and legal review remain outside this passing gate. This is technical evidence, not regulatory certification.

## Supplier content cross-check (final authentic-corpus run 37811684120)

**PASS: 100/100 genuine supplier SDS Section 2.2 browser cases, zero review flags, zero errors.** In addition to H-code matching, the updated runner independently compares supplier P-code occurrence against builder-selected P-codes (with omitted supplier P-codes recorded for regulatory review), the explicit supplier signal word against the builder signal word, and the complete EUH208 'Contains ... May produce an allergic reaction' substance list against the actual sensitiser names in Smart Paste state. The 78 supplier SDS with EUH208 lists matched exactly after PDF layout artefacts and whitespace/case normalisation. The remaining 22 documents had no such supplier EUH208 list. All 100 had no H-code omissions, unexpected P-codes, or detected contaminated sensitiser names under the previous test. **Subsequent independent evidence review identified two supplier-versus-builder signal discrepancies which the previous check had not flagged; these are now explicitly tested and require investigation.** The isolated builder was corrected for wrapped chemical names and supplier page headers that otherwise polluted EUH208 text. Source artifact and log: https://github.com/craftymousegifts/clpeasy/actions/runs/37811684120 .

**Regulatory caveat:** Smart Paste deliberately excludes certain occupational precautionary P-codes, so an exact one-to-one P-code reproduction is not expected and the exclusions need independent GB CLP suitability review. Supplier raw fragrance SDS data cannot by itself establish a finished candle/wax-melt label at a particular fragrance load. The general repository `npm test` suite was still running at the time of this report; do not claim whole-repository CI success.

## Independent artifact audit — open regulatory discrepancies

Reviewing the archived per-document results from run 37811684120 found **two signal-word differences** previously missed by the browser comparator: SDS 035 (Caribbean Escape Premium Fragrance Oil) supplier says **Warning** while builder selects **no signal word**; SDS 056 (Crazy Chocolate & Orange Fine Fragrance Oil) supplier says **None** while builder selects **Warning**. The first SDS lists H412/H402, for which no CLP signal word is normally required; the second lists H317, for which Warning is ordinarily required. These could be inconsistencies in the supplier documents, but must not be silently counted as supplier-content matches. The test now flags both for explicit human regulatory review rather than changing builder hazard logic to mirror a potentially incorrect SDS. Source: archived `browser-results.json` and original PDFs in https://github.com/craftymousegifts/clpeasy/actions/runs/37811684120 .

The same artifact records **400 individual supplier P-code omissions across 96 of 100 documents**, primarily P280 (95), P272 (92), P264 (75), P362 (56), P363 (36), P405 (25), P270 (11), and P303+P361+P353 (10). These omissions are recorded for regulatory assessment, not automatically classed as software defects: occupational supplier SDS statements and consumer finished-product label selection have different contexts. Do not claim all supplier precautionary content is preserved or legally approved. **Current QA status: 98 exact signal matches, 2 regulatory review cases; no production deployment.**

### Primary PDF verification of signal discrepancies

The original archived PDFs (not only extracted browser state) were checked. SDS 035, Nikura Caribbean Escape, version 3 dated 04/07/2025, section 2.1 classifies Aquatic Chronic 3 / Acute 3 with H412 and H402, while section 2.2 prints `Signal word: Warning`. Neither of those hazard categories requires the Warning signal word. SDS 056, Nikura Crazy Chocolate & Orange, version 6 dated 19/08/2026, section 2.1 classifies Skin Sensitisation 1 with H317, while section 2.2 prints `Signal word: None`. Skin Sensitisation 1 requires Warning. These are **supplier SDS internal classification-versus-label-element inconsistencies**, not demonstrated builder signal-word defects. The browser test retains both as reported supplier anomalies while failing for any unrelated signal mismatch. Supplier corrections should be requested; do not copy either inconsistent signal word into CLPeasy's classification logic.

## Final verified classification of source discrepancies — run 37813604674

The updated regression now **passes all 100 authentic SDS browser cases** with zero technical review flags and zero browser errors. Crucially, it **separately reports two supplier SDS internal signal-word anomalies**, rather than suppressing or mistaking them for software defects. The archived JSON independently confirms `supplier_signal_anomalies: 2`, `technical_signal_mismatches: 0`, and `supplier_p_code_exclusions: 400`. The two supplier inconsistencies are verified against original PDF Section 2.1 and 2.2 (see preceding section). **No builder signal-word change is warranted by this evidence.** The 400 supplier P-code omissions remain a distinct regulatory review issue. Evidence: https://github.com/craftymousegifts/clpeasy/actions/runs/37813604674 .

### Precautionary-statement exclusion inventory (supplier Section 2.2 versus builder)

| Code | Omitted occurrences | Typical supplier instruction | Regulatory disposition |
|---|---:|---|---|
| P280 | 95 | Wear protective gloves/protective clothing/eye protection | Review relevance to the specific finished product and its hazards |
| P272 | 92 | Contaminated work clothing should not leave the workplace | Workplace-specific; verify consumer applicability |
| P264 | 75 | Wash thoroughly after handling | Review against selected classification and required wording |
| P362 | 56 | Take off contaminated clothing | Review combined P-code selection and skin exposure context |
| P363 | 36 | Wash contaminated clothing before reuse | Review workplace versus consumer context |
| P405 | 25 | Store locked up | Check hazard classification and consumer selection |
| P270 | 11 | Do not eat, drink or smoke when using | Review applicability to finished product |
| P303+P361+P353 | 10 | IF ON SKIN (or hair): remove contaminated clothing and rinse | Review classification and combination/precedence rules |

**Total 400 omitted occurrences** (not 400 unique statements). These counts are from the authentic source-versus-builder artifact, not proof that omissions are correct or incorrect. A fragrance oil concentrate's supplier SDS is not automatically the prescribed consumer label for a diluted finished candle. No automatic inclusion or deletion was applied pending a product-specific classification review.

## GB CLP Article 28 precautionary statement policy review

**Primary sources:** [HSE on precautionary statements](https://www.hse.gov.uk/chemical-classification/labelling-packaging/hazard-precautionary-statements-signal-words.htm); [retained GB CLP Article 28](https://www.legislation.gov.uk/eur/2008/1272/2022-11-01?view=extent); [HSE classification responsibilities](https://www.hse.gov.uk/chemical-classification/classification/how-does-classification-work.htm).

The HSE says the supplier selects appropriate precautionary statements on the basis of hazard classification; the GB CLP Article 28 text allows omitting clearly redundant/unnecessary statements for the **specific mixture and use**, and ordinarily limits the label to six precautionary statements unless hazards justify more. **It does not authorise automatically deleting any named P-code from every finished home-fragrance product solely because the code is described as “occupational”.** Mixture classification and the resulting label are product- and concentration-specific.

### Findings and required disposition

- **High priority — automatic exclusions:** The current Smart Paste `_pExclude` array silently removes nine P-code forms for all products, including P280 (95 instances in the corpus), P264 (75), P405 (25), and the P303+P361+P353 response combination (10). The blanket code comment “codes not applicable to finished consumer home fragrance products” is broader than what the primary sources establish. A code can be inappropriate for a particular candle yet relevant to another mixture/product or exposure scenario. Treat the existing exclusion policy as **not regulator-validated**.
- **P280 requires a maker-specific decision:** The builder already offers a manual protective-equipment picker and prevents P280 being accepted without a selected equipment item. That mitigates rendering ambiguity but does **not** make silent initial removal inherently correct. The builder should make exclusions visible and explain how to review/reinstate an applicable statement before any regulatory approval.
- **P-code selection cannot be established by matching raw fragrance SDS 1:1:** The supplier SDS describes the concentrate, not necessarily a candle/wax melt/room spray at the maker's final fragrance loading. Never infer that all 400 omitted occurrences must be restored to the finished label.
- **QA protection added:** `tests/sds-p-code-exclusion-policy.js` now guards the current nine-item list and the manual P280 selection pathway. It will fail if the exclusion list is silently changed without revisiting the policy. This is a **change-control test**, not a safety endorsement.

**Decision:** Keep draft PR unmerged. Do not alter the regulatory inclusion/exclusion policy until a competent GB CLP reviewer checks finished-product examples and documented hazard/use scenarios. Independently prioritise a user-visible exclusion disclosure and review workflow before release.

## Maker-facing exclusion transparency — verified run 37814610297

QA-branch Smart Paste now displays a persistent, accessible notice immediately beneath the SDS paste field when supplier precautionary statements are filtered. It lists **each omitted supplier P code** and explains that the concentrate's SDS may differ from the finished product, that final-formulation classification/use must be reviewed, and that P280 can be manually added with the PPE picker. The notice is absent when no codes were excluded and is replaced on every new extraction. The authentic Chromium test now asserts **all omitted codes appear in the visible notice for each document**; 100/100 documents passed with zero browser errors or review flags. The new `tests/sds-p-code-exclusion-policy.js` guards the nine exclusions and P280 manual selection; the isolated QA workflow executes it before the wider suite. Evidence: https://github.com/craftymousegifts/clpeasy/actions/runs/37814610297 . This change improves transparency but does **not** establish that the nine blanket exclusions are legally appropriate for all product types.

## Completed final CI — run 37814799658

**Both jobs passed:** `authentic-supplier-corpus` (100 authentic supplier SDS browser cases, including visible P-code exclusion notices) and `sds-regression` (all targeted regression tests, precautionary exclusion policy guard, and the full `npm test` suite). GitHub Actions: https://github.com/craftymousegifts/clpeasy/actions/runs/37814799658 . The full-suite log explicitly notes **`SKIP Edge Function tests: Deno is not installed`**; therefore this green CI run does **not** validate Supabase Edge Functions under Deno. The regulatory review of the 400 excluded P-code occurrences remains open, and the two internally inconsistent supplier SDS signal words remain documented supplier anomalies. QA changes remain on the isolated draft branch, not in production.

## Incremental verification — Deno Edge Functions

The isolated workflow was updated to install Deno using `denoland/setup-deno@v2` and run `node tests/deno/run.js` directly before the existing npm suite. In run 37816177118 both **Install Deno for offline Edge Function tests** and **Verify Deno Edge Function tests are not skipped** completed successfully. This closes the previous environment-level test gap without rerunning earlier exploratory checks by hand. The six offline mocked tests cover Stripe webhook, signup notification, CLP account events, checkout session creation, billing status and subscription management. No live Stripe, Supabase or Brevo changes were made. The full `npm test` step in this same run must finish before describing the entire run as green.

## Regulatory decision matrix — no unsupported automatic policy changes

The following is a **review protocol**, not an assertion that any particular code is legally required or prohibited on a finished product. Every decision needs the *actual* finished-mixture classification, product presentation, foreseeable consumer use, label space, and applicable GB CLP precautionary-statement selection principles. A raw fragrance SDS alone is insufficient.

| Excluded code | Supplier SDS occurrences | Required case-by-case evidence before deciding |
|---|---:|---|
| P280 | 95 | Is skin/eye PPE appropriate for foreseeable consumer handling of this finished mixture? What protective equipment can truthfully be specified? |
| P272 | 92 | Does contaminated work clothing meaningfully apply to the marketed use, or is it only concentrate/workplace handling advice? |
| P264 | 75 | Does the finished classification warrant hygiene wording, and what specific washing action is appropriate? |
| P362 | 56 | Does the finished mixture require contaminated-clothing response instructions? |
| P363 | 36 | Is laundering contaminated clothing a necessary response for the finished mixture? |
| P405 | 25 | Does the classification/marketed-use context warrant locked storage? |
| P270 | 11 | Is eating/drinking/smoking avoidance an appropriate precaution for the actual intended use? |
| P303+P361+P353 | 10 | Do finished-mixture hazards require this skin/hair response combination? |
| Other combinations | Remaining 0 | Preserve exact source code combinations; check for normalisation, overlaps and duplicates |

**Release decision gates:**
1. Assemble at least one real finished-formulation worked example for **each product family** (candle, wax melt, reed diffuser, room spray), with fragrance percentage and supplier SDS version; never substitute concentrate hazards for the finished mixture.
2. Have a competent GB CLP reviewer document the finished-mixture hazard classification, required label elements and selected P-statements, including reasons for each excluded or reinstated code.
3. Reconcile the review against the builder's generated **actual PDF/SVG/PNG export** and physical-label space constraints; the present 100-case exercise validated the Smart Paste browser extraction, not printed-label legal correctness.
4. Resolve any demonstrated gaps in a separate change with targeted tests. Do not globally restore all 400 occurrences or approve blanket removal without evidence.

**Status: blocked on real formulation-specific regulatory evidence.** No legal sign-off is claimed. Supplier SDS anomalies #035 and #056 remain separate supplier clarification items.

## Final Deno-enabled CI result — run 37816177118

**Both jobs completed successfully**: the authentic supplier SDS Chromium corpus and `sds-regression`, including the full `npm test` suite. Unlike the earlier green run, this run installed Deno and executed the six offline mocked Edge Function test files before the full suite. The job logs include successful billing-status (26 scenarios) and manage-subscription (8 scenarios) checks. CI evidence: https://github.com/craftymousegifts/clpeasy/actions/runs/37816177118 . No rerun of previously completed manual prechecks is required.

**Separate, non-blocking follow-up:** some existing billing tests reference legacy Easy Pro and annual pricing scenarios. This is not evidence of a production billing defect, and pricing changes are out of scope for this Smart Paste QA PR; track separately against current product rules. The **regulatory sign-off for excluded P-statements remains unresolved** and is the release gate for these QA changes.

## Final QA handover — frozen evidence and narrowly scoped remaining decisions

**Technical CI is green** as of run [37816177118](https://github.com/craftymousegifts/clpeasy/actions/runs/37816177118): authentic SDS browser job, isolated targeted checks, Deno-backed offline Edge Function tests and the full npm suite all passed. Do **not** rerun the same prechecks or corpus solely to recreate this evidence. Rerun only focused tests for a newly changed component or if source evidence changes. The earlier chronology in this audit trail is retained for traceability; initial 0/100 and unverified CI statements describe *earlier stages*, not the final outcome.

**Outstanding decisions, with owners and completion evidence:**

| Decision | Suggested owner | What constitutes completion |
|---|---|---|
| GB CLP applicability of the nine excluded precautionary codes | Competent GB CLP specialist, with founder providing formulation facts | Written code-by-code determination for each actual finished-product family and use/concentration, citing classification and selection rationale |
| Whether the two contradictory supplier signal words require correction or clarification | Nikura SDS author / competent GB CLP specialist | Written supplier clarification or documented reviewer determination; do not alter hazard signal logic to mimic internally inconsistent SDS |
| Maker-facing notice accessibility and persistence after extraction, save/reopen and Step 3 navigation | Engineering QA | Focused UI visibility and persistence checks, not only DOM-text presence; fix only if demonstrably hidden or lost |
| Print/export of representative *finished-product* labels | Engineering QA following specialist classification | Compare actual PDF/SVG/PNG content and size against approved reference label for one example per product family |
| Merge/release decision | Founder after the above evidence | Explicit approval; draft PR remains unmerged until then |

**Important:** Do not describe the 100 raw-fragrance SDS Smart Paste browser passes as a finished-product CLP certification. The supplier SDS data do not supply all final-formulation facts. No production deployment, database mutation, or customer-data access is authorised by this QA work.

## Maker-visible Step 3 review notice — targeted verification

The new `checkVisibility()` assertion initially reported 96 hidden notices because the browser harness called `extractSDS()` while the builder was on hidden Step 1. This was a **test harness setup error**, not evidence that the maker-facing Step 3 notice was hidden. The harness now enters Step 3 before extraction, then checks computed visibility. The targeted `authentic-supplier-corpus` job in [run 37818230347](https://github.com/craftymousegifts/clpeasy/actions/runs/37818230347) **passed**. This confirms that the notice is visible in the active Step 3 panel for the authentic corpus cases with excluded P-codes. The separate stale-notice reset fix remains on this QA branch. This targeted result does not establish persistence after save/reopen or a regulatory decision on P-code applicability.

## Scope control — incremental reset assertions

After the Step 3 visibility correction, the existing authentic-document harness gained *post-extraction reset assertions* for removal of the excluded P-code notice, selected P-statements, pasted source text, H-code selections, sensitiser state and extraction provenance. These assertions reuse the same in-browser extraction snapshot; they do **not** constitute a new independent GB CLP classification audit. The isolated run for commit `398979adc0acefbf017a97a303f7ab497e0afe87` is [37819319181](https://github.com/craftymousegifts/clpeasy/actions/runs/37819319181). The `authentic-supplier-corpus` job **passed** in this run, confirming the new post-extraction reset assertions against the existing authentic corpus. The separate `sds-regression` job was still running at the time of this update; do not claim the entire run is complete. Do not repeat earlier manual prechecks.

## New independent source class — supplier 10% candle-wax SDS (not concentrate SDS)

**Verified external source:** Nikura's [10% CLP document catalogue](https://nikura.com/pages/clp-labels-at-10) links directly to supplier-generated 10% documents. The [Nag Champa Premium Fragrance Oil 10% in Candle Wax PDF](https://nikura.blob.core.windows.net/pdfs/CLP10_Nag_Champa_Premium_Fragrance_Oil_FO-FR-NAG.pdf), issue 21 July 2025, version 1, identifies the mixture as **10% in candle wax**, with uses **Candles/Wax Melts**. This is distinct from previously tested raw fragrance-concentrate SDS. The earlier 100 concentrate tests must **not** be counted as 10% finished-mixture tests.

**10% Section 2.2 label elements in source:** signal word **Warning**; H317, H412, H316; EUH208 sensitisers **Amyl cinnamic aldehyde, Citronellol, Coumarin, Linalyl acetate, d-Limonene**; P261, P272, P273, P280, P302/352, P333/313, P363, P501. Section 16 is a *code glossary*, not the applicable label: do **not** harvest the extra P-codes there. Slash-separated P302/352 and P333/313 combinations need normalisation to P302+P352 and P333+P313 for comparison.

**Concrete supplier-output fidelity discrepancy:** the current Smart Paste exclusion list removes **P272, P280 and P363** from this expressly 10%-in-candle-wax Section 2.2, despite their presence in the supplier document. This is **not** by itself a legal noncompliance finding: GB CLP selection may be context-specific. But the assertion that those statements only apply to fragrance concentrate is not supported by this 10% example. No automatic blanket restoration is approved.

**Additional compatibility question:** H316 appears in the supplier's 10% Section 2.2. Verify builder support and GB CLP applicability before treating this as a valid finished-product code.

**New technical gate:** collect a separate 10% document manifest and compare actual Section 2.2 signal/H/EUH/P elements against Smart Paste and exports. Distinguish intentional withholding from accidental loss. Do not rerun the 100 concentrate tests or claim any 10% browser pass count yet.
