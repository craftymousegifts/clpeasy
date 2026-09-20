// Regression coverage for the Sep 2026 fix that replaces the obstructive CLP
// tooltip in the homepage hero.
//
// Bug: the decorative CLP ring/stamp inside the hero <h1> had
// onclick="this.classList.toggle('tip-open')" -- clicking it pinned a black
// ".clp-tip-text" overlay reading "Classification, Labelling & Packaging"
// with no close control, covering part of the headline until clicked again.
//
// Fix: the onclick handler, the .tip-open pinned-overlay behaviour, and the
// .clp-tip-text element/CSS are all removed. The ring keeps only its
// existing decorative :hover spin animation (no click/tap state at all,
// since there is no script left to toggle anything). A plain, always-
// visible, always-readable sentence -- "CLP means Classification, Labelling
// and Packaging." -- sits directly under the headline instead, using "and"
// (not an ampersand), outside the <h1>, never as a title attribute, never
// as a button.
//
// Run from the repo root: node tests/clp-hero-explanation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const HELPER_SENTENCE = 'CLP means Classification, Labelling and Packaging.';
const HERO_H1_TEXT = 'Create print-ready GB CLP labels in minutes';

const html = fs.readFileSync('index.html', 'utf8');

// ── 1. .clp-label-wrap has no inline onclick handler ───────────────────
const wrapOpenTagMatch = html.match(/<span class="clp-label-wrap"[^>]*>/);
assert(wrapOpenTagMatch, 'the .clp-label-wrap span must still exist in the hero');
assert(!/onclick/i.test(wrapOpenTagMatch[0]),
  `.clp-label-wrap must not carry an inline onclick handler -- found: ${wrapOpenTagMatch[0]}`);

// ── 2. No tip-open interaction/behaviour remains anywhere on the page ──
assert(!html.includes('tip-open'), 'no "tip-open" class, selector or reference may remain anywhere in index.html');

// ── 3. The black .clp-tip-text overlay element/CSS is gone ─────────────
assert(!html.includes('clp-tip-text'), 'the .clp-tip-text element and its CSS must be removed from index.html');
assert(!html.includes('Classification, Labelling &amp; Packaging'),
  'the old ampersand-worded pinned-tooltip copy must not remain anywhere on the page');

// ── Decorative ring: pointer cursor removed, hover-spin kept, but never
//    tied to any click/tap ("tip-open") state ──────────────────────────
const wrapRuleMatch = html.match(/\.clp-label-wrap\{[^}]*\}/);
assert(wrapRuleMatch, 'the .clp-label-wrap base CSS rule must still exist');
assert(!/cursor\s*:\s*pointer/.test(wrapRuleMatch[0]),
  `.clp-label-wrap must no longer show a pointer cursor (it is not interactive) -- rule was: ${wrapRuleMatch[0]}`);
assert(html.includes(".clp-label-wrap:hover .clp-ring{animation:clp-spin"),
  'the CLP ring may still spin decoratively on hover');

// ── 4. The exact helper sentence appears exactly once ───────────────────
const escaped = HELPER_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const helperMatches = html.match(new RegExp(escaped, 'g')) || [];
assert.strictEqual(helperMatches.length, 1,
  `the exact sentence "${HELPER_SENTENCE}" must appear exactly once in index.html, found ${helperMatches.length}`);

// ── Real-DOM checks (structure, accessible text, focus, event handling) ──
const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' });
const document = dom.window.document;

const h1 = document.querySelector('h1');
assert(h1, 'the hero <h1> must exist');

// ── 6. The h1's accessible text is unchanged ────────────────────────────
const h1Text = h1.textContent.replace(/\s+/g, ' ').trim();
assert.strictEqual(h1Text, HERO_H1_TEXT,
  `the h1's accessible text must remain exactly "${HERO_H1_TEXT}", got "${h1Text}"`);

// ── 5. The helper sentence lives OUTSIDE the h1, as its own element ─────
assert(!h1.textContent.includes('CLP means'),
  'the helper sentence must not be placed inside the <h1> (it must not alter the headline\'s accessible reading order)');
