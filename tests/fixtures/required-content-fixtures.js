// Synthetic label records for tests/required-content-export-blocking.js and
// its jsdom baseline (tests/fixtures/generate-required-content-baseline.js).
// No production/customer data. Covers Builder Label Technical Audit findings
// M09 (blank business name printed as "Your Brand") and M31 (EUH208 without a
// named substance printed as "Contains: sensitising substance").
const { FIXTURE_P_CHOICES } = require('./p-statement-choices'); // Issue #5: supplier P completions (test data)
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const complete = {
  scentName: 'Lavender Fields', productType: 'Scented Candle', bizName: 'Crafty Mouse Gifts',
  bizAddress: '12 Mill Lane', bizPhone: '01234 567890', signal: 'Warning',
  hStatements: 'H317, H412, EUH208', pStatements: 'P102, P501', pChoices: FIXTURE_P_CHOICES, sensitisers: ['Linalool', 'Citral'],
  pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
};
const without = (o, key) => { const c = Object.assign({}, o); delete c[key]; return c; };

// [id, record, expected missing list]
const RECORDS = [
  ['complete-control', complete, []],
  ['complete-no-euh208', Object.assign({}, complete, { hStatements: 'H317, H412', sensitisers: ['Linalool'] }), []],
  ['empty-business-name', Object.assign({}, complete, { bizName: '' }), ['business-name']],
  ['whitespace-business-name', Object.assign({}, complete, { bizName: '   \t ' }), ['business-name']],
  ['undefined-business-name', without(complete, 'bizName'), ['business-name']],
  ['empty-product-name', Object.assign({}, complete, { scentName: '' }), ['product-name']],
  ['whitespace-product-name', Object.assign({}, complete, { scentName: '  ' }), ['product-name']],
  ['euh208-no-names', Object.assign({}, complete, { hStatements: 'H412, EUH208', sensitisers: [] }), ['euh208-substance']],
  ['euh208-blank-names', Object.assign({}, complete, { hStatements: 'H412, EUH208', sensitisers: ['  ', '', ' . '] }), ['euh208-substance']],
  ['euh208-valid-names', Object.assign({}, complete, { hStatements: 'H412, EUH208', sensitisers: ['Citral'] }), []],
  ['everything-missing', Object.assign({}, complete, { scentName: ' ', bizName: '', hStatements: 'EUH208', sensitisers: [] }), ['product-name', 'business-name', 'euh208-substance']],
];
const GEOMS = [['circle', 75, 75], ['square', 63, 63], ['rectangle', 80, 100]];

function renderCases() {
  const out = [];
  for (const [id, rec, missing] of RECORDS) for (const [shape, w, h] of GEOMS) {
    out.push({ key: `${id}|${shape} ${w}x${h}`, id, missing, data: Object.assign({}, rec, { shape, size: 'custom', customW: w, customH: h }) });
  }
  return out;
}

function stubRenderer(source) {
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
      window.eval(source);
    },
  });
  return dom.window.LabelRenderer;
}

// {"<case>": {sha256, fits, warnings}} -- the rendered label itself.
function renderContentFingerprints(source) {
  const LR = stubRenderer(source);
  const out = {};
  for (const c of renderCases()) {
    const r = LR.renderLabel(c.data, { instanceId: 'baseline' });
    out[c.key] = { sha256: crypto.createHash('sha256').update(r.svg).digest('hex'), fits: r.fits, warnings: [...r.warnings] };
  }
  return out;
}

module.exports = { complete, RECORDS, GEOMS, renderCases, stubRenderer, renderContentFingerprints };
