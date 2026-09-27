// Synthetic label content for tests/product-name-one-line-sizing.js and its
// jsdom baseline (tests/fixtures/generate-product-name-sizing-baseline.js).
// No production/customer data. Covers Builder Label Technical Audit finding
// M43: product-name sizing when the name no longer fits on one line.
const { FIXTURE_P_CHOICES } = require('./p-statement-choices'); // Issue #5: supplier P completions (test data)
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const GEOMS = [
  ['square', 52, 52], ['square', 63, 63], ['square', 100, 100], ['square', 150, 150],
  ['rectangle', 63, 44], ['rectangle', 80, 100], ['rectangle', 100, 70], ['rectangle', 150, 40],
  ['circle', 52, 52], ['circle', 63, 63], ['circle', 100, 100], ['circle', 150, 150],
];

// A long, realistic name grown one word at a time (8 -> 128 characters).
const LONG_WORDS = 'Midnight Blackberry, Bay Leaf, Smoked Vanilla, Warm Amber, Sandalwood & Tonka Bean with a hint of Pink Pepper and Orange Blossom'.split(' ');
const GROWING = LONG_WORDS.map((_, i) => LONG_WORDS.slice(0, i + 1).join(' '));
const REALISTIC = ['Rose', 'Vanilla Bean', 'Lavender Fields', 'Midnight Blackberry', 'Sea Salt & Driftwood', 'Fresh Linen & White Cotton',
  'Christmas Spiced Orange & Cinnamon', "Grandma's Kitchen Apple Pie & Warm Cinnamon Spice", 'WWMM WWMM WMWMW WWMM WWMM WMWMW WWMM'];

const content = (shape, w, h, name, bizName) => ({
  shape, size: 'custom', customW: w, customH: h, scentName: name, productType: 'Scented Candle', signal: 'Warning',
  bizName: bizName === undefined ? 'Crafty Mouse Gifts' : bizName, bizAddress: '12 Mill Lane', bizPhone: '01234 567890',
  hStatements: 'H317', pStatements: 'P102, P501', pChoices: FIXTURE_P_CHOICES, sensitisers: ['Geraniol'], pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
});

// Every jsdom baseline case: automatic sizing only.
function sizingCases() {
  const out = [];
  for (const [shape, w, h] of GEOMS) for (const n of [...REALISTIC, ...GROWING]) {
    out.push({ key: `${shape} ${w}x${h}|${n}`, data: content(shape, w, h, n) });
  }
  return out;
}

function stubRenderer(labelRendererSource) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => ({
        font: '',
        measureText(text) {
          const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
          return { width: [...String(text)].reduce((w, c) => w + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
        },
        drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; },
      });
      window.eval(labelRendererSource);
    },
  });
  return dom.window.LabelRenderer;
}

// {"<case>": {sha256, fits, warnings, scentPx, floorPx}} in the jsdom stub.
function renderSizingFingerprints(labelRendererSource) {
  const LR = stubRenderer(labelRendererSource);
  const out = {};
  for (const c of sizingCases()) {
    const r = LR.renderLabel(c.data, { instanceId: 'baseline' });
    const { mmW, pw } = r.metrics.labelDims;
    out[c.key] = {
      sha256: crypto.createHash('sha256').update(r.svg).digest('hex'),
      fits: r.fits, warnings: [...r.warnings],
      scentPx: r.metrics.fontSizes.scent,
      floorPx: Math.max(1.2 * pw / mmW, 3.2), // label-render.js _mandatoryMinFS
    };
  }
  return out;
}

module.exports = { GEOMS, GROWING, REALISTIC, content, sizingCases, renderSizingFingerprints };