const helperEl = Array.from(document.querySelectorAll('body *')).find(
  el => el.children.length === 0 && el.textContent.trim() === HELPER_SENTENCE
);
assert(helperEl, 'the helper sentence must exist as its own element in the document');
assert(!h1.contains(helperEl), 'the helper element must not be a descendant of the h1');
assert.notStrictEqual(helperEl.tagName, 'TITLE', 'the helper text must not rely on a <title> element');

// Must not be delivered only via a title="" attribute anywhere either.
assert(!html.includes('title="Classification, Labelling'),
  'the CLP explanation must not be delivered only via a title="" attribute');

const wrap = document.querySelector('.clp-label-wrap');
assert(wrap, 'the .clp-label-wrap decorative stamp must still exist inside the h1');
assert(h1.contains(wrap), 'the decorative CLP stamp must remain inside the h1, as part of the headline');

// ── 7. The decorative stamp is not exposed as a clickable button ────────
assert.notStrictEqual(wrap.tagName, 'BUTTON', 'the CLP stamp wrapper must not be a <button>');
assert.strictEqual(wrap.getAttribute('role'), null, 'the CLP stamp wrapper must not carry role="button"');
assert.strictEqual(wrap.getAttribute('onclick'), null, 'the CLP stamp wrapper must have no onclick attribute (confirmed via the live DOM, not just source text)');
assert.strictEqual(h1.querySelector('button'), null, 'no <button> element may exist inside the h1');
assert.strictEqual(h1.querySelector('[role="button"]'), null, 'no element with role="button" may exist inside the h1');

// ── 8. The decorative stamp does not receive unnecessary keyboard focus ──
assert.strictEqual(wrap.getAttribute('tabindex'), null, 'the CLP stamp wrapper must not have a tabindex (it must not be keyboard-focusable)');
const svgRing = wrap.querySelector('svg.clp-ring');
assert(svgRing, 'the decorative ring SVG must still exist');
assert.strictEqual(svgRing.getAttribute('tabindex'), null, 'the decorative ring SVG must not have a tabindex');
assert.strictEqual(svgRing.getAttribute('aria-hidden'), 'true', 'the decorative ring SVG must remain aria-hidden');

// ── 9. Hovering/clicking the stamp can never produce a persistent overlay ──
// Real DOM events dispatched on the real element -- not a manual function
// call -- proving there is no script left anywhere that could react to
// either event, since runScripts is "outside-only" (index.html's own
// inline scripts are never executed, matching the fact that none of them
// reference .clp-label-wrap any more per the source checks above).
assert.strictEqual(document.querySelector('.clp-tip-text'), null, 'no .clp-tip-text overlay may exist before interaction');
wrap.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
wrap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
wrap.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); // a second click (the old toggle's "off" state) too
assert.strictEqual(document.querySelector('.clp-tip-text'), null, 'no .clp-tip-text overlay may appear after hovering/clicking the stamp');
assert.strictEqual(wrap.classList.contains('tip-open'), false, 'clicking the stamp must never add a "tip-open" class -- there is no script left to do so');

// ── 10. Existing desktop and mobile headline wrapping is preserved ──────
const heroMatch = html.match(/<h1>Create <em>print-ready<\/em><br class="hero-mobile-gb-lead"> GB<br class="hero-gb-break">[\s\S]{0,800}?labels<br class="hero-mobile-break"> in minutes<\/h1>/);
assert(heroMatch, 'the hero <h1> must retain its exact desktop/mobile line-break markup (hero-mobile-gb-lead / hero-gb-break / hero-mobile-break) -- this fix must not disturb the existing responsive headline wrapping');

console.log('CLP hero explanation checks passed (no onclick/tip-open/clp-tip-text remain; pointer cursor removed while the decorative hover-spin is kept; the exact helper sentence "CLP means Classification, Labelling and Packaging." appears exactly once, outside the h1; the h1\'s accessible text and its responsive line-break markup are unchanged; the stamp is not a button, carries no role or tabindex, and real hover/click DOM events on it can never produce a persistent overlay)');
