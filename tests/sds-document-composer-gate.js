// 3 Oct 2026: saved fixtures stand for labels completed in the Builder, so they
// carry the supplier-document confirmation the Builder saves (real product
// type and %, made by sds-doc-check.js; see tests/helpers/sds-doc-verified.js).
const __confirmed = arr => arr.map(r => require('./helpers/sds-doc-verified').withConfirmedDoc(r, '10%'));
// Supplier-document confirmation gate in the Print Sheet Composer (owner
// decision 2, 3 Oct 2026). Same jsdom harness as print-sheet-fit-blocking.js.
// A sheet containing any label without a current confirmation (an older
// saved label, or one changed after confirming) cannot be printed or
// downloaded through ANY path; the labels are named with guidance; nothing is
// opened, built or consumed; removing the label releases the block. Saved
// designs are never modified by the Composer.
// Run from the repo root: node tests/sds-document-composer-gate.js
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

// A label that fits at a 52mm circle -- used twice (A and B, different
// names) so a "replace the failing label" scenario has a second distinct
// fitting label to swap in.
//
// Sept 2026 correction (genuine 1.2mm mandatory-text floor): CLPeasy's
// smallest supported label size (52mm circle) now has very little headroom
// for hazard/precautionary/sensitiser content once the floor is measured
// as a real DM Sans x-height rather than a nominal SVG font-size -- the
// original 2-H/2-P/2-sensitiser content here was verified to now overflow
// even at the floor (fits:false, hazard-text-overflow). Reduced to the
// bare-minimum single H-statement/single P-statement/no-sensitiser
// combination, verified directly against the corrected renderer to
// genuinely fit. This test's purpose is proving the fit-BLOCKING mechanism
// (which cells get marked, which exports refuse, what clears the block),
// not stress-testing how much content 52mm can hold -- that's covered
// separately in tests/pictogram-parity.js and the read-only impact
// assessment -- so a thin-but-real fitting fixture serves this test's
// purpose correctly.
const fitsA = {
  scentName:'Lavender Fields', productType:'Wax Melt', bizName:'Crafty Mouse Gifts',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'Duns', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
  signal:'Warning', hStatements:'H315', pStatements:'P273',
  sensitisers:[], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
// Same footprint (52mm circle, so it satisfies the sheet's one-size lock)
// but with content that reliably overflows even at the smallest legible
// size -- this is the real shared renderer's own fits:false verdict, not a
// synthetic flag, mirroring the extreme-stress fixture already proven
// during the shared-renderer parity work.
const doesNotFit = {
  scentName:'Extreme Stress Test Scent Name That Is Quite Long Indeed',
  productType:'Wax Melt', bizName:'Extreme Stress Business Name Ltd',
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
    window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
    window.eval(labelLibrarySource); window.eval(require("fs").readFileSync(require("path").join(__dirname,"..","entitlement.js"),"utf8"));
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    // A blocked downloadPDF() must never reach this -- counted so the test
    // can prove zero side effect / nothing "consumed" by a blocked attempt.
    window.open = () => { windowOpenCalls++; return { document:{ open(){}, write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
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
    const confirmed = __confirmed([fitsA])[0];
    const legacy = Object.assign({}, fitsA, { scentName:'Older Saved Label', productType:'Wax Melt', fragLoad:'10%' });
    const stale = Object.assign(__confirmed([Object.assign({}, fitsA, { scentName:'Changed After Confirming' })])[0], { hStatements:fitsA.hStatements + ', H319' });
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([confirmed, legacy, stale]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(async () => {
  try {
    window.eval("sbClient={from:()=>({select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{plan:'pro',status:'active',subscription_status:'active',trial_end:null,downloads_used:0,downloads_limit:30,topup_credits:0},error:null});}}),rpc:()=>Promise.resolve({data:{ok:true,consumed:true,free_redownload:false,source:'plan',clean_export:true},error:null})}; currentUser=currentUser||{id:'test-pro-user'}; isPro=true; _previewVerifiedAt=Date.now(); updateProGate();");
    const saved = window.eval('getSaved()');
    const before = JSON.stringify(saved);
    const rec = name => saved.find(r => r.scentName === name);
    const M = window.SdsDocCheck;
    assert(M, 'print.html loads the shared module');
    assert.strictEqual(M.status(rec('Lavender Fields')), 'verified');
    assert.strictEqual(M.status(rec('Older Saved Label')), 'not-checked');
    assert.strictEqual(M.status(rec('Changed After Confirming')), 'needs-recheck');
    const note = document.getElementById('sds-doc-sheet-note');
    const pdfDisabled = () => window.eval('document.getElementById("btn-pdf").disabled');
    const pngDisabled = () => window.eval('document.getElementById("btn-png-all").disabled');

    // The saved-label list marks drafts (saved, not ready to print).
    const card = name => (document.getElementById('sli-' + rec(name).id) || {}).textContent || '';
    assert(/Draft: document check needed/.test(card('Older Saved Label')) && /Draft: document check needed/.test(card('Changed After Confirming')), 'unchecked labels marked as drafts in the list');
    assert(card('Lavender Fields') && !/Draft/.test(card('Lavender Fields')), 'checked label not marked');

    // Confirmed label only: export proceeds.
    window.eval(`addToSheet('${rec('Lavender Fields').id}')`);
    assert.strictEqual(pdfDisabled(), false, 'confirmed label: Print/PDF enabled');
    assert.strictEqual(note.style.display, 'none', 'no notice for a confirmed sheet');
    windowOpenCalls = 0; await window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 1, 'confirmed sheet exports');

    // Add an older label (no confirmation) and a changed one.
    window.eval(`addToSheet('${rec('Older Saved Label').id}')`);
    window.eval(`addToSheet('${rec('Changed After Confirming').id}')`);
    assert.strictEqual(pdfDisabled(), true, 'Print/PDF disabled');
    assert.strictEqual(pngDisabled(), true, 'cutting-machine download disabled');
    assert.notStrictEqual(note.style.display, 'none', 'notice shown');
    assert(/Older Saved Label/.test(note.textContent) && /Changed After Confirming/.test(note.textContent) && !/Lavender Fields/.test(note.textContent), 'notice names exactly the unconfirmed labels');
    assert(/Create Label/.test(note.textContent) && /Step 3/.test(note.textContent) && /saved designs are kept/i.test(note.textContent), 'notice gives the way to fix it');
    const msg = window.eval('getSheetFitBlockMessage()');
    assert(msg && /supplier document check/.test(msg), 'single export gate refuses');
    // Every path refuses with no side effects.
    windowOpenCalls = 0; window.eval('window.__lastAlert=null'); await window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 0, 'downloadPDF opens nothing');
    assert(/supplier document check/.test(window.eval('window.__lastAlert') || ''), 'downloadPDF explains');
    zipFileCalls = 0; anchorClickCalls = 0; window.eval('window.__lastAlert=null');
    window.eval('openCricutModal()');
    assert.strictEqual(window.eval('document.getElementById("cricutModal").classList.contains("show")'), false, 'cutting-machine dialog does not open');
    await window.eval('cricutDownloadZip()'); await window.eval('cricutDownloadSequential()');
    assert.strictEqual(zipFileCalls, 0, 'no ZIP built'); assert.strictEqual(anchorClickCalls, 0, 'no PNG downloaded');

    // Removing the unconfirmed labels releases the block.
    window.eval(`removeSheetItem('${rec('Older Saved Label').id}')`);
    assert.strictEqual(pdfDisabled(), true, 'still blocked by the changed label');
    assert(!/Older Saved Label/.test(note.textContent), 'notice updates');
    window.eval(`removeSheetItem('${rec('Changed After Confirming').id}')`);
    assert.strictEqual(pdfDisabled(), false, 'released');
    assert.strictEqual(note.style.display, 'none', 'notice hidden');
    windowOpenCalls = 0; await window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 1, 'exports again');

    assert.strictEqual(JSON.stringify(window.eval('getSaved()')), before, 'saved designs unchanged by the Composer');
    assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no script errors');
    console.log('sds-document composer gate checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 600);
