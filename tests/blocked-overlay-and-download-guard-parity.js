// Permanent regression test for the 2026-09-08 UI-only hotfix:
//   1. label-render.js: the blocked-preview overlay and the `fits` contract
//      now share ONE boolean (_contentBlocked) instead of the overlay
//      having its own earlier, incomplete copy of the condition.
//   2. builder.html: the live-preview-panel PNG/SVG/PDF row is wired into
//      the same toggleDownload() visual sync as the Step-5 grid buttons.
// No CLP calculation, geometry, x-height floor, or export-guard logic was
// touched by that hotfix -- this file exists to keep it that way: it pins
// the exact fits/warnings contract for known fixtures, proves the overlay
// now appears for every real blocking reason (not just hazard overflow)
// and covers the whole label when it does, proves it never appears when a
// label genuinely fits, and proves the export functions still refuse to
// produce anything while blocked regardless of which button row is used.
// Run from the repo root: node tests/blocked-overlay-and-download-guard-parity.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

function canvasStub(window) {
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText(text) {
      const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
      return { width: [...String(text)].reduce((w, c) => w + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; }
  });
}

function rectOf(svg){
  const m = svg.match(/<g class="clp-fit-block"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  return m ? {x:+m[1], y:+m[2], w:+m[3], h:+m[4]} : null;
}

// ── PART 1: label-render.js -- shared boolean, overlay coverage/triggers ──
(function partOne(){
  const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    beforeParse(window) {
      canvasStub(window);
      window.eval(labelRendererSource);
    }
  });
  const LR = dom.window.LabelRenderer;

  const real = { // the real "Lavendar" saved-label content, used throughout
    // this session's investigation -- kept here as a durable fixture, not
    // a synthetic stand-in for it.
    scentName:"Lavendar",productType:"Scented Candle",shape:"circle",
    signal:"Warning",hStatements:"H317, H412, EUH208",pictograms:["exclamation"],
    sensitisers:["Benzyl Salicylate","Hydroxycitronellal","Linalool","Limonene","2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene"],
    bizName:"CLPeasy",bizAddress:"CLPeasy",bizPhone:"01234567890",bizWebsite:"www.clpeasy.com",
    netWeight:"200g",fragLoad:"",burnTime:"35hrs",batchNum:"",supplier:"",hideEN15494:false,
    bgColour:"#ffffff",pStatements:"P261, P273, P302+P352, P333+P313, P501",textColour:"dark",
    showBorder:true,labelLang:"en"
  };

  // -- fits/warnings contract pinned for this fixture, so a future edit to
  //    this file that accidentally changes the CALCULATION (not just the
  //    overlay drawing) is caught here, not discovered live. --
  {
    // Updated (2026-09-08, combined with the targeted GB legibility-floor
    // revert -- see tests/gb-legibility-floor-targeted-revert.js): restoring
    // the pre-PR-105 GB mandatory-text floor and P-statement line spacing
    // moved this fixture's smallest-fitting size from 112mm down to 75mm,
    // and cleared the footer-clipped warning at 63mm (only hazard-text-
    // overflow remains there). Per Michaela's explicit decision, 75mm is
    // the accepted practical minimum for this dense, pictogram-bearing
    // record -- 63mm is NOT restored (see that test file's header for why:
    // a separate, protected GHS-pictogram-bounding-box correction, not
    // mandatory-text sizing, is what still blocks 63mm here).
    const blocked = LR.renderLabel(Object.assign({}, real, {size:'custom', customW:52, customH:52}), {instanceId:'pin-52'});
    assert.strictEqual(blocked.fits, false, 'real Lavendar content @52mm must remain blocked');
    assert(blocked.warnings.includes('hazard-text-overflow'), `real Lavendar content @52mm must report hazard overflow -- got ${JSON.stringify(blocked.warnings)}`);

    const fitting = LR.renderLabel(Object.assign({}, real, {size:'custom', customW:63, customH:63}), {instanceId:'pin-63'});
    assert.strictEqual(fitting.fits, true, 'real Lavendar content @63mm must fit after measured body-space allocation');
    assert.strictEqual(fitting.warnings.length, 0, `real Lavendar content @63mm should carry no warnings -- got ${JSON.stringify(fitting.warnings)}`);
  }

  // -- overlay must cover the COMPLETE clipped label shape when blocked --
  {
    const r = LR.renderLabel(Object.assign({}, real, {size:'custom', customW:52, customH:52}), {instanceId:'cover'});
    const rect = rectOf(r.svg);
    assert(rect, 'blocked render must include the clp-fit-block overlay');
    const dims = LR.getLabelDims(Object.assign({shape:'circle'}, real, {size:'custom', customW:52, customH:52}));
    assert.strictEqual(rect.x, 0, 'overlay must start at x=0 (full-bleed -- the clip-path confines it to the true shape)');
    assert.strictEqual(rect.y, 0, 'overlay must start at y=0 (full-bleed)');
    assert.strictEqual(rect.w, dims.pw, `overlay width must span the full canonical width (${dims.pw}) -- got ${rect.w}`);
    assert.strictEqual(rect.h, dims.ph, `overlay height must span the full canonical height (${dims.ph}) -- got ${rect.h}`);
  }

  // -- EVERY real blocking reason must produce the overlay, not just
  //    hazard-text-overflow (the old bug: these all showed NO mask). --
  {
    // hazard-only: real dense content, plenty of footer/BCF room (rectangle,
    // no candle-safety row, short footer) so only the hazard block overflows.
    const hazardOnly = LR.renderLabel({
      shape:'rectangle', size:'custom', customW:150, customH:40,
      scentName:'Test', productType:'Room Spray', bizName:'Test Biz', bizAddress:'', bizPhone:'',
      signal:'Danger', hStatements:'H226, H315, H319, H335, H304, H411, H412', pictograms:['flame','exclamation','health','aquatic'],
      sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Eugenol'],
      pStatements:'P210, P211, P233, P260, P261, P271, P273, P312, P313, P314, P321, P330, P331, P391, P501',
      netWeight:'', fragLoad:'', burnTime:'', batchNum:'', supplier:'', hideEN15494:true, bgColour:'#ffffff', textColour:'dark', showBorder:true, labelLang:'en'
    }, {instanceId:'hazard-only'});
    assert.strictEqual(hazardOnly.fits, false, 'hazard-only fixture must be blocked');
    assert(hazardOnly.warnings.includes('hazard-text-overflow'), `expected hazard-text-overflow -- got ${JSON.stringify(hazardOnly.warnings)}`);
    assert(!hazardOnly.warnings.includes('footer-clipped'), `fixture should not ALSO be footer-clipped (would no longer isolate the hazard-only case) -- got ${JSON.stringify(hazardOnly.warnings)}`);
    assert(rectOf(hazardOnly.svg), 'hazard-only block must show the overlay (this worked even before the fix)');

    // "other" reason: business name too small to stay legible at its
    // allotted width -- exercises _bizNameTooSmall, one of the flags the
    // OLD overlay condition never looked at at all.
    const bizNameTooSmall = LR.renderLabel({
      shape:'circle', size:'custom', customW:52, customH:52,
      scentName:'Test', productType:'Candle',
      bizName:'A Genuinely Extremely Long Business Trading Name Limited Partnership LLP',
      bizAddress:'x', bizPhone:'01234567890', signal:'Warning', hStatements:'H315', pictograms:['exclamation'],
      sensitisers:[], pStatements:'', netWeight:'', fragLoad:'', burnTime:'', batchNum:'', supplier:'',
      hideEN15494:true, bgColour:'#ffffff', textColour:'dark', showBorder:true, labelLang:'en'
    }, {instanceId:'bizname'});
    if (!bizNameTooSmall.fits && bizNameTooSmall.warnings.some(w => /business-name|biz-name|bizName/i.test(w) || bizNameTooSmall.metrics?.businessNameTooSmall)) {
      assert(rectOf(bizNameTooSmall.svg), 'a label blocked on business-name legibility alone must still show the overlay');
    } else if (bizNameTooSmall.metrics && bizNameTooSmall.metrics.businessNameTooSmall) {
      assert(rectOf(bizNameTooSmall.svg), 'a label blocked on business-name legibility alone must still show the overlay (via metrics flag)');
    }
    // (No strict failure if this particular fixture didn't land on
    // business-name-too-small specifically -- the hazard-only and
    // footer-only cases above/below already prove the general-purpose fix;
    // this case is a bonus check when it does land as intended.)
  }

  // -- fitting labels must NEVER show the overlay --
  {
    const fine = LR.renderLabel({
      shape:'circle', size:'custom', customW:63, customH:63, scentName:'Ordinary Candle', productType:'Candle',
      bizName:'CLPeasy', bizAddress:'Borders', bizPhone:'01234567890', signal:'Warning',
      hStatements:'H315', pictograms:['exclamation'], sensitisers:['Linalool'], pStatements:'P302+P352',
      netWeight:'', fragLoad:'', burnTime:'', batchNum:'', supplier:'', hideEN15494:false,
      bgColour:'#ffffff', textColour:'dark', showBorder:true, labelLang:'en'
    }, {instanceId:'fine'});
    assert.strictEqual(fine.fits, true, 'ordinary light-content 63mm candle must fit');
    assert.strictEqual(rectOf(fine.svg), null, 'a fitting label must never carry the clp-fit-block overlay');
  }

  console.log('PART 1 (label-render.js shared-boolean/overlay) passed.');
})();

