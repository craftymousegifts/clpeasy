// Decision 5 (owner-approved, 20 Oct 2026): three P-statement wording
// corrections against GB CLP Annex IV (legislation.gov.uk, current revised
// text; no outstanding UK effects):
//   P103       "Read carefully and follow all instructions." (wording since
//              Regulation (EU) 2019/521; CLPeasy printed the older
//              "Read label before use").
//   P313       "Get medical advice/attention." -- "/" means a choice has to be
//   P332+P313  made (Annex IV, Part 1 conventions). CLPeasy printed the slash;
//              it now uses "advice", the option P333+P313, P337+P313 and P314
//              already use.
//   1. Both P_LIB copies stay identical; only these three entries change.
//   2. Preview and export SVGs print the corrected sentences.
//   3. A label too small for the longer P103 is blocked, never shortened, and
//      the recommended supported size prints it in full.
// Run from the repo root: node tests/p-statement-wording-decision5.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');
const builderSrc = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

const EXPECTED = {
  'P103': 'Read carefully and follow all instructions',
  'P313': 'Get medical advice',
  'P332+P313': 'If skin irritation occurs: get medical advice',
};
const lib = src => { const a = src.indexOf('const P_LIB=['), b = src.indexOf("{code:'P280'", a);
  return new Map([...src.slice(a, b).matchAll(/\{code:'([^']+)',desc:'([^']*)'\}/g)].map(m => [m[1], m[2]])); };
const rLib = lib(rendererSrc), bLib = lib(builderSrc);
assert.deepStrictEqual([...bLib], [...rLib], 'builder.html and label-render.js P_LIB must be identical');
for (const [c, d] of Object.entries(EXPECTED)) assert.strictEqual(rLib.get(c), d, c);
for (const old of ["'Read label before use'", "'Get medical advice/attention'", "'If skin irritation occurs: get medical advice/attention'"])
  assert(!rendererSrc.includes(old) && !builderSrc.includes(old), 'old wording remains: ' + old);
assert(![...rLib.values()].some(d => /advice\/attention/.test(d)), 'no library entry prints "advice/attention"');
ok('both libraries carry the three corrected entries and no "advice/attention" remains');

const w = new JSDOM('', { runScripts: 'outside-only' }).window;
w.HTMLCanvasElement.prototype.getContext = () => ({ font: '',
  measureText(t) { const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
    return { width: [...String(t)].reduce((a, c) => a + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; },
  drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; } });
w.eval(rendererSrc);
const LR = w.LabelRenderer;
const drawn = svg => (svg.match(/>([^<>]+)</g) || []).map(s => s.slice(1, -1)).join(' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const base = { shape: 'rectangle', size: 'custom', customW: 120, customH: 84, scentName: 'Fresh Linen', productType: 'Scented Candle',
  bizName: 'Test Maker', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000', signal: 'Warning',
  hStatements: 'H315, H317', pictograms: ['exclamation'], sensitisers: [], pStatements: 'P102, P103, P313, P332+P313, P501' };
for (const forExport of [false, true]) {
  const r = LR.renderLabel(base, { instanceId: 'd5-' + forExport, forExport });
  assert.strictEqual(r.fits, true, JSON.stringify(r.warnings));
  const t = drawn(r.svg);
  for (const d of Object.values(EXPECTED)) assert(t.includes(d + '.'), (forExport ? 'export' : 'preview') + ' must print "' + d + '."');
  assert(!/advice\/attention|Read label before use/.test(t), 'old wording must not be printed');
}
ok('preview and export SVGs print the corrected sentences');

const crowded = Object.assign({}, base, { shape: 'circle', customW: 52, customH: 52, hStatements: 'H226, H315, H317, H319, H411',
  pictograms: ['flame', 'exclamation', 'aquatic'], sensitisers: ['Limonene', 'Linalool'],
  pStatements: 'P101, P102, P103, P210, P261, P273, P313, P332+P313, P305+P351+P338, P501' });
const blocked = LR.renderLabel(crowded, { instanceId: 'd5-crowded', forExport: true });
assert(!blocked.fits && blocked.warnings.includes('hazard-text-overflow'), JSON.stringify(blocked.warnings));
const rec = LR.findSmallestFittingSize(crowded, { instanceId: 'd5-rec' });
const atRec = rec && LR.renderLabel(Object.assign({}, crowded, { customW: rec.mmW, customH: rec.mmH }), { instanceId: 'd5-at-rec', forExport: true });
assert(atRec && atRec.fits && Object.values(EXPECTED).every(d => drawn(atRec.svg).includes(d + '.')), 'recommended size prints all three in full');
ok('a 52 mm circle is blocked, never shortened; the recommended ' + rec.mmW + ' mm size prints them in full');

console.log(`\nAll ${n} decision 5 wording checks passed.`);
