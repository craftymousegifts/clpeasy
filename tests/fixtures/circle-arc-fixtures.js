// Synthetic label content for tests/circle-product-name-business-name-clearance.js
// and its jsdom baseline (tests/fixtures/generate-circle-non-arc-baseline.js).
// No production/customer data. Covers Builder Label Technical Audit finding
// M45: curved product name vs business name on circular labels.
const CIRCLE_MM = [52, 63, 75, 100, 150];

// Product names: controlled lengths 10-46 characters, a narrow/wide pair of
// equal length (rendered width, not character count, is what matters), and
// realistic maker product names.
const PRODUCT_NAMES = [
  'Rose',
  'Aaaaa Bbbb',                                     // 10
  'Aaaaa Bbbbbb',                                   // 12
  'Aaaaa Bbbbbbbbb',                                // 15
  'Aaaaa Bbbbbbbbbbbbbb',                           // 20
  'Aaaaa Bbbbbbbbbbbbbbbbbbb',                      // 25
  'Aaaaa Bbbbbbbbbbbbbbbbbbbbbbbb',                 // 30
  'Aaaaa Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',       // 40
  'illi lill iilll',                                // 15, narrow
  'WWMM WWMM WMWMW',                                // 15, wide
  'Vanilla Bean',
  'Lavender Fields',
  'Pomegranate Noir',
  'Midnight Blackberry',
  'Sea Salt & Driftwood',
  'Fresh Linen & White Cotton',
  'Christmas Spiced Orange & Cinnamon',
  'Midnight Blackberry, Bay Leaf & Smoked Vanilla',
  'Crème Brûlée & Tonka',
];

const BUSINESS_NAMES = ['CMG', 'Crafty Mouse Gifts', 'The Little Candle Company of Yorkshire', ''];
const DEFAULT_BUSINESS = 'Crafty Mouse Gifts';
// Subset used with every business name and with the manual size overrides.
const KEY_NAMES = ['Vanilla Bean', 'Lavender Fields', 'Pomegranate Noir', 'Midnight Blackberry',
  'Fresh Linen & White Cotton', 'Christmas Spiced Orange & Cinnamon', 'Midnight Blackberry, Bay Leaf & Smoked Vanilla', 'WWMM WWMM WMWMW'];

// Builder's +/- fine-tune values, pushed past both ends (the renderer clamps them).
const OVERRIDES = [
  { scentFSOverride: 999 }, { scentFSOverride: 0 },
  { bizNameFSOverride: 999 }, { bizNameFSOverride: 0 },
];

const baseContent = (scentName, bizName) => ({
  scentName, productType: 'Scented Candle', signal: 'Warning',
  bizName, bizAddress: '12 Mill Lane, Testville', bizPhone: '01234 567890',
  hStatements: 'H317', pStatements: 'P102, P501', sensitisers: ['Geraniol'], pictograms: ['exclamation'],
  netWeight: '200g', textColour: 'dark', showBorder: true,
});

// Every circle case: {key, data, opts}
function circleArcCases() {
  const out = [];
  const add = (mm, name, biz, opts) => out.push({
    key: `${mm}mm|${name}|biz=${biz || '(empty)'}|${opts ? JSON.stringify(opts) : 'auto'}`,
    data: Object.assign(baseContent(name, biz), { shape: 'circle', size: 'custom', customW: mm, customH: mm }),
    opts: opts || null,
  });
  for (const mm of CIRCLE_MM) {
    for (const n of PRODUCT_NAMES) add(mm, n, DEFAULT_BUSINESS);
    for (const b of BUSINESS_NAMES) if (b !== DEFAULT_BUSINESS) for (const n of KEY_NAMES) add(mm, n, b);
  }
  for (const mm of [52, 63, 100, 150]) for (const o of OVERRIDES) for (const n of KEY_NAMES) add(mm, n, DEFAULT_BUSINESS, o);
  return out;
}

module.exports = { CIRCLE_MM, PRODUCT_NAMES, BUSINESS_NAMES, KEY_NAMES, OVERRIDES, circleArcCases };