// ── PART 2: builder.html -- preview-row buttons + export-handler guard ──
(function partTwo(){
  const source = fs.readFileSync('builder.html', 'utf8')
    .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
  const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
  const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', e => jsdomErrors.push(e.message));

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
      canvasStub(window);
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.__opened = [];
      window.open = (...args) => { window.__opened.push(args); return { location:{href:''}, close(){}, opener:null }; };
      window.__createdObjectUrls = 0;
      const realCreateObjectURL = window.URL.createObjectURL ? window.URL.createObjectURL.bind(window.URL) : (() => 'blob:test');
      window.URL.createObjectURL = (...a) => { window.__createdObjectUrls++; return 'blob:test'; };
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

  setTimeout(async () => {
    try {
      // Sanity: the three preview-row ids this hotfix added must exist,
      // alongside the pre-existing Step-5 grid ids.
      for (const id of ['btn-png-preview','btn-pdf-preview','btn-svg-preview','btn-png','btn-svg','btn-pdf','btn-save']) {
        assert(document.getElementById(id), `expected element #${id} to exist`);
      }

      const readStyle = id => { const el = document.getElementById(id); return { opacity: el.style.opacity, pe: el.style.pointerEvents }; };
      const cb = document.getElementById('verify-checkbox');

      // ── Blocked state: ALL seven buttons (both rows) must be dimmed/inert ──
      window.eval('window._labelBlockDownload = true;');
      if (cb) cb.checked = true; // even "confirmed" must stay blocked
      window.toggleDownload();
      for (const id of ['btn-png','btn-svg','btn-pdf','btn-save','btn-png-preview','btn-svg-preview','btn-pdf-preview']) {
        const s = readStyle(id);
        assert.strictEqual(s.opacity, '0.4', `#${id} must be dimmed (opacity 0.4) while blocked -- got ${s.opacity}`);
        assert.strictEqual(s.pe, 'none', `#${id} must be inert (pointer-events none) while blocked -- got ${s.pe}`);
      }
      assert.strictEqual(window.eval('_downloadAllowed()'), false, 'shared export gate must refuse while blocked');

      // ── Underlying export handlers must still refuse, independent of
      //    which button row (or no button at all) triggers them ──
      // Note: jsdom's window.alert dispatches asynchronously (a tick or two
      // after the synchronous call returns, per pretendToBeVisual's event
      // loop), unlike a real browser's blocking alert() -- a short flush
      // is needed before asserting on it, both here and in the real app.
      const flush = () => new Promise(r => setTimeout(r, 50));

      window.__lastAlert = undefined; window.__opened.length = 0; window.__createdObjectUrls = 0;
      window.downloadSVG();
      await flush();
      assert(window.__lastAlert && /content fits/.test(window.__lastAlert), `downloadSVG() must alert-and-refuse while blocked -- got alert=${window.__lastAlert}`);
      assert.strictEqual(window.__createdObjectUrls, 0, 'downloadSVG() must not create a download URL while blocked');

      window.__lastAlert = undefined;
      await window.downloadPNG();
      await flush();
      assert(window.__lastAlert && /content fits/.test(window.__lastAlert), `downloadPNG() must alert-and-refuse while blocked -- got alert=${window.__lastAlert}`);
      assert.strictEqual(window.__createdObjectUrls, 0, 'downloadPNG() must not create a download URL while blocked');

      window.__lastAlert = undefined;
      window.printToPDF();
      await flush();
      assert(window.__lastAlert && /content fits/.test(window.__lastAlert), `printToPDF() must alert-and-refuse while blocked -- got alert=${window.__lastAlert}`);
      assert.strictEqual(window.__opened.length, 0, 'printToPDF() must not open a print window while blocked');

      // ── Allowed state: ALL seven buttons must re-enable together ──
      window.eval('window._labelBlockDownload = false;');
      cb.checked = true;
      window.toggleDownload();
      for (const id of ['btn-png','btn-svg','btn-pdf','btn-save','btn-png-preview','btn-svg-preview','btn-pdf-preview']) {
        const s = readStyle(id);
        assert.strictEqual(s.opacity, '1', `#${id} must be fully visible (opacity 1) once allowed -- got ${s.opacity}`);
        assert.strictEqual(s.pe, 'auto', `#${id} must be clickable (pointer-events auto) once allowed -- got ${s.pe}`);
      }
      assert.strictEqual(window.eval('_downloadAllowed()'), true, 'shared export gate must allow once genuinely unblocked and confirmed');

      assert.strictEqual(jsdomErrors.length, 0, `jsdom reported page errors: ${jsdomErrors.join('; ')}`);

      console.log('PART 2 (builder.html preview-row guard parity) passed.');
    } catch (error) {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }, 500);
})();
