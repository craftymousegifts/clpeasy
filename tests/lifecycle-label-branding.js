// Regression coverage for removing the leftover Crafty Mouse Gifts branding
// from the central sample label inside the homepage "CLP label lifecycle"
// diagram (fix: remove legacy branding from lifecycle label). The centre
// mock label previously showed real CMG business/product/batch details;
// it must now show neutral placeholder text while remaining a label-shaped
// visual example, and the rest of the homepage lifecycle diagram (nine
// stages, tooltip/accessibility behaviour already covered by
// tests/lifecycle-reminder-accuracy.js and
// tests/lifecycle-tooltip-pin-interaction.js) must be unaffected.
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

const centreLabelMatch = html.match(/<!-- CENTRE MOCK LABEL -->[\s\S]*?<!-- STEP NODES/);
assert(centreLabelMatch, 'could not locate the CENTRE MOCK LABEL block inside the lifecycle diagram');
const centreLabel = centreLabelMatch[0];

// ── Neutral placeholder text now present ───────────────────────────────
assert(centreLabel.includes('>Your Business Name<'),
  'lifecycle centre label must show the neutral "Your Business Name" placeholder');
assert(centreLabel.includes('>Your Product Name<'),
  'lifecycle centre label must show the neutral "Your Product Name" placeholder');
assert(centreLabel.includes('Batch: EXAMPLE-001'),
  'lifecycle centre label must show a neutral example batch code, not a real CMG batch number');

// ── Real Crafty Mouse Gifts branding removed from the lifecycle diagram ──
// Scoped to the lifecycle <svg> (not the whole homepage): index.html also
// contains a genuine "— Michaela, Crafty Mouse Gifts" testimonial byline
// and a separate decorative-label symbol library (both pre-existing, both
// outside this fix's scope -- see the task report for details), so a
// whole-file assertion would be a false requirement, not a real one.
assert(!/Crafty Mouse Gifts/i.test(lifecycle),
  'the lifecycle diagram must not contain "Crafty Mouse Gifts" anywhere');
assert(!lifecycle.includes('Summer Bloom'),
  'the lifecycle diagram must not contain the "Summer Bloom" sample product name');
assert(!lifecycle.includes('CMG-2026-001'),
  'the lifecycle diagram must not contain the real "CMG-2026-001" sample batch code');

// ── The central label itself must still exist as a visual example ─────
assert(centreLabel.includes('<circle cx="280" cy="280" r="94" fill="white" stroke="#4C9BB0" stroke-width="2"/>'),
  'the lifecycle centre mock label circle must still exist, unchanged in size/shape/styling');
assert(centreLabel.includes('SCENTED CANDLE'),
  'the lifecycle centre mock label must still show its example product type');
assert(centreLabel.includes('WARNING'),
  'the lifecycle centre mock label must still show its example signal word');

// ── Nine lifecycle stages preserved ────────────────────────────────────
for (let step = 1; step <= 9; step++) {
  const nodePattern = new RegExp('<g class="lc-node" data-step="' + step + '"');
  assert(nodePattern.test(lifecycle), `lifecycle diagram must still contain stage node ${step}`);
}
assert(!/data-step="10"/.test(lifecycle), 'lifecycle diagram must not have gained a tenth stage node');

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

console.log('lifecycle label-branding checks passed (centre mock label shows neutral "Your Business Name" / "Your Product Name" / "Batch: EXAMPLE-001" placeholders, no real Crafty Mouse Gifts / Summer Bloom / CMG-2026-001 branding remains in the lifecycle diagram, centre label circle and example content preserved, all nine lifecycle stages and their titles intact)');
