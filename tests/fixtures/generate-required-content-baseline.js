// Generates tests/fixtures/required-content-render-baseline.json: a SHA-256 of
// the renderLabel() SVG (plus fits and warnings) for every required-content
// fixture, using the same deterministic jsdom canvas stub as the other
// renderer tests.
//
// The committed baseline was generated from label-render.js as it was BEFORE
// the required-content (M09/M31) export blocking (branch
// fix/circle-per-line-text-fit @ 0102247). The regression test uses it to
// prove that change never alters the rendered label, its physical fit or its
// warnings -- complete and incomplete labels alike (preview placeholders are
// still drawn while a label is being built).
// Regenerate only deliberately:
//   node tests/fixtures/generate-required-content-baseline.js [path/to/label-render.js]
// Issue #5 (M19/M20, precautionary-statement wording): regenerated from the
// renderer WITH the corrected P wording; the fixtures now carry supplier
// P completions (tests/fixtures/p-statement-choices.js). Every changed
// fingerprint was proven to differ SOLELY by P wording: the pre-Issue-5
// renderer with only its P_LIB wording replaced produced byte-identical
// output for every case (evidence: Claude outputs/Builder Label Technical
// Audit/post-fix-precautionary-statement-wording/data/).
const fs = require('fs');
const path = require('path');
const { renderContentFingerprints } = require('./required-content-fixtures');

const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderContentFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'required-content-render-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} required-content fingerprints from ${rendererPath}`);
