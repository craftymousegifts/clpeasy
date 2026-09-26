// Generates tests/fixtures/product-name-sizing-baseline.json: a SHA-256 of
// every renderLabel() SVG (plus fits, warnings, product-name size and the
// mandatory minimum) for the product-name sizing fixture set, using the same
// deterministic jsdom canvas stub as the other renderer tests.
//
// The committed baseline was generated from label-render.js as it was BEFORE
// the one-line product-name sizing fix (audit finding M43; branch
// fix/circle-per-line-text-fit @ a092f05). The regression test uses it to
// prove that every label whose product name was NOT collapsed to the minimum
// before the fix is byte-identical after it.
// Regenerate only deliberately:
//   node tests/fixtures/generate-product-name-sizing-baseline.js [path/to/label-render.js]
const fs = require('fs');
const path = require('path');
const { renderSizingFingerprints } = require('./product-name-sizing-fixtures');

const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderSizingFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'product-name-sizing-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} product-name sizing fingerprints from ${rendererPath}`);
