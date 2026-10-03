// Regression coverage for the homepage seasonal treatment, as approved in the
// PR #202 homepage redesign (2 Oct 2026). The redesign replaced the old hero
// seasonal pill and the dismissible footer banner with ONE inline seasonal
// strip placed directly beneath the image hero, and keeps falling particles
// brief (they stop by themselves after 12 seconds).
//
// What this checks (current behaviour, driven through the real seasons.js):
//  * particle artwork: pointed curved leaves with a vein/stem, October's
//    minority of swaying pumpkins, even lane-based spread and recycling;
//  * no seasonal hero pill/CTA is created any more;
//  * exactly one seasonal strip, directly beneath .homepage-image-hero,
//    labelled as a region, with an accessible "Start your 14-day free trial"
//    link that stays on CLPeasy's own site (a relative sign-up link, never
//    another host such as a Netlify deploy preview);
//  * September leaves are visible (opacity 0.72), run before 12s and are
//    removed after the 12s stop, and never come back.
//
// The clock is pinned (9 September 2026, local time) and setTimeout /
// requestAnimationFrame are replaced with a manually-advanceable virtual
// clock, exactly as in the previous version of this test.
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('seasons.js', 'utf8');

// ── Particle artwork (unchanged by the redesign) ──
assert(source.includes('ctx.bezierCurveTo('),
  'autumn particles must use a pointed curved leaf silhouette');
assert(source.includes("ctx.strokeStyle = 'rgba(92,45,12,0.55)'"),
  'autumn leaves must draw a visible centre vein/stem');
assert(source.includes("type.indexOf('leaves') === 0 ? '0.72' : '0.4'"),
  "autumn leaves (and October's mixed leaves+pumpkins) must be clearly visible without changing other seasonal particles");
assert(source.includes("particle: 'leaves+pumpkins'"),
  "October must use the mixed 'leaves+pumpkins' particle type, not plain leaves");
assert(source.includes("const isMixed = type === 'leaves+pumpkins';"),
  'addParticles must recognise the mixed leaves+pumpkins type');
assert(/PUMPKIN_SHARE\s*=\s*0\.2/.test(source),
  'pumpkins must be a minority accent among the leaves (not a 50/50 split or a full replacement)');
assert(source.includes("ctx.fillText('\\u{1F383}', 0, 0)"),
  'pumpkins must render as a recognisable pumpkin rather than a generic shape');
assert(/kind === 'pumpkin'[\s\S]{0,200}Math\.sin\(p\.swingPhase\)/.test(source),
  'pumpkins must sway gently rather than spin like leaves');
assert(source.includes('function laneX(lane)'),
  'particles must spawn (and recycle) within their own horizontal lane so the full width is covered evenly');
assert(source.includes('if (p.y > canvas.height + 20) { p.y = -20; p.x = laneX(p.lane); }'),
  'a particle recycling off the bottom must respawn within its own lane');

// ── Approved #202 structure ──
assert(source.includes('particleStopTimer = setTimeout(stopParticles, 12000);'),
  'seasonal particles must stop by themselves after 12 seconds');
assert(/function applyHeroPill\(m\)\s*\{\s*\/\*[^*]*\*\/\s*\}/.test(source),
  'the old seasonal hero pill/CTA must no longer be created (applyHeroPill is a no-op)');
assert(source.includes("document.querySelector('.homepage-image-hero')"),
  'the seasonal strip must be placed relative to the homepage image hero');

function makeWindow(opts) {
  const { signedIn = false, sbAvailable = true, presetDismissed = [] } = opts || {};
  const dom = new JSDOM(`<!doctype html><html><body>
  <section class="hero">
    <div><div id="hero-pill">BUILT BY A MAKER</div></div>
    <h1>Generate <em>print-ready</em> labels</h1>
  </section>
  <section class="homepage-image-hero"><img alt="CLPeasy hero"></section>
  <section id="after-hero"></section>
</body></html>`, {
    url: 'https://example.test/',
    runScripts: 'dangerously',
    beforeParse(window) {
      // Fixed clock: 9 September 2026, 12:00, expressed via LOCAL date
      // components so it reads as September 9th under any timezone.
      const RealDate = window.Date;
      const FIXED_MS = new RealDate(2026, 8, 9, 12, 0, 0).getTime();
      class FixedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(FIXED_MS);
          } else {
            super(...args);
          }
        }
        static now() {
          return FIXED_MS;
        }
      }
      window.Date = FixedDate;

      // Pre-seed any dismissal keys this scenario wants to simulate as
      // already recorded from an earlier page load this browser session.
      presetDismissed.forEach(key => window.sessionStorage.setItem(key, '1'));

      // Mock of the same _sb Supabase client index.html establishes
      // globally. A real getSession() call is itself async, so this
      // returns a genuine Promise -- exercising the exact same
      // microtask-timing seasons.js relies on in production.
      if (sbAvailable) {
        window._sb = {
          auth: {
            getSession: () => Promise.resolve({
              data: { session: signedIn ? { user: { id: 'test-user' } } : null }
            })
          }
        };
      }
      // When sbAvailable is false, `_sb` is left undefined entirely --
      // proving seasons.js's fail-safe path (never throws, defaults to
      // signed-out) rather than assuming a global that isn't there.

      // Manually-advanceable virtual clock -- see file header. Shared
      // store for both setTimeout/clearTimeout and
      // requestAnimationFrame/cancelAnimationFrame, since seasons.js's own
      // stopParticles() cancels a requestAnimationFrame handle exactly
      // like a timer handle.
      let virtualNow = 0;
      let idSeq = 1;
      const timers = new Map();
      function schedule(fn, delay) {
        const id = idSeq++;
        timers.set(id, { time: virtualNow + Math.max(0, delay || 0), fn });
        return id;
      }
      window.setTimeout = (fn, delay, ...args) => schedule(() => fn(...args), delay);
      window.clearTimeout = (id) => { timers.delete(id); };
      window.requestAnimationFrame = (fn) => schedule(() => fn(virtualNow), 16);
      window.cancelAnimationFrame = (id) => { timers.delete(id); };
      window.__advanceClock = (ms) => {
        const target = virtualNow + ms;
        for (;;) {
          let nextId = null;
          let nextTime = Infinity;
          for (const [id, t] of timers) {
            if (t.time <= target && t.time < nextTime) { nextTime = t.time; nextId = id; }
          }
          if (nextId === null) break;
          const t = timers.get(nextId);
          timers.delete(nextId);
          virtualNow = nextTime;
          t.fn();
        }
        virtualNow = target;
      };

      window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect(){}, save(){}, restore(){}, translate(){}, rotate(){},
        beginPath(){}, moveTo(){}, bezierCurveTo(){}, closePath(){}, fill(){},
        lineTo(){}, stroke(){}, ellipse(){}, arc(){},
        set fillStyle(value){}, set strokeStyle(value){}, set lineWidth(value){}
      });
    }
  });
  return dom;
}

