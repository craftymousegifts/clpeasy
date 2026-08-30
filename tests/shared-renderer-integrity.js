// Structural integrity checks for the shared label-rendering engine.
// Proves builder.html and print.html both load the ONE canonical
// label-render.js file rather than each carrying their own copy (inlined
// or otherwise) of the renderer -- the whole point of the shared-renderer
// extraction was to eliminate duplicate renderer copies, so this test
// exists specifically to catch a regression back into that state.
// Run from the repo root: node tests/shared-renderer-integrity.js
const fs = require('fs');
const assert = require('assert');

const SCRIPT_SRC_RE = /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;

function scriptSrcs(html) {
  const out = [];
  let m;
  const re = new RegExp(SCRIPT_SRC_RE);
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

try {
  assert(fs.existsSync('label-render.js'), 'label-render.js does not exist at the repo root');
  const rendererSource = fs.readFileSync('label-render.js', 'utf8');

  // The canonical file must actually define the shared renderer, and must
  // expose it only through window.LabelRenderer (never leak bare globals
  // that could collide with either page's own top-level names).
  assert(/function renderLabel\(rawData,\s*opts\)/.test(rendererSource), 'label-render.js does not define renderLabel(rawData, opts)');
  assert(/root\.LabelRenderer\s*=\s*LabelRenderer/.test(rendererSource), 'label-render.js does not expose window.LabelRenderer');

  const builderHTML = fs.readFileSync('builder.html', 'utf8');
  const printHTML = fs.readFileSync('print.html', 'utf8');

  // 1. Both pages reference the same file by an external <script src>.
  const builderSrcs = scriptSrcs(builderHTML);
  const printSrcs = scriptSrcs(printHTML);
  assert(builderSrcs.includes('label-render.js'), 'builder.html does not <script src="label-render.js">');
  assert(printSrcs.includes('label-render.js'), 'print.html does not <script src="label-render.js">');

  // 2. Neither page contains an inlined copy of the renderer. Strip every
  // externally-sourced <script> tag (the same thing this project's own
  // jsdom test harnesses do) -- if a distinctive, uniquely-identifying
  // fragment of the renderer's own source still turns up in what's left,
  // it means a copy got pasted directly into the page again.
  const RENDERER_FINGERPRINT = "function renderLabel(rawData, opts)";
  const builderInline = builderHTML.replace(SCRIPT_SRC_RE, '');
  const printInline = printHTML.replace(SCRIPT_SRC_RE, '');
  assert(!builderInline.includes(RENDERER_FINGERPRINT), 'builder.html contains an inlined copy of renderLabel()');
  assert(!printInline.includes(RENDERER_FINGERPRINT), 'print.html contains an inlined copy of renderLabel()');
  // Also check by raw byte count: an inlined copy of label-render.js would
  // add >1MB to whichever page carries it -- catch that even if the
  // fingerprint above were somehow renamed/reformatted away.
  assert(builderHTML.length < 2900000, `builder.html is suspiciously large (${builderHTML.length} bytes) -- may contain an inlined renderer copy`);
  assert(printHTML.length < 1500000, `print.html is suspiciously large (${printHTML.length} bytes) -- may contain an inlined renderer copy`);

  // 3. Only one canonical renderLabel implementation exists across the
  // production files that matter to label rendering.
  const PRODUCTION_FILES = ['label-render.js', 'builder.html', 'print.html'];
  let implementationCount = 0;
  const foundIn = [];
  for (const f of PRODUCTION_FILES) {
    const text = fs.readFileSync(f, 'utf8');
    const matches = text.match(/function renderLabel\(rawData,\s*opts\)\{/g) || [];
    if (matches.length) { implementationCount += matches.length; foundIn.push(`${f}(${matches.length})`); }
  }
  assert.strictEqual(implementationCount, 1, `expected exactly one renderLabel() implementation across production files, found ${implementationCount}: ${foundIn.join(', ')}`);
  assert.deepStrictEqual(foundIn, ['label-render.js(1)'], `renderLabel() implementation must live only in label-render.js, found in: ${foundIn.join(', ')}`);

  console.log('shared-renderer integrity checks passed (single canonical label-render.js, no inlined copies)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
