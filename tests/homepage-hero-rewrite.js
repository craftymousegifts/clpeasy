// Regression coverage for the homepage hero rewrite (Sep 2026): a new
// heading/product-explanation aimed at ~3-second product clarity, a
// smaller/secondary founder section beneath it, the particle-over-text
// stacking fix, and removal of the "Your Brand Name" header band from the
// decorative background labels. Run from repo root: node tests/homepage-hero-rewrite.js
//
// These are static string checks against the committed source (index.html,
// seasons.js), mirroring the style already used in
// tests/autumn-homepage-ui.js for seasons.js. They intentionally do not
// re-test particle quantity/speed/lane/ratio behaviour -- that coverage
// already lives in autumn-homepage-ui.js and is untouched by this change.

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const seasonsSource = fs.readFileSync('seasons.js', 'utf8');

// ── Section 1: new heading + product explanation ──────────────────────
const heroMatch = html.match(/<h1>Create <em>print-ready<\/em> GB<br>[\s\S]{0,800}?labels in minutes<\/h1>/);
assert(heroMatch, 'hero <h1> must read "Create print-ready GB ... labels in minutes" (CLP ring markup sits between "GB" and "labels")');

assert(html.includes('Paste Section 2.2 from your current supplier SDS, review the hazard information CLPeasy extracts, then build and download your label.'),
  'hero must explain the core workflow in plain steps');
assert(html.includes('Print wherever works for you—at home, in your workspace or through a professional printer.'),
  'hero must state that labels can be printed anywhere, not just via CLPeasy');
assert(html.includes('For candles, wax melts, reed diffusers and room sprays.'),
  'hero must list the supported product types');

// Must not claim the product produces "compliant labels" (house wording
// rule: CLPeasy does not guarantee legal compliance).
assert(!/create compliant labels|produces compliant labels|generate compliant labels/i.test(html),
  'hero copy must not claim CLPeasy produces/creates "compliant labels"');
// The approved "print-ready"/"GB CLP" wording must be retained.
assert(html.includes('print-ready'), 'the approved "print-ready" wording must be retained in the hero');

// ── Section 2: secondary founder section, shortened bio ───────────────
assert(html.includes('Built by a maker, for makers') , 'founder section label must be present');
assert(html.includes("I'm Michaela, a candle and wax melt maker with a background in IT, including Formula 1 and enterprise software. After struggling to find a straightforward and affordable way to create my own GB CLP labels, I built CLPeasy to help me—and other makers—make label creation faster, clearer and less stressful."),
  'founder section must use the exact shortened bio copy');

// Old long-form biography content must be gone from the hero rewrite.
assert(!html.includes('Scottish Borders'), '"Scottish Borders" must not appear anywhere on the homepage');
assert(!html.includes('a few years working in IT for a Formula 1 team and inside a global enterprise'),
  'the old lengthy career-history sentence must be removed from the hero');
assert(!/£200[–-]£600/.test(html),
  'the old £200–£600 annual-cost claim must be removed from the hero/founder copy');

// The founder section must sit inside the same z-index:2 hero-content
// wrapper as the heading (i.e. after it in source order, within one
// <section class="hero">), confirming it was added to the hero, not a
// stray duplicate elsewhere.
const headingIdx = html.indexOf('Create <em>print-ready</em> GB');
const founderIdx = html.indexOf('Built by a maker, for makers', headingIdx);
assert(headingIdx !== -1 && founderIdx > headingIdx,
  'the founder section must appear after the hero heading in source order (not counting the unrelated meta-description/footer occurrences of this phrase elsewhere on the page)');

// ── Section 3: particle-over-content stacking fix ──────────────────────
// The hero-content wrapper (heading/explanation/founder section) must be
// stacked above the particle canvas by z-index, not rely on DOM order.
assert(/<div style="position:relative;z-index:2;">/.test(html),
  'hero content wrapper must have z-index:2 so it paints above the particle canvas (z-index:1)');
// The particle canvas itself must still request the lower z-index -- this
// file must NOT need to change seasons.js to fix the stacking bug.
assert(seasonsSource.includes("canvas.id = 'clpeasy-particles'"),
  'the particle canvas creation must still exist in seasons.js, unchanged by the hero stacking fix');
assert(seasonsSource.includes('z-index:1;opacity:'),
  'the particle canvas must still be created at z-index:1 in seasons.js -- the stacking fix must be a pure index.html change, not a seasons.js edit');

// ── Section 4: decorative "Your Brand Name" header band removed ───────
assert(!html.includes('Your Brand Name'),
  'the decorative mini-labels must no longer show a "Your Brand Name" header band (the real label renderer never produces one)');

// WARNING/DANGER colour rule on the decorative labels must match the real
// renderer (label-render.js): WARNING stays the label's normal dark text
// colour (#111111 here), DANGER is red (#cc0000) -- amber is never used.
// (circular decorative labels include "position:relative;z-index:1;" before
// the signal word; rectangular ones omit it -- both are decorative labels
// covered by this rule, so it is optional in the pattern.)
const wrongWarning = (html.match(/color:#[0-9a-fA-F]{3,6};font-weight:800;font-family:sans-serif;(?:position:relative;z-index:1;)?">WARNING/g) || [])
  .filter(m => !m.startsWith('color:#111111;'));
const wrongDanger = (html.match(/color:#[0-9a-fA-F]{3,6};font-weight:800;font-family:sans-serif;(?:position:relative;z-index:1;)?">DANGER/g) || [])
  .filter(m => !m.startsWith('color:#cc0000;'));
assert.strictEqual(wrongWarning.length, 0, 'every decorative WARNING label must use the normal dark text colour (#111111), never amber/red');
assert.strictEqual(wrongDanger.length, 0, 'every decorative DANGER label must use red (#cc0000)');
const totalWarning = (html.match(/font-weight:800;font-family:sans-serif;(?:position:relative;z-index:1;)?">WARNING/g) || []).length;
const totalDanger = (html.match(/font-weight:800;font-family:sans-serif;(?:position:relative;z-index:1;)?">DANGER/g) || []).length;
assert(totalWarning + totalDanger >= 40, `expected the ~52 decorative labels to still carry a WARNING/DANGER signal word (found ${totalWarning + totalDanger})`);

console.log(`homepage hero rewrite checks passed (heading/product-explanation copy, secondary founder section with old long-bio content removed, particle-stacking z-index fix present without touching seasons.js particle creation, "Your Brand Name" bands fully removed, WARNING/DANGER colours correct across ${totalWarning + totalDanger} decorative labels)`);
