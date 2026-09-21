// Security regression coverage for the Sep 2026 preview-watermark /
// export-authorisation audit (see the accompanying security report).
//
// Prior architecture: the watermark WAS already baked directly into the
// SVG string by label-render.js's renderLabel() (opts.watermark), never a
// removable DOM overlay -- that part was sound. The actual hole was that
// every caller decided `watermark` from a plain, page-scoped mutable
// variable (builder.html's `S.isPro`, print.html's `isPro`) set once at
// page load and never re-checked -- trivially flippable from the browser
// devtools console before clicking any download button, or before calling
// the wrapped export function directly. print.html additionally
// hard-coded `watermark:false` unconditionally and granted `isPro=true`
// to any signed-in user regardless of subscription status.
//
// The fix adds `refreshProEntitlement()` on both pages: a fresh,
// fail-closed re-verification (mirroring the exact login-time Supabase
// subscription query, RLS-scoped to the authenticated user) run
// immediately before any export function actually builds a downloadable
// artifact -- see wrapDownloads() in builder.html and
// downloadPDF()/cricutDownloadZip()/cricutDownloadSequential() in
// print.html.
//
// These tests exercise actual rendering and authorisation BEHAVIOUR
// (the real SVG content of a captured download, real entitlement-mocked
// Supabase responses, real console-style tampering of the cached flag) --
// not a search for the word "watermark" in source. Run from repo root:
// node tests/preview-watermark-and-export-authorization.js

const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const builderSource = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const printSource = fs.readFileSync('print.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};
function activeSubQuery(){
  return {
    select(){ return this; }, eq(){ return this; },
    single(){ return Promise.resolve({ data:{ plan:'pro', status:'active' }, error:null }); }
  };
}

function canvasStub(){
  return () => ({
    font:'',
    measureText(text){
      const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
      return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
  });
}

function decodeDataUri(href){
  const comma = href.indexOf(',');
  return decodeURIComponent(href.slice(comma+1));
}

// ── builder.html harness ───────────────────────────────────────────────
async function openBuilder(opts){
  opts = opts || {};
  const capturedHrefs = [];
  const capturedBlobs = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(builderSource, {
    url: 'https://local.clpeasy.test/builder.html',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window){
      window.HTMLCanvasElement.prototype.getContext = canvasStub();
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      // downloadSVG() sets a data-URI directly on an <a> then calls
      // .click() -- capture it there instead of trying to read a real
      // Blob back out of jsdom.
      window.HTMLAnchorElement.prototype.click = function(){ capturedHrefs.push(this.href); };
      // printToPDF() builds a Blob of the print-window HTML (which embeds
      // the rendered SVG) -- capture its content directly rather than
      // trying to read a real Blob back out of jsdom.
      const RealBlob = window.Blob;
      window.Blob = function(parts, opts2){ capturedBlobs.push(String(parts.join(''))); return new RealBlob(parts, opts2); };
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data:{ session: opts.session || null } }),
          onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
          signOut: async () => ({})
        },
        from: () => Object.create(opts.activeSub ? activeSubQuery() : emptyQuery),
        rpc: async () => ({ data:false, error:null })
      }) };
    }
  });
  const { window } = dom;
  await new Promise(resolve => setTimeout(resolve, 250));
  return { dom, window, document: window.document, errors, capturedHrefs, capturedBlobs };
}

function fillMinimalLabel(window){
  window.selectShape('circle');
  window.selectSize(63);
  window.setApprovedBuilderStep(2);
  window.document.getElementById('scent-name').value = 'Security Test Candle';
  window.document.getElementById('product-type').value = 'Scented Candle';
  window.onProductTypeChange();
  window.updateLabel();
  const cb = window.document.getElementById('verify-checkbox');
  if (cb) cb.checked = true;
}

