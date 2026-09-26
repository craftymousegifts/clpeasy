// Synthetic stress-test fixtures for the Builder label audit.
// No production/customer data. Audit-only; not used by the application.
const LONG_SENS = [
  '2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene',
  '4-(4-hydroxy-4-methylpentyl)cyclohex-3-ene-1-carbaldehyde',
  '3-(4-tert-butylphenyl)-2-methylpropanal',
  'alpha-Hexylcinnamaldehyde',
  '(R)-p-mentha-1,8-diene',
];
const MANY_SENS = ['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin','Eugenol','Hexyl Cinnamal','Benzyl Salicylate','Alpha-Isomethyl Ionone'];
const ALL_P = 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P301+P310, P301+P312, P302+P352, P304+P340, P305+P351+P338, P312, P313, P314, P321, P330, P331, P332+P313, P333+P313, P337+P313, P370+P378, P391, P403+P233, P211, P501';
const TYPICAL_P = 'P101, P102, P261, P273, P302+P352, P333+P313, P501';
const BIZ = { bizName: 'Crafty Test Studio', bizAddress: '12 Mill Lane, Testville, TE1 2ST', bizPhone: '01234 567890' };
const LONG_BIZ = {
  bizName: 'The Extraordinarily Long Handmade Candle & Home Fragrance Company Ltd',
  bizAddress: 'Unit 14B, The Old Victorian Textile Mill Business Park, 1234 Longest Industrial Estate Road, Little Snoring-on-the-Marsh, Great Yarmouth, Norfolk NR99 9ZZ, United Kingdom',
  bizPhone: '+44 (0)1234 567890 / +44 (0)7700 900123',
  bizWebsite: 'www.extraordinarily-long-handmade-candle-company.co.uk',
};
const base = (o) => Object.assign({
  scentName: 'Lavender', productType: 'Scented Candle', signal: 'Warning',
  hStatements: 'H317, H412', pStatements: TYPICAL_P,
  sensitisers: ['Linalool', 'Limonene'], pictograms: ['exclamation'],
  netWeight: '200g', burnTime: '', batchNum: '',
  textColour: 'dark', showBorder: true,
}, BIZ, o);

