// Non-fitting-label export block (amendment #4). Follows the same jsdom
// pattern as tests/print-sheet-composer.js and tests/builder-regression.js.
// Proves: an occupied position the shared renderer reports as fits:false is
// still shown (marked, with a reason) rather than hidden; it blocks the
// whole sheet's print/PDF export while it remains; valid positions stay
// visible and unaffected; removing or swapping out the failing label
// releases the block; blank/unused slots never count as a failure; and a
// blocked export attempt has no side effect (no popup/window.open, i.e.
// nothing is "consumed" by the blocked attempt).
// Run from the repo root: node tests/print-sheet-fit-blocking.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const source = fs.readFileSync('print.html', 'utf8')
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

// A label that fits comfortably at a 52mm circle -- used twice (A and B,
// different names) so a "replace the failing label" scenario has a second
// distinct fitting label to swap in.
const fitsA = {
  scentName:'Lavender Fields', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
  signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
  sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
// Same footprint (52mm circle, so it satisfies the sheet's one-size lock)
// but with content that reliably overflows even at the smallest legible
// size -- this is the real shared renderer's own fits:false verdict, not a
// synthetic flag, mirroring the extreme-stress fixture already proven
// during the shared-renderer parity work.
const doesNotFit = {
  scentName:'Extreme Stress Test Scent Name That Is Quite Long Indeed',
  productType:'Candle', bizName:'Extreme Stress Business Name Ltd',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'1 Long Address Road, Some Town, County, Postcode', bizPhone:'01234 567890',
  bizWebsite:'www.extremestresstestbusiness.co.uk',
  netWeight:'220g', batchNum:'B009-EXTREME', burnTime:'45 hrs approx',
  signal:'Danger', hStatements:'H319, H317, H411, H412, H315, H336',
  pStatements:'P101, P102, P103, P210, P233, P260, P261, P271, P273, P302+P352, P305+P351+P338, P312, P501, P211',
  sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
  pictograms:['exclamation','flame','aquatic'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
const fitsB = { ...fitsA, scentName:'Sandalwood Dusk' };

let windowOpenCalls = 0;
let anchorClickCalls = 0;
let zipFileCalls = 0;

const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/print.html',
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
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
    // Cricut/cutting-machine PNG building (buildLabelPNGBlob) uses
    // canvas.toBlob() rather than toDataURL() -- jsdom has no real canvas
    // backend, so stub a fake PNG blob callback.
    window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size: 1, type: 'image/png' }); };
    // jsdom's own window.crypto implements randomUUID()/getRandomValues()
    // but NOT crypto.subtle (SubtleCrypto) -- label-library.js's legacy-
    // migration path needs it for deterministic id assignment. Polyfilled
    // via Node's real webcrypto implementation, exactly matching the
    // proven pattern in tests/label-identity-and-spec.js, BEFORE
    // label-library.js is evaluated below.
    try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
    window.eval(labelRendererSource);
    window.eval(labelLibrarySource);
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    // A blocked downloadPDF() must never reach this -- counted so the test
    // can prove zero side effect / nothing "consumed" by a blocked attempt.
    window.open = () => { windowOpenCalls++; return { document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    // A blocked cutting-machine export must never trigger an actual
    // download -- counted so the test can prove zero side effect / nothing
    // "consumed" by a blocked Cricut ZIP or sequential-PNG attempt. Overriding
    // this also avoids jsdom's "Not implemented: navigation" console error
    // that following a real blob: href would otherwise raise.
    window.HTMLAnchorElement.prototype.click = function(){ anchorClickCalls++; };
    // Minimal JSZip stand-in -- cricutDownloadZip() only calls .file() per
    // label and .generateAsync() once at the end.
    window.JSZip = function(){
      this.file = function(){ zipFileCalls++; };
      this.generateAsync = async function(){ return { size: 0 }; };
    };
    window.__capturedSvg = null;
    class FakeImage {
      set src(v){
        const match = decodeURIComponent(String(v).split(',').slice(1).join(',')).match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
        if (match) window.__capturedSvg = { width:Number(match[1]), height:Number(match[2]) };
        if (this.onload) this.onload();
      }
    }
    window.Image = FakeImage;
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:false, error:null })
    }) };
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([fitsA, doesNotFit, fitsB]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(async () => {
  try {
    // Force Pro status on so the pre-existing, unrelated subscription gate
    // can't mask what this test is actually checking (the fit-block).
    window.eval('isPro=true; updateProGate();');

    // ── Resolve each fixture's stable LabelLibrary-assigned id at runtime
    // -- these fixtures are intentionally id-less (legitimate pre-stable-ID
    // saved labels put through LabelLibrary's legacy migration on init()),
    // so tests must look their ids up by scentName rather than assuming a
    // fixed index/order. ─────────────────────────────────────────────
    const savedFixtures = window.eval('getSaved()');
    const idOf = name => {
      const rec = savedFixtures.find(r => r.scentName === name);
      assert(rec, `fixture "${name}" not found in migrated saved labels`);
      return rec.id;
    };
    const idFitsA = idOf(fitsA.scentName);
    const idDoesNotFit = idOf(doesNotFit.scentName);
    const idFitsB = idOf(fitsB.scentName);

    // ── Add one fitting + one non-fitting label (mixed sheet) ──────
    window.eval(`addToSheet('${idFitsA}')`); // fitsA
    window.eval(`addToSheet('${idDoesNotFit}')`); // doesNotFit
    let issues = window.eval('sheetFitIssues');
    assert.strictEqual(issues.length, 1, 'expected exactly one fit issue after adding one non-fitting label');
    assert.strictEqual(issues[0].itemId, idDoesNotFit, 'fit issue should be traced back to the doesNotFit sheet item');
    assert.strictEqual(issues[0].scentName, doesNotFit.scentName);
    assert(typeof issues[0].reason === 'string' && issues[0].reason.length > 0, 'fit issue must carry a human-readable reason');

    // ── Valid position remains visible; only the failing one is marked ──
    const canvasHTML1 = document.getElementById('sheet-canvas').innerHTML;
    const invalidCellCount = (canvasHTML1.match(/sheet-cell-invalid/g) || []).length;
    assert.strictEqual(invalidCellCount, 1, 'exactly one sheet-cell should carry sheet-cell-invalid');
    const svgCount = (canvasHTML1.match(/<svg/g) || []).length;
    assert.strictEqual(svgCount, 2, 'both occupied positions (valid and invalid) must still render an SVG -- the failing one is shown, not hidden');

    // ── Blank positions never count as a failure ───────────────────
    // Template default is 3x5 = 15 slots, only 2 occupied -- 13 blanks.
    assert.strictEqual(issues.length, 1, 'blank slots must not appear in sheetFitIssues');

    // ── One invalid position blocks the entire mixed-sheet export ──
    assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), true, 'btn-pdf must be disabled while a position fails to fit');
    windowOpenCalls = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 0, 'a blocked downloadPDF() must not open the print/PDF popup -- no side effect, nothing consumed');
    assert(window.eval('window.__lastAlert').toLowerCase().includes("can't be printed"), 'downloadPDF() must show a clear summary alert when blocked');

    // ── Removing the invalid label releases the export block ───────
    window.eval(`removeSheetItem('${idDoesNotFit}')`);
    issues = window.eval('sheetFitIssues');
    assert.strictEqual(issues.length, 0, 'removing the failing label must clear sheetFitIssues');
    assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), false, 'btn-pdf must re-enable once the failing label is removed');
    const canvasHTML2 = document.getElementById('sheet-canvas').innerHTML;
    assert.strictEqual((canvasHTML2.match(/sheet-cell-invalid/g) || []).length, 0, 'no cell should remain marked invalid after removal');

    windowOpenCalls = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 1, 'downloadPDF() must proceed normally once no position is failing');

    // ── Replacing the invalid label (remove + add a different fitting
    // label) also releases the block, and the surviving valid label (A)
    // plus the new one (B) both remain on the sheet. ────────────────
    window.eval(`addToSheet('${idDoesNotFit}')`); // doesNotFit again
    assert.strictEqual(window.eval('sheetFitIssues.length'), 1, 'setup: sheet should be blocked again before the replace step');
    window.eval(`removeSheetItem('${idDoesNotFit}')`);
    window.eval(`addToSheet('${idFitsB}')`); // fitsB, in its place
    issues = window.eval('sheetFitIssues');
    assert.strictEqual(issues.length, 0, 'replacing the failing label with a fitting one must clear the block');
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'both the original valid label and its replacement should remain on the sheet');
    windowOpenCalls = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 1, 'export must succeed again after the replace');

    // ── Blocker #3: the identical fit gate applies to EVERY output path,
    // not just Print/PDF -- the Cricut/cutting-machine modal (ZIP and
    // sequential PNG), before opening, before building a single file,
    // before consuming any download/click. Sheet is currently unblocked
    // (fitsA + fitsB from the replace step above) -- prove the happy path
    // still works before proving the blocked path produces nothing. ──
    assert.strictEqual(window.eval('document.getElementById("btn-png-all").disabled'), false, 'btn-png-all must be enabled while nothing fails to fit');
    window.eval('openCricutModal()');
    assert.strictEqual(window.eval('document.getElementById("cricutModal").classList.contains("show")'), true, 'Cricut modal should open normally when the sheet is not blocked');
    zipFileCalls = 0; anchorClickCalls = 0;
    await window.eval('cricutDownloadZip()');
    assert(zipFileCalls > 0, 'an unblocked ZIP export should actually build PNG file entries');
    assert.strictEqual(anchorClickCalls, 1, 'an unblocked ZIP export should trigger exactly one download click');
    window.eval('closeCricutModal()');

    anchorClickCalls = 0;
    window.eval('openCricutModal()');
    await window.eval('cricutDownloadSequential()');
    assert(anchorClickCalls > 0, 'an unblocked sequential export should trigger a download click per label');
    window.eval('closeCricutModal()');

    // ── Now re-block the sheet and prove every cutting-machine path
    // refuses, with zero side effects, before any file/click work. ──
    window.eval(`addToSheet('${idDoesNotFit}')`); // doesNotFit
    assert.strictEqual(window.eval('sheetFitIssues.length'), 1, 'setup: sheet should be blocked again for the Cricut-path checks');
    assert.strictEqual(window.eval('document.getElementById("btn-png-all").disabled'), true, 'btn-png-all must be disabled while a position fails to fit');

    window.eval('window.__lastAlert = null;');
    window.eval('openCricutModal()');
    assert.strictEqual(window.eval('document.getElementById("cricutModal").classList.contains("show")'), false, 'Cricut modal must NOT open while any position fails to fit');
    assert(window.eval('window.__lastAlert') && window.eval('window.__lastAlert').toLowerCase().includes("can't be printed"), 'openCricutModal() must show the same clear block summary when refused');

    // Defensive guards inside the export functions themselves -- called
    // directly (bypassing the modal gate above) to prove they refuse
    // independently, not merely because the modal never opened.
    zipFileCalls = 0; anchorClickCalls = 0;
    window.eval('window.__lastAlert = null;');
    await window.eval('cricutDownloadZip()');
    assert.strictEqual(zipFileCalls, 0, 'a blocked ZIP export must not build a single PNG file entry');
    assert.strictEqual(anchorClickCalls, 0, 'a blocked ZIP export must not trigger any download click -- nothing consumed');
    assert(window.eval('window.__lastAlert'), 'cricutDownloadZip() called directly while blocked must still alert and refuse');

    anchorClickCalls = 0;
    window.eval('window.__lastAlert = null;');
    await window.eval('cricutDownloadSequential()');
    assert.strictEqual(anchorClickCalls, 0, 'a blocked sequential export must not trigger any download click -- nothing consumed');
    assert(window.eval('window.__lastAlert'), 'cricutDownloadSequential() called directly while blocked must still alert and refuse');

    // Clean up so we end on a known-good state.
    window.eval(`removeSheetItem('${idDoesNotFit}')`);

    if (errors.length) throw new Error('jsdom runtime errors: ' + errors.join('; '));
    console.log('print-sheet fit-blocking checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 50);
