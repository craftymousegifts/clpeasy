# M37 — pictogram precedence — implementation-boundary review

Status: GB REQUIREMENT CONFIRMED — IMPLEMENTATION PAUSED AT LEGACY-DATA DECISION

## Authoritative GB rule

Current GB CLP Article 26 requires pictogram precedence.

Mandatory suppression relevant to CLPeasy's supported H-code model:
- if GHS06 applies, GHS07 shall not appear;
- if GHS05 applies, GHS07 shall not appear **for skin or eye irritation**;
- if GHS08 applies **for respiratory sensitisation**, GHS07 shall not appear for skin sensitisation or skin/eye irritation.

Article 26 also makes some pictograms optional in combinations (GHS01 with GHS02/GHS03; GHS04 with GHS02/GHS06). Those optional cases do not require CLPeasy to delete the optional pictogram and should not be silently changed as part of the mandatory-suppression fix.

## Why a simple pictogram-key rule is unsafe

The GHS05/GHS08 rules depend on the hazard reason for GHS07.

Examples:
- H314 + H319: GHS05 suppresses GHS07 for the eye-irritation reason.
- H314 + H302: GHS07 is still needed for harmful acute toxicity; it must not be removed merely because GHS05 exists.
- H334 + H317: respiratory sensitisation (GHS08) suppresses GHS07 for skin sensitisation.
- H361 + H317: GHS08 here is reproductive toxicity, not respiratory sensitisation; Article 26(1)(d) cannot be applied merely because a health-hazard pictogram is present.

Therefore precedence must be derived from the selected H codes/classification reasons.

## Current CLPeasy data is sufficient for new Builder selections

Builder's H_PICTO_MAP identifies the H-code reason for each pictogram. For newly selected hazards, the mandatory Article 26 suppression can be computed before S.pictograms is saved.

## Remaining legacy-data decision

Existing saved labels can already contain a pictogram array created before precedence support. Some may contain GHS07 that Article 26 would suppress.

There are two safe product approaches:
1. automatically derive the effective pictogram set from the saved H codes on render/load; or
2. fail closed and require the maker to reopen/reconfirm Step 3 before export.

This overlaps with open M64 (valid pictogram keys can disagree with H codes). Implementing only the new-label Builder path would leave old saved labels inconsistent; silently rewriting old records would violate the audit's no-silent-repair pattern.

## Recommendation

Resolve M37 together with the **validation logic** needed by M64, but do not silently mutate saved records. Compute the expected pictogram set from H codes + Article 26 precedence, compare it with the stored list, and block mismatched legacy/tampered data until the maker explicitly reconfirms/saves Step 3.

## Application code changed

NO — stopped at the explicit legacy-data/product decision.
