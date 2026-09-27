// Valid-pictogram label fixtures for tests/unknown-pictogram-keys.js (M38,
// Issue #7) and its jsdom baseline (tests/fixtures/generate-pictogram-key-baseline.js).
// Synthetic content only. Every list here uses only the nine valid internal
// pictogram keys, so M38's validation must leave every render byte-identical.
const crypto = require('crypto');
const { stubRenderer } = require('./required-content-fixtures');

const VALID_KEYS = ['flame', 'exclamation', 'aquatic', 'explosion', 'oxidiser', 'gas', 'health', 'skull', 'corrosive'];
const LISTS = [...VALID_KEYS.map(k => [k]), ['exclamation', 'health'], ['flame', 'exclamation', 'aquatic'],
  ['skull', 'corrosive', 'health', 'aquatic'], VALID_KEYS, ['health', 'health'], []];
const GEOMS = [['circle', 52, 52], ['circle', 63, 63], ['circle', 75, 75], ['square', 63, 63], ['rectangle', 63, 44], ['rectangle', 100, 50], ['rectangle', 150, 100]];

function pictogramCases() {
  const out = [];
  for (const p of LISTS) for (const [shape, w, h] of GEOMS) {
    out.push({ key: `${JSON.stringify(p)}|${shape} ${w}x${h}`, data: {
      scentName: 'Lavender Fields', productType: 'Scented Candle', bizName: 'Crafty Mouse Gifts', bizAddress: '12 Mill Lane', bizPhone: '01234 567890',
      hStatements: 'H317, H412', pStatements: 'P102', signal: 'Warning', pictograms: p,
      shape, size: 'custom', customW: w, customH: h, textColour: 'dark', showBorder: true } });
  }
  return out;
}
// {"<case>": {sha256, fits, warnings}}
function renderPictogramFingerprints(source) {
  const LR = stubRenderer(source);
  const out = {};
  for (const c of pictogramCases()) {
    const r = LR.renderLabel(c.data, { instanceId: 'pk' });
    out[c.key] = { sha256: crypto.createHash('sha256').update(r.svg).digest('hex'), fits: r.fits, warnings: Array.from(r.warnings) };
  }
  return out;
}
module.exports = { VALID_KEYS, pictogramCases, renderPictogramFingerprints };
