// Generates tests/fixtures/square-rect-render-baseline.json: a SHA-256 of
// every square/rectangle renderLabel() SVG (plus fits/warnings) for the
// circle-containment fixture set, using the same deterministic jsdom
// canvas stub as the existing renderer tests.
//
// The committed baseline was generated from main's label-render.js BEFORE
// the circular-label containment fix, so the regression test proves that
// fix left square/rectangle output byte-for-byte unchanged. Regenerate
// only deliberately, when square/rectangle output is meant to change:
//   node tests/fixtures/generate-square-rect-baseline.js [path/to/label-render.js]
// Issue #5 (M19/M20, precautionary-statement wording): regenerated from the
// renderer WITH the corrected P wording; the fixtures now carry supplier
// P completions (tests/fixtures/p-statement-choices.js). Every changed
// fingerprint was proven to differ SOLELY by P wording: the pre-Issue-5
// renderer with only its P_LIB wording replaced produced byte-identical
// output for every case (evidence: Claude outputs/Builder Label Technical
// Audit/post-fix-precautionary-statement-wording/data/).
const fs = require('fs');
const path = require('path');
const { renderSquareRectFingerprints } = require('./square-rect-fingerprints');

const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderSquareRectFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'square-rect-render-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} square/rectangle fingerprints from ${rendererPath}`);
