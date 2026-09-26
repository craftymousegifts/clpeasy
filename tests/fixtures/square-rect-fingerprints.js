// Shared by generate-square-rect-baseline.js and
// tests/circle-per-line-text-containment.js: renders every fixture on every
// square/rectangle geometry through the given label-render.js source in
// jsdom (same canvas-stub metrics as the existing renderer tests) and
// returns {"<fixture>|<geometry>": {sha256, fits, warnings}}.
const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const { FIXTURES, SQUARE_RECT_GEOMS } = require('./circle-containment-fixtures');

function renderSquareRectFingerprints(labelRendererSource) {
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
  const LR = dom.window.LabelRenderer;
  const out = {};
  for (const [fx, content] of Object.entries(FIXTURES)) {
    for (const [geom, g] of Object.entries(SQUARE_RECT_GEOMS)) {
      const r = LR.renderLabel(Object.assign({}, content, g), { instanceId: 'baseline' });
      out[fx + '|' + geom] = {
        sha256: crypto.createHash('sha256').update(r.svg).digest('hex'),
        fits: r.fits,
        warnings: [...r.warnings],
      };
    }
  }
  return out;
}

module.exports = { renderSquareRectFingerprints };
