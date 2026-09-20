// Regression coverage for the homepage "CLP label lifecycle" diagram's
// centre label (fix: restore lifecycle centre label from homepage
// template). History: an earlier pass replaced the real Crafty Mouse
// Gifts sample label with neutral placeholder text; a later pass removed
// the centre label entirely, leaving the ring empty; this final pass
// restores a complete centre label by reusing the homepage background's
// existing "clp-tmpl-circle-candle" template (a hidden <symbol> in the
// page's pictogram sprite <svg>, also used for the floating decorative
// labels elsewhere on the homepage) via a local, business-name-sanitised
// copy of that symbol, referenced with <use> so the rendered label is the
// same design, not an invented approximation. The nine lifecycle stage
// nodes, their arrows, the orbit ring, and the tooltip/accessibility
// behaviour already covered by tests/lifecycle-reminder-accuracy.js and
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
// The centre circle is cx=280 cy=280 r=94, i.e. it spans x/y 186..374 (188 wide/tall).
// The <use> must fit exactly inside that circle's bounding box -- not overflow it,
// not float off-centre inside it, and not be shrunk down to a token icon.
assert.strictEqual(parseFloat(useMatch[1]), 186, 'centre label <use> x must position it flush with the 94px-radius ring (186 = 280 - 94)');
assert.strictEqual(parseFloat(useMatch[2]), 186, 'centre label <use> y must position it flush with the 94px-radius ring (186 = 280 - 94)');
assert.strictEqual(parseFloat(useMatch[3]), 188, 'centre label <use> width must exactly fill the 94px-radius ring\'s bounding box (188 = 2 x 94)');
assert.strictEqual(parseFloat(useMatch[4]), 188, 'centre label <use> height must exactly fill the 94px-radius ring\'s bounding box (188 = 2 x 94)');

// ── 2 & 3. It genuinely reuses the homepage background label design, ──
// not a sparse/invented approximation. Compare structurally against the
// real "clp-tmpl-circle-candle" template defined in the homepage's hidden
// pictogram sprite <svg> (also used for the floating decorative labels).
const originalMatch = html.match(/<symbol id="clp-tmpl-circle-candle" viewBox="0 0 260 260">([\s\S]*?)<\/symbol>/);
assert(originalMatch, 'could not locate the original "clp-tmpl-circle-candle" homepage background label template to compare against');
const originalInner = originalMatch[1];

// Normalise both copies the same way (strip the id renames the centre-label
// copy needed to avoid duplicate-ID collisions with the original template,
// and the one intentional business-name substitution) and require them to
// be identical -- proving the centre label is an exact structural copy of
// the real template, not a rebuilt lookalike.
function normalise(svg) {
  return svg
    .replace(/lc-centre-label-clip/g, 'LOCAL_CLIP_ID')
    .replace(/circle-candle-lc/g, 'LOCAL_CLIP_ID')
    .replace(/lc-centre-label-scentArc/g, 'LOCAL_ARC_ID')
    .replace(/circle-candle-scentArc/g, 'LOCAL_ARC_ID')
    .replace(/Your Business Name/g, 'BIZ_NAME')
    .replace(/Crafty Mouse Gifts/g, 'BIZ_NAME');
}
assert.strictEqual(normalise(centreLabelInner), normalise(originalInner),
  'the lifecycle centre label must be a structurally exact copy of the homepage "clp-tmpl-circle-candle" template (same shape, border, typography, spacing, pictograms and layout), not an invented approximation');

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

// ── 5. Nine lifecycle stages and connecting arrows remain present ─────
for (let step = 1; step <= 9; step++) {
  const nodePattern = new RegExp('<g class="lc-node" data-step="' + step + '"');
  assert(nodePattern.test(lifecycle), `lifecycle diagram must still contain stage node ${step}`);
}
assert(!/data-step="10"/.test(lifecycle), 'lifecycle diagram must not have gained a tenth stage node');
const arrowCount = (lifecycle.match(/marker-end="url\(#a-(teal|amber|green)\)"/g) || []).length;
assert.strictEqual(arrowCount, 9, `lifecycle diagram must still have exactly 9 connecting arrows (found ${arrowCount})`);
assert(lifecycle.includes('<circle cx="280" cy="280" r="210" fill="none" stroke="#E2EEF2" stroke-width="1.5" stroke-dasharray="5 4"/>'),
  'the lifecycle orbit ring must be unaffected by restoring the centre label');

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

console.log('lifecycle label-branding checks passed (centre label restored as an exact structural copy of the homepage "clp-tmpl-circle-candle" background template via <use>, fitted exactly inside the 94px-radius ring, showing the neutral "Your Business Name" placeholder with all 7 original pictograms and full hazard-statement text intact, no real Crafty Mouse Gifts / Summer Bloom / CMG-2026-001 branding present, no sparse text-only placeholder, all nine lifecycle stages / 9 arrows / orbit ring / tooltip scaffolding preserved)');
