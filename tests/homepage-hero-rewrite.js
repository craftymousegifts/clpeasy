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

// ── Section 1: heading + product explanation (approved #202 image hero) ──
// PR #202 (2 Oct 2026) replaced the typed hero (heading + three explanation
// lines + mobile-only <br> handling) with approved artwork. The headline and
// the create/download/print explanation are now in the artwork; the page
// keeps them in real text for assistive tech and search: one visually-hidden
// <h1> and the artwork's alt text. (Heading accessibility is covered in depth
// by tests/clp-hero-explanation.js.)
const heroH1 = html.match(/<h1 id="homepage-hero-title"[^>]*>([^<]*)<\/h1>/);
assert(heroH1 && heroH1[1].trim() === 'Create print-ready GB CLP labels in minutes',
  'the image hero must keep a real <h1> reading "Create print-ready GB CLP labels in minutes"');
const heroAlt = html.match(/<img src="assets\/CLPeasy%20Home%20page\.png" alt="([^"]+)"/);
assert(heroAlt, 'the approved hero artwork must be the first hero image');
assert(/Create, download and print labels/.test(heroAlt[1]),
  'the hero must still explain the core workflow in plain words (create, download, print) -- now via the artwork alt text');
assert(/for candles, wax melts, reed diffusers and room sprays/.test(heroAlt[1]),
  'the hero must still list the supported product types -- now via the artwork alt text');
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
const headingIdx = html.indexOf('id="homepage-hero-title"');
const founderIdx = html.indexOf('Built by a maker, for makers', headingIdx);
const heroEndIdx = html.indexOf('</section>', headingIdx);
assert(headingIdx !== -1 && founderIdx > headingIdx && founderIdx < heroEndIdx,
  'the founder section must appear after the hero heading, inside the same image-hero <section> (not a stray duplicate elsewhere)');

// ── Section 3: particle-over-content stacking fix ──────────────────────
// The hero-content wrapper (heading/explanation/founder section) must be
// stacked above the particle canvas by z-index, not rely on DOM order.
// With the artwork hero there is no text wrapper to lift; what matters is that
// the particles can never block the hero's sign-up hotspot: the hotspot sits
// at z-index:3 inside its positioned banner, and the canvas (z-index:1)
// ignores pointer events.
assert(/<div class="homepage-hero-banner" style="position:relative;[^"]*">\s*<img[^>]*>\s*<a href="auth\.html\?mode=signup"[^>]*style="position:absolute;[^"]*z-index:3;/.test(html),
  'the hero sign-up hotspot must be positioned over the artwork at z-index:3, above the particle canvas (z-index:1)');
assert(seasonsSource.includes('pointer-events:none;z-index:1;'),
  'the particle canvas must ignore pointer events so it can never block the hero link');
// The particle canvas itself must still request the lower z-index -- this
// file must NOT need to change seasons.js to fix the stacking bug.
assert(seasonsSource.includes("canvas.id = 'clpeasy-particles'"),
  'the particle canvas creation must still exist in seasons.js, unchanged by the hero stacking fix');
assert(seasonsSource.includes('z-index:1;opacity:'),
  'the particle canvas must still be created at z-index:1 in seasons.js -- the stacking fix must be a pure index.html change, not a seasons.js edit');

// ── Section 4: decorative "Your Brand Name" header band removed ───────
assert(!html.includes('Your Brand Name'),
  'the decorative mini-labels must no longer show a "Your Brand Name" header band (the real label renderer never produces one)');

// The decorative labels were replaced (separate task, same branch): they
// are no longer hand-built divs with an isolated signal word in a
// `color:#xxx;font-weight:800;font-family:sans-serif;...">WARNING`-style
// span -- they are now static SVG thumbnails cloned from genuine
// label-render.js output via <use href="#clp-tmpl-...">, embedded once as
// <symbol> markup. That old hand-rolled pattern is asserted absent below
// (confirming the fake mini-label markup was actually removed, not just
// hidden behind new SVGs); the new markup's structural correctness --
// shape/viewBox sanity, WARNING/DANGER colour matching the renderer's own
// rule, byte-for-byte match against a fresh render, pointer-events:none,
// absence of the old "Your Brand Name" band and duplicate inner ring, and
// the 52-count/32+6+14 template split -- is covered exhaustively by
// tests/decorative-labels-renderer-derived.js, which re-renders each
// fixture through the real renderer and diffs it against what's embedded
// in index.html. Duplicating that here would just be two tests asserting
// the same generated bytes.
assert(!/color:#[0-9a-fA-F]{3,6};font-weight:800;font-family:sans-serif;(?:position:relative;z-index:1;)?">(WARNING|DANGER)/.test(html),
  'the old hand-rolled decorative signal-word span markup must be gone (superseded by renderer-derived SVG thumbnails; see tests/decorative-labels-renderer-derived.js)');
// The decorative label wall and its renderer-derived templates are verified
// byte-for-byte by tests/decorative-labels-renderer-derived.js (kept as the
// single source of truth for that content, as noted above), so the position
// count is not duplicated here.

console.log('homepage hero rewrite checks passed (image hero keeps the exact h1 and a workflow/product-type alt text; founder section inside the hero after the heading with the shortened bio; banned claims absent; sign-up hotspot above the pointer-events:none particle canvas; old hand-rolled decorative markup absent)');
