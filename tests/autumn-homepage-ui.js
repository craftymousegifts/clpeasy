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

    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    window.HTMLCanvasElement.prototype.getContext = () => ({
      clearRect(){}, save(){}, restore(){}, translate(){}, rotate(){},
      beginPath(){}, moveTo(){}, bezierCurveTo(){}, closePath(){}, fill(){},
      lineTo(){}, stroke(){}, ellipse(){}, arc(){},
      set fillStyle(value){}, set strokeStyle(value){}, set lineWidth(value){}
    });
  }
});

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
console.log('autumn homepage UI checks passed (working builder CTA; recognisable pointed, veined leaf particles)');
