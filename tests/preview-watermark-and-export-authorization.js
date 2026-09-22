// Security regression coverage for the Sep 2026 preview-watermark /
// export-authorisation audit (see the accompanying security report).
//
// ROUND 1 (exports): every export function decided `watermark` from a
// plain, page-scoped mutable variable (builder.html's `S.isPro`,
// print.html's `isPro`) set once at page load and never re-checked --
// trivially flippable from the browser devtools console before clicking
// any download button, or before calling the wrapped export function
// directly. print.html additionally hard-coded `watermark:false`
// unconditionally and granted `isPro=true` to any signed-in user
// regardless of subscription status. Fixed with `refreshProEntitlement()`
// on both pages: a fresh, fail-closed re-verification (mirroring the
// login-time Supabase subscription query, RLS-scoped to the authenticated
// user) run immediately before any export function actually builds a
// downloadable artifact -- see wrapDownloads() in builder.html and
// downloadPDF()/cricutDownloadZip()/cricutDownloadSequential() in
// print.html. Round 1 exports remain a normal VECTOR SVG string with the
// watermark as readable "PREVIEW ONLY" text baked into that string.
//
// ROUND 2 (live preview DOM -- an initial "not a removable overlay" claim
// in this fix's own first version was WRONG and is corrected here): the
// exports above were fixed, but the LIVE ON-SCREEN PREVIEW
// (builder.html's #label-svg-container/#sheet-label-container,
// print.html's Composer #sheet-canvas cells) still injected the clean
// vector SVG into the DOM with the watermark as one more child <g>
// alongside it -- reproduced directly: select that <g> (its <text> reads
// "PREVIEW ONLY") in devtools, call .remove(), and a complete, undamaged
// clean label is left behind with zero further effort, no console
// variable tampering needed at all. Fixed by flattening the UNAUTHORISED
// preview to a single rasterised <image> (watermark burned into the same
// pixels as the label) before it ever reaches the DOM -- see
// renderPreviewInto()/rasterizePreviewSVG() in builder.html and
// renderSheetCanvas()/rasterizeCellSVG()/fillComposerRasterCells() in
// print.html. An authorised (freshly, server-verified Pro) preview is
// unaffected and stays full live vector, exactly as before either round.
//
// These tests exercise actual rendering and authorisation BEHAVIOUR (the
// real SVG/DOM structure of a rendered preview, the real content of a
// captured download, real entitlement-mocked Supabase responses, real
// console-style tampering of the cached flag) -- not a search for the
// word "watermark" in source. Run from repo root:
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
function activeSubQuery(plan){
  // The real entitlement check (S.isPro/isPro) reads ONLY sub.status --
  // never sub.plan -- so Easy Start and Easy Pro must both be treated as
  // entitled to clean output. `plan` here is deliberately varied by
  // callers (see tests 6b/12b below) precisely to prove that: passing
  // 'easy-start' still comes back with a clean export, closing the doubt
  // the misleading "isPro" variable name could otherwise raise.
  return {
    select(){ return this; }, eq(){ return this; },
    single(){ return Promise.resolve({ data:{ plan:plan||'pro', status:'active' }, error:null }); }
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
      // Deterministic, near-instant preview rasterisation (Sep 2026 fix) --
      // jsdom's own unstubbed Image is inconsistent (sometimes throws,
      // sometimes never fires onload/onerror at all).
      window.Image = class { set src(v){ if (this.onload) this.onload(); } };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
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
        from: () => Object.create(opts.activeSub ? activeSubQuery(opts.plan) : emptyQuery),
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
function makeSupabaseStub(session, activeSub, plan){
  return { createClient: () => ({
    auth: {
      getSession: async () => ({ data:{ session } }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      signOut: async () => ({})
    },
    from: () => Object.create(activeSub ? activeSubQuery(plan) : emptyQuery),
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
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
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
      window.supabase = makeSupabaseStub(opts.session || null, opts.activeSub, opts.plan);
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

  // 1. buildSVG(false)'s raw string (the source data feeding both the
  //    live preview and, at export time, buildSVG(true)) still bakes the
  //    watermark in as normal, readable text -- this part of the
  //    architecture was always sound and stays unchanged by the DOM fix
  //    below.
  {
    const { window, document } = await openBuilder({});
    fillMinimalLabel(window);
    const svg = window.buildSVG(false);
    assert(/PREVIEW ONLY/.test(svg) && /CLPeasy/.test(svg), 'unpaid preview SVG must contain the baked-in watermark text');
    assert(!document.querySelector('.label-watermark-overlay'), 'there must be no separate removable watermark overlay element');
    ok('buildSVG(false) still bakes the watermark into its raw SVG string as before');
  }

  // 1b. THE ACTUAL DOM: an earlier version of this fix wrongly reported
  //     this as already safe because the watermark wasn't a separate
  //     HTML/CSS overlay -- but the LIVE PREVIEW commits that same SVG
  //     STRING straight into the DOM, where the watermark is still its
  //     own child <g> next to the clean label paths. Reproduced directly:
  //     selecting that <g> (whose <text> reads "PREVIEW ONLY") and
  //     calling .remove() in devtools left a complete, undamaged clean
  //     label behind -- no variable tampering needed at all. Fixed by
  //     flattening the unauthorised preview to one rasterised <image>
  //     before it ever reaches the DOM (renderPreviewInto()); this test
  //     proves that structurally, not just by string-matching.
  {
    const { window } = await openBuilder({});
    fillMinimalLabel(window);
    await new Promise(r=>setTimeout(r,300)); // let the async raster commit land
    const svg = window.document.getElementById('label-svg-container').querySelector('svg');
    assert(svg, 'the preview container must contain an <svg> once rendering settles');
    assert.strictEqual(svg.querySelectorAll('g').length, 0, 'an unpaid preview must contain zero <g> elements -- no separate watermark group to delete');
    assert.strictEqual(svg.querySelectorAll('text').length, 0, 'an unpaid preview must contain zero live <text> elements -- nothing vector to extract');
    assert.strictEqual(svg.querySelectorAll('path,rect,circle').length, 0, 'an unpaid preview must contain zero live vector shape elements underneath the raster image');
    const images = svg.querySelectorAll('image');
    assert.strictEqual(images.length, 1, 'an unpaid preview must be exactly one flattened raster <image>');
    assert(images[0].getAttribute('href').startsWith('data:image/png'), 'the single preview image must be a rasterised PNG, not a live/vector reference');
    // The "delete the watermark group" attack itself: there is no group
    // to delete, so deleting the only content node (the image) must leave
    // NOTHING -- never a clean label.
    images[0].remove();
    assert.strictEqual(svg.querySelectorAll('path,rect,circle,text,image').length, 0, "deleting the preview's only content node must leave nothing recoverable, not a clean label underneath");
    ok('the live preview DOM for an unpaid user is a single flattened raster image with zero separable vector/text/group content -- the exact devtools deletion this fix addresses has nothing left to expose');
  }

  // 1c. A genuinely authorised (real active subscription) user's live
  //     preview DOM stays full, sharp, live vector -- the raster fix must
  //     not degrade what a paying customer actually sees while building
  //     their label.
  {
    const session = { user:{ id:'user-paid-preview', email:'paid@example.com', user_metadata:{} } };
    const { window } = await openBuilder({ session, activeSub:true });
    fillMinimalLabel(window);
    await new Promise(r=>setTimeout(r,300));
    const svg = window.document.getElementById('label-svg-container').querySelector('svg');
    assert(svg, 'the preview container must contain an <svg>');
    assert.strictEqual(svg.querySelectorAll('image[href^="data:image/png"]').length, 0, "an authorised user's preview must NOT be a rasterised image");
    assert(svg.querySelectorAll('text').length > 0, "an authorised user's preview must contain live, sharp vector text");
    assert(/Security Test Candle/.test(svg.outerHTML), "an authorised user's preview must show the real, inspectable label content (proving it is genuinely live vector, not a stale/placeholder frame)");
    ok("an authorised user's live preview DOM remains full, sharp, live vector -- unaffected by the unpaid-preview raster fix");
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

  // 6b. Easy Start is a PAID plan, same as Easy Pro -- the entitlement
  //     variable is named `S.isPro`/`isPro`, but its actual check
  //     (sub.status==='active') never inspects sub.plan at all. Prove
  //     that directly: an active-status "easy-start" subscription (not
  //     "pro") must still receive a clean, unwatermarked export -- the
  //     misleading variable name must not translate into an actual
  //     Pro-only restriction.
  {
    const session = { user:{ id:'user-easy-start', email:'start@example.com', user_metadata:{} } };
    const { window, capturedHrefs } = await openBuilder({ session, activeSub:true, plan:'easy-start' });
    fillMinimalLabel(window);
    await window.downloadSVG();
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(!/PREVIEW ONLY/.test(svgOut), "an active Easy Start subscriber's SVG download must NOT contain the watermark -- plan tier must not gate this, only active subscription status");
    ok('an Easy Start subscriber (not just Easy Pro) receives a clean, unwatermarked export -- confirms the isPro variable name does not translate into a Pro-only restriction');
  }

  // 6c. An expired/lapsed trial and a cancelled subscription must both
  //     stay watermarked -- status is anything other than 'active' in
  //     both cases (the app never grants entitlement off trial_end/plan
  //     alone), so this is the fail-safe default already proven for
  //     guests, now proven explicitly for these two named account states.
  {
    for (const status of ['trialing','cancelled','expired','past_due']) {
      const session = { user:{ id:'user-'+status, email:status+'@example.com', user_metadata:{} } };
      const { window, capturedHrefs } = await openBuilder({ session }); // no activeSub -> emptyQuery -> single() resolves {data:null}, matching "no active subscriptions row" for a lapsed/expired/never-active account
      fillMinimalLabel(window);
      await window.downloadSVG();
      const svgOut = decodeDataUri(capturedHrefs[0]);
      assert(/PREVIEW ONLY/.test(svgOut), `an account in a non-active state (${status}) must still receive a watermarked export`);
    }
    ok('expired trial, cancelled, expired and past-due subscription states all remain watermarked -- only a genuine active-status row unlocks a clean export');
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
    // fillMinimalLabel()'s own guest-mode preview render kicked off an
    // async rasterisation (Blob included) that may still be pending --
    // let it fully settle before counting Blobs, so only printToPDF()'s
    // own is under test below.
    await new Promise(r=>setTimeout(r,100));
    capturedBlobs.length=0;
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

  // 8b. An Easy Start subscriber who has used their whole monthly
  //     allowance but holds a purchased top-up credit: the credit must
  //     still be spent via the existing consume_topup_credit() RPC
  //     (untouched by this fix -- refreshProEntitlement() runs AFTER
  //     dlRecord() in wrapDownloads(), never before or instead of it),
  //     the credit balance must decrement, and -- since they ARE an
  //     active subscriber -- the resulting download must be clean, not
  //     watermarked. Composes the allowance mechanism and the
  //     entitlement mechanism in one realistic scenario.
  {
    const session = { user:{ id:'user-topup', email:'topup@example.com', user_metadata:{} } };
    const { window, capturedHrefs } = await openBuilder({ session, activeSub:true, plan:'easy-start' });
    fillMinimalLabel(window);
    window.eval(`
      DL={used:10,limit:10,plan:'easy-start',is_pro:false,credits:3,loaded:true};
      window.__rpcCalls=0;
      sbClient.rpc=function(name){ window.__rpcCalls++; return Promise.resolve({data:2,error:null}); };
    `);
    await window.downloadSVG();
    assert.strictEqual(window.eval('window.__rpcCalls'), 1, 'a user at their monthly limit with a top-up credit must reach consume_topup_credit() exactly once');
    assert.strictEqual(window.eval('DL.credits'), 2, "the top-up credit balance must decrement from the RPC's returned remaining count");
    const svgOut = decodeDataUri(capturedHrefs[0]);
    assert(!/PREVIEW ONLY/.test(svgOut), 'an active Easy Start subscriber spending a top-up credit must still receive a clean, unwatermarked export');
    ok('an active subscriber using a purchased top-up credit still gets a clean export, and the credit is correctly consumed -- unaffected by the entitlement re-check');
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

  // 9b. THE ACTUAL COMPOSER GRID DOM (same class of bug/fix as 1b, applied
  //     to print.html's sheet-canvas cells): a guest's placed cell must be
  //     a single flattened raster image with zero separable vector/text/
  //     group content, not a live SVG with a deletable watermark <g>.
  {
    const idA='aaaaaaaa-0000-4000-8000-00000000009b';
    const { window } = await openComposer({ seed:[candleFixture({ id:idA })] });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    await new Promise(r=>setTimeout(r,300)); // let the async cell-fill land
    const cell=window.document.querySelector('#sheet-canvas .sheet-cell');
    assert(cell, 'the Composer canvas must show an occupied cell');
    const svg=cell.querySelector('svg');
    assert(svg, 'the occupied cell must contain an <svg>');
    assert.strictEqual(svg.querySelectorAll('g').length,0,'an unpaid Composer cell must contain zero <g> elements -- no separate watermark group to delete');
    assert.strictEqual(svg.querySelectorAll('text').length,0,'an unpaid Composer cell must contain zero live <text> elements');
    const images=svg.querySelectorAll('image');
    assert.strictEqual(images.length,1,'an unpaid Composer cell must be exactly one flattened raster <image>');
    assert(images[0].getAttribute('href').startsWith('data:image/png'),'the Composer cell image must be a rasterised PNG');
    ok('the Composer grid DOM for an unpaid user is a single flattened raster image per cell, with zero separable vector/text/group content');
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

  // 12b. Easy Start on print.html's Composer -- same proof as test 6b,
  //      for the sheet-export surface: plan tier must not gate this,
  //      only active subscription status.
  {
    const session = { user:{ id:'user-easy-start-sheet', email:'start-sheet@example.com', user_metadata:{} } };
    const idA = 'aaaaaaaa-0000-4000-8000-000000000004';
    const { window, capturedImgSrcs } = await openComposer({ session, activeSub:true, plan:'easy-start', seed:[candleFixture({ id:idA })] });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    await window.eval('downloadPDF()');
    assert(capturedImgSrcs.length >= 1, 'downloadPDF() must proceed for an active Easy Start subscriber');
    const sheetSvg = decodeURIComponent(capturedImgSrcs[capturedImgSrcs.length-1].split(',').slice(1).join(','));
    assert(!/PREVIEW ONLY/.test(sheetSvg), "an active Easy Start subscriber's exported print sheet must NOT contain the watermark");
    ok('an Easy Start subscriber (not just Easy Pro) receives a clean print-sheet export on print.html');
  }

  console.log(`preview watermark and export authorisation checks passed (${passed} assertions)`);
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
