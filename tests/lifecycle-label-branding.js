// Regression coverage for the homepage "CLP label lifecycle" diagram's
// centre label. History: an earlier pass replaced the real Crafty Mouse
// Gifts sample label with neutral placeholder text; a later pass removed
// the centre label entirely, leaving the ring empty; a third pass
// restored a complete centre label by reusing the homepage background's
// existing "clp-tmpl-circle-candle" template (a hidden <symbol> in the
// page's pictogram sprite <svg>, also used for the floating decorative
// labels elsewhere on the homepage) via a local, business-name-sanitised
// copy of that symbol, referenced with <use> so the rendered label is the
// same design, not an invented approximation; this final pass enlarges
// that label by the approved +10% and removes the trailing whitespace the
// copied block had inherited from the source template (insignificant
// formatting only -- the structural comparison below is whitespace-
// tolerant so this cleanup doesn't require touching the source template).
// The nine lifecycle stage nodes, their arrows (checked here at their
// exact original coordinates), the orbit ring, and the tooltip/
// accessibility behaviour already covered by
// tests/lifecycle-reminder-accuracy.js and
// tests/lifecycle-tooltip-pin-interaction.js must be unaffected.
//
// Run from repo root: node tests/lifecycle-label-branding.js

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');

// Isolate the lifecycle diagram's <svg id="lc-svg"> so a stray match
// elsewhere on the homepage (or in the shared background-label sprite
// itself) can't hide a real problem in the diagram, or vice versa.
const lifecycleMatch = html.match(/<svg id="lc-svg"[\s\S]*?<\/svg>/);
assert(lifecycleMatch, 'could not locate the lifecycle diagram <svg id="lc-svg"> in index.html');
const lifecycle = lifecycleMatch[0];

// ── 1. A complete central label is present, referenced via <use> ──────
const centreSymbolMatch = lifecycle.match(/<symbol id="lc-centre-label" viewBox="0 0 260 260">([\s\S]*?)<\/symbol>/);
assert(centreSymbolMatch, 'the lifecycle diagram must define a local "lc-centre-label" symbol for the centre label');
const centreLabelInner = centreSymbolMatch[1];

