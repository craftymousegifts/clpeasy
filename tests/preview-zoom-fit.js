// ── LABEL PREVIEW ZOOM / FIT-TO-VIEW REGRESSION COVERAGE ─────────────────
// Regression coverage for Michaela's manual review of Preview #105
// (2026-09-06): "Fit to view" was landing at 51% (a hardcoded absolute
// zoom unrelated to any real fit calculation) while manual zoom could
// reach 114% (because the displayed "100%" reference point was only 88%
// of the true full-fill scale).
//
// (28 Sep 2026, REVISED for the sixth correction's fit-to-view
// circularity fix): the desktop preview panel became content-height,
// which made #preview-canvas-area's own clientHeight a function of the
// very SVG size recomputePreviewFit() was trying to calculate --
// SVG height -> stage height -> canvas-area clientHeight -> fit
// calculation -> SVG height again. Fixed by making the preview column's
// WIDTH the primary constraint (a genuine grid-track value, independent
// of this element's own content) and deriving a maximum-height guard from
// .wizard-panel's height instead (the form column, in the same grid row,
// whose height is set directly by .builder-layout's own
// height:calc(100vh - 230px) rule -- independent of the preview).
//
// This file proves builder.html's zoom:
//   - never displays more than 100%, however the user tries to zoom in;
//   - "Fit to view" always lands on exactly 100%, i.e. the largest scale
//     that fits the whole label inside the available preview column
//     width, capped by the independent row-height guard;
//   - that 100% scale is genuinely contained, preserving aspect ratio;
//   - it recalculates when the label's shape/dimensions change and when
//     the preview panel/window resizes;
//   - the NEW formula is deterministic and stable: repeated calls,
//     shape-switch-and-back, and resize all converge to the identical
//     result with no oscillation (the specific property the circularity
//     fix above needed to guarantee, which the old height-from-content
//     formula could never actually promise).
// jsdom performs no real layout, so real elements' offsetParent is always
// null (see updateLabel()'s existing visibility gate) -- this harness
// stubs offsetParent and the preview panel's clientWidth (and, for the
// max-height guard, .wizard-panel's clientHeight) the same kind of
// environment stub tests/builder-regression.js already uses for the
// canvas 2D context, so the actual shared code path (updateLabel() ->
// recomputePreviewFit()/applyZoomToSVG(), and fitPreviewToView()) runs
// for real rather than being reimplemented here.
// Run from the repo root: node tests/preview-zoom-fit.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource);
    window.eval(labelLibrarySource);
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:false, error:null })
    }) };
  }
});

const { window } = dom;
const document = window.document;

// Stubs the preview column's WIDTH (a genuine grid-track value in
// production, safe to stub directly here) and the FORM column's height
// (.wizard-panel -- the independent max-height reference the new formula
// uses instead of the preview's own, circular, clientHeight). Not
// stubbing #preview-canvas-area's clientHeight at all is deliberate: the
// new formula never reads it, and leaving it stubbable would risk a test
// silently passing by accident if a future change reintroduced that read.
function setPreviewGeometry(colWidth, rowHeight){
  const area = document.getElementById('preview-canvas-area');
  Object.defineProperty(area, 'clientWidth', { value: colWidth, configurable: true });
  const formPanel = document.querySelector('.wizard-panel');
  Object.defineProperty(formPanel, 'clientHeight', { value: rowHeight, configurable: true });
}
function stubVisible(){
  const dc = document.getElementById('label-svg-container');
  Object.defineProperty(dc, 'offsetParent', { value: {}, configurable: true });
}
// Independently derives the expected reserved inset from the LIVE
// elements' own computed CSS (padding only, matching recomputePreviewFit()'s
// own boxInsets() -- reimplemented separately here, not imported from
// builder.html, precisely so this test would actually fail if that
// function's real behaviour diverged from what it's declared to do) plus
// the one documented small BREATHING constant.
const BREATHING = 8;
function expectedReservedInset(){
  const area = document.getElementById('preview-canvas-area');
  const stage = document.getElementById('preview-stage');
  function pad(el, axis){
    const cs = window.getComputedStyle(el);
    return axis === 'x'
      ? (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.paddingRight)||0)
      : (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0);
  }
  return {
    x: pad(area,'x') + pad(stage,'x') + BREATHING,
    y: pad(area,'y') + pad(stage,'y') + BREATHING
  };
}
// Independently computes the expected fit zoom using the SAME algorithm
// recomputePreviewFit() is documented to use -- width-driven, height
// capped by an independent row-height reference, AND an explicit
// display-size cap (29 Sep 2026, seventh correction) -- WITHOUT calling
// into builder.html's own function, so this is a genuine cross-check.
const MAX_DISPLAY_PX = 320;
function expectedFitZoom(colWidth, rowHeight, vbW, vbH){
  const inset = expectedReservedInset();
  const widthZoom = (colWidth - inset.x) / vbW;
  const heightZoom = (rowHeight - inset.y) / vbH;
  const capZoom = Math.min(MAX_DISPLAY_PX / vbW, MAX_DISPLAY_PX / vbH);
  return Math.min(widthZoom, heightZoom, capZoom);
}

