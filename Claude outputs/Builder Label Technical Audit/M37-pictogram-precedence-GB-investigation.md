# M37 — hazard pictogram precedence — GB CLP investigation

Status: INVESTIGATED — AWAITING IMPLEMENTATION APPROVAL

## GB-only regulatory finding

GB CLP Article 26 contains mandatory precedence rules where classification would otherwise produce multiple hazard pictograms.

Relevant rules include:

- if GHS06 (skull and crossbones) applies, GHS07 (exclamation mark) shall not appear;
- if GHS05 (corrosion) applies, GHS07 shall not appear for skin or eye irritation;
- if GHS08 applies for respiratory sensitisation, GHS07 shall not appear for skin sensitisation or skin/eye irritation;
- Article 26 also contains the GHS01/GHS02/GHS03 and GHS04 precedence/optionality rules.

This is a GB CLP regulatory requirement.

## Current audit-branch behaviour

`syncPictogramsFromH()` maps every selected H-code through `H_PICTO_MAP`, deduplicates the resulting keys, and adds every resulting pictogram.

There is no Article 26 precedence stage.

Therefore combinations such as a classification requiring both GHS06 and GHS07 can currently retain/show both rather than suppressing GHS07 as required.

## Implementation boundary

Do not implement a simplistic global rule such as "if corrosive exists, always delete exclamation" without retaining the reason/source hazards.

Article 26(c) suppresses GHS07 when its reason is skin/eye irritation; Article 26(d) similarly scopes suppression to specified hazards. If GHS07 is independently required by another hazard not covered by the precedence rule, the implementation must respect the actual GB rule rather than suppress by pictogram key alone.

The safest implementation therefore derives pictograms from H-code/classification reasons, applies Article 26 precedence to those reasons, then produces the final pictogram list.

Saved/tampered pictogram consistency (M64) remains a separate validation issue.

## Classification

GB CLP regulatory logic defect.

## Application code changed

NO
