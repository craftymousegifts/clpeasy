// Regression coverage for the September homepage seasonal treatment.
// The hero CTA must be a real link and falling leaves must retain a
// recognisable pointed silhouette, vein and stem rather than plain ovals.
//
// Date-fixing (2026-09-09): seasons.js's init() derives the active month
// from a bare `new Date()` (plus a "within 14 days of month-end, show next
// month" look-ahead), with no injection point of its own. Without pinning
// the clock, this test only exercised the September path by coincidence of
// the real calendar date -- it would have started testing the wrong
// month's config (or failing outright) within weeks, and behaved
// differently under a CI runner in a different timezone. The window's
// Date is replaced, before seasons.js is evaluated, with a subclass that:
//   - returns a fixed 9 September 2026, 12:00 local time for `new Date()`
//     with no arguments (and for `Date.now()`);
//   - forwards every other call (`new Date(year, month, day)`, etc.)
//     unchanged to the real Date, so seasons.js's own date arithmetic
//     (e.g. computing days-in-month via `new Date(year, month+1, 0)`)
//     still behaves exactly as it does in production.
// Midday, via LOCAL date components (not a UTC ISO string), is used
// specifically so the fixed instant reads as September 9th regardless of
// which timezone the test happens to run in -- a near-midnight UTC
// timestamp could roll to the 8th or the 10th under some local offsets;
// noon on the 9th cannot roll into August or October under any real-world
// UTC offset.
//
// Particle-lifecycle coverage (timing correction, 2026-09-09, clarified
// requirement): the leaves must stop together with the footer banner's own
// automatic dismissal -- a 4s appear-delay plus an 8s auto-visible window,
// so ~12s after page load -- via the restored stopParticles() call in the
// automatic-dismiss branch of injectFooterBanner(). Explicitly clicking the
// banner's "x" close button must also stop the leaves immediately, exactly
// as before. The separate independent 60s particleStopTimer (set in
// addParticles()) is kept only as a fallback for sessions where the banner
// was already dismissed earlier (its sessionStorage dismissal key already
// set) and so never shows/auto-dismisses again this load -- in the normal
// first-visit flow, stopParticles() clears that 60s timer as part of its
// own cleanup the moment the 12s auto-dismiss (or an explicit close) fires
// it first, so the 60s timer never gets the chance to do anything once the
// leaves are already gone. Proving all of this needs real elapsed time
// (12s, then 60s) without the test actually waiting that long, so
// `makeWindow()` below replaces the window's
// setTimeout/clearTimeout/requestAnimationFrame/cancelAnimationFrame with
// a manually-advanceable virtual clock: `__advanceClock(ms)` fires every
// timer (including ones newly scheduled by an already-firing timer, e.g.
// the banner's nested 4s-then-8s chain, or each animation frame's own
// re-scheduling of the next frame) up to and including virtual `ms`
// milliseconds from now, in chronological order, synchronously.
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('seasons.js', 'utf8');

assert(source.includes("document.createElement('a')"),
  'seasonal hero CTA must be created as an anchor');
assert(source.includes("icon.href = m.bannerCtaUrl || 'builder.html'"),
  'seasonal hero CTA must use the configured seasonal destination');
assert(source.includes('ctx.bezierCurveTo('),
  'autumn particles must use a pointed curved leaf silhouette');
assert(source.includes("ctx.strokeStyle = 'rgba(92,45,12,0.55)'"),
  'autumn leaves must draw a visible centre vein/stem');
assert(source.includes("type === 'leaves' ? '0.72' : '0.4'"),
  'autumn leaves must be clearly visible without changing other seasonal particles');

// Timing correction: stopParticles() must now be called exactly twice in
// the whole file -- once from the automatic banner-dismiss branch, once
// from the explicit close-button handler. This is a source-level guard
// against the exact opposite regression (leaves running on independently
// of the banner); the behavioural proof below (SCENARIO A/B/C) is the
// direct evidence.
const stopParticlesCalls = (source.match(/stopParticles\(\);/g) || []).length;
assert.strictEqual(stopParticlesCalls, 2,
  `stopParticles() must be called exactly twice in seasons.js (automatic banner dismissal, and the explicit close-button handler) -- found ${stopParticlesCalls} call(s)`);
assert(source.indexOf('Auto-dismiss after 8 seconds') > -1, 'could not locate the auto-dismiss block to check');
{
  const startIdx = source.indexOf('Auto-dismiss after 8 seconds');
  const endIdx = source.indexOf('}, 4000);', startIdx);
  // Strip comment-only lines first -- this block's own explanatory
  // comment mentions "stopParticles()" in prose, which would otherwise
  // false-positive (or, here, mask a genuine removal) against a plain
  // substring check.
  const block = source.slice(startIdx, endIdx)
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
  assert(block.includes('stopParticles()'),
    'automatic banner dismissal must call stopParticles() so the leaves stop together with the banner');
  assert(block.includes("sessionStorage.setItem(dismissKey, '1')"),
    'automatic banner dismissal must still record its dismissal key');
}

