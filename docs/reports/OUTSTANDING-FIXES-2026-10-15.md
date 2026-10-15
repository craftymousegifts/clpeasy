# Current fixes and open-work inventory — 15 October 2026

This reconciles the current GitHub inventory (25 open PRs and four open issues) with the repository's existing sign-off records. An open PR is not necessarily an unfixed defect. No PR was closed or merged in this audit.

## Current label release candidate

**#243 is one draft package, not another fix.** Its revised scope is five existing fixes:

| Original PR | Fix |
|---|---|
| #236 | Keep curved product name clear of the business name/website/headings |
| #237 | Match drawn label fonts to layout measurements |
| #240 | Keep circular hazard/precautionary text inside the circle |
| #241 | Balance circular footer text and keep edge clearance |
| #242 | Show fine-tune size as a percentage of its automatic size |

#236 was added at Michaela's request after the original four-fix QA. The candidate remains a draft for test/review, with no main merge or production approval. Real iPhone and physical-print checks remain outstanding. See `COMBINED-LABEL-RELEASE-QA-2026-10-15.md`.

## Other current implementation drafts — not added to this release

| PR/item | What remains | Status / next action |
|---|---|---|
| **#233** | Missing P202/P308+P313/P310 coverage and incomplete eye-contact wording | Draft regulatory-content correction. Verify exact GB wording/selectable wording and outputs before release; do not silently fold into visual fixes |
| **#234** | Explain SDS source suitability and that fragrance percentage does not recalculate hazards | Draft source-warning enhancement. Needs its own message/UI checks; not a new classification engine |
| **#235** | Step 4 fit/missing-business-detail warnings and mobile preview clipping | Draft UI fix. Does **not** stack Website/Batch inputs; separate from that issue |
| **#238** | Recover unused pictogram space for labels with no pictograms and stop progression on overflow | Draft renderer/flow change. Requires integration review with the current renderer before release |
| **#239** | Make payment/subscription/PAYG support easier to find | Draft support-page improvement; no payment-processing change |
| **Website / Batch fields** | Two-column mobile row leaves Batch input only about 43/51/71 px at 375/390/430 px widths | Confirmed existing layout defect. No dedicated fix included in #243. Suggested small separate CSS change: stack the fields and retain room for clear/increment controls |
| **Pricing checkout-status indicator** | Existing `pricing-checkout-ux` browser test fails because indicator lookup is null on pricing page | Confirmed current test failure; pricing/checkout sources are unchanged by the label candidate. Investigate as a UI task; this test does not establish a payment or credit-delivery defect |

Fresh `pricing-signed-in-cta` browser checks PASS (17 scenarios), so the older October 4 signed-in-CTA finding is no longer reported as an outstanding defect. The checkout-status indicator test remains separate.

## Wider work that remains separate

| PR/issue | Scope | Disposition |
|---|---|---|
| #127 | Server-authorised clean rendering/export | Open architectural/security project; client-side checks do not complete it |
| #166 | Legacy plan switching, portal/proration/usage-reset review | Open legacy billing review. Historical findings must be reconciled with current plans and live configuration before claiming a current incident or changing anything |
| #223 | Website/link health monitor | Open monitoring feature requiring separate backend review/approval; not a label-layout fix |
| #225 | SDS corpus QA and unresolved findings/decisions | QA/evidence branch, not a production fix to merge wholesale. #233 addresses a subset. Regulatory/policy questions such as withheld P statements and pictogram precedence remain separate reviews |
| #230 | AI handover pilot | Coordination only, not permission to operate an autonomous implementation/deployment system |
| #231 / #232 | Reporting workflow / two-way handover simulation | Draft automation prototypes, not customer defect fixes |
| #128 | Competitor research | Open research task; not a broken customer workflow |

Existing unresolved regulatory/policy reviews (including the Article 18 substance-identifier question) are not cleared by browser or geometry test PASS. This inventory makes no legal-compliance claim.

## Older open PRs already reconciled as superseded/history

The repository's `FINAL-PR-SIGNOFF-2026-10-04.md` and `OUTSTANDING-REGISTER-2026-10-04.md` explicitly record these dispositions. Current main contains that sign-off history; do not merge old branches to make the open list shorter.

| PR | Recorded disposition |
|---|---|
| #204 | Required-content/pictogram/suffix app scope reconciled by #208/#210/#211; no old combined branch merge |
| #203 | Frozen by owner; superseded; rejected supplier questionnaire must not return |
| #201 | Hero-image proposal superseded by later approved homepage |
| #184 | Pricing proposal superseded; its one-off bonus wording is stale |
| #174 / #171 | Back-to-top/navigation work superseded by current implementation |
| #161 | Download/save/printing alternative superseded by merged guidance/status fixes |
| #155 | Old compact SDS-guidance draft superseded by current guidance |
| #148 | SEO proposal superseded by later wider-product positioning |
| #162 | Historical release documentation, not a code fix |

These are **not ten additional fixes waiting to be released**. Reclassifying/closing them is a separate repository-housekeeping decision; this audit has not changed their state.

## Recommended order

1. Finish the five-fix #243 device/print review and founder release decision.
2. Prioritise the remaining builder UI/fit issues: mobile Website/Batch, #235 and #238, with separate reviewable changes.
3. Review #233's regulatory wording and #234's SDS warning on their own evidence; neither is silently authorised by the visual release.
4. Handle payment-support/checkout-status presentation separately from billing logic.
5. Keep backend architecture, monitoring, automation and historical PR housekeeping out of the immediate label release.
