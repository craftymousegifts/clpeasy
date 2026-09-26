// Generates tests/fixtures/circle-non-arc-render-baseline.json: for every
// circle case in circle-arc-fixtures.js, a SHA-256 of the renderLabel() SVG
// with the curved product-name element removed (plus the full SVG, fits and
// warnings), using the same deterministic jsdom canvas stub as the other
// renderer tests.
//
// The committed baseline was generated from label-render.js as it was BEFORE
// the curved product-name / business-name collision fix (branch
// fix/circle-per-line-text-fit @ 59faa0c). The regression test uses it to
// prove that fix changes only the curved product name's size, plus the block
// flags when the name cannot clear the business name at the minimum size.
// Regenerate only deliberately:
//   node tests/fixtures/generate-circle-non-arc-baseline.js [path/to/label-render.js]
const fs = require('fs');
const path = require('path');
const { renderCircleNonArcFingerprints } = require('./circle-non-arc-fingerprints');

const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderCircleNonArcFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'circle-non-arc-render-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} circle fingerprints from ${rendererPath}`);
