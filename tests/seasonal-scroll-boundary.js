// Regression: seasonal decorations must never scroll below the inline banner.
// Simulate iPhone Safari scroll/address-bar movement and responsive relayout.
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('seasons.js', 'utf8');

async function run() {
  const dom = new JSDOM('<!doctype html><html><body><section class="homepage-image-hero"></section><section id="how-it-works">How it works</section></body></html>', {
    url: 'https://clpeasy.com/', runScripts: 'dangerously',
    beforeParse(w) {
      const RealDate = w.Date;
      const fixed = new RealDate(2026, 10, 10, 12).getTime();
      w.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      };
      w.innerWidth = 390; w.innerHeight = 844;
      let now = 0, next = 1;
      const timers = new Map();
      function schedule(fn, ms) { const id = next++; timers.set(id, {at: now + ms, fn}); return id; }
      w.setTimeout = (fn, ms) => schedule(fn, ms);
      w.clearTimeout = id => timers.delete(id);
      w.requestAnimationFrame = fn => schedule(fn, 16);
      w.cancelAnimationFrame = id => timers.delete(id);
      w.advance = ms => {
        const until = now + ms;
        while (true) {
          const due = [...timers.entries()].filter(([,t]) => t.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
          if (!due) break;
          timers.delete(due[0]); now = due[1].at; due[1].fn();
        }
        now = until;
      };
      w.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect(){}, save(){}, restore(){}, translate(){}, rotate(){},
        beginPath(){}, rect(){}, clip(){}, moveTo(){}, bezierCurveTo(){},
        closePath(){}, fill(){}, lineTo(){}, stroke(){}, fillText(){},
        set fillStyle(x){}, set strokeStyle(x){}, set lineWidth(x){},
        set font(x){}, set textAlign(x){}, set textBaseline(x){}
      });
    }
  });
  const w = dom.window;
  // jsdom does not lay out elements; simulate a real banner below the hero.
  let bannerDocumentBottom = 1190;
  const nativeRect = w.HTMLElement.prototype.getBoundingClientRect;
  w.HTMLElement.prototype.getBoundingClientRect = function() {
    if (this.id === 'clpeasy-season-banner') {
      return {bottom: bannerDocumentBottom - w.scrollY};
    }
    return nativeRect.call(this);
  };
  w.eval(source);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const canvas = w.document.getElementById('clpeasy-particles');
  assert(canvas, 'festive particle canvas should be created');
  assert.strictEqual(canvas.style.position, 'absolute', 'canvas must scroll with document, not visual viewport');
  assert.strictEqual(canvas.height, 1190);
  assert.strictEqual(canvas.style.height, '1190px');
  assert.strictEqual(canvas.width, 390);
  // Fast scrolling must not move the canvas's document bottom.
  for (const scrollY of [250, 900, 1500, 300, 0]) {
    Object.defineProperty(w, 'scrollY', {value: scrollY, configurable: true});
    w.advance(16);
    assert.strictEqual(canvas.height, 1190, 'scroll must not change document-space clipping boundary');
    assert.strictEqual(canvas.style.height, '1190px');
  }
  // Safari browser chrome changing viewport height must not expose particles.
  w.innerHeight = 720;
  w.dispatchEvent(new w.Event('resize'));
  assert.strictEqual(canvas.height, 1190);
  // Actual layout change must follow the banner edge.
  bannerDocumentBottom = 1270;
  w.advance(16);
  assert.strictEqual(canvas.height, 1270);
  assert.strictEqual(canvas.style.height, '1270px');
  // Orientation changes still redistribute across the new width.
  w.innerWidth = 844;
  w.dispatchEvent(new w.Event('resize'));
  assert.strictEqual(canvas.width, 844);
  w.advance(12650);
  assert.strictEqual(w.document.getElementById('clpeasy-particles'), null,
    'particles still stop and are removed after the approved 12-second duration');
  assert(w.document.getElementById('clpeasy-season-banner'),
    'seasonal banner remains in place');
  dom.window.close();
  console.log('seasonal scroll boundary regression passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
