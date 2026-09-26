// Shared by generate-circle-non-arc-baseline.js and
// tests/circle-product-name-business-name-clearance.js: renders every circle
// case from circle-arc-fixtures.js through the given label-render.js source in
// jsdom (the same canvas-stub metrics as the other renderer tests) and returns
// {"<case>": {nonArc, full, fits, warnings, arcCollision}}.
//   nonArc: SHA-256 of the SVG with the curved product-name <text> removed,
//           i.e. everything the M45 fix must leave byte-identical.
//   full:   SHA-256 of the whole SVG.
const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const { circleArcCases } = require('./circle-arc-fixtures');

const ARC_TEXT = /<text[^>]*><textPath[^>]*>[\s\S]*?<\/textPath><\/text>/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function renderCircleNonArcFingerprints(labelRendererSource) {
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
  for (const c of circleArcCases()) {
    const r = LR.renderLabel(c.data, Object.assign({ instanceId: 'baseline' }, c.opts || {}));
    if (!ARC_TEXT.test(r.svg)) throw new Error('curved product-name element not found: ' + c.key);
    out[c.key] = {
      nonArc: sha(r.svg.replace(ARC_TEXT, '')),
      full: sha(r.svg),
      fits: r.fits,
      warnings: [...r.warnings],
      arcCollision: !!r.metrics.scentArcCollision,
    };
  }
  return out;
}

module.exports = { renderCircleNonArcFingerprints };
