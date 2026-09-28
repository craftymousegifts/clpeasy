# M13 — nominal quantity — GB CLP investigation

Status: INVESTIGATED — NO DEFECT REQUIRING A HARD "always required on this CLPeasy label" GATE

## GB-only regulatory finding

For a hazardous substance/mixture in packaging made available to the general public, GB CLP Article 17(1)(b) requires the nominal quantity **unless that quantity is specified elsewhere on the package**.

Therefore CLPeasy must not claim that nominal quantity is universally required inside the CLPeasy-generated CLP label itself.

## Current product decision

Keeping the CLPeasy net-weight/net-quantity field optional can be consistent with GB CLP because the maker may already show the nominal quantity elsewhere on the product packaging.

However, the UI should make that condition clear rather than implying the information is simply optional in all circumstances.

## Recommendation

Do not create a hard export block solely because the CLPeasy label's quantity field is empty.

Prefer guidance such as:

"Nominal quantity — required for products supplied to the general public unless it is shown elsewhere on the package."

Any separate product-type terminology issue (weight vs volume / "net weight" vs "net quantity") remains under M15 and should not be silently folded into M13.

## Classification

GB CLP guidance/UX accuracy, not an export-gating defect by itself.

## Application code changed

NO
