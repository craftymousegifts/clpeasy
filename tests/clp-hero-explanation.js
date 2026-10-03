// Regression coverage for the homepage hero's CLP heading and the removed
// obstructive CLP tooltip, updated for the approved PR #202 image hero
// (2 Oct 2026).
//
// History: the hero <h1> once carried a decorative CLP ring/stamp with an
// onclick that pinned a black ".clp-tip-text" overlay ("Classification,
// Labelling & Packaging") over the headline with no close control. That was
// removed in Sep 2026. PR #202 then replaced the typed hero with an approved
// artwork banner (assets/CLPeasy Home page.png): the visible headline is now
// part of the artwork, and the page keeps ONE real <h1> -- visually hidden but
// still read by screen readers and search engines -- plus a descriptive alt
// text and an accessible free-trial hotspot over the artwork's button.
//
// This test therefore checks:
//  1. the obstructive tooltip can never come back (no tip-open / clp-tip-text /
//     "&amp; Packaging" title text, no onclick in the hero);
//  2. exactly one <h1>, with the exact approved heading text, inside the
//     image hero, hidden only visually (clip technique) -- never display:none,
//     visibility:hidden or aria-hidden, which would remove it for assistive tech;
//  3. the heading contains no button / role=button / tabindex / onclick;
//  4. the hero artwork has a meaningful alt text describing CLP labels and the
//     product types;
//  5. the hero free-trial hotspot is a real link to sign-up with an
//     accessible name (it has no visible text of its own).
//
// Run from the repo root: node tests/clp-hero-explanation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const HERO_H1_TEXT = 'Create print-ready GB CLP labels in minutes';
const html = fs.readFileSync('index.html', 'utf8');
const document = new JSDOM(html).window.document;

// ── 1. The obstructive tooltip cannot return ───────────────────────────
assert(!html.includes('tip-open'), 'no "tip-open" class, selector or reference may remain anywhere in index.html');
assert(!html.includes('clp-tip-text'), 'the .clp-tip-text tooltip element and its CSS must not exist');
assert(!html.includes('Classification, Labelling &amp; Packaging'), 'the old tooltip text (with an ampersand) must not exist');
assert(!html.includes('title="Classification, Labelling'), 'the CLP explanation must never rely on a title attribute tooltip');

// ── 2. One real, accessible heading inside the image hero ─────────────
const h1s = document.querySelectorAll('h1');
assert.strictEqual(h1s.length, 1, `the homepage must have exactly one <h1> (found ${h1s.length})`);
const h1 = h1s[0];
assert.strictEqual(h1.textContent.replace(/\s+/g, ' ').trim(), HERO_H1_TEXT, 'the hero <h1> must carry the exact approved heading text');
const hero = document.querySelector('section.homepage-image-hero');
assert(hero, 'the approved image hero section must exist');
assert(hero.contains(h1), 'the <h1> must sit inside the image hero');
assert.strictEqual(hero.getAttribute('aria-labelledby'), h1.id, 'the hero section must be labelled by its heading');
const h1Style = (h1.getAttribute('style') || '').replace(/\s+/g, '');
assert(/clip:rect\(0,0,0,0\)/.test(h1Style) && /position:absolute/.test(h1Style), 'the heading is hidden visually with the clip technique (the artwork shows the headline)');
assert(!/display:none|visibility:hidden/.test(h1Style), 'the heading must not be display:none or visibility:hidden (that would hide it from screen readers)');
assert.strictEqual(h1.getAttribute('aria-hidden'), null, 'the heading must not be aria-hidden');

// ── 3. Nothing interactive inside the heading ─────────────────────────
assert.strictEqual(h1.querySelector('button, [role="button"], [onclick], [tabindex]'), null, 'no button, role=button, onclick or tabindex inside the h1');
assert.strictEqual(h1.getAttribute('onclick'), null, 'the h1 has no onclick');
assert.strictEqual(hero.querySelector('[onclick*="tip"]'), null, 'no tooltip toggle anywhere in the hero');

// ── 4. Meaningful artwork alt text ────────────────────────────────────
const art = hero.querySelector('img[src*="CLPeasy"]');
assert(art, 'the approved hero artwork image must be present');
const alt = art.getAttribute('alt') || '';
assert(/CLP labels/.test(alt), 'the hero artwork alt text must say what the page offers (CLP labels)');
assert(/candles/.test(alt) && /wax melts/.test(alt) && /reed diffusers/.test(alt) && /room sprays/.test(alt), 'the alt text must name the supported product types');

// ── 5. Accessible free-trial hotspot over the artwork button ──────────
const cta = hero.querySelector('.homepage-hero-banner a[href]');
assert(cta, 'the hero must have a link over the artwork free-trial button');
assert(/(^|\/)auth(\.html)?\?mode=signup$/.test(cta.getAttribute('href')), 'the hero hotspot must open sign-up');
assert.strictEqual(cta.getAttribute('aria-label'), 'Start your 14-day free trial', 'the textless hotspot must have an accessible name');

console.log('CLP hero heading checks passed (no tooltip can return; one accessible visually-hidden h1 with the exact heading inside the image hero; meaningful artwork alt text; accessible sign-up hotspot)');