const useMatch = lifecycle.match(/<use href="#lc-centre-label" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"\s*\/>/);
assert(useMatch, 'the lifecycle diagram must render the centre label via <use href="#lc-centre-label" .../>, not inline duplicate markup');
// The centre circle is cx=280 cy=280 r=94, i.e. its bounding box spans
// 186..374 (188 wide/tall). The label is sized at a +10% increase over
// that (94 * 1.10 = 103.4px radius, 206.8px square), confirmed safe
// because the nearest lifecycle element (stage node 1's circle edge) sits
// 182px from centre -- comfortably outside a 103.4px-radius label, with
// ~78.6px of clearance to spare. It must still be centred exactly on
// (280,280): x/y = 280 - 103.4 = 176.6.
const LABEL_RADIUS = 94 * 1.10; // 103.4
const LABEL_SIZE = LABEL_RADIUS * 2; // 206.8
const LABEL_POS = 280 - LABEL_RADIUS; // 176.6
assert.strictEqual(parseFloat(useMatch[1]), LABEL_POS, `centre label <use> x must keep it centred at the +10% size (${LABEL_POS} = 280 - ${LABEL_RADIUS})`);
assert.strictEqual(parseFloat(useMatch[2]), LABEL_POS, `centre label <use> y must keep it centred at the +10% size (${LABEL_POS} = 280 - ${LABEL_RADIUS})`);
assert.strictEqual(parseFloat(useMatch[3]), LABEL_SIZE, `centre label <use> width must be the approved +10% size (${LABEL_SIZE} = 2 x ${LABEL_RADIUS})`);
assert.strictEqual(parseFloat(useMatch[4]), LABEL_SIZE, `centre label <use> height must be the approved +10% size (${LABEL_SIZE} = 2 x ${LABEL_RADIUS})`);

// ── 2 & 3. It genuinely reuses the homepage background label design, ──
// not a sparse/invented approximation. Compare structurally against the
// real "clp-tmpl-circle-candle" template defined in the homepage's hidden
// pictogram sprite <svg> (also used for the floating decorative labels).
const originalMatch = html.match(/<symbol id="clp-tmpl-circle-candle" viewBox="0 0 260 260">([\s\S]*?)<\/symbol>/);
assert(originalMatch, 'could not locate the original "clp-tmpl-circle-candle" homepage background label template to compare against');
const originalInner = originalMatch[1];

// Normalise both copies the same way and require them to be identical --
// proving the centre label is a structural copy of the real template, not
// a rebuilt lookalike, while ignoring only the specifically approved
// differences:
//   - the id renames the centre-label copy needed to avoid duplicate-ID
//     collisions with the original template (clip-path id, scent-arc id)
//   - the one approved business-name substitution (real -> neutral)
//   - insignificant formatting (trailing whitespace on a line)
// Anything else -- a real change to the homepage template's shape, border,
// typography, spacing, pictograms or layout -- will still make this
// comparison fail until the lifecycle copy is updated to match, which is
// the point: this test is meant to catch exactly that drift.
function normalise(svg) {
  return svg
    .replace(/lc-centre-label-clip/g, 'LOCAL_CLIP_ID')
    .replace(/circle-candle-lc/g, 'LOCAL_CLIP_ID')
    .replace(/lc-centre-label-scentArc/g, 'LOCAL_ARC_ID')
    .replace(/circle-candle-scentArc/g, 'LOCAL_ARC_ID')
    .replace(/Your Business Name/g, 'BIZ_NAME')
    .replace(/Crafty Mouse Gifts/g, 'BIZ_NAME')
    .split('\n').map((line) => line.replace(/[ \t]+$/, '')).join('\n');
}
assert.strictEqual(normalise(centreLabelInner), normalise(originalInner),
  'the lifecycle centre label must be a structurally exact copy of the homepage "clp-tmpl-circle-candle" template (same shape, border, typography, spacing, pictograms and layout), not an invented approximation -- if the homepage template\'s design changes, this test should fail until the lifecycle copy is updated to match');

// A "sparse" text-only placeholder would have none of a real label's
// pictogram references or hazard-statement text -- require both, so a
// regression back to a bare "YOUR CLP LABEL" text box would fail loudly.
const pictogramUseCount = (centreLabelInner.match(/<use href="#asset-(ghs|bcf)-[a-z_]+"/g) || []).length;
assert.strictEqual(pictogramUseCount, 7,
  `centre label must reuse all 7 pictograms from the original template (2 GHS + 5 EN 15494 candle safety) -- found ${pictogramUseCount}`);
assert(centreLabelInner.includes('May cause an allergic skin reaction. Toxic to aquatic life with long lasting effects.'),
  'centre label must include the original template\'s full H-statement text, not a shortened placeholder');
assert(centreLabelInner.includes('Keep out of reach of children.'),
  'centre label must include the original template\'s full P-statement text, not a shortened placeholder');
assert(centreLabelInner.includes('SCENTED CANDLE'), 'centre label must show its example product type');
assert(centreLabelInner.includes('WARNING'), 'centre label must show its example signal word');
assert(centreLabelInner.includes('200g · Burn: 35hrs'), 'centre label must include the original template\'s footer text');

// ── 4. No real Crafty Mouse Gifts branding or product data ────────────
assert(!/Crafty Mouse Gifts/i.test(lifecycle), 'the lifecycle diagram must not contain "Crafty Mouse Gifts"');
assert(!lifecycle.includes('Summer Bloom'), 'the lifecycle diagram must not contain "Summer Bloom"');
assert(!lifecycle.includes('CMG-2026-001'), 'the lifecycle diagram must not contain "CMG-2026-001"');
assert(!lifecycle.includes('YOUR CLP LABEL'), 'the lifecycle diagram must not use a plain "YOUR CLP LABEL" text-only placeholder');
assert(centreLabelInner.includes('Your Business Name'),
  'centre label must show the neutral "Your Business Name" placeholder in place of the real business name');

// ── 5. Nine lifecycle stages and connecting arrows remain present, at ──
// their exact original coordinates (a centre-label resize must never
// nudge the surrounding ring).
const EXPECTED_NODES = {
  1: { cx: 280, cy: 70, r: 28 },
  2: { cx: 415, cy: 119, r: 26 },
  3: { cx: 487, cy: 244, r: 26 },
  4: { cx: 462, cy: 385, r: 26 },
  5: { cx: 352, cy: 477, r: 26 },
  6: { cx: 208, cy: 477, r: 26 },
  7: { cx: 98, cy: 385, r: 26 },
  8: { cx: 73, cy: 244, r: 26 },
  9: { cx: 145, cy: 119, r: 26 },
};
for (const [step, { cx, cy, r }] of Object.entries(EXPECTED_NODES)) {
  const nodeBlockMatch = lifecycle.match(new RegExp(`<g class="lc-node" data-step="${step}"[\\s\\S]*?<\\/g>`));
  assert(nodeBlockMatch, `lifecycle diagram must still contain stage node ${step}`);
  const circlePattern = new RegExp(`<circle cx="${cx}" cy="${cy}" r="${r}"`);
  assert(circlePattern.test(nodeBlockMatch[0]),
    `stage node ${step}'s circle must remain at its exact original coordinates (cx=${cx}, cy=${cy}, r=${r}) -- the centre label resize must not move the surrounding ring`);
}
assert(!/data-step="10"/.test(lifecycle), 'lifecycle diagram must not have gained a tenth stage node');

const EXPECTED_ARROWS = [
  [309, 81, 381, 107], [431, 146, 469, 212], [481, 274, 468, 350],
  [438, 405, 379, 454], [321, 477, 244, 477], [184, 457, 126, 408],
  [93, 355, 79, 279], [89, 217, 127, 150], [174, 109, 246, 82],
];
for (const [x1, y1, x2, y2] of EXPECTED_ARROWS) {
  const linePattern = new RegExp(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
  assert(linePattern.test(lifecycle), `connecting arrow (${x1},${y1})->(${x2},${y2}) must remain at its exact original coordinates`);
}
const arrowCount = (lifecycle.match(/marker-end="url\(#a-(teal|amber|green)\)"/g) || []).length;
assert.strictEqual(arrowCount, 9, `lifecycle diagram must still have exactly 9 connecting arrows (found ${arrowCount})`);
assert(lifecycle.includes('<circle cx="280" cy="280" r="210" fill="none" stroke="#E2EEF2" stroke-width="1.5" stroke-dasharray="5 4"/>'),
  'the lifecycle orbit ring must be unaffected by resizing the centre label');

// The resized label must still fit safely inside the ring without
// overlapping the nearest surrounding element. The nearest stage-node
// circle edge (step 1, directly above centre) sits at distance
// hypot(280-280, 70-280) - 28 = 182 from centre (280,280); the arrows
// never come closer to centre than that. The label's own radius must
// stay below that with a visible margin.
const nearestNodeEdgeDistance = 210 - 28; // hypot(0,210) - r(28)
assert(LABEL_RADIUS < nearestNodeEdgeDistance,
  `resized centre label (radius ${LABEL_RADIUS}) must stay clear of the nearest stage node's circle edge (${nearestNodeEdgeDistance}px from centre)`);

// ── 6. Existing lifecycle interactions unaffected ──────────────────────
// The tooltip markup/script this diagram relies on is untouched by this
// fix (only the centre-label markup changed); full interaction behaviour
// -- hover, click/tap pin, Escape, outside click, keyboard, mobile -- is
// exercised end-to-end by tests/lifecycle-tooltip-pin-interaction.js,
// which runs as part of the same test suite. Here we just confirm the
// tooltip scaffolding this fix must not have disturbed is still present.
// The tooltip <div> lives just outside the <svg> itself, so check the
// wider lifecycle section of the page rather than the lifecycle <svg>.
const lifecycleSectionMatch = html.match(/<div id="lifecycle"[\s\S]*?<svg id="lc-svg"/);
assert(lifecycleSectionMatch, 'could not locate the lifecycle section wrapper containing the tooltip markup');
const lifecycleSection = lifecycleSectionMatch[0];
assert(lifecycleSection.includes('id="lc-tip"'), 'lifecycle tooltip element must still be present');
assert(lifecycleSection.includes('id="lc-tip-step"') && lifecycleSection.includes('id="lc-tip-title"') && lifecycleSection.includes('id="lc-tip-desc"'),
  'lifecycle tooltip content elements must still be present');

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

console.log('lifecycle label-branding checks passed (centre label is a whitespace-tolerant but otherwise exact structural copy of the homepage "clp-tmpl-circle-candle" background template via <use>, sized at the approved +10% increase and still centred with a safe margin from the nearest stage node, showing the neutral "Your Business Name" placeholder with all 7 original pictograms and full hazard-statement text intact, no real Crafty Mouse Gifts / Summer Bloom / CMG-2026-001 branding present, no sparse text-only placeholder, all nine lifecycle stage node coordinates and all 9 arrow coordinates unchanged, orbit ring and tooltip scaffolding preserved)');
