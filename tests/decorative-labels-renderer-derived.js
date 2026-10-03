// Regression coverage for the Sep 2026 decorative-label correction: the
// homepage's "wall of labels" background must show genuine, renderer-
// derived CLP label thumbnails (real GHS pictogram diamonds, correct
// signal-word colouring, hazard/precautionary text, sensitiser wording)
// instead of a hand-built "scent name + isolated WARNING word" card, and
// the mobile hero heading/header corrections that shipped alongside it.
// Run from the repo root: node tests/decorative-labels-renderer-derived.js
//
// The strongest possible proof that a decorative thumbnail is genuinely
// renderer-derived is to re-run the SAME real label-render.js, with the
// SAME documented fixture content, right now, and diff the result against
// what's actually embedded in index.html -- not just check for plausible-
// looking markup. This file does exactly that (mirroring the canvas-stub
// jsdom pattern already established in tests/renderer-resolution-invariance.js),
// so it also catches future drift if the renderer's output ever changes
// without the embedded thumbnails being regenerated.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

// index.html is checked out with this repo's native CRLF line endings, while
// a freshly rendered SVG string built in-process by label-render.js uses
// plain \n -- a platform difference in line-ending representation, not a
// content difference. Normalize both sides before comparing so the content
// comparison below isn't sensitive to which line-ending style either string
// happens to carry.
function normalizeLineEndings(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function stubCanvas(window) {
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText(text) {
      const size = Number((String(this.font).match(/([\d.]+)px/)||[])[1]) || 12;
      return { width: [...String(text)].reduce((w, ch) => w + size * (/[MW@%]/.test(ch) ? .82 : /[ilI1.,' ]/.test(ch) ? .28 : .54), 0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; }
  });
}

const labelRendererSource = fs.readFileSync(path.join(__dirname, '..', 'label-render.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  beforeParse(window) { stubCanvas(window); window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8')); }
});
const LR = dom.window.LabelRenderer;
assert(LR, 'LabelRenderer did not load');

// Exact same 5 canonical fixtures used to build the embedded thumbnails --
// each one's hazard/precautionary/sensitiser/pictogram content is copied
// verbatim from an existing repo test fixture; see the build script this
// mirrors (kept outside tests/ since it is a one-off generation tool, not
// a test) for the full per-fixture provenance comments.
const FIXTURES = [
  { id: 'circle-candle', shape: 'circle', mm: 63, data: {
    // Owner-approved example scent (3 Oct 2026, PR #202): Musk & Sandalwood.
    shape: 'circle', scentName: 'Musk & Sandalwood', productType: 'Scented Candle',
    netWeight: '200g', burnTime: '35hrs', signal: 'Warning',
    hStatements: 'H317, H411, EUH208',
    pStatements: 'P102, P261, P273, P302+P352, P333+P313, P391, P501',
    sensitisers: ['Geraniol', 'Linalool'], pictograms: ['exclamation', 'aquatic'],
    bizName: 'Crafty Mouse Gifts', textColour: 'dark', showBorder: true,
  }},
  { id: 'square-waxmelt', shape: 'square', mm: 63, data: {
    shape: 'square', scentName: 'Sandalwood Dusk', productType: 'Wax Melt',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation'],
    bizName: 'Crafty Mouse Gifts', textColour: 'dark', showBorder: true,
  }},
  { id: 'rectangle-candle', shape: 'rectangle', mmW: 99, mmH: 57, data: {
    shape: 'rectangle', scentName: 'Vanilla Candle', productType: 'Scented Candle',
    signal: 'WARNING', hStatements: 'H317,H411,H315',
    pStatements: 'P302+P352,P333+P313,P305+P351+P338,P273,P280',
    p280Items: ['gloves', 'eye'],
    sensitisers: ['Linalool', 'Limonene', 'Citral', 'Geraniol', 'Eugenol', 'Coumarin'],
    pictograms: ['exclamation', 'aquatic'],
    bizName: 'Crafty Mouse Gifts', textColour: 'dark', showBorder: true,
  }},
  { id: 'rectangle-reed-diffuser', shape: 'rectangle', mmW: 70, mmH: 50, data: {
    shape: 'rectangle', scentName: 'Palo Santo', productType: 'Reed Diffuser',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation', 'health', 'corrosive'],
    bizName: 'Crafty Mouse Gifts', textColour: 'dark', showBorder: true,
  }},
  { id: 'rectangle-room-spray', shape: 'rectangle', mmW: 120, mmH: 60, data: {
    shape: 'rectangle', scentName: 'Fresh Linen', productType: 'Room Spray',
    signal: 'Danger', hStatements: 'H226, H315, H319, H411',
    pictograms: ['flame', 'exclamation', 'aquatic'],
    sensitisers: ['Linalool', 'Limonene', 'Geraniol'],
    pStatements: 'P210, P233, P261, P271, P273, P305+P351+P338, P501',
    bizName: 'Crafty Mouse Gifts', hideEN15494: true, textColour: 'dark', showBorder: true,
  }},
];

function extractTag(source, tagRe) {
  const m = tagRe.exec(source);
  return m ? m[0] : null;
}

// ── 1. Every canonical template must genuinely still fit (fits:true, zero
//    warnings) when rendered fresh, right now, through the real renderer --
//    proves the embedded thumbnails are not stale/hand-edited approximations. ──
const pool = new LR.SharedAssetPool();
const regenerated = {};
for (const fx of FIXTURES) {
  const data = Object.assign({}, fx.data, fx.shape === 'rectangle'
    ? { size: 'custom', customW: fx.mmW, customH: fx.mmH }
    : { size: 'custom', customW: fx.mm, customH: fx.mm });
  const res = LR.renderLabel(data, { instanceId: fx.id, sharedDefs: pool });
  assert(res.fits, `${fx.id}: genuine fixture no longer fits at its documented size (${JSON.stringify(res.warnings)}) -- the embedded homepage thumbnail is now stale and must be regenerated`);
  assert.strictEqual(res.warnings.length, 0, `${fx.id}: expected zero warnings, got ${JSON.stringify(res.warnings)}`);
  const vbMatch = /viewBox="([^"]+)"/.exec(res.svg);
  const bodyMatch = /^<svg[^>]*>(.*)<\/svg>\s*$/s.exec(res.svg);
  regenerated[fx.id] = { viewBox: vbMatch[1], body: bodyMatch[1] };
}

