// Regression coverage for the September homepage seasonal treatment.
// The hero CTA must be a real link and falling leaves must retain a
// recognisable pointed silhouette, vein and stem rather than plain ovals.
//
// Date-fixing (2026-09-09): seasons.js's init() derives the active month
// from a bare `new Date()` (plus a "within 14 days of month-end, show next
// month" look-ahead), with no injection point of its own. Without pinning
// the clock, this test only exercised the September path by coincidence of
// the real calendar date. The window's Date is replaced, before seasons.js
// is evaluated, with a subclass that returns a fixed 9 September 2026,
// 12:00 LOCAL time for `new Date()`/`Date.now()` with no arguments, and
// forwards every other call unchanged, so seasons.js's own date arithmetic
// still behaves exactly as it does in production, and the fixed instant
// reads as September 9th under any timezone.
//
// Particle-lifecycle coverage (timing correction, 2026-09-09): leaves must
// stop together with the footer banner's own automatic dismissal (~12s
// after page load: 4s appear-delay + 8s auto-visible window), and an
// explicit close must also stop them immediately. The independent 60s
// particleStopTimer (set in addParticles()) is a harmless no-op once the
// leaves already stopped early, and a working fallback when the banner's
// own auto-dismiss chain never runs this load (its sessionStorage
// dismissal key already set).
//
// Auth-state CTA coverage (2026-09-09): a signed-out visitor must not be
// sent straight into the restricted Builder preview by either the hero
// pill or the bottom-banner CTA -- both must point at '/auth?mode=signup'
// when signed out, and at the configured Builder-bound destination
// ('builder.html') when signed in. seasons.js determines this by reusing
// the same Supabase session mechanism index.html already establishes as
// the global `_sb` client (`_sb.auth.getSession()`) -- it does not infer
// sign-in from page text or the URL. The banner's own sessionStorage
// dismissal key is scoped per auth state too, so a dismissal recorded
// while signed out must never suppress the banner on a later signed-in
// load in the same browser session, and vice versa.
//
// Refresh bug fix coverage (2026-09-09): addParticles() previously ran
// unconditionally on every load, regardless of whether the banner (for
// this exact auth state) had already been dismissed earlier in the same
// browser session. So a refresh after an auto-dismiss or a manual close
// left the leaves running anyway -- with no banner ever shown for them --
// stopped only by the unrelated 60s fallback timer. injectFooterBanner()
// now reports an `eligible` flag (this load's own auth-scoped dismissal
// key not already set) once the real auth state resolves, and init()
// only calls addParticles() when eligible is true -- decided *before*
// particles would ever visibly start, so an ineligible refresh shows no
// flicker at all, just nothing.
//
// All of this needs real elapsed time (4s, 12s, then 60s) without the test
// actually waiting that long, so `makeWindow()` below replaces the
// window's setTimeout/clearTimeout/requestAnimationFrame/
// cancelAnimationFrame with a manually-advanceable virtual clock. Because
// the auth check is itself asynchronous (a Promise, exactly like the real
// `_sb.auth.getSession()`), and everything in this test file runs as one
// synchronous top-level script otherwise, `flushMicrotasks()` gives any
// pending `.then()` callback a chance to run before clock advancement or
// assertions proceed -- mirroring how a real browser drains the
// microtask queue between the DOMContentLoaded task finishing and any
// later timer (setTimeout) firing.
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('seasons.js', 'utf8');

assert(source.includes("document.createElement('a')"),
  'seasonal hero CTA must be created as an anchor');
assert(source.includes('ctx.bezierCurveTo('),
  'autumn particles must use a pointed curved leaf silhouette');
assert(source.includes("ctx.strokeStyle = 'rgba(92,45,12,0.55)'"),
  'autumn leaves must draw a visible centre vein/stem');
assert(source.includes("type === 'leaves' ? '0.72' : '0.4'"),
  'autumn leaves must be clearly visible without changing other seasonal particles');

// Timing correction guard (unchanged): stopParticles() must be called
// exactly twice -- automatic banner dismissal, and the explicit close.
const stopParticlesCalls = (source.match(/stopParticles\(\);/g) || []).length;
assert.strictEqual(stopParticlesCalls, 2,
  `stopParticles() must be called exactly twice in seasons.js (automatic banner dismissal, and the explicit close-button handler) -- found ${stopParticlesCalls} call(s)`);

// Auth-state gating guards.
assert(source.includes('_sb.auth.getSession()'),
  'auth state must be read via the same established _sb.auth.getSession() mechanism used elsewhere in the app, not inferred from text or the URL');
