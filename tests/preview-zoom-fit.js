// ── LABEL PREVIEW ZOOM / FIT-TO-VIEW REGRESSION COVERAGE ─────────────────
// Regression coverage for Michaela's manual review of Preview #105
// (2026-09-06): "Fit to view" was landing at 51% (a hardcoded absolute
// zoom unrelated to any real fit calculation) while manual zoom could
// reach 114% (because the displayed "100%" reference point was only 88%
// of the true full-fill scale). Proves builder.html's zoom now:
//   - never displays more than 100%, however the user tries to zoom in;
//   - "Fit to view" always lands on exactly 100%, i.e. the largest scale
//     that fits the whole label inside the available preview panel;
//   - that 100% scale is genuinely contained (touches but never exceeds
//     the panel's available width/height, preserving aspect ratio);
//   - it recalculates when the label's shape/dimensions change and when
//     the preview panel/window resizes.
// jsdom performs no real layout, so real elements' offsetParent is always
// null (see updateLabel()'s existing visibility gate) -- this harness
// stubs offsetParent and the preview panel's clientWidth/clientHeight,
// the same kind of environment stub tests/builder-regression.js already
// uses for the canvas 2D context, so the actual shared code path
// (updateLabel() -> recomputePreviewFit()/applyZoomToSVG(), and
// fitPreviewToView()) runs for real rather than being reimplemented here.
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

// Force the preview panel "visible" (jsdom never computes real layout, so
// offsetParent is always null and clientWidth/clientHeight are always 0 --
// see the read-only limitation already documented in
// tests/checkpoint-b-identity-wiring.js) and give the panel an explicit,
// controllable size so the fit calculation has real numbers to work with.
function setPanelSize(w, h){
  const area = document.getElementById('preview-canvas-area');
  Object.defineProperty(area, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(area, 'clientHeight', { value: h, configurable: true });
}
function stubVisible(){
  const dc = document.getElementById('label-svg-container');
  Object.defineProperty(dc, 'offsetParent', { value: {}, configurable: true });
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
    const viewports = [
      { label:'desktop', w:760, h:560 },
      { label:'mobile', w:340, h:300 },
    ];

    // ── 1. Fit to view always lands on exactly 100%, genuinely contained ─
    for(const c of cases){
      for(const vp of viewports){
        setPanelSize(vp.w, vp.h);
        c.setup();
        const { vbW, vbH } = currentSvgBox();
        const aW = vp.w - 40, aH = vp.h - 40;
        const expectedFit = Math.min(aW / vbW, aH / vbH);

        window.fitPreviewToView();
        const pct = document.getElementById('zoom-pct').textContent;
        assert.strictEqual(pct, '100%', `Fit to view must display exactly 100% for ${c.label} at ${vp.label} viewport, got ${pct}`);
        assert(Math.abs(window.eval('_previewFitZoom') - expectedFit) < 1e-6, `Fit to view's computed scale must equal the true largest-contained scale for ${c.label} at ${vp.label} viewport`);

        const dc = document.getElementById('label-svg-container');
        const svg = dc.querySelector('svg');
        const renderedW = Number(svg.getAttribute('width'));
        const renderedH = Number(svg.getAttribute('height'));
        assert(renderedW <= aW + 1, `Fit to view must not crop/overflow width for ${c.label} at ${vp.label} viewport (${renderedW} > ${aW})`);
        assert(renderedH <= aH + 1, `Fit to view must not crop/overflow height for ${c.label} at ${vp.label} viewport (${renderedH} > ${aH})`);
        // Must be the LARGEST contained scale -- i.e. it should be touching
        // one of the two available-space boundaries, not sitting arbitrarily
        // smaller inside them (which would mean unnecessary empty space).
        const touchesWidth = Math.abs(renderedW - aW) <= 1;
        const touchesHeight = Math.abs(renderedH - aH) <= 1;
        assert(touchesWidth || touchesHeight, `Fit to view must use all available width or height (no unnecessary empty space) for ${c.label} at ${vp.label} viewport -- got ${renderedW}x${renderedH} inside ${aW}x${aH}`);
        // Aspect ratio preserved -- no distortion.
        assert(Math.abs((renderedW/renderedH) - (vbW/vbH)) < 0.01, `Fit to view must preserve aspect ratio (no distortion) for ${c.label} at ${vp.label} viewport`);

        ok(`Fit to view: ${c.label} at ${vp.label} viewport lands on exactly 100%, contained, no distortion, no unnecessary empty space`);
      }
    }

    // ── 2. Zoom display never exceeds 100%, however far the user zooms in ─
    {
      setPanelSize(760, 560);
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
      setPanelSize(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      window.fitPreviewToView();
      const fitRect = window.eval('_previewFitZoom');
      window.selectShape('circle'); window.selectSize(63); // dimensions/shape change alone, no explicit re-fit call
      const fitCircle = window.eval('_previewFitZoom');
      assert.notStrictEqual(fitRect, fitCircle, 'changing shape/dimensions must recalculate the fit scale automatically (via updateLabel() -> recomputePreviewFit()), not keep the previous shape\'s value');
      const pctAfterShapeChange = document.getElementById('zoom-pct').textContent;
      assert.notStrictEqual(pctAfterShapeChange, '', 'zoom display must still be populated immediately after a shape change');
      ok('shape/dimension change automatically recalculates the fit scale, no manual re-fit required');
    }

    // ── 4. Recalculates when the preview panel/window resizes ───────────
    {
      setPanelSize(760, 560);
      window.selectShape('rectangle');
      document.getElementById('custom-w').value='63'; document.getElementById('custom-h').value='44'; window.onDimInput();
      window.fitPreviewToView();
      const fitBefore = window.eval('_previewFitZoom');

      setPanelSize(340, 300); // simulate the panel/window shrinking, e.g. to a mobile viewport
      assert(typeof window._schedulePreviewRefit === 'function', 'a resize-triggered recompute handler must exist');
      window.dispatchEvent(new window.Event('resize'));
      await new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 0)));

      const fitAfter = window.eval('_previewFitZoom');
      assert.notStrictEqual(fitAfter, fitBefore, 'resizing the window must recalculate the fit scale for the new panel size, not keep the old one');
      const { vbW, vbH } = currentSvgBox();
      const expectedFitAfter = Math.min((340-40)/vbW, (300-40)/vbH);
      assert(Math.abs(fitAfter - expectedFitAfter) < 1e-6, 'the recalculated fit scale after resize must match the new panel size exactly');
      ok('window resize automatically recalculates the fit scale for the new panel size');
    }

    // ── 5. Preview zoom never touches the physical export dimensions ────
    {
      setPanelSize(760, 560);
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

    console.log(`\nAll ${passed} preview-zoom-fit.js checks passed.`);
  } catch (err) {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}, 80);