function makeWindow(opts) {
  const preDismissed = !!(opts && opts.preDismissed);
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

      // Simulate a session where the banner was already dismissed earlier
      // (e.g. an earlier page load this browser session) -- seasons.js
      // reads this same key at injectFooterBanner() time via
      // `clpeasy-banner-dismissed-${new Date().getMonth()}` (September = 8).
      if (preDismissed) {
        window.sessionStorage.setItem('clpeasy-banner-dismissed-8', '1');
      }

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

// ── Static checks: CTA link + opacity (no clock advancement needed) ──
{
  const dom = makeWindow();
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  const cta = dom.window.document.getElementById('clpeasy-season-icon');
  assert(cta, 'September seasonal hero CTA must be inserted');
  assert.strictEqual(cta.tagName, 'A', 'seasonal hero CTA must be keyboard- and link-accessible');
  assert.strictEqual(cta.getAttribute('href'), 'builder.html', 'September CTA must open the label builder');
  assert.strictEqual(cta.getAttribute('aria-label'), 'Build your autumn range labels now');
  assert(cta.textContent.includes('Build your autumn range labels now'));
  assert.strictEqual(dom.window.document.getElementById('clpeasy-particles').style.opacity, '0.72');

  dom.window.close();
}

// ── SCENARIO A: automatic banner dismissal stops the leaves at ~12s,
//    and the independent 60s timer is a harmless no-op afterwards ──────
{
  const dom = makeWindow();
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  // Leaves must be present and at full opacity right from page load.
  let particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'autumn particles must be present immediately after page load');
  assert.strictEqual(particles.style.opacity, '0.72',
    'autumn particles must start at full 0.72 opacity');

  // Just before the banner's auto-dismiss point (4s appear-delay + 8s
  // auto-visible window = 12s) the leaves must still be running, untouched.
  dom.window.__advanceClock(11999);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'autumn particles must still be present just before the banner auto-dismisses');
  assert.strictEqual(particles.style.opacity, '0.72',
    'autumn particles must remain at full opacity right up to the banner auto-dismiss point');
  const dismissKey = 'clpeasy-banner-dismissed-8'; // September = month index 8
  assert.strictEqual(dom.window.sessionStorage.getItem(dismissKey), null,
    'the banner must not have auto-dismissed yet just before the 12s point');

  // Cross the 12s auto-dismiss point: the banner hides, records its
  // dismissal key, AND stops the leaves -- all together.
  dom.window.__advanceClock(2); // now at 12001ms
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'the particle element should still exist right as the auto-dismiss fade-out begins');
  assert.strictEqual(particles.style.opacity, '0',
    'automatic banner dismissal must stop the leaves (fade to opacity 0) at the ~12s point');
  assert.strictEqual(dom.window.sessionStorage.getItem(dismissKey), '1',
    'automatic dismissal must record the banner\'s own dismissal key at the same ~12s point');

  // stopParticles() removes the element ~600ms after fading it out.
  dom.window.__advanceClock(700);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must be fully removed shortly after the automatic banner dismissal stops it');

  // The independent 60s particleStopTimer would otherwise fire around
  // now (60s from page load) -- but stopParticles() already cleared it as
  // part of its own cleanup at the 12s stop. Advancing well past 60s must
  // not throw and must not resurrect or otherwise touch the (already
  // removed) particle element: the 60s timer is a harmless no-op here.
  assert.doesNotThrow(() => dom.window.__advanceClock(60000), // now at ~72.7s
    'the independent 60s timer must not error after the leaves already stopped early');
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must remain removed well past the 60s mark -- the safety timer must not resurrect it or do anything else');

  dom.window.close();
}

// ── SCENARIO B: an explicit user close stops the leaves immediately,
//    independent of the 12s auto-dismiss timing ────────────────────────
{
  const dom = makeWindow();
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  // The close button exists immediately (its listener is registered
  // unconditionally, independent of the banner's own show/auto-dismiss
  // timing), so a user can click it right away, well before the 12s point.
  let particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0.72',
    'sanity check: particles must be visible before the explicit close is clicked');

  dom.window.document.getElementById('clpeasy-banner-close').dispatchEvent(new dom.window.Event('click'));

  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'the particle element should still exist right as the explicit-close fade-out begins');
  assert.strictEqual(particles.style.opacity, '0',
    'an explicit user close must stop the particle effect immediately, well before the 12s auto-dismiss point');

  dom.window.__advanceClock(700);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must be fully removed shortly after an explicit close');

  dom.window.close();
}

// ── SCENARIO C: when the banner was already dismissed in an earlier
//    session (its auto-show/dismiss chain never runs this load), the
//    independent 60s timer is the fallback that still stops the leaves ──
{
  const dom = makeWindow({ preDismissed: true });
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  let particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0.72',
    'leaves must still run even when the banner itself will not show again this session');

  // Well past the 12s point the banner would otherwise have auto-dismissed
  // at -- since it never showed, nothing should have stopped the leaves yet.
  dom.window.__advanceClock(30000); // now at 30s
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'without the banner auto-dismiss chain running, the leaves must not have stopped by 30s');
  assert.strictEqual(particles.style.opacity, '0.72',
    'the leaves must remain at full opacity until the independent 60s fallback timer fires');

  // Cross the independent 60s particleStopTimer -- the fallback.
  dom.window.__advanceClock(30001); // now at ~60.001s
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'the particle element should still exist right as the 60s fallback fade-out begins');
  assert.strictEqual(particles.style.opacity, '0',
    'the independent 60s timer must act as a fallback and still stop the leaves when the banner never auto-dismisses again');

  dom.window.__advanceClock(700);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must be fully removed shortly after the 60s fallback stops it');

  dom.window.close();
}

console.log('autumn homepage UI checks passed (working builder CTA; recognisable pointed, veined leaf particles; automatic banner dismissal now stops the leaves together with it at ~12s; an explicit user close still stops them immediately; the independent 60s timer is a harmless no-op when the leaves already stopped early, and remains a working fallback when the banner never auto-dismisses again)');