assert(source.includes("'/auth?mode=signup'"),
  "a signed-out visitor's seasonal CTA must resolve to '/auth?mode=signup'");
assert(source.includes("target === 'builder.html' && !signedIn"),
  'only CTAs that target the Builder should be gated by auth state -- other destinations (e.g. knowledge.html) must be left alone');
assert(source.includes('id="clpeasy-banner-cta"'),
  'the bottom-banner CTA must be addressable so its href can be corrected once the real auth state resolves');
assert(source.includes("${signedIn ? 'in' : 'out'}"),
  "the banner's own sessionStorage dismissal key must be scoped by auth state so a dismissal cannot leak between signed-in and signed-out visits");

// Refresh-bug guards.
assert(source.includes('onEligibilityResolved'),
  'injectFooterBanner must report whether this load is eligible so init() can decide whether to start particles at all');
assert(source.includes('if (eligible) addParticles(m.particle, m.accent);'),
  "addParticles() must only run when this load is eligible (its auth-scoped dismissal key not already set) -- never unconditionally on every load");
assert(source.includes('particleStopTimer = setTimeout(stopParticles, 60000);'),
  'the independent 60s safety-fallback timer must not be removed');

function makeWindow(opts) {
  const { signedIn = false, sbAvailable = true, presetDismissed = [] } = opts || {};
  const dom = new JSDOM(`<!doctype html><html><body>
  <section class="hero">
    <div><div id="hero-pill">BUILT BY A MAKER</div></div>
    <h1>Generate <em>print-ready</em> labels</h1>
  </section>
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

async function main() {
  // ── Static checks: CTA element shape + opacity (auth-independent) ──
  {
    const dom = makeWindow({ signedIn: false });
    await loadAndSettle(dom);

    const cta = dom.window.document.getElementById('clpeasy-season-icon');
    assert(cta, 'September seasonal hero CTA must be inserted');
    assert.strictEqual(cta.tagName, 'A', 'seasonal hero CTA must be keyboard- and link-accessible');
    assert.strictEqual(cta.getAttribute('aria-label'), 'Build your autumn range labels now');
    assert(cta.textContent.includes('Build your autumn range labels now'));
    assert.strictEqual(dom.window.document.getElementById('clpeasy-particles').style.opacity, '0.72');

    dom.window.close();
  }

  // ── SCENARIO A: signed-out visitor -- both CTAs must send them to sign
  //    up, never straight into the Builder; timing unchanged ──────────
  {
    const dom = makeWindow({ signedIn: false });
    await loadAndSettle(dom);

    const hero = dom.window.document.getElementById('clpeasy-season-icon');
    const bannerCta = dom.window.document.getElementById('clpeasy-banner-cta');
    assert.strictEqual(hero.getAttribute('href'), '/auth?mode=signup',
      'signed-out hero CTA must not open the restricted Builder preview -- it must send the visitor to sign up');
    assert.strictEqual(bannerCta.getAttribute('href'), '/auth?mode=signup',
      'signed-out bottom-banner CTA must not open the restricted Builder preview -- it must send the visitor to sign up');
    // Wording must be untouched by the auth-state fix.
    assert.strictEqual(hero.getAttribute('aria-label'), 'Build your autumn range labels now');

    // Leaves present at t0.
    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'leaves must be present and at full opacity at page load');

    // Still running just before the ~12s auto-dismiss point.
    dom.window.__advanceClock(11999);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'leaves must remain at full opacity right up to the banner auto-dismiss point');
    const dismissKeyOut = 'clpeasy-banner-dismissed-8-out';
    assert.strictEqual(dom.window.sessionStorage.getItem(dismissKeyOut), null,
      'the signed-out dismissal key must not be set before the banner auto-dismisses');

    // Banner and leaves stop together at ~12s, recording the signed-out
    // dismissal key (not a generic or signed-in one).
    dom.window.__advanceClock(2); // now at 12001ms
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0',
      'automatic banner dismissal must stop the leaves at the ~12s point for a signed-out visitor');
    assert.strictEqual(dom.window.sessionStorage.getItem(dismissKeyOut), '1',
      'automatic dismissal must record the signed-out-scoped dismissal key');

    dom.window.__advanceClock(700);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      'the particle canvas must be fully removed shortly after automatic dismissal stops it');

    // The independent 60s timer must remain a harmless no-op afterwards.
    assert.doesNotThrow(() => dom.window.__advanceClock(60000));
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null, 'the particle canvas must remain removed well past 60s');

    dom.window.close();
  }

  // ── SCENARIO B: signed-in visitor -- both CTAs must open the Builder;
  //    timing unchanged ────────────────────────────────────────────────
  {
    const dom = makeWindow({ signedIn: true });
    await loadAndSettle(dom);

    const hero = dom.window.document.getElementById('clpeasy-season-icon');
    const bannerCta = dom.window.document.getElementById('clpeasy-banner-cta');
    assert.strictEqual(hero.getAttribute('href'), 'builder.html',
      'signed-in hero CTA must open the label builder');
    assert.strictEqual(bannerCta.getAttribute('href'), 'builder.html',
      'signed-in bottom-banner CTA must open the label builder');
    assert.strictEqual(hero.getAttribute('aria-label'), 'Build your autumn range labels now');

    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'leaves must be present and at full opacity at page load');

    dom.window.__advanceClock(11999);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'leaves must remain at full opacity right up to the banner auto-dismiss point');
    const dismissKeyIn = 'clpeasy-banner-dismissed-8-in';
    assert.strictEqual(dom.window.sessionStorage.getItem(dismissKeyIn), null,
      'the signed-in dismissal key must not be set before the banner auto-dismisses');

    dom.window.__advanceClock(2); // now at 12001ms
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0',
      'automatic banner dismissal must stop the leaves at the ~12s point for a signed-in visitor too');
    assert.strictEqual(dom.window.sessionStorage.getItem(dismissKeyIn), '1',
      'automatic dismissal must record the signed-in-scoped dismissal key');

    dom.window.__advanceClock(700);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      'the particle canvas must be fully removed shortly after automatic dismissal stops it');

    dom.window.close();
  }

  // ── SCENARIO C: an explicit close still stops the leaves immediately,
  //    regardless of auth state or the 12s timing ─────────────────────
  {
    const dom = makeWindow({ signedIn: false });
    await loadAndSettle(dom);

    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'sanity check: particles must be visible before the explicit close is clicked');

    dom.window.document.getElementById('clpeasy-banner-close').dispatchEvent(new dom.window.Event('click'));

    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0',
      'an explicit user close must stop the particle effect immediately, well before the 12s auto-dismiss point');
    assert.strictEqual(dom.window.sessionStorage.getItem('clpeasy-banner-dismissed-8-out'), '1',
      'an explicit close while signed out must record the signed-out-scoped dismissal key');

    dom.window.__advanceClock(700);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      'the particle canvas must be fully removed shortly after an explicit close');

    dom.window.close();
  }

  // ── SCENARIO D: dismissal isolation -- a dismissal recorded under one
  //    auth state must not suppress the banner (or its leaves) on a
  //    later load under the OTHER auth state, in the same session ──────
  {
    // Already dismissed while signed OUT in an earlier load; this load is
    // signed IN -- the banner must still show and auto-dismiss normally.
    const dom = makeWindow({ signedIn: true, presetDismissed: ['clpeasy-banner-dismissed-8-out'] });
    await loadAndSettle(dom);

    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'a prior signed-out dismissal must not suppress the banner/leaves for a signed-in visitor');

    dom.window.__advanceClock(12001);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0',
      'the banner must still auto-dismiss (and stop the leaves) normally at ~12s for the signed-in visitor');
    assert.strictEqual(dom.window.sessionStorage.getItem('clpeasy-banner-dismissed-8-in'), '1');

    dom.window.close();
  }
  {
    // Symmetric case: already dismissed while signed IN; this load is
    // signed OUT -- the banner must still show and auto-dismiss normally.
    const dom = makeWindow({ signedIn: false, presetDismissed: ['clpeasy-banner-dismissed-8-in'] });
    await loadAndSettle(dom);

    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0.72',
      'a prior signed-in dismissal must not suppress the banner/leaves for a signed-out visitor');

    dom.window.__advanceClock(12001);
    particles = dom.window.document.getElementById('clpeasy-particles');
    assert(particles && particles.style.opacity === '0',
      'the banner must still auto-dismiss (and stop the leaves) normally at ~12s for the signed-out visitor');
    assert.strictEqual(dom.window.sessionStorage.getItem('clpeasy-banner-dismissed-8-out'), '1');

    dom.window.close();
  }
  {
    // THE REFRESH BUG, fixed: with THIS load's own auth-scoped key already
    // dismissed, particles must never be created at all -- not started
    // and later stopped by the 60s fallback (that was the bug), and no
    // flicker in between. The banner must likewise never become visible.
    const dom = makeWindow({ signedIn: false, presetDismissed: ['clpeasy-banner-dismissed-8-out'] });
    await loadAndSettle(dom);

    let particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      "a refresh after this auth state's banner was already dismissed must never start the particle canvas at all");
    let banner = dom.window.document.getElementById('clpeasy-season-banner');
    assert.strictEqual(banner.style.transform, 'translateY(100%)',
      'the banner must remain suppressed (never becomes visible) on this refresh');

    // Confirm this holds well past every timing point that would
    // otherwise be involved (4s, 12s, 60s) -- there is no delayed leak,
    // and the (never-created) 60s timer cannot resurrect anything.
    assert.doesNotThrow(() => dom.window.__advanceClock(65000));
    particles = dom.window.document.getElementById('clpeasy-particles');
    banner = dom.window.document.getElementById('clpeasy-season-banner');
    assert.strictEqual(particles, null,
      'the particle canvas must still not exist even after 65s of elapsed time on this refresh');
    assert.strictEqual(banner.style.transform, 'translateY(100%)',
      'the banner must still never have appeared on this refresh');

    dom.window.close();
  }
  {
    // Symmetric refresh-bug case for the signed-in dismissal key.
    const dom = makeWindow({ signedIn: true, presetDismissed: ['clpeasy-banner-dismissed-8-in'] });
    await loadAndSettle(dom);

    const particles = dom.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      "a refresh after this auth state's banner was already dismissed must never start the particle canvas at all (signed-in)");
    const banner = dom.window.document.getElementById('clpeasy-season-banner');
    assert.strictEqual(banner.style.transform, 'translateY(100%)',
      'the banner must remain suppressed on this signed-in refresh too');

    dom.window.close();
  }

  // ── SCENARIO E: fail-safe when the Supabase client isn't available --
  //    must default to signed-out, never throw ────────────────────────
  {
    const dom = makeWindow({ sbAvailable: false });
    await loadAndSettle(dom);

    const hero = dom.window.document.getElementById('clpeasy-season-icon');
    const bannerCta = dom.window.document.getElementById('clpeasy-banner-cta');
    assert.strictEqual(hero.getAttribute('href'), '/auth?mode=signup',
      'without a Supabase client available, the hero CTA must fail safe to the signed-out destination');
    assert.strictEqual(bannerCta.getAttribute('href'), '/auth?mode=signup',
      'without a Supabase client available, the banner CTA must fail safe to the signed-out destination');

    dom.window.close();
  }

  // ── SCENARIO F: manual close, then a refresh in the same auth state --
  //    neither the banner nor the leaves may appear on that refresh ────
  {
    // Phase 1: fresh signed-out load, user clicks the close button.
    const dom1 = makeWindow({ signedIn: false });
    await loadAndSettle(dom1);
    dom1.window.document.getElementById('clpeasy-banner-close').dispatchEvent(new dom1.window.Event('click'));
    await flushMicrotasks();
    const recordedKey = 'clpeasy-banner-dismissed-8-out';
    assert.strictEqual(dom1.window.sessionStorage.getItem(recordedKey), '1',
      'manual close must record the same auth-scoped dismissal key a later refresh will see');
    let particles = dom1.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles && particles.style.opacity, '0',
      'manual close must immediately stop the leaves (fade to opacity 0) in this same load');
    dom1.window.__advanceClock(700);
    particles = dom1.window.document.getElementById('clpeasy-particles');
    assert.strictEqual(particles, null,
      'manual close must have fully removed the leaves shortly afterward in this same load');
    dom1.window.close();

    // Phase 2: simulate a refresh in the same browser session/auth state
    // by starting a new load with that exact key already present.
    const dom2 = makeWindow({ signedIn: false, presetDismissed: [recordedKey] });
    await loadAndSettle(dom2);
    particles = dom2.window.document.getElementById('clpeasy-particles');
    const banner = dom2.window.document.getElementById('clpeasy-season-banner');
    assert.strictEqual(particles, null,
      'refreshing after a manual close must not start the particle canvas');
    assert.strictEqual(banner.style.transform, 'translateY(100%)',
      'refreshing after a manual close must not show the banner');
    dom2.window.close();
  }

  console.log('autumn homepage UI checks passed (working, auth-aware CTAs on both hero pill and bottom banner; recognisable pointed, veined leaf particles; automatic banner dismissal stops the leaves together with it at ~12s for either auth state; an explicit close still stops them immediately; a refresh after either kind of dismissal shows neither banner nor leaves, with no flicker; the independent 60s timer never gets the chance to leak leaves on an ineligible refresh; banner dismissal is isolated per auth state; and the CTA fails safe to signed-out when no Supabase client is available)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
