# M36 — pictogram size versus label area — GB CLP investigation

Status: INVESTIGATED — GB REQUIREMENT CONFIRMED — AWAITING IMPLEMENTATION DESIGN/APPROVAL

## GB-only regulatory finding

The GB CLP text applicable to the pre-IP-completion retained regime states in Annex I section 1.2.1 that:

- hazard pictograms are square set at a point;
- each hazard pictogram must cover at least **one fifteenth of the minimum surface area of the label dedicated to the Article 17 information**;
- the minimum pictogram area must not be less than **1 cm²**;
- for packages not exceeding 3 litres, Table 1.3 also gives a 10 x 10 mm minimum and a larger "if possible" size.

Therefore M36's original question is resolved: the one-fifteenth rule is real and relevant to GB CLP.

## Current audit-branch behaviour

The renderer now has a corrected absolute floor based on a 10mm red-square side (100mm²), and it distinguishes the rotated diamond's outer bounding box from the red square itself.

However, the renderer does not currently derive the required pictogram area from one fifteenth of the label's Article-17 information area.

Its preferred search target is currently approximately 11.314mm red-square side (derived from a 16mm outer bounding box), regardless of label surface area.

That means the absolute 100mm² floor can be satisfied while the one-fifteenth requirement is still missed on larger labels.

Illustrative geometry if the whole CLPeasy label surface is the Article-17 information area:

- 52mm circle: area about 2123.7mm²; 1/15 about 141.6mm²; equivalent square side about 11.90mm.
- 63mm circle: area about 3117.2mm²; 1/15 about 207.8mm²; equivalent square side about 14.41mm.
- 63x44mm rectangle: area 2772mm²; 1/15 = 184.8mm²; equivalent square side about 13.59mm.

Those examples exceed the renderer's current ~11.314mm preferred square-side target.

## Important implementation question

The regulation refers to the surface area of the label **dedicated to the information required by Article 17**.

Before coding, CLPeasy must define from its actual label geometry what area is genuinely dedicated to Article-17 information, especially where the generated label also contains non-CLP information such as branding, batch information or candle-safety symbols.

Do not simply use package capacity, outer canvas dimensions, or an EU/NI post-Brexit font rule.

## Minimum safe formula once the Article-17 label area is defined

Required red-square area must be at least:

max(100mm², article17LabelAreaMm2 / 15)

Required red-square side is therefore:

sqrt(max(100, article17LabelAreaMm2 / 15))

The renderer's rotated-diamond outer bounding box must then be derived from that red-square side using the existing geometry helper, not confused with the regulated square side itself.

## Classification

GB CLP regulatory geometry defect / design-definition dependency.

## Application code changed

NO
