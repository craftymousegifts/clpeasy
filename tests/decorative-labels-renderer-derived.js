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
  beforeParse(window) { stubCanvas(window); window.eval(labelRendererSource); }
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
    shape: 'circle', scentName: 'Vanilla', productType: 'Scented Candle',
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

// ── 6. Decorative SVGs must be non-interactive and correctly wired to the
//    shared symbol pool -- exactly 52 label positions, each referencing
//    one of the 5 templates via <use>, none able to receive pointer events. ──
const useMatches = [...html.matchAll(/<use href="#clp-tmpl-([a-z-]+)"\/>/g)];
assert.strictEqual(useMatches.length, 52, `expected 52 decorative label positions referencing a template, found ${useMatches.length}`);
const templateCounts = {};
for (const m of useMatches) templateCounts[m[1]] = (templateCounts[m[1]] || 0) + 1;
assert.strictEqual(templateCounts['circle-candle'], 32, `expected all 32 circle positions to use circle-candle, got ${templateCounts['circle-candle']}`);
assert.strictEqual(templateCounts['square-waxmelt'], 6, `expected all 6 square positions to use square-waxmelt, got ${templateCounts['square-waxmelt']}`);
const rectTotal = (templateCounts['rectangle-candle'] || 0) + (templateCounts['rectangle-reed-diffuser'] || 0) + (templateCounts['rectangle-room-spray'] || 0);
assert.strictEqual(rectTotal, 14, `expected all 14 rectangle positions to use one of the 3 rectangle templates, got ${rectTotal}`);
// Every decorative <svg> must declare pointer-events:none of its own, on
// top of the wall container's existing pointer-events:none.
const decorativeSvgs = [...html.matchAll(/<svg viewBox="0 0 260 \d+" width="100%" height="100%"[^>]*>/g)];
assert.strictEqual(decorativeSvgs.length, 52, `expected 52 decorative <svg> wrappers, found ${decorativeSvgs.length}`);
for (const m of decorativeSvgs) {
  assert(/pointer-events:none/.test(m[0]), `a decorative label <svg> is missing pointer-events:none: ${m[0]}`);
}
assert(/Seasonal CLP labels[\s\S]{0,60}<div style="position:absolute;inset:0;z-index:0;pointer-events:none;/.test(html),
  'the decorative wall container itself must still declare pointer-events:none');

// ── 7. Hero content must still stack above both the particle canvas and
//    the decorative label wall (unchanged from the previous correction --
//    guards against a future edit accidentally undoing it). ──────────────
assert(/<div style="position:relative;z-index:2;">/.test(html), 'hero content wrapper must still be z-index:2 (above the particle canvas)');
const seasonsSource = fs.readFileSync(path.join(__dirname, '..', 'seasons.js'), 'utf8');
assert(seasonsSource.includes('z-index:1;opacity:'), 'the particle canvas must still be created at z-index:1 in seasons.js, unchanged');

// ── 8. label-render.js itself must be byte-for-byte untouched by this
//    correction (only USED to generate static thumbnails, never edited). ──
assert(/function renderLabel\(rawData,\s*opts\)/.test(labelRendererSource), 'label-render.js must still define the canonical renderLabel()');
assert(labelRendererSource.includes('const LabelRenderer = {'), 'label-render.js must still expose the same LabelRenderer API');

// ── 9. Mobile hero-heading and header corrections. ─────────────────────
assert(html.includes('class="hero-gb-break"'), 'the desktop line break after "GB" must be taggable so it can be hidden on mobile only');
assert(/\.hero-gb-break\s*\{\s*display:\s*none;?\s*\}/.test(html), 'the "GB" break must be hidden on mobile (so "GB" does not sit alone on its own line)');
assert(html.includes('class="hero-mobile-break"'), 'a mobile-only break must exist to separate "labels" from "in minutes"');
assert(/\.hero-mobile-break\s*\{\s*display:\s*none;?\s*\}/.test(html), 'the mobile-only break must be hidden by default (desktop/tablet unaffected)');
assert(/\.hero-mobile-break\s*\{\s*display:\s*initial;?\s*\}/.test(html), 'the mobile-only break must be shown inside the mobile media query');
// A mobile-only break before "GB" itself is also required: with only the
// break AFTER "GB" hidden, "GB" merges with "Create print-ready" instead
// (verified to actually happen in a live render before this was added --
// see homepage-hero-rewrite.js's heroMatch for the exact required markup
// order). This break must land BEFORE " GB" in the <h1>, not after it.
assert(html.includes('class="hero-mobile-gb-lead"'), 'a mobile-only break must exist before "GB" so it pairs with "CLP labels" instead of "Create print-ready"');
assert(/\.hero-mobile-gb-lead\s*\{\s*display:\s*none;?\s*\}/.test(html), 'the GB-lead break must be hidden by default (desktop/tablet unaffected)');
assert(/\.hero-mobile-gb-lead\s*\{\s*display:\s*initial;?\s*\}/.test(html), 'the GB-lead break must be shown inside the mobile media query');
assert(/<em>print-ready<\/em><br class="hero-mobile-gb-lead"> GB/.test(html), 'the GB-lead break must sit between "print-ready" and "GB" in the heading markup');
assert(/\.clp-ring\s*\{\s*display:\s*none;?\s*\}/.test(html), 'the decorative CLP ring stamp must be hidden on mobile so it does not interrupt the headline');
// Cascade-order regression guard: the hero's own inline <style> tag (which
// unconditionally redefines .clp-label-wrap{display:inline-flex;...} for
// the desktop tooltip/spin behaviour) must appear BEFORE the mobile
// override that collapses it to plain inline text -- otherwise, at equal
// selector specificity, the later unconditional rule silently wins on
// every viewport and the mobile collapse never applies (this exact bug
// was hit and fixed once already for .hero-mobile-break; the same
// source-order requirement applies here for a different selector).
const unconditionalWrapIdx = html.indexOf('.clp-label-wrap{position:relative;display:inline-flex;');
const mobileWrapOverrideIdx = html.indexOf('.clp-label-wrap { width: auto; height: auto; display: inline; }');
assert(unconditionalWrapIdx !== -1 && mobileWrapOverrideIdx !== -1 && mobileWrapOverrideIdx > unconditionalWrapIdx,
  'the mobile .clp-label-wrap collapse override must be placed AFTER the hero\'s unconditional .clp-label-wrap definition in source order, or it will never win the cascade on mobile');
assert(/\.nav-dropdown\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(html), 'the Resources nav dropdown must be hidden on mobile, matching the already-hidden Features/Pricing/FAQ links');
assert(/\.btn-nav\s*\{[^}]*white-space:\s*nowrap/.test(html), '"Start free trial" must not be allowed to wrap onto multiple lines on mobile');

// ── 10. Founder-copy readability correction. ────────────────────────────
assert(html.includes('font-size:14px;color:#4B5563;line-height:1.7;'), 'founder-section body copy must be 14px, #4B5563, line-height 1.7');

// ── 11. Version 1.0's recorded release date must be the real public-
//    launch date, not a placeholder. ────────────────────────────────────
const builderSource = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');
assert(builderSource.includes("released:'15/06/2026'"), "APP_VERSION.released must be CLPeasy's actual public-launch date (15/06/2026)");

console.log(`decorative-labels-renderer-derived checks passed (${useMatches.length} decorative labels genuinely renderer-derived and byte-matched against a fresh render; header-band/duplicate-ring/scent-span removal confirmed; signal-word colour rule verified; pointer-events:none on every decorative svg; hero stacking, mobile heading/header, founder readability and version date all verified)`);