// ── print.html harness (mirrors tests/print-sheet-export-fidelity.js) ──
function makeSupabaseStub(session, activeSub){
  return { createClient: () => ({
    auth: {
      getSession: async () => ({ data:{ session } }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      signOut: async () => ({})
    },
    from: () => Object.create(activeSub ? activeSubQuery() : emptyQuery),
    rpc: async () => ({ data:false, error:null })
  }) };
}
function makeCapturingImage(captured){
  return class CapturingImage {
    set src(v){ captured.push(v); if (this.onload) this.onload(); }
  };
}
async function openComposer(opts){
  opts = opts || {};
  const capturedImgSrcs = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(printSource, {
    url: 'https://local.clpeasy.test/print.html',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window){
      window.HTMLCanvasElement.prototype.getContext = canvasStub();
      try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.Image = makeCapturingImage(capturedImgSrcs);
      window.supabase = makeSupabaseStub(opts.session || null, opts.activeSub);
      if (opts.seed){
        const ns = opts.session ? opts.session.user.id : 'guest';
        window.localStorage.setItem('clpeasy_labels__u_'+ns, JSON.stringify(opts.seed));
      }
    }
  });
  const { window } = dom;
  await new Promise(resolve => setTimeout(resolve, 250));
  return { dom, window, document: window.document, errors, capturedImgSrcs };
}
function candleFixture(overrides){
  return Object.assign({
    scentName:'Security Sheet Candle', productType:'Scented Candle', bizName:'Test Biz',
    shape:'rectangle', size:'custom', customW:57, customH:99,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'20 hrs',
    signal:'Warning', hStatements:'H315', pStatements:'', sensitisers:[], pictograms:['exclamation'],
    textColour:'dark', showBorder:true, hideEN15494:false, labelLang:'en',
  }, overrides);
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── builder.html ───────────────────────────────────────────────────

  // 1. Unpaid/guest preview bakes the watermark directly into the
  //    rendered SVG markup -- not a separate overlay element.
  {
    const { window, document } = await openBuilder({});
    fillMinimalLabel(window);
    const svg = window.buildSVG(false);
    assert(/PREVIEW ONLY/.test(svg) && /CLPeasy/.test(svg), 'unpaid preview SVG must contain the baked-in watermark text');
    assert(!document.querySelector('.label-watermark-overlay'), 'there must be no separate removable watermark overlay element');
    ok('unpaid/guest preview SVG has the watermark baked directly into the returned markup, not a removable overlay');
  }

  // 2. Deleting the informational `.watermark-note` banner (the one
  //    visible DOM node that even mentions "watermark") must not touch
  //    the label SVG at all -- it is UI copy, not a rendering overlay,
  //    so "removing an overlay" here can never reveal a clean label.
  {
    const { window, document } = await openBuilder({});
    fillMinimalLabel(window);
    const before = window.buildSVG(false);
    const note = document.querySelector('.watermark-note');
    if (note) note.remove();
    const after = window.buildSVG(false);
    assert.strictEqual(before, after, 'deleting the informational watermark-note banner must not change the rendered label SVG');
    assert(/PREVIEW ONLY/.test(after), 'the label SVG must still carry the watermark after the banner is removed');
    ok('deleting the visible watermark-note banner does not alter or clean the rendered label SVG');
  }

  // 3. A genuinely unpaid guest's real SVG download is watermarked.
  {
    const { window, capturedHrefs } = await openBuilder({});
    fillMinimalLabel(window);
    await window.downloadSVG();
    assert.strictEqual(capturedHrefs.length, 1, 'downloadSVG() must trigger exactly one download');
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(/PREVIEW ONLY/.test(svgOut), "an unpaid guest's SVG download must contain the watermark");
    ok("an unpaid/guest user's real SVG download contains the watermark");
  }

  // 4. The exact devtools-console bypass (`S.isPro = true`) must NOT
  //    authorise a clean export: the wrapped download re-verifies
  //    entitlement fresh against the (mocked, RLS-scoped) server
  //    immediately before building the file, overriding the tampered flag.
  {
    const { window, capturedHrefs } = await openBuilder({}); // no session backs any entitlement
    fillMinimalLabel(window);
    window.eval('S.isPro = true;');
    await window.downloadSVG();
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(/PREVIEW ONLY/.test(svgOut), 'setting S.isPro=true from the console with no real session/subscription must still produce a watermarked download');
    assert.strictEqual(window.eval('S.isPro'), false, 'the fresh server re-check must reset the tampered S.isPro back to false');
    ok('tampering S.isPro via console does not authorise a clean export -- the wrapped download re-verifies and fails closed');
  }

  // 5. Fail-closed: if the entitlement re-check itself errors, the export
  //    must stay watermarked, never treated as "probably fine".
  {
    const session = { user:{ id:'user-error-case', email:'x@example.com', user_metadata:{} } };
    const { window, capturedHrefs } = await openBuilder({ session });
    fillMinimalLabel(window);
    window.eval("sbClient.from = () => ({ select(){return this;}, eq(){return this;}, single(){ return Promise.reject(new Error('network down')); } });");
    window.eval('S.isPro = true;'); // also tampered, to prove the error path wins either way
    await window.downloadSVG();
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(/PREVIEW ONLY/.test(svgOut), 'a failed entitlement re-check must fail closed (watermarked), not open');
    ok('a failed/erroring entitlement re-check fails closed -- export stays watermarked');
  }

  // 6. Legitimate authorised (real active subscription) users still get a
  //    clean export -- the fix must not break paying customers.
  {
    const session = { user:{ id:'user-paid', email:'paid@example.com', user_metadata:{} } };
    const { window, capturedHrefs } = await openBuilder({ session, activeSub:true });
    fillMinimalLabel(window);
    await window.downloadSVG();
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(!/PREVIEW ONLY/.test(svgOut), "a real Pro subscriber's SVG download must NOT contain the watermark");
    ok('an authorised Pro subscriber still receives a clean, unwatermarked export');
  }

  // 7. Every clean-export entry point funnels through the same
  //    authorisation choke point (wrapDownloads()), and a second,
  //    independently-implemented export function (printToPDF, which
  //    embeds the rendered SVG in a print-window HTML Blob rather than a
  //    downloaded file) reaches the same fresh, fail-closed decision as
  //    SVG did in test 4.
  {
    const { window, capturedBlobs } = await openBuilder({});
    fillMinimalLabel(window);
    for (const fn of ['downloadPNG','downloadSVG','downloadPDFSheet','downloadPrintReadyPDF','downloadCricutPNGs','printToPDF']){
      assert.strictEqual(window.eval(`window.${fn}.__dlwrapped`), true, `${fn} must be wrapped by wrapDownloads() (the single authorisation choke point)`);
    }
    window.eval('S.isPro = true;'); // console-tamper again, verifying printToPDF's path specifically
    await window.printToPDF();
    assert.strictEqual(window.eval('S.isPro'), false, "printToPDF's authorisation path must reach the same fresh re-check and reset the tampered flag, exactly like downloadSVG");
    assert.strictEqual(capturedBlobs.length, 1, 'printToPDF() must build exactly one print-window HTML blob');
    assert(/PREVIEW ONLY/.test(capturedBlobs[0]), 'printToPDF() must embed the watermarked SVG in its print-window HTML for an unauthorised/tampered user');
    ok('every clean-export function is wrapped by the same authorisation choke point, and printToPDF reaches the identical fresh, fail-closed entitlement decision as SVG');
  }

  // 8. Download-allowance counting is unaffected by the entitlement fix:
  //    a logged-out guest (DL.loaded stays false) is never blocked or
  //    counted by the allowance gate itself.
  {
    const { window } = await openBuilder({});
    fillMinimalLabel(window);
    assert.strictEqual(window.eval('DL.loaded'), false, 'guest session must never load a download-allowance row');
    assert.strictEqual(window.eval('dlGate()'), true, 'dlGate() must not block downloads when no allowance data is loaded (guest/no-session case)');
    ok('download-allowance gating (dlGate) is unaffected by the entitlement re-check -- guests remain ungated by allowance as before');
  }

  // ── print.html ─────────────────────────────────────────────────────

  // 9. The Composer's own live preview render (renderSheetPosition, the
  //    single path every preview cell AND every export funnels through)
  //    now correctly watermarks for a non-Pro user, instead of the old
  //    hard-coded `watermark:false` that showed every user a clean
  //    label regardless of plan.
  {
    const { window } = await openComposer({ seed:[candleFixture()] });
    const svg = window.eval("buildLabelSVGFromData(getSaved()[0], 200, 200)");
    assert(/PREVIEW ONLY/.test(svg), 'print.html must watermark the Composer preview for a non-Pro/guest user (previously hard-coded to no watermark)');
    ok("print.html's Composer preview is watermarked for a non-Pro user");
  }

  // 10. A guest (no session) cannot export a print sheet at all -- print
  //     sheets are a Pro-only export surface (per the pricing copy: "A4
  //     print sheets" is listed under the paid Easy Start plan) -- and
  //     certainly never receives a clean PDF.
  {
    const idA = 'aaaaaaaa-0000-4000-8000-000000000001';
    const { window } = await openComposer({ seed:[candleFixture({ id:idA })] });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    let openCalls = 0;
    window.open = () => { openCalls++; return { document:{write(){},close(){}}, location:{href:''}, close(){}, opener:null }; };
    await window.eval('downloadPDF()');
    assert.strictEqual(openCalls, 0, 'a guest/unpaid user must never have a print-sheet PDF window opened');
    ok('a guest/unpaid user cannot export a print-sheet PDF at all (Pro-only export surface)');
  }

  // 11. The console-tamper bypass on print.html (`isPro = true`, no real
  //     session backing it) must not authorise a print-sheet export.
  {
    const idA = 'aaaaaaaa-0000-4000-8000-000000000002';
    const { window } = await openComposer({ seed:[candleFixture({ id:idA })] });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    window.eval('isPro = true;'); // the exact console-tamper this fix defends against
    let openCalls = 0;
    window.open = () => { openCalls++; return { document:{write(){},close(){}}, location:{href:''}, close(){}, opener:null }; };
    await window.eval('downloadPDF()');
    assert.strictEqual(openCalls, 0, 'tampering isPro=true via console with no real session must not authorise a print-sheet export');
    assert.strictEqual(window.eval('isPro'), false, 'the fresh server re-check must reset the tampered isPro back to false');
    ok('tampering isPro via console on print.html does not authorise an export -- fails closed exactly like builder.html');
  }

  // 12. A real, actively-subscribed Pro user on print.html still gets a
  //     clean (unwatermarked) exported sheet -- the fix must not break
  //     paying customers on this page either.
  {
    const session = { user:{ id:'user-paid-sheet', email:'paid@example.com', user_metadata:{} } };
    const idA = 'aaaaaaaa-0000-4000-8000-000000000003';
    const { window, capturedImgSrcs } = await openComposer({ session, activeSub:true, seed:[candleFixture({ id:idA })] });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    await window.eval('downloadPDF()');
    assert(capturedImgSrcs.length >= 1, "downloadPDF() must proceed for a real Pro subscriber");
    const sheetSvg = decodeURIComponent(capturedImgSrcs[capturedImgSrcs.length-1].split(',').slice(1).join(','));
    assert(!/PREVIEW ONLY/.test(sheetSvg), "a real Pro subscriber's exported print sheet must NOT contain the watermark");
    ok("an authorised Pro subscriber's print-sheet export on print.html remains clean");
  }

  console.log(`preview watermark and export authorisation checks passed (${passed} assertions)`);
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
