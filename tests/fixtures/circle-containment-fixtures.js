// Synthetic label content for tests/circle-per-line-text-containment.js and
// the square/rectangle no-change baseline (tests/fixtures/
// generate-square-rect-baseline.js). No production/customer data.
// Content mirrors the Builder Label Technical Audit (Sept 2026) stress set.
const BIZ = { bizName: 'Crafty Test Studio', bizAddress: '12 Mill Lane, Testville, TE1 2ST', bizPhone: '01234 567890' };
const base = (o) => Object.assign({
  scentName: 'Lavender', productType: 'Scented Candle', signal: 'Warning',
  hStatements: 'H317, H412', pStatements: 'P101, P102, P261, P273, P302+P352, P333+P313, P501',
  sensitisers: ['Linalool', 'Limonene'], pictograms: ['exclamation'],
  netWeight: '200g', textColour: 'dark', showBorder: true,
}, BIZ, o);

const ALL_P = 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P301+P310, P301+P312, P302+P352, P304+P340, P305+P351+P338, P312, P313, P314, P321, P330, P331, P332+P313, P333+P313, P337+P313, P370+P378, P391, P403+P233, P211, P501';
const MANY_SENS = ['Linalool', 'Limonene', 'Citral', 'Geraniol', 'Citronellol', 'Coumarin', 'Eugenol', 'Hexyl Cinnamal', 'Benzyl Salicylate', 'Alpha-Isomethyl Ionone'];
const LONG_SENS = [
  '2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene',
  '4-(4-hydroxy-4-methylpentyl)cyclohex-3-ene-1-carbaldehyde',
  '3-(4-tert-butylphenyl)-2-methylpropanal',
  'alpha-Hexylcinnamaldehyde',
  '(R)-p-mentha-1,8-diene',
];

const FIXTURES = {
  light: base({ scentName: 'Rose', hStatements: 'H317', pStatements: 'P102, P501', sensitisers: ['Geraniol'], netWeight: '' }),
  medium: base({ productType: 'Wax Melt', hStatements: 'H315, H317, H319, H411', pictograms: ['exclamation', 'aquatic'],
    pStatements: 'P101, P102, P261, P273, P302+P352, P305+P351+P338, P333+P313, P391, P501',
    sensitisers: ['Linalool', 'Limonene', 'Cinnamal', 'Eugenol', 'Coumarin', 'Citral'], netWeight: '80g', batchNum: 'B002' }),
  heavy: base({ productType: 'Room Spray', signal: 'Danger', hStatements: 'H225, H319, H317, H412', pictograms: ['flame', 'exclamation'],
    pStatements: 'P101, P102, P210, P211, P233, P261, P305+P351+P338, P337+P313, P333+P313, P403+P233, P501',
    sensitisers: ['Linalool', 'Limonene', 'Citronellol', 'Geraniol'], netWeight: '200ml', batchNum: 'B004' }),
  multiH: base({ productType: 'Reed Diffuser', signal: 'Danger', hStatements: 'H226, H304, H315, H317, H319, H336, H411, EUH066',
    pictograms: ['flame', 'health', 'exclamation', 'aquatic'] }),
  multiP: base({ pStatements: ALL_P }),
  euh: base({ hStatements: 'H412, EUH066, EUH071, EUH208, EUH210', sensitisers: ['Citral', 'Coumarin'], pictograms: [], signal: '' }),
  euh208Sensitisers: base({ hStatements: 'H317, H412, EUH208', sensitisers: MANY_SENS }),
  longChemicalNames: base({ hStatements: 'H317, H412', sensitisers: LONG_SENS }),
  onePictogram: base({}),
};

// FIT/NOT FIT boundary sweeps (whole mm) -- each range is chosen to span the
// point where that content stops fitting on a circle.
const BOUNDARY_SWEEPS = [
  ['onePictogram', 54, 60],
  ['multiP', 80, 85],
  ['heavy', 64, 70],
];

const CIRCLE_SIZES = [52, 63, 75, 100];

// Square/rectangle geometries whose output must be byte-identical to main.
const SQUARE_RECT_GEOMS = {
  'square-52-default': { shape: 'square', size: 52 },
  'square-63': { shape: 'square', size: 'custom', customW: 63, customH: 63 },
  'square-100': { shape: 'square', size: 'custom', customW: 100, customH: 100 },
  'rect-52x36-default': { shape: 'rectangle', size: 52 },
  'rect-63x44': { shape: 'rectangle', size: 'custom', customW: 63, customH: 44 },
  'rect-80x100': { shape: 'rectangle', size: 'custom', customW: 80, customH: 100 },
  'rect-150x40': { shape: 'rectangle', size: 'custom', customW: 150, customH: 40 },
};

module.exports = { FIXTURES, BOUNDARY_SWEEPS, CIRCLE_SIZES, SQUARE_RECT_GEOMS };