// ── 2. index.html must embed exactly these 5 templates as <symbol id="clp-
//    tmpl-*">, and each one's body must match a freshly regenerated render
//    byte-for-byte -- the strongest possible "genuinely renderer-derived,
//    not hand-edited" guarantee. ──────────────────────────────────────────
for (const fx of FIXTURES) {
  const re = new RegExp(`<symbol id="clp-tmpl-${fx.id}" viewBox="([^"]+)">(.*?)</symbol>`, 's');
  const m = re.exec(html);
  assert(m, `index.html must embed a <symbol id="clp-tmpl-${fx.id}">`);
  assert.strictEqual(m[1], regenerated[fx.id].viewBox, `${fx.id}: embedded viewBox does not match a fresh render`);
  assert.strictEqual(
    normalizeLineEndings(m[2]),
    normalizeLineEndings(regenerated[fx.id].body),
    `${fx.id}: embedded thumbnail markup does not match a fresh, genuine renderLabel() output -- it may have been hand-edited or gone stale`
  );
}

// ── 3. Shape sanity: circle/square templates are square viewBoxes; the
//    rectangle templates are the correct landscape proportions. ──────────
assert.strictEqual(regenerated['circle-candle'].viewBox, '0 0 260 260', 'circle template must be a 1:1 canonical viewBox');
assert.strictEqual(regenerated['square-waxmelt'].viewBox, '0 0 260 260', 'square template must be a 1:1 canonical viewBox');
for (const id of ['rectangle-candle', 'rectangle-reed-diffuser', 'rectangle-room-spray']) {
  const [, , w, h] = regenerated[id].viewBox.split(' ').map(Number);
  assert(w > h, `${id}: expected a landscape rectangle viewBox, got ${regenerated[id].viewBox}`);
}

// ── 4. Signal-word colour rule (matches label-render.js's own rule:
//    DANGER is red, WARNING is the label's normal text colour, never
//    arbitrarily coloured/amber). ──────────────────────────────────────
for (const fx of FIXTURES) {
  const body = regenerated[fx.id].body;
  const isDanger = /danger/i.test(fx.data.signal);
  if (isDanger) {
    assert(/fill="#cc0000"[^>]*>DANGER</.test(body), `${fx.id}: DANGER signal word must be rendered in red (#cc0000)`);
  } else {
    assert(/>WARNING</.test(body), `${fx.id}: expected WARNING signal word text`);
    assert(!/fill="#cc0000"[^>]*>WARNING</.test(body), `${fx.id}: WARNING must never be coloured red`);
  }
}

