// Correction A (17 Oct 2026): restore the complete GB CLP Annex IV wording of
// P305+P351+P338, P210 and P304+P340 (previously printed shortened; the full
// wording was approved in Issue #5 / M19-M20 on 27 Sep 2026 but never merged).
//   1. Both wording libraries (label-render.js and builder.html) carry the
//      exact corrected strings and stay identical.
//   2. Preview and export SVGs print the complete sentences.
//   3. A label that can no longer fit is blocked (hazard-text-overflow) rather
//      than having any wording shortened, and the size recommendation is a
//      supported size at which the complete wording fits.
// Run from the repo root: node tests/p-statement-wording-correction-a.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');
const builderSrc = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');

const EXPECTED = {
  'P305+P351+P338': 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing',
  'P210': 'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking',
  'P304+P340': 'IF INHALED: Remove person to fresh air and keep comfortable for breathing',
};
const SHORTENED = [
  "'IF IN EYES: rinse cautiously with water for several minutes'",
  "'Keep away from heat and ignition sources. No smoking'",
  "'IF INHALED: remove to fresh air and keep comfortable for breathing'",
];

let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

// ── 1. Both libraries: exact strings, identical copies ──────────────────
const libLine = (src, name) => {
  const m = /^const P_LIB=\[.*$/m.exec(src);
  assert(m, name + ': P_LIB definition not found');
  return m[0];
};
const rendererLib = libLine(rendererSrc, 'label-render.js');
const builderLib = libLine(builderSrc, 'builder.html');
assert.strictEqual(builderLib, rendererLib, 'builder.html P_LIB must stay identical to label-render.js P_LIB');
ok('builder.html and label-render.js P_LIB are identical');
for (const [code, text] of Object.entries(EXPECTED)) {
  const entry = `{code:'${code}',desc:'${text}'}`;
  assert(rendererLib.includes(entry), `label-render.js: ${code} must read exactly "${text}"`);
  assert(builderLib.includes(entry), `builder.html: ${code} must read exactly "${text}"`);
  ok(`${code} carries the complete wording in both libraries`);
}
for (const old of SHORTENED) {
  assert(!rendererSrc.includes(old) && !builderSrc.includes(old), `shortened wording ${old} must not remain`);
}
ok('no shortened wording remains in either file');

// ── 2/3. Rendered output ────────────────────────────────────────────────
const w = new JSDOM('', { runScripts: 'outside-only' }).window;
w.HTMLCanvasElement.prototype.getContext = () => ({
  font: '',
  measureText(text) {
    const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
    return { width: [...String(text)].reduce((a, c) => a + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
  },
  drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; }
});
w.eval(rendererSrc);
const LR = w.LabelRenderer;
// All drawn text, joined across wrapped <tspan>/<text> lines.
const drawnText = svg => (svg.match(/>([^<>]+)</g) || []).map(s => s.slice(1, -1)).join(' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const base = {
  shape: 'rectangle', size: 'custom', customW: 120, customH: 84,
  scentName: 'Fresh Linen', productType: 'Room Spray', bizName: 'Crafty Mouse Gifts',
  bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000',
  signal: 'Warning', hStatements: 'H226, H319', pictograms: ['flame', 'exclamation'], sensitisers: [],
  pStatements: 'P210, P304+P340, P305+P351+P338',
};
for (const forExport of [false, true]) {
  const r = LR.renderLabel(base, { instanceId: 'corr-a-' + forExport, forExport });
  assert.strictEqual(r.fits, true, `fixture must fit (${JSON.stringify(r.warnings)})`);
  const t = drawnText(r.svg);
  for (const text of Object.values(EXPECTED)) {
    assert(t.includes(text + '.'), `${forExport ? 'export' : 'preview'} SVG must print "${text}."; drawn text: ${t}`);
  }
  ok(`${forExport ? 'export' : 'preview'} SVG prints all three complete statements`);
}

// A small label that cannot hold the complete wording is blocked, never shortened.
const crowded = Object.assign({}, base, {
  shape: 'circle', customW: 52, customH: 52,
  hStatements: 'H226, H317, H319, H411', sensitisers: ['Limonene', 'Linalool'],
  pictograms: ['flame', 'exclamation', 'aquatic'],
  pStatements: 'P102, P210, P261, P273, P305+P351+P338, P337+P313, P403+P233, P501',
});
const blocked = LR.renderLabel(crowded, { instanceId: 'corr-a-crowded', forExport: true });
assert.strictEqual(blocked.fits, false, 'crowded 52 mm label must not fit');
assert(blocked.warnings.includes('hazard-text-overflow'), `crowded label must be blocked for hazard-text-overflow, got ${JSON.stringify(blocked.warnings)}`);
ok('a label too small for the complete wording is blocked (hazard-text-overflow)');

const rec = LR.findSmallestFittingSize(crowded, { instanceId: 'corr-a-rec' });
assert(rec, 'a size recommendation must exist for the crowded label');
assert(rec.mmW >= LR.CUSTOM_SIZE_MIN_MM && rec.mmH >= LR.CUSTOM_SIZE_MIN_MM, `recommendation ${rec.mmW}x${rec.mmH} must not be below the supported ${LR.CUSTOM_SIZE_MIN_MM} mm minimum`);
const atRec = LR.renderLabel(Object.assign({}, crowded, { customW: rec.mmW, customH: rec.mmH }), { instanceId: 'corr-a-at-rec', forExport: true });
assert.strictEqual(atRec.fits, true, `label must fit at the recommended ${rec.mmW} mm (${JSON.stringify(atRec.warnings)})`);
const recText = drawnText(atRec.svg);
for (const code of ['P305+P351+P338', 'P210']) {
  assert(recText.includes(EXPECTED[code] + '.'), `complete ${code} wording must be printed at the recommended size`);
}
ok(`recommended size ${rec.mmW} mm is supported and prints the complete wording`);

console.log(`\nAll ${n} Correction A checks passed.`);