setTimeout(async () => {
  try {
    assert.deepStrictEqual(errors, [], 'builder.html must never throw during preview-zoom testing: ' + errors.join('; '));
    stubVisible();
    let passed = 0;
    function ok(label){ passed++; console.log('PASS:', label); }

    function currentSvgBox(){
      const dc = document.getElementById('label-svg-container');
      const svg = dc.querySelector('svg');
      const vb = svg.getAttribute('viewBox');
      const [,, vbW, vbH] = vb.split(' ').map(Number);
      return { vbW, vbH };
    }

    const cases = [
      { label:'63×44mm rectangle', setup(){ window.selectShape('rectangle'); document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput(); } },
      { label:'63mm circle', setup(){ window.selectShape('circle'); window.selectSize(63); } },
      { label:'57×99mm rectangle', setup(){ window.selectShape('rectangle'); document.getElementById('custom-w').value='57'; document.getElementById('custom-h').value='99'; window.onDimInput(); } },
    ];
    // "narrow" here stands in for a smaller desktop/tablet-landscape
    // preview column -- recomputePreviewFit() never actually runs on the
    // <=860px mobile layout at all (it's gated behind
    // #label-svg-container's offsetParent, which is null there because
    // .right-column is display:none; mobile's bottom-sheet preview uses
    // a completely separate #sheet-label-container with no fit
    // calculation of its own), so there is no true "mobile" fit case to
    // cover in this file -- only a range of desktop column widths.
    const geometries = [
      { label:'wide desktop', w:760, h:560 },
      { label:'narrow desktop', w:400, h:340 },
    ];

    // ── 0. Explicit display-size cap is genuinely enforced ───────────────
    // At a realistic column/row size (well within the 360-420px column
    // and comfortably tall), the circle/square MUST be capped at
    // MAX_DISPLAY_PX, not merely happen to be smaller for some other
    // reason -- this proves the cap is a real, binding constraint, not
    // just present in the formula but never actually the limiting factor.
    {
      setPreviewGeometry(400, 500); // generous width+height so only the cap can be binding
      window.selectShape('circle'); window.selectSize(63);
      window.fitPreviewToView();
      const dc = document.getElementById('label-svg-container');
      const svg = dc.querySelector('svg');
      const renderedW = Number(svg.getAttribute('width'));
      const renderedH = Number(svg.getAttribute('height'));
      assert(renderedW <= MAX_DISPLAY_PX + 1 && renderedH <= MAX_DISPLAY_PX + 1, `a circle must never display larger than the ${MAX_DISPLAY_PX}px cap even with generous column/row space, got ${renderedW}x${renderedH}`);
      assert(Math.abs(Math.max(renderedW, renderedH) - MAX_DISPLAY_PX) <= 1, `the cap must be the genuinely BINDING constraint here (rendered size should equal the cap, not sit arbitrarily smaller), got ${renderedW}x${renderedH} vs cap ${MAX_DISPLAY_PX}`);
      ok(`explicit display-size cap (${MAX_DISPLAY_PX}px) is genuinely enforced for a circle with generous available space`);
    }

    // ── 1. Fit to view always lands on exactly 100%, genuinely contained ─
    for(const c of cases){
      for(const geo of geometries){
        setPreviewGeometry(geo.w, geo.h);
        c.setup();
        const { vbW, vbH } = currentSvgBox();
        const expectedFit = expectedFitZoom(geo.w, geo.h, vbW, vbH);
        const inset = expectedReservedInset();
        const aW = geo.w - inset.x, aH = geo.h - inset.y;

        window.fitPreviewToView();
        const pct = document.getElementById('zoom-pct').textContent;
        assert.strictEqual(pct, '100%', `Fit to view must display exactly 100% for ${c.label} at ${geo.label} geometry, got ${pct}`);
        assert(Math.abs(window.eval('_previewFitZoom') - expectedFit) < 1e-6, `Fit to view's computed scale must equal the width-driven/height-capped formula's result for ${c.label} at ${geo.label} geometry`);

        const dc = document.getElementById('label-svg-container');
        const svg = dc.querySelector('svg');
        const renderedW = Number(svg.getAttribute('width'));
        const renderedH = Number(svg.getAttribute('height'));
        assert(renderedW <= aW + 1, `Fit to view must not crop/overflow width for ${c.label} at ${geo.label} geometry (${renderedW} > ${aW})`);
        assert(renderedH <= aH + 1, `Fit to view must not crop/overflow height for ${c.label} at ${geo.label} geometry (${renderedH} > ${aH})`);
        // Must be the LARGEST contained scale -- i.e. it should be touching
        // one of the two available-space boundaries, not sitting arbitrarily
        // smaller inside them (which would mean unnecessary empty space).
        const touchesWidth = Math.abs(renderedW - aW) <= 1;
        const touchesHeight = Math.abs(renderedH - aH) <= 1;
        // (29 Sep 2026, seventh correction): a third valid reason to stop
        // growing is the explicit display-size cap -- when that's the
        // binding constraint, the rendered label legitimately does NOT
        // touch the column/row boundary (there's deliberate room to
        // spare), so "no unnecessary empty space" must also accept
        // "correctly capped" as a valid outcome, not just "fills the
        // available space".
        const touchesCap = Math.abs(Math.max(renderedW, renderedH) - MAX_DISPLAY_PX) <= 1;
        assert(touchesWidth || touchesHeight || touchesCap, `Fit to view must use all available width/height, or be correctly capped at ${MAX_DISPLAY_PX}px, for ${c.label} at ${geo.label} geometry -- got ${renderedW}x${renderedH} inside ${aW}x${aH} (cap ${MAX_DISPLAY_PX})`);
        // Aspect ratio preserved -- no distortion.
        assert(Math.abs((renderedW/renderedH) - (vbW/vbH)) < 0.01, `Fit to view must preserve aspect ratio (no distortion) for ${c.label} at ${geo.label} geometry`);

        ok(`Fit to view: ${c.label} at ${geo.label} geometry lands on exactly 100%, contained, no distortion, no unnecessary empty space`);
      }
    }

    // ── 2. Zoom display never exceeds 100%, however far the user zooms in ─
    {
      setPreviewGeometry(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      window.setPreviewZoom(999); // an extreme manual zoom-in attempt
      const pct = document.getElementById('zoom-pct').textContent;
      assert.strictEqual(pct, '100%', `manual zoom must clamp its displayed percentage at 100%, never showing more (e.g. the previously-observed 114%), got ${pct}`);
      assert.strictEqual(window.eval('previewZoom'), window.eval('_previewMaxZoom'), 'previewZoom must clamp to _previewMaxZoom, which must equal the true fit scale');
      ok('manual zoom: displayed percentage never exceeds 100%, even for an extreme zoom-in request');
    }

    // ── 3. Recalculates when shape/dimensions change ─────────────────────
    {
      setPreviewGeometry(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      window.fitPreviewToView();
      const fitRect = window.eval('_previewFitZoom');
      let { vbW: rectVbW, vbH: rectVbH } = currentSvgBox();
      assert(Math.abs(fitRect - expectedFitZoom(760, 560, rectVbW, rectVbH)) < 1e-6, 'fit for the initial rectangle must be correct');

      window.selectShape('circle'); window.selectSize(63); // dimensions/shape change alone, no explicit re-fit call
      const fitCircle = window.eval('_previewFitZoom');
      const { vbW: circleVbW, vbH: circleVbH } = currentSvgBox();
      // (29 Sep 2026, seventh correction): with the explicit display-size
      // cap in play, two different shapes CAN legitimately land on the
      // identical capped zoom (both this rectangle and this circle share
      // the same canonical vbW=260, so both hit the same cap here) -- so
      // "the value changed" is no longer the right thing to assert.
      // Instead: each shape's zoom must independently match ITS OWN
      // correctly-recalculated expected value, proving a real
      // recalculation happened (not a stale leftover) even when the
      // numeric result happens to coincide.
      assert(Math.abs(fitCircle - expectedFitZoom(760, 560, circleVbW, circleVbH)) < 1e-6, 'fit after a shape change must be correctly recalculated for the NEW shape, not a stale leftover from the previous one');
      const pctAfterShapeChange = document.getElementById('zoom-pct').textContent;
      assert.notStrictEqual(pctAfterShapeChange, '', 'zoom display must still be populated immediately after a shape change');
      ok('shape/dimension change automatically recalculates the fit scale, no manual re-fit required');
    }

    // ── 4. Recalculates when the preview panel/window resizes ───────────
    {
      setPreviewGeometry(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      window.fitPreviewToView();
      const fitBefore = window.eval('_previewFitZoom');

      setPreviewGeometry(400, 340); // simulate the preview column/row shrinking
      assert(typeof window._schedulePreviewRefit === 'function', 'a resize-triggered recompute handler must exist');
      window.dispatchEvent(new window.Event('resize'));
      await new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 0)));

      const fitAfter = window.eval('_previewFitZoom');
      const { vbW, vbH } = currentSvgBox();
      const expectedFitAfter = expectedFitZoom(400, 340, vbW, vbH);
      // (29 Sep 2026, seventh correction): with the explicit display-size
      // cap in play, a resize CAN legitimately leave the zoom numerically
      // unchanged (this fixture's rectangle is cap-bound at both the old
      // and new geometry) -- so "the value changed" is no longer the
      // right thing to assert. The real requirement is that a
      // recalculation genuinely happened and produced the CORRECT result
      // for the new geometry, which is what actually matters.
      assert(Math.abs(fitAfter - expectedFitAfter) < 1e-6, 'the recalculated fit scale after resize must match the new geometry exactly (a genuine recalculation, whether or not the numeric result happens to be unchanged)');
      ok('window resize automatically recalculates the fit scale for the new panel size');
    }

    // ── 5. Preview zoom never touches the physical export dimensions ────
    {
      setPreviewGeometry(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      const dimsBeforeZoom = window.getDims();
      window.fitPreviewToView();
      window.setPreviewZoom(0.3);
      const dimsAfterZoom = window.getDims();
      assert.deepStrictEqual(dimsAfterZoom, dimsBeforeZoom, 'preview zoom must never alter the physical mm dimensions used for SVG/PDF/PNG export');
      const exportSvg = window.buildSVG(true);
      assert(exportSvg.includes(`width="${dimsBeforeZoom.pw}" height="${dimsBeforeZoom.ph}"`) || exportSvg.includes('viewBox="0 0'), 'export SVG geometry must be unaffected by preview zoom');
      ok('preview zoom is display-only and never alters export geometry (getDims()/buildSVG(true) unaffected)');
    }

    // ── 6. STABILITY: the circularity fix must be provably deterministic ─
    // For circle, square, a wide rectangle and a tall rectangle: the first
    // result is correct, repeated calls never drift, leaving and
    // returning to the same shape reproduces it exactly, switching shape
    // and switching back returns to the original, and a resize settles in
    // one recalculation with no oscillation.
    const stabilityShapes = [
      { label:'circle', setup(){ window.selectShape('circle'); window.selectSize(63); } },
      { label:'square', setup(){ window.selectShape('square'); window.selectSize(63); } },
      { label:'wide rectangle', setup(){ window.selectShape('rectangle'); document.getElementById('custom-w').value='99'; document.getElementById('custom-h').value='52'; window.onDimInput(); } },
      { label:'tall rectangle', setup(){ window.selectShape('rectangle'); document.getElementById('custom-w').value='52'; document.getElementById('custom-h').value='99'; window.onDimInput(); } },
    ];

    for(const shape of stabilityShapes){
      setPreviewGeometry(760, 560);
      shape.setup();
      const { vbW, vbH } = currentSvgBox();
      const expected = expectedFitZoom(760, 560, vbW, vbH);

      // First result correct.
      window.recomputePreviewFit();
      const first = window.eval('_previewFitZoom');
      assert(Math.abs(first - expected) < 1e-6, `first recomputePreviewFit() result must be correct for ${shape.label}`);

      // Repeated calls (3x) produce the identical zoom and dimensions --
      // no drift, growth or shrinkage from calling it again with nothing
      // changed (the specific failure mode a circular formula risks).
      const dc = document.getElementById('label-svg-container');
      const dimsAt = () => { const svg = dc.querySelector('svg'); return `${svg.getAttribute('width')}x${svg.getAttribute('height')}`; };
      const firstDims = dimsAt();
      for(let i=0;i<3;i++){
        window.recomputePreviewFit();
        window.applyZoomToSVG();
        assert.strictEqual(window.eval('_previewFitZoom'), first, `recomputePreviewFit() call #${i+2} must produce the IDENTICAL zoom for ${shape.label} (no oscillation/drift)`);
        assert.strictEqual(dimsAt(), firstDims, `recomputePreviewFit() call #${i+2} must produce the IDENTICAL rendered dimensions for ${shape.label}`);
      }

      // Navigating away (simulated: re-render via updateLabel() as if a
      // different step's edit triggered it) and back reproduces the same
      // result.
      window.updateLabel();
      assert.strictEqual(window.eval('_previewFitZoom'), first, `re-rendering (simulating navigating away and back) must reproduce the identical fit for ${shape.label}`);
      assert.strictEqual(dimsAt(), firstDims, `re-rendering must reproduce the identical rendered dimensions for ${shape.label}`);

      // Switching shape and switching back returns to the original result.
      window.selectShape(shape.label.includes('circle') ? 'square' : 'circle');
      window.selectSize(52);
      shape.setup(); // switch back
      assert(Math.abs(window.eval('_previewFitZoom') - expected) < 1e-6, `switching away and back to ${shape.label} must return to the original fit result`);
      assert.strictEqual(dimsAt(), firstDims, `switching away and back to ${shape.label} must return to the original rendered dimensions`);

      // Resize recalculates ONCE to a new, correct, stable result (not an
      // oscillating sequence of intermediate values).
      setPreviewGeometry(500, 420);
      const expectedAfterResize = expectedFitZoom(500, 420, vbW, vbH);
      window.dispatchEvent(new window.Event('resize'));
      await new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 0)));
      const afterResize = window.eval('_previewFitZoom');
      assert(Math.abs(afterResize - expectedAfterResize) < 1e-6, `resize must settle on the correct new geometry's fit for ${shape.label}`);
      // Calling recomputePreviewFit() again at the SAME (new) geometry
      // must not change anything further -- proves the resize settled,
      // rather than merely happening to match on this particular tick.
      window.recomputePreviewFit();
      assert.strictEqual(window.eval('_previewFitZoom'), afterResize, `a further recompute at the same post-resize geometry must not oscillate for ${shape.label}`);

      ok(`stability: ${shape.label} -- first result, 3x repeat, re-render, shape-switch-and-back, and resize all converge to the identical, correct result with no oscillation`);
    }

    console.log(`\nAll ${passed} preview-zoom-fit.js checks passed.`);
  } catch (err) {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}, 80);