const CASES = [
  ['01-short-simple', base({ scentName: 'Rose', hStatements: 'H317', pStatements: 'P102, P501', sensitisers: ['Geraniol'], netWeight: '' })],
  ['02-long-product-name', base({ scentName: 'Midnight Blackberry, Bay Leaf & Smoked Vanilla Winter Solstice Edition' })],
  ['03-long-supplier-address', base(LONG_BIZ)],
  ['04-max-H', base({ signal: 'Danger', hStatements: 'H226, H304, H315, H317, H319, H336, H411, EUH066', pictograms: ['flame','health','exclamation','aquatic'] })],
  ['05-max-P', base({ pStatements: ALL_P })],
  ['06-several-EUH', base({ hStatements: 'H412, EUH066, EUH071, EUH208, EUH210', sensitisers: ['Citral', 'Coumarin'], pictograms: [] , signal: ''})],
  ['07-multi-sensitisers', base({ hStatements: 'H317, H412', sensitisers: MANY_SENS })],
  ['08-long-sensitiser-names', base({ hStatements: 'H317, H412', sensitisers: LONG_SENS })],
  ['09-one-pictogram', base({})],
  ['10-two-pictograms', base({ hStatements: 'H317, H411', pictograms: ['exclamation','aquatic'] })],
  ['11-three-plus-pictograms', base({ signal: 'Danger', hStatements: 'H226, H304, H317, H411', pictograms: ['flame','health','exclamation','aquatic'] })],
  ['12-heavy-combined', base(Object.assign({}, LONG_BIZ, { scentName: 'Midnight Blackberry & Smoked Vanilla', signal: 'Danger', hStatements: 'H226, H304, H315, H317, H319, H411, EUH208', pStatements: ALL_P, sensitisers: MANY_SENS.concat(LONG_SENS.slice(0,2)), pictograms: ['flame','health','exclamation','aquatic'], netWeight: '220g', burnTime: '45 hours', batchNum: 'BN-2026-0001' }))],
  ['13-special-chars', base({ scentName: 'Fig & Cassis <Noir> "Édition" — Crème Brûlée', bizName: 'O\'Brien & Søn’s <Candles> "Ltd"', bizAddress: '1 Rue de l\'Église & Co., Zürich <CH>', bizPhone: '+41 (0)44 123 45 67', sensitisers: ['Linalool', 'd-Limonene & <Citral>'] })],
  ['14-missing-optional', base({ netWeight: '', burnTime: '', batchNum: '', bizWebsite: '', bizAddress: '', pStatements: '', sensitisers: [] , hStatements: 'H412', pictograms: [], signal: ''})],
  ['15-long-candle', base({ productType: 'Scented Candle', scentName: 'Christmas Spiced Orange & Cinnamon', hStatements: 'H315, H317, H319, H411', pictograms: ['exclamation','aquatic'], pStatements: 'P101, P102, P261, P273, P280, P302+P352, P305+P351+P338, P333+P313, P391, P501', p280Items: ['gloves','eye'], sensitisers: ['Linalool','Limonene','Cinnamal','Eugenol','Coumarin','Citral'], netWeight: '220g', burnTime: '45 hours', batchNum: 'B001' })],
  ['16-long-wax-melt', base({ productType: 'Wax Melt', scentName: 'Christmas Spiced Orange & Cinnamon', hStatements: 'H315, H317, H319, H411', pictograms: ['exclamation','aquatic'], pStatements: 'P101, P102, P261, P273, P302+P352, P305+P351+P338, P333+P313, P391, P501', sensitisers: ['Linalool','Limonene','Cinnamal','Eugenol','Coumarin','Citral'], netWeight: '80g', batchNum: 'B002' })],
  ['17-long-diffuser', base({ productType: 'Reed Diffuser', scentName: 'Oud, Amber & Black Pepper', signal: 'Danger', hStatements: 'H226, H304, H315, H317, H319, H411', pictograms: ['flame','health','exclamation','aquatic'], pStatements: 'P101, P102, P210, P233, P261, P273, P301+P310, P331, P302+P352, P305+P351+P338, P333+P313, P403+P233, P501', sensitisers: ['Linalool','Limonene','Coumarin','Benzyl Salicylate','Hexyl Cinnamal'], netWeight: '100ml', batchNum: 'B003' })],
  ['18-long-room-spray', base({ productType: 'Room Spray', scentName: 'Fresh Linen & White Cotton', signal: 'Danger', hStatements: 'H225, H319, H317, H412', pictograms: ['flame','exclamation'], pStatements: 'P101, P102, P210, P211, P233, P261, P305+P351+P338, P337+P313, P333+P313, P403+P233, P501', sensitisers: ['Linalool','Limonene','Citronellol','Geraniol'], netWeight: '200ml', batchNum: 'B004' })],
];

const GEOMS = [
  ['circle-52-default', { shape: 'circle', size: 52 }],
  ['circle-63', { shape: 'circle', size: 'custom', customW: 63, customH: 63 }],
  ['circle-100', { shape: 'circle', size: 'custom', customW: 100, customH: 100 }],
  ['square-63', { shape: 'square', size: 'custom', customW: 63, customH: 63 }],
  ['rect-52x36-default', { shape: 'rectangle', size: 52 }],
  ['rect-63x44', { shape: 'rectangle', size: 'custom', customW: 63, customH: 44 }],
  ['rect-80x100', { shape: 'rectangle', size: 'custom', customW: 80, customH: 100 }],
  ['rect-150x40', { shape: 'rectangle', size: 'custom', customW: 150, customH: 40 }],
];
module.exports = { CASES, GEOMS };
