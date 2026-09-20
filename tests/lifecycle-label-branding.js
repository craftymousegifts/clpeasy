// Regression coverage for removing the central mock product label from the
// homepage "CLP label lifecycle" diagram (fix: remove lifecycle mock
// product label). An earlier pass replaced the real Crafty Mouse Gifts
// sample content with neutral placeholder text ("Your Business Name" /
// "Your Product Name" / "Batch: EXAMPLE-001"), but the label itself was
// still visibly present, which wasn't the requirement -- the centre of the
// lifecycle ring must now be completely empty: no label circle, no
// placeholder or real business/product/batch text, no hazard diamond, no
// H-statement/sensitiser text, no dividing line, no "clpeasy.com" text.
// The nine lifecycle stage nodes, their arrows/positioning, and the
// tooltip/accessibility behaviour already covered by
// tests/lifecycle-reminder-accuracy.js and
// tests/lifecycle-tooltip-pin-interaction.js must be unaffected.
//
// Run from repo root: node tests/lifecycle-label-branding.js

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');

// Isolate the lifecycle diagram's <svg id="lc-svg"> so a stray match
// elsewhere on the homepage (or in an unrelated decorative-label symbol)
// can't hide a real problem in the diagram itself, or vice versa.
const lifecycleMatch = html.match(/<svg id="lc-svg"[\s\S]*?<\/svg>/);
assert(lifecycleMatch, 'could not locate the lifecycle diagram <svg id="lc-svg"> in index.html');
const lifecycle = lifecycleMatch[0];

// ── No central mock product label remains ──────────────────────────────
assert(!/<!--\s*CENTRE MOCK LABEL\s*-->/i.test(lifecycle),
  'the "CENTRE MOCK LABEL" block must be fully removed from the lifecycle diagram, not just its text');
// The label's own 94px-radius centre circle must be gone. (The lifecycle
// diagram still legitimately contains other circles -- the orbit ring and
// the nine stage-node circles -- so this checks the specific centre-label
// circle by its exact attributes, not "any circle".)
assert(!lifecycle.includes('<circle cx="280" cy="280" r="94" fill="white" stroke="#4C9BB0" stroke-width="2"/>'),
  'the lifecycle centre mock label circle (r=94, the product label outline) must be removed');
// The dark business-name pill background and the divider line above the
// batch/footer text were part of the same removed mock label.
assert(!lifecycle.includes('<rect x="224" y="216" width="112" height="13" rx="2" fill="#0f2236"/>'),
  'the lifecycle centre label\'s business-name background pill must be removed');
assert(!lifecycle.includes('<line x1="230" y1="319" x2="330" y2="319" stroke="#E8EAED" stroke-width="0.8"/>'),
  'the lifecycle centre label\'s dividing line must be removed');
// The hazard-diamond pictogram rect from the removed mock label.
assert(!lifecycle.includes('<rect x="274" y="276" width="12" height="12" rx="1" fill="none" stroke="#111318" stroke-width="1" transform="rotate(45 280 282)"/>'),
  'the lifecycle centre label\'s hazard diamond must be removed');

// ── No old or placeholder label wording remains anywhere in the diagram ──
const bannedLabelText = [
  'Crafty Mouse Gifts',
  'Summer Bloom',
  'CMG-2026-001',
  'Your Business Name',
  'Your Product Name',
  'EXAMPLE-001',
  'SCENTED CANDLE',
  'H317',
  'H412',
  'Contains: Linalool, Citral',
];
for (const text of bannedLabelText) {
  assert(!lifecycle.includes(text), `no trace of the removed mock label's "${text}" text should remain in the lifecycle diagram`);
}
// "WARNING" and "clpeasy.com" were also part of the removed mock label;
// check them with care since "WARNING" in particular is a generic word
// that must not appear anywhere in the diagram now that its only source
// (the mock label's signal word) is gone.
assert(!lifecycle.includes('>WARNING<'), 'the removed mock label\'s "WARNING" signal-word text must not remain in the lifecycle diagram');
assert(!lifecycle.includes('>clpeasy.com<'), 'the removed mock label\'s "clpeasy.com" footer text must not remain in the lifecycle diagram');

// ── Nine lifecycle stages, arrows and interactions preserved ──────────
for (let step = 1; step <= 9; step++) {
  const nodePattern = new RegExp('<g class="lc-node" data-step="' + step + '"');
  assert(nodePattern.test(lifecycle), `lifecycle diagram must still contain stage node ${step}`);
}
assert(!/data-step="10"/.test(lifecycle), 'lifecycle diagram must not have gained a tenth stage node');

// Arrows connecting the nine stages (9 <line> elements with marker-end,
// distinct from the removed centre label's divider <line>).
const arrowCount = (lifecycle.match(/marker-end="url\(#a-(teal|amber|green)\)"/g) || []).length;
assert.strictEqual(arrowCount, 9, `lifecycle diagram must still have exactly 9 connecting arrows (found ${arrowCount})`);

// The orbit ring (unrelated to the removed centre label) must remain.
assert(lifecycle.includes('<circle cx="280" cy="280" r="210" fill="none" stroke="#E2EEF2" stroke-width="1.5" stroke-dasharray="5 4"/>'),
  'the lifecycle orbit ring must be unaffected by removing the centre mock label');

const stageTitles = [
  '1:{t:"New scent idea"',
  '2:{t:"Get your SDS"',
  '3:{t:"Import hazard data"',
  '4:{t:"Build your label"',
  '5:{t:"Download & print"',
  '6:{t:"Sell your product"',
  '7:{t:"Review when something changes"',
  '8:{t:"Check the current information"',
  '9:{t:"Update and reprint"',
];
for (const title of stageTitles) {
  assert(html.includes(title), `lifecycle step data must still include ${title}`);
}

console.log('lifecycle label-branding checks passed (central mock product label fully removed -- no label circle, background pill, hazard diamond, divider line, or old/placeholder label text remains -- nine lifecycle stages, their 9 connecting arrows, orbit ring and step titles all preserved)');
