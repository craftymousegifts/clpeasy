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
// Particle-lifecycle coverage (Preview #108 QA, 2026-09-09): the footer
// banner auto-dismisses itself 12s after page load (a 4s appear-delay plus
// an 8s auto-visible window) and was calling stopParticles() at that point
// -- cutting the autumn leaves far earlier than their own independent 60s
// particleStopTimer (set in addParticles()) intended. The fix removes that
// one call so automatic dismissal only hides the banner and records its
// session dismissal key; the explicit "x" close button still stops the
// particles immediately, since that IS a deliberate user action. Proving
// this needs real elapsed time (12s, then 60s) without the test actually
// waiting that long, so `installFakeClock()` below replaces the window's
// setTimeout/clearTimeout/requestAnimationFrame/cancelAnimationFrame with
// a manually-advanceable virtual clock: `advance(ms)` fires every timer
// (including ones newly scheduled by an already-firing timer, e.g. the
// banner's nested 4s-then-8s chain, or each animation frame's own
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

// Preview #108 QA fix: stopParticles() must be called exactly once in the
// whole file (the explicit close-button handler) -- not from the
// automatic-dismissal branch above it. This is a source-level guard
// against the exact regression QA found; the behavioural proof below
// (SCENARIO A/B) is the direct evidence.
const stopParticlesCalls = (source.match(/stopParticles\(\);/g) || []).length;
assert.strictEqual(stopParticlesCalls, 1,
  `stopParticles() must be called exactly once in seasons.js (the explicit close-button handler only) -- found ${stopParticlesCalls} call(s)`);
assert(source.indexOf('Auto-dismiss after 8 seconds') > -1, 'could not locate the auto-dismiss block to check');
{
  const startIdx = source.indexOf('Auto-dismiss after 8 seconds');
  const endIdx = source.indexOf('}, 4000);', startIdx);
  // Strip comment-only lines first -- this block's own explanatory
  // comment (added by the fix) mentions "stopParticles()" in prose, which
  // would otherwise false-positive against a plain substring check.
  const block = source.slice(startIdx, endIdx)
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
  assert(!block.includes('stopParticles()'),
    'automatic banner dismissal must not call stopParticles() -- it must only hide the banner and set its dismissal key');
  assert(block.includes("sessionStorage.setItem(dismissKey, '1')"),
    'automatic banner dismissal must still record its dismissal key');
}

function makeWindow() {
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

// ── SCENARIO A: automatic banner dismissal must not stop the leaves;
//    the independent 60s timer still does ──────────────────────────
{
  const dom = makeWindow();
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  // Just past the banner's auto-dismiss point (4s appear-delay + 8s
  // auto-visible window = 12s).
  dom.window.__advanceClock(12001);
  let particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'autumn particles must still be present in the DOM immediately after the banner auto-dismisses');
  assert.strictEqual(particles.style.opacity, '0.72',
    'autumn particles must still be at full 0.72 opacity after the banner auto-dismisses -- they must not have started fading out');
  const dismissKey = 'clpeasy-banner-dismissed-8'; // September = month index 8
  assert.strictEqual(dom.window.sessionStorage.getItem(dismissKey), '1',
    'automatic dismissal must still record the banner\'s own dismissal key');

  // Nothing new happens between 12s and the 60s cap.
  dom.window.__advanceClock(30000); // now at ~42s
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'autumn particles must still be present well after the banner auto-dismiss point, before the 60s cap');
  assert.strictEqual(particles.style.opacity, '0.72',
    'autumn particles must remain at full opacity until the independent 60s timer fires');

  // Cross the existing independent 60s particleStopTimer, but stop just
  // past it (not all the way to +700ms) so the fade-out is observed
  // before the separate removal timer (stopParticles' own +600ms) fires.
  dom.window.__advanceClock(18000); // now at ~60.001s, just past the 60s cap
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'the particle element should still exist right as the 60s stop begins its fade-out');
  assert.strictEqual(particles.style.opacity, '0',
    'the existing independent 60s particleStopTimer must still stop the leaves');

  // stopParticles() removes the element ~600ms after fading it out.
  dom.window.__advanceClock(700);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must be fully removed shortly after the 60s timer stops it');

  dom.window.close();
}

// ── SCENARIO B: an explicit user close still stops the leaves right away ──
{
  const dom = makeWindow();
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  // The close button exists immediately (its listener is registered
  // unconditionally, independent of the banner's own show/auto-dismiss
  // timing), so a user can click it right away.
  let particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles && particles.style.opacity === '0.72',
    'sanity check: particles must be visible before the explicit close is clicked');

  dom.window.document.getElementById('clpeasy-banner-close').dispatchEvent(new dom.window.Event('click'));

  particles = dom.window.document.getElementById('clpeasy-particles');
  assert(particles, 'the particle element should still exist right as the explicit-close fade-out begins');
  assert.strictEqual(particles.style.opacity, '0',
    'an explicit user close must still stop the particle effect immediately (well before either the 12s auto-dismiss point or the 60s cap)');

  dom.window.__advanceClock(700);
  particles = dom.window.document.getElementById('clpeasy-particles');
  assert.strictEqual(particles, null,
    'the particle canvas must be fully removed shortly after an explicit close');

  dom.window.close();
}

console.log('autumn homepage UI checks passed (working builder CTA; recognisable pointed, veined leaf particles; automatic banner dismissal no longer stops the leaves early; the independent 60s timer and an explicit user close both still stop them)');
