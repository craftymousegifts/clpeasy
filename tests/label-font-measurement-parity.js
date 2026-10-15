// Regression for a label measured with one font family and drawn with another.
// Exercises rendered SVG and records canvas measurement fonts. This is a
// structural guard; actual PDF pixels and external SVG viewers need browser QA.
// Georgia business-name measurement is a separate, deliberately excluded issue.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const measured = new Set();
const source = fs.readFileSync(process.env.LABEL_FONT_TEST_RENDERER || path.join(root, 'label-render.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html></html>', {
  runScripts: 'dangerously',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText(text) {
        const match = this.font.match(/([\d.]+)px\s+(.+)$/);
        const size = Number(match?.[1]) || 12;
        measured.add(match?.[2]);
        return { width: [...String(text)].reduce((n, ch) => n + size * (/[MW@%]/.test(ch) ? .82 : /[ilI1.,' ]/.test(ch) ? .28 : .54), 0) };
      },
      drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; }
    });
    w.eval(source);
    w.eval(fs.readFileSync(path.join(root, 'sds-doc-check.js'), 'utf8'));
  }
});
let checked = 0;
for (const [shape, width, height] of [['circle',63,63], ['circle',80,80], ['square',63,63], ['rectangle',99,67]]) {
  const result = dom.window.LabelRenderer.renderLabel({
    shape, size:'custom', customW:width, customH:height,
    scentName:'Fig', productType:'Scented Candle', signal:'WARNING',
    hStatements:'H317', pStatements:'P102, P501', sensitisers:[],
    pictograms:['exclamation'], bizName:'QA', bizAddress:'1 Test Lane',
    bizPhone:'01632 960000', textColour:'dark', showBorder:true
  }, {instanceId:'font-parity-'+shape+'-'+width});
  assert(result.fits, `${shape} ${width}x${height}: fixture must exercise a complete label`);
  const doc = new JSDOM(result.svg, {contentType:'image/svg+xml'}).window.document;
  const statements = [...doc.querySelectorAll('text')].filter(el => /allergic skin reaction|reach of children|local regulations/.test(el.textContent));
  assert(statements.length >= 2, 'hazard and precautionary text must be present');
  for (const el of statements) {
    const family = el.getAttribute('font-family');
    assert(measured.has(family), `drawn statement font ${family} differs from measured fonts ${[...measured].join(', ')}`);
    checked++;
  }
  // Every non-business text element must use a family used by the measuring
  // path; a font import must not override that choice in the print view.
  for (const el of doc.querySelectorAll('text[font-family]')) {
    const family = el.getAttribute('font-family');
    if (family === 'Georgia,serif') continue;
    assert(measured.has(family), `unmeasured drawing font ${family}`);
  }
  assert(![...doc.querySelectorAll('style')].some(el => /@import/.test(el.textContent)), 'print SVG must not import an alternative drawing font');
}
assert(checked >= 8);
console.log(`PASS: ${checked} statement elements across four fitting labels use measured font families; business serif excluded; structural verification only`);
