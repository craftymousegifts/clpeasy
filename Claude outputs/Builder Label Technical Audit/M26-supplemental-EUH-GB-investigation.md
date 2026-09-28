# M26 — supplemental EUH statements — GB CLP investigation

Status: INVESTIGATED — REGULATORY STRUCTURE CONFIRMED, PRESENTATION DESIGN STILL NEEDS REVIEW

## GB-only regulatory finding

GB CLP Article 25 requires applicable supplemental statements to be included in the **supplemental information section** of the label.

The label-layout rules also require supplemental information to be placed in that supplemental-information section and located with the other Article 17 label elements.

Therefore EUH supplemental statements should not simply be treated as ordinary H statements with no distinction in the label model.

## Current CLPeasy implication

CLPeasy currently carries EUH codes through the same general hazard-statement input/data path, with special handling for EUH208.

The audit's M26 concern is valid at the structural level: supplemental EUH content should have an identifiable supplemental-information grouping rather than being semantically indistinguishable from Article 21 H statements.

## What the GB source does NOT settle by itself

This investigation does not establish that CLPeasy must print a literal heading such as "Supplemental information", draw a box, or use a particular visual separator.

Those are presentation choices unless a more specific applicable GB rule is identified.

## Recommendation

Preserve exact applicable EUH wording, but model/render supplemental statements as a distinct supplemental-information group positioned with the other CLP label elements.

Do not invent a mandatory heading or decorative treatment without further basis.

## Classification

GB CLP regulatory structure + UI/layout design decision.

## Application code changed

NO