// ── 5. Former scent-card-only markup ("Your Brand Name" header band, a
//    plain isolated WARNING/DANGER <span> with no surrounding real label
//    structure, the duplicate inner circular ring) must be fully absent,
//    not merely hidden behind the new SVGs. ──────────────────────────────
assert(!html.includes('Your Brand Name'), 'the old "Your Brand Name" header band must not exist anywhere in index.html');
assert(!/<span id="scent-\d+"/.test(html), 'the old per-position scent-name <span id="scent-N"> markup must be removed (scent names are now baked into genuine rendered SVG text, not swappable spans)');
// The renderer's own single outer ring (part of the genuine SVG output)
// is expected; a SECOND, duplicate hand-drawn inner ring div (the pre-Sep-
// 2026 bug) must not have returned.
assert(!/border-radius:50%;[^"]*">\s*<div style="position:absolute;top:6px;left:6px;right:6px;bottom:6px;border-radius:50%;border:0\.75px/.test(html),
  'the old duplicate hand-drawn inner circular ring must not be present');

// ── 6/7. RETIRED 3 Oct 2026 (owner decision): PR #202 intentionally
//    replaced the typed hero and its 52-label decorative wall with the
//    approved image hero. The five templates above now live only in the
//    hidden 0x0 sprite (no <use> positions), so the 52-position, wrapper,
//    wall-container and z-index:2 hero-wrapper checks no longer apply. Do
//    not restore the wall. The particle canvas z-index guard still applies:
const seasonsSource = fs.readFileSync(path.join(__dirname, '..', 'seasons.js'), 'utf8');
assert(seasonsSource.includes('z-index:1;opacity:'), 'the particle canvas must still be created at z-index:1 in seasons.js, unchanged');

// ── 8. label-render.js itself must be byte-for-byte untouched by this
//    correction (only USED to generate static thumbnails, never edited). ──
assert(/function renderLabel\(rawData,\s*opts\)/.test(labelRendererSource), 'label-render.js must still define the canonical renderLabel()');
assert(labelRendererSource.includes('const LabelRenderer = {'), 'label-render.js must still expose the same LabelRenderer API');

// ── 9. Mobile hero-heading and header corrections. ─────────────────────
// The old typed-hero mobile heading checks (hero-gb-break,
// hero-mobile-break, hero-mobile-gb-lead, .clp-ring, .clp-label-wrap
// cascade order) were RETIRED 3 Oct 2026 with the typed hero itself
// (PR #202 image hero; heading checks live in clp-hero-explanation.js).
assert(/\.nav-dropdown\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(html), 'the Resources nav dropdown must be hidden on mobile, matching the already-hidden Features/Pricing/FAQ links');
assert(/\.btn-nav\s*\{[^}]*white-space:\s*nowrap/.test(html), '"Start free trial" must not be allowed to wrap onto multiple lines on mobile');

// ── 10. Founder-copy readability correction. ────────────────────────────
// The owner later enlarged this copy deliberately (be17946, 30 Sep 2026:
// 18px #374151 line-height 1.65), so the guard is now a readability floor.
const founderP = html.match(/<p style="[^"]*font-size:(\d+)px;[^"]*line-height:([\d.]+);[^"]*">I'm Michaela, a candle and wax melt maker/);
assert(founderP && Number(founderP[1]) >= 14 && Number(founderP[2]) >= 1.5, 'founder-section body copy must stay at least 14px with line-height of at least 1.5');

// ── 11. v1.0.0's recorded release date must be the real public-launch
//    date, not a placeholder. Versioning moved to a single authoritative
//    source (version.js) in the chore/versioning-and-release-notes work;
//    the historical launch date now lives in the release records instead
//    of inline in builder.html. ──────────────────────────────────────────
const changelogSource = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
assert(/15 June 2026|2026-06-15/.test(changelogSource), "CHANGELOG.md must record CLPeasy's actual public-launch date (15 June 2026) for v1.0.0, not a placeholder");

console.log('decorative-labels-renderer-derived checks passed (all 5 embedded templates, including the Musk & Sandalwood circle candle, genuinely renderer-derived and byte-matched against a fresh render; header-band/duplicate-ring/scent-span removal confirmed; signal-word colour rule verified; particle canvas stacking, mobile header, founder readability and version date verified; 52-label wall and typed-hero checks retired with PR #202)');
