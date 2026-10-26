const s22 = `2.2 Label elements
Hazard pictograms: GHS07
Signal word: Warning
Hazard statements
H317 May cause an allergic skin reaction.
H319 Causes serious eye irritation.
Precautionary statements
P261 Avoid breathing vapours.
P280 Wear protective gloves/eye protection.
P305+P351+P338 IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.
P501 Dispose of contents/container in accordance with local regulations.
EUH208 Contains Linalool. May produce an allergic reaction.`;
const wrap = (body) => `SAFETY DATA SHEET
SECTION 1: Identification
1.1 Product identifier Synthetic Test Candle 10%
SECTION 2: Hazards identification
2.1 Classification of the substance or mixture
Skin Sens. 1 H317; Eye Irrit. 2 H319; Aquatic Chronic 3 H412
${body}
2.3 Other hazards
None known.
SECTION 3: Composition/information on ingredients
Linalool 10-25% Skin Sens. 1B H317
Citral 1-5% H315 H317 H319 Danger H300
SECTION 11: Toxicological information
H302 Harmful if swallowed.`;
module.exports = {
  '1 exact 2.2': s22,
  '2 whole SDS (2.1 + 3 around)': wrap(s22),
  '3 OCR whitespace + wrapped P305+P351+P338': wrap(`2.2   Label  elements
Hazard pictograms:   GHS07
Signal word :  Warning
H317   May cause an allergic
       skin reaction.
P305+P351+
P338 IF IN EYES: Rinse cautiously with water
for several minutes. Remove contact lenses, if present
and easy to do. Continue rinsing.
P501 Dispose of contents/container in accordance with local regulations.`),
  '3b spaced combined code': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P305 + P351 + P338 IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.`,
  '4 header/footer noise inside 2.2': wrap(`2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P261 Avoid breathing vapours.
Synthetic Supplies Ltd, Unit 1, Testtown                 Page 2 of 9
Issue date: 01/10/2026       Version: 3
2.2 Label elements (continued)
P501 Dispose of contents/container in accordance with local regulations.`),
  '5 H412 only in 2.1 (must not be added)': wrap(`2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P280 Wear protective gloves.`),
  '6a complete P280 + P241': `2.2 Label elements
Signal word: Warning
H226 Flammable liquid and vapour.
H317 May cause an allergic skin reaction.
P241 Use explosion-proof electrical and ventilating equipment.
P280 Wear protective gloves and eye protection.`,
  '7a incomplete P241 (ellipsis/brackets)': `2.2 Label elements
Signal word: Warning
H226 Flammable liquid and vapour.
P241 Use explosion-proof [electrical/ventilating/lighting/…] equipment.
P280 Wear protective gloves.`,
  '7b incomplete P280 (ellipsis)': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P280 Wear protective gloves/protective clothing/…`,
  '7c code-only P280 and P241': `2.2 Label elements
Signal word: Warning
H226 Flammable liquid and vapour.
H317 May cause an allergic skin reaction.
P241
P280`,
  '8 absent 2.2 in whole SDS': `SECTION 1: Identification
1.1 Product identifier Synthetic
SECTION 2: Hazards identification
2.1 Classification Skin Sens. 1 H317
SECTION 3: Composition
Linalool H317`,
  '9 two SDSs pasted': wrap(s22) + '\n\n' + wrap(s22.replace('Warning', 'Danger')),
  '10 P272 supplied, P363 without matching H': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P272 Contaminated work clothing should not be allowed out of the workplace.
P363 Wash contaminated clothing before reuse.`,
  '11 signal None, pictograms None': `2.2 Label elements
Pictograms: None
Signal word: None
EUH208 Contains Citral. May produce an allergic reaction.`,
  '13 bare Supplemental information heading': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P501 Dispose of contents/container in accordance with local regulations.
Supplemental information
EUH208 Contains Citral. May produce an allergic reaction.`,
  '14 page number + supplier address block after P501': `2.2 Label elements
Signal word: Warning
H317 - May cause an allergic skin reaction.
P501 - Dispose of contents/container to an approved waste disposal plant
1/2
Synthetic Supplies Ltd
Unit 1 Test Estate
Testtown
TE1 1ST
customerservice@example.invalid
TEL: 01632 960000

Supplemental Information - Additional Information on Sensitisers (EUH208):
Contains Linalool, Citral. May produce an allergic reaction.
This document is given for information only.
2/2`,
  '15 statement continues across a page break': `2.2 Label elements
Signal word: Warning
H319 Causes serious eye irritation.
P305+P351+P338 IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses,
Page 2 of 9

if present and easy to do. Continue rinsing.`,
  '16 administrative note vs safety note': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P501 Dispose of contents/container in accordance with local regulations.
Supplemental information: For professional use only. This document is given for information only.
EUH208 Contains Linalool, Citral. May produce an allergic reaction.
This document is given for information only. It is the final product manufacturer's responsibility to establish the labelling of the product placed on the market.`,
  '12 UFI + Contains': `2.2 Label elements
Signal word: Warning
H317 May cause an allergic skin reaction.
P280 Wear protective gloves.
Contains: Linalool, Citral.
UFI: TEST-0000-0000-0000`,
};