// Gives any pending Promise .then() callback a chance to run (e.g.
// seasons.js's getAuthState() chain) before the test advances the fake
// clock or asserts on the result -- see file header.
function flushMicrotasks() {
  return new Promise(resolve => setImmediate(resolve));
}

async function loadAndSettle(dom) {
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  // Several hops: _sb.auth.getSession() -> getAuthState()'s own .then()
  // -> the consuming .then() in applySeasonIcon/injectFooterBanner.
  await flushMicrotasks();
  await flushMicrotasks();
  await flushMicrotasks();
}

// Gives pending Promise .then() callbacks a chance to run.
function flushMicrotasks() {
  return new Promise(resolve => setImmediate(resolve));
}

async function loadAndSettle(dom) {
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await flushMicrotasks();
  await flushMicrotasks();
  await flushMicrotasks();
}

async function main() {
  const dom = makeWindow({ signedIn: false });
  await loadAndSettle(dom);
  const doc = dom.window.document;

  // No hero pill / hero CTA any more.
  assert.strictEqual(doc.getElementById('clpeasy-season-icon'), null, 'no seasonal hero pill/CTA');
  assert.strictEqual(doc.querySelectorAll('#hero-pill a').length, 0, 'no link injected into the hero pill');

  // Exactly one inline strip, directly beneath the image hero.
  const strips = doc.querySelectorAll('#clpeasy-season-banner');
  assert.strictEqual(strips.length, 1, 'exactly one seasonal strip');
  const strip = strips[0];
  assert(strip.previousElementSibling && strip.previousElementSibling.classList.contains('homepage-image-hero'),
    'the seasonal strip sits directly beneath the homepage image hero');
  assert.strictEqual(strip.nextElementSibling && strip.nextElementSibling.id, 'after-hero', 'the strip is inserted, not appended at the end');
  assert.strictEqual(strip.getAttribute('role'), 'region', 'the strip is a labelled region');
  assert(/seasonal reminder$/.test(strip.getAttribute('aria-label') || ''), 'the region is named as a seasonal reminder');
  assert(!/position:\s*fixed/.test(strip.style.cssText), 'the strip is part of the page, not a fixed overlay');

  // Its link: accessible, and kept on CLPeasy's own site.
  const cta = doc.getElementById('clpeasy-banner-cta');
  assert(cta && cta.tagName === 'A', 'the strip link is a real anchor');
  assert.strictEqual(cta.getAttribute('aria-label'), 'Start your 14-day free trial');
  const href = cta.getAttribute('href') || '';
  assert(/mode=signup/.test(href), 'the strip link opens sign-up');
  assert(!/^[a-z]+:\/\//i.test(href) || /^https:\/\/clpeasy\.com\//.test(href),
    `the strip link must stay on CLPeasy's own site (relative, or https://clpeasy.com) -- found ${href}`);

  // Particles: visible leaves, running before 12s, removed after, never back.
  let particles = doc.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0.72', 'September leaves visible at load');
  dom.window.__advanceClock(11000);
  particles = doc.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0.72', 'leaves still running before 12s');
  dom.window.__advanceClock(1000);
  particles = doc.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0', 'leaves fading out at 12s');
  dom.window.__advanceClock(700);
  assert.strictEqual(doc.getElementById('clpeasy-particles'), null, 'leaves removed after the fade');
  dom.window.__advanceClock(60000);
  assert.strictEqual(doc.getElementById('clpeasy-particles'), null, 'leaves never come back');
  assert.strictEqual(doc.querySelectorAll('#clpeasy-season-banner').length, 1, 'the strip stays on the page after the leaves stop');

  // Without a Supabase client the page still works (never throws).
  const dom2 = makeWindow({ sbAvailable: false });
  await loadAndSettle(dom2);
  assert.strictEqual(dom2.window.document.querySelectorAll('#clpeasy-season-banner').length, 1, 'strip shown without a Supabase client');

  dom.window.close(); dom2.window.close();
  console.log('autumn homepage UI checks passed (particle artwork; no hero pill; one inline strip beneath the image hero with an on-site sign-up link; leaves visible, stopping at 12s and never returning)');
}

main().catch(err => { console.error(err); process.exit(1); });
