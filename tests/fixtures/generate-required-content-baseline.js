// Generates tests/fixtures/required-content-render-baseline.json: a SHA-256 of
// the renderLabel() SVG (plus fits and warnings) for every required-content
// fixture, using the same deterministic jsdom canvas stub as the other
// renderer tests.
//
// The committed baseline was generated from label-render.js as it was BEFORE
// the required-content (M09/M31) export blocking (branch
// fix/circle-per-line-text-fit @ 0102247). Phase 2 port (3 Oct 2026): it was
// regenerated from production main 6bd9a00's label-render.js (before M09/M31
// was ported onto it), so the test still proves the port never alters output. The regression test uses it to
// prove that change never alters the rendered label, its physical fit or its
// warnings -- complete and incomplete labels alike (preview placeholders are
// still drawn while a label is being built).
// Regenerate only deliberately:
//   node tests/fixtures/generate-required-content-baseline.js [path/to/label-render.js]
const fs = require('fs');
const path = require('path');
const { renderContentFingerprints } = require('./required-content-fixtures');

const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderContentFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'required-content-render-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} required-content fingerprints from ${rendererPath}`);
