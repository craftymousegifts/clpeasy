// D3/R4 precautionary-statement regression. Run: node tests/d3-r4-precautionary-statements.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const builder = fs.readFileSync('builder.html', 'utf8');
const renderer = fs.readFileSync('label-render.js', 'utf8');
const extract = source => {
  const match = source.match(/const P_LIB=\[(.*?)\];/s);
  assert(match, 'P_LIB missing');
  return [...match[1].matchAll(/\{code:'([^']+)',desc:'([^']*)'\}/g)]
    .reduce((map, [, code, desc]) => (map.set(code, desc), map), new Map());
};
const a = extract(builder), b = extract(renderer);
const expected = new Map([
  ['P202', 'Do not handle until all safety precautions have been read and understood'],
  ['P308+P313', 'IF exposed or concerned: Get medical advice/attention'],
  ['P310', 'Immediately call a POISON CENTRE/doctor'],
  ['P305+P351+P338', 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.'],
]);
for (const [code, wording] of expected) {
  assert.strictEqual(a.get(code), wording, 'Builder incorrect: ' + code);
  assert.strictEqual(b.get(code), wording, 'Renderer incorrect: ' + code);
}
assert.strictEqual(a.size, new Set(a.keys()).size);
assert.strictEqual(b.size, new Set(b.keys()).size);
assert.strictEqual(a.get('P280'), b.get('P280'), 'P280 regression');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText(s) { return { width: String(s).length * 6 }; },
      drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; }
    });
    w.eval(renderer);
  }
});
const LR = dom.window.LabelRenderer;
assert(LR && LR.renderLabel, 'Shared renderer unavailable');
for (const code of expected.keys()) {
  const label = {
    shape: 'rectangle', size: 'custom', customW: 160, customH: 200,
    scentName: 'Test', productType: 'Wax Melt', bizName: 'Test Maker',
    signal: 'Danger', hStatements: 'H318', pStatements: code,
    pictograms: ['corrosion']
  };
  const result = LR.renderLabel(label, { instanceId: 'd3r4-' + code.replace(/\W/g, ''), pw: 500, ph: 650 });
  assert(!result.warnings.some(w => w === 'unrecognized-code:' + code), 'Unrecognised ' + code);
  assert(result.svg.includes('<svg'), 'SVG missing for ' + code);
  if (code === 'P305+P351+P338') {
    assert(result.svg.includes('Remove contact lenses'), 'Eye-contact contact-lens instruction missing from SVG');
    assert(result.svg.includes('Continue rinsing'), 'Eye-contact final instruction missing from SVG');
  }
}
console.log('PASS: D3/R4 library parity, known codes and SVG rendering');
