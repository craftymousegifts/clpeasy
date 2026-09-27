// Generates tests/fixtures/pictogram-key-render-baseline.json from the
// renderer BEFORE M38 (Issue #7) -- branch fix/circle-per-line-text-fit @
// a762538 -- so tests/unknown-pictogram-keys.js can prove the pictogram-key
// validation leaves every valid-key label byte-identical (SVG, fits,
// warnings). Regenerate only deliberately:
//   node tests/fixtures/generate-pictogram-key-baseline.js [path/to/label-render.js]
const fs = require('fs');
const path = require('path');
const { renderPictogramFingerprints } = require('./pictogram-key-fixtures');
const rendererPath = process.argv[2] || path.join(__dirname, '..', '..', 'label-render.js');
const out = renderPictogramFingerprints(fs.readFileSync(rendererPath, 'utf8'));
fs.writeFileSync(path.join(__dirname, 'pictogram-key-render-baseline.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} pictogram-key fingerprints from ${rendererPath}`);
