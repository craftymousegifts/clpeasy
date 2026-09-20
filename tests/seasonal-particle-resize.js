// Regression coverage for the Sep 2026 particle-redistribution-on-resize fix.
//
// Bug: addParticles() in seasons.js distributes falling leaves/pumpkins
// using the canvas width AT THE MOMENT they are created (via laneX(), a
// fixed-width horizontal "lane" per particle). The old resize listener only
// updated canvas.width/canvas.height -- it never touched any particle's x/y
// -- so widening the browser (e.g. maximising it) left every existing
// particle confined to the OLD, narrower width, leaving an empty strip on
// the right until a particle happened to recycle off the bottom edge.
//
// Fix (see seasons.js addParticles()): a module-scoped particleResizeHandler
// now (a) only acts on a GENUINE viewport-dimension change, (b) records the
// previous canvas width/height before resizing, (c) proportionally rescales
// every particle's x/y from the old dimensions to the new ones (so the
// whole set redistributes immediately, not just on recycle), (d) falls back
// to laneX(p.lane) -- recomputed against the NEW width -- for any particle
// that was parked just off-edge mid-wrap rather than scaling that sentinel
// position, and (e) clamps the result into valid bounds. stopParticles()
// now also removes this listener so it can never act on a stale/removed
// canvas, and addParticles() removes any stray previous listener itself so
// repeated invocations cannot stack duplicates.
//
// This test drives the REAL seasons.js source through a real page load (via
// jsdom, exactly like tests/autumn-homepage-ui.js) and real `resize` events
// -- it never calls any internal function manually. Particle positions are
// observed by recording every ctx.translate(x, y) call draw() makes each
// animation frame (the same coordinates draw() itself uses to place each
// particle), advanced via the same manually-advanceable virtual
// setTimeout/requestAnimationFrame clock tests/autumn-homepage-ui.js
// established.
//
// Run from the repo root: node tests/seasonal-particle-resize.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('seasons.js', 'utf8');

// ── Source-level guards ──────────────────────────────────────────────
assert(source.includes('let particleResizeHandler = null;'),
  'the resize listener must be tracked at module scope so stopParticles() can remove it regardless of which addParticles() call registered it');
assert(/stopParticles\(\)\s*\{[\s\S]{0,400}window\.removeEventListener\('resize', particleResizeHandler\)/.test(source),
  "stopParticles() must remove/neutralise the resize listener so it cannot continue acting on a removed or stale canvas");
assert(/if \(newWidth === canvas\.width && newHeight === canvas\.height\) return;/.test(source),
  'the resize handler must bail out (no remap) when the dimensions have not genuinely changed');
assert(/p\.x = laneX\(p\.lane\);/.test(source.split('particleResizeHandler = () => {')[1] || ''),
  'a particle outside the previous valid bounds (mid-wrap) must be reset safely via laneX(p.lane) on resize, not scaled as if it were a real position');
assert(source.includes("window.removeEventListener('resize', particleResizeHandler); particleResizeHandler = null;\n    const canvas = document.createElement('canvas');".split('\n')[0]) || /addParticles\(type, accentColor\) \{[\s\S]{0,400}particleResizeHandler[\s\S]{0,60}removeEventListener/.test(source),
  'addParticles() must remove any stray previous resize listener itself, so repeated invocations cannot stack duplicate listeners');

// ── Real page-load / real-resize-event runtime checks ─────────────────
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
      // Fixed clock: 9 September 2026 -> 'leaves' particles, 18 of them,
      // opacity 0.72 (matches tests/autumn-homepage-ui.js's own scenario A).
      const RealDate = window.Date;
      const FIXED_MS = new RealDate(2026, 8, 9, 12, 0, 0).getTime();
      class FixedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) { super(FIXED_MS); } else { super(...args); }
        }
        static now() { return FIXED_MS; }
      }
      window.Date = FixedDate;

      window._sb = {
        auth: { getSession: () => Promise.resolve({ data: { session: null } }) }
      };

      // Start at a real desktop viewport (jsdom defaults to 1024x768 --
      // this pins the pre-resize dimensions explicitly instead of relying
      // on that default).
      window.innerWidth = 1366;
      window.innerHeight = 768;

      // Manually-advanceable virtual clock, identical in shape to
      // tests/autumn-homepage-ui.js's own harness.
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

      // Records every ctx.translate(x, y) call draw() makes -- one call per
      // particle per frame, in the same order every time -- so a single
      // advanced frame gives us every current particle position without
      // ever touching seasons.js's private `particles` array directly.
      let currentRecord = [];
      window.__getRecord = () => currentRecord;
      window.__resetRecord = () => { currentRecord = []; };
      window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect(){}, save(){}, restore(){},
        translate(x, y) { currentRecord.push([x, y]); },
        rotate(){}, beginPath(){}, moveTo(){}, bezierCurveTo(){}, closePath(){}, fill(){},
        lineTo(){}, stroke(){}, ellipse(){}, arc(){}, fillText(){},
        set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
        set font(v){}, set textAlign(v){}, set textBaseline(v){},
      });
    }
  });
  return dom;
}

function flushMicrotasks() {
  return new Promise(resolve => setImmediate(resolve));
}

async function loadAndSettle(dom) {
  dom.window.eval(source);
  // jsdom fires its own DOMContentLoaded once (asynchronously) as the
  // document's readyState naturally transitions to 'complete' -- a second,
  // manually-dispatched DOMContentLoaded on top of that (as an earlier
  // draft of this test did) double-fires seasons.js's own
  // `document.addEventListener('DOMContentLoaded', init)` listener and
  // double-runs addParticles(), which is a test-harness artifact (jsdom
  // dispatching an event twice), not a real-browser possibility (a
  // document's DOMContentLoaded fires exactly once) and not a seasons.js
  // bug -- so this test relies solely on jsdom's own single, natural
  // firing, exactly like a real page load.
  await flushMicrotasks();
  await flushMicrotasks();
  await flushMicrotasks();
  await flushMicrotasks();
}

// One RAF tick's worth of particle positions, captured fresh.
function captureFrame(win) {
  win.__resetRecord();
  win.__advanceClock(16);
  return win.__getRecord();
}

async function main() {
  const dom = makeWindow();
  const win = dom.window;
  await loadAndSettle(dom);

  const canvas = win.document.getElementById('clpeasy-particles');
  assert(canvas, 'the particle canvas must exist after a normal eligible load');
  assert.strictEqual(canvas.width, 1366, 'canvas must be created at the initial viewport width');
  assert.strictEqual(canvas.height, 768, 'canvas must be created at the initial viewport height');

  // ── 1. Particles initially occupy lanes across the COMPLETE viewport ──
  let frame = captureFrame(win);
  assert.strictEqual(frame.length, 18, `expected 18 leaf particles for September, saw ${frame.length} translate() calls in one frame`);
  let xs = frame.map(p => p[0]);
  assert(Math.min(...xs) < 1366 * 0.2, `some particles must start near the left edge of the initial 1366px viewport -- min x was ${Math.min(...xs)}`);
  assert(Math.max(...xs) > 1366 * 0.8, `some particles must start near the right edge of the initial 1366px viewport -- max x was ${Math.max(...xs)}`);

  // ── 2. Expanding 1366px -> 1920px immediately redistributes into the
  //       new right-hand area, without waiting for any particle to recycle ──
  win.innerWidth = 1920;
  win.innerHeight = 1080;
  win.dispatchEvent(new win.Event('resize'));
  assert.strictEqual(canvas.width, 1920, 'canvas width must update immediately on a genuine resize');
  assert.strictEqual(canvas.height, 1080, 'canvas height must update immediately on a genuine resize');

  frame = captureFrame(win);
  assert.strictEqual(frame.length, 18, 'the particle count must not change across a resize');
  xs = frame.map(p => p[0]);
  let ys = frame.map(p => p[1]);
  assert(Math.max(...xs) > 1366, `expanding to 1920px must populate the new right-hand area (beyond the old 1366px edge) immediately -- max x was ${Math.max(...xs)}, expected some > 1366`);
  assert(Math.max(...xs) <= 1920 + 20, `no particle may sit meaningfully outside the new 1920px viewport -- max x was ${Math.max(...xs)}`);
  assert(xs.every(x => x >= -20), 'no particle x may fall below the valid lower bound after a resize');
  assert(ys.every(y => y >= -20 && y <= 1080 + 20), 'every particle y must be within valid bounds of the new 1080px height after a resize');

  // ── 3. Shrinking 1920px -> 1024px keeps every position within valid
  //       bounds ─────────────────────────────────────────────────────────
  win.innerWidth = 1024;
  win.innerHeight = 768;
  win.dispatchEvent(new win.Event('resize'));
  assert.strictEqual(canvas.width, 1024);
  assert.strictEqual(canvas.height, 768);

  frame = captureFrame(win);
  xs = frame.map(p => p[0]);
  ys = frame.map(p => p[1]);
  assert(xs.every(x => x >= -20 && x <= 1024 + 20), `every particle x must be clamped within the new, smaller 1024px viewport -- got [${xs.join(', ')}]`);
  assert(ys.every(y => y >= -20 && y <= 768 + 20), 'every particle y must be clamped within the new, smaller 768px viewport');

  // ── 4. Re-expanding leaves no empty right-hand strip ───────────────────
  win.innerWidth = 1920;
  win.innerHeight = 1080;
  win.dispatchEvent(new win.Event('resize'));
  frame = captureFrame(win);
  xs = frame.map(p => p[0]);
  assert(Math.max(...xs) > 1024, `re-expanding to 1920px must again populate space beyond the previous 1024px edge -- max x was ${Math.max(...xs)}`);
  assert(Math.max(...xs) > 1920 * 0.6, `re-expanding must not leave the right-hand portion of the 1920px viewport empty -- max x was ${Math.max(...xs)}`);

  // ── 5. Mobile portrait -> landscape resizing redistributes correctly ──
  win.innerWidth = 390;
  win.innerHeight = 844;
  win.dispatchEvent(new win.Event('resize'));
  assert.strictEqual(canvas.width, 390);
  assert.strictEqual(canvas.height, 844);
  frame = captureFrame(win);
  assert(frame.every(p => p[0] >= -20 && p[0] <= 390 + 20), 'every particle x must be within bounds after resizing down to a mobile portrait viewport');
  assert(frame.every(p => p[1] >= -20 && p[1] <= 844 + 20), 'every particle y must be within bounds after resizing down to a mobile portrait viewport');

  win.innerWidth = 844;
  win.innerHeight = 390;
  win.dispatchEvent(new win.Event('resize'));
  assert.strictEqual(canvas.width, 844);
  assert.strictEqual(canvas.height, 390);
  frame = captureFrame(win);
  xs = frame.map(p => p[0]);
  ys = frame.map(p => p[1]);
  assert(xs.every(x => x >= -20 && x <= 844 + 20), 'every particle x must be within bounds after the portrait-to-landscape orientation change');
  assert(ys.every(y => y >= -20 && y <= 390 + 20), 'every particle y must be within bounds after the portrait-to-landscape orientation change');
  assert(Math.max(...xs) > 390, `landscape orientation must populate the widened area beyond the old 390px portrait width -- max x was ${Math.max(...xs)}`);

  // ── 6 & 7. Repeated resize events (including a no-op one, at the SAME
  //           dimensions) must not create another canvas or another
  //           animation loop/timer ─────────────────────────────────────
  const canvasCountBefore = win.document.querySelectorAll('#clpeasy-particles').length;
  assert.strictEqual(canvasCountBefore, 1, 'sanity check: exactly one particle canvas must exist before repeated resize events');
  win.dispatchEvent(new win.Event('resize')); // no-op: same 844x390 as above
  win.dispatchEvent(new win.Event('resize')); // no-op again
  win.innerWidth = 800; // a genuine change
  win.dispatchEvent(new win.Event('resize'));
  win.dispatchEvent(new win.Event('resize')); // repeat the SAME new size -- no-op
  assert.strictEqual(win.document.querySelectorAll('#clpeasy-particles').length, 1,
    'repeated resize events (including no-op repeats) must never create a second particle canvas');
  frame = captureFrame(win);
  assert.strictEqual(frame.length, 18,
    `repeated resize events must not spin up a duplicate animation loop -- one frame must still draw exactly 18 particles, saw ${frame.length} translate() calls (a duplicate requestAnimationFrame loop would double this)`);

  // ── 8. stopParticles() cleans up the canvas AND the resize listener --
  //       a resize after stopping must not resurrect anything ───────────
  win.document.getElementById('clpeasy-banner-close').dispatchEvent(new win.Event('click'));
  win.__advanceClock(700); // past the 0.6s fade-out/removal in stopParticles()
  assert.strictEqual(win.document.getElementById('clpeasy-particles'), null,
    'the particle canvas must be fully removed after stopParticles() runs');

  assert.doesNotThrow(() => {
    win.innerWidth = 1920;
    win.innerHeight = 1080;
    win.dispatchEvent(new win.Event('resize'));
  }, 'a resize event after stopParticles() must not throw (the listener must have been removed, not left dangling on a stale canvas)');
  assert.strictEqual(win.document.getElementById('clpeasy-particles'), null,
    'a resize event after stopParticles() must not recreate the particle canvas -- the resize listener must have been removed');

  // ── 9. Existing banner timing and particle-stop behaviour are unchanged ──
  // (light touch here -- tests/autumn-homepage-ui.js already covers this
  // exhaustively; this just confirms the resize fix did not disturb it.)
  const banner = win.document.getElementById('clpeasy-season-banner');
  assert.strictEqual(banner.style.transform, 'translateY(100%)',
    'the banner must remain in its dismissed state after the explicit close, unaffected by the resize fix');

  win.close();

  console.log('seasonal particle resize checks passed (particles fill the complete viewport on load; expanding/shrinking/re-expanding desktop widths and a mobile portrait<->landscape orientation change all redistribute particles immediately and keep every position within valid bounds; repeated resize events -- including no-ops at unchanged dimensions -- create no duplicate canvas or animation loop; stopParticles() removes the resize listener so a later resize cannot resurrect the canvas; banner dismissal timing is unaffected)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
