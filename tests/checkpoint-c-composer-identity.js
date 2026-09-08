// ── CHECKPOINT C1: COMPOSER SAVED-LABEL IDENTITY ─────────────────────────
// Focused regression coverage for the Checkpoint C1 corrections list.
// Loads the real print.html through the same jsdom harness pattern
// tests/print-sheet-composer.js / tests/checkpoint-b-identity-wiring.js
// already established (CDN <script src> tags stripped and stubbed;
// label-render.js and label-library.js injected explicitly via
// window.eval() in beforeParse -- real production HTML/JS, never a
// simplified re-implementation).
// Run from the repo root: node tests/checkpoint-c-composer-identity.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const printSource = fs.readFileSync('print.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');

function stubCanvas(window){
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font:'',
    measureText(text){
      const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
      return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
  window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size:1, type:'image/png' }); };
}

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};
function makeSupabaseStub(session){
  return { createClient: () => ({
    auth: {
      getSession: async () => ({ data:{ session } }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      signOut: async () => ({})
    },
    from: () => Object.create(emptyQuery),
    rpc: async () => ({ data:false, error:null })
  }) };
}

// Real jsdom UUID-format ids so LabelLibrary.isValidId()/findById() etc.
// all accept them exactly as they would a genuinely LabelLibrary-generated
// record -- these tests seed storage directly (bypassing the UI) purely to
// set up fixtures faster, the same way tests/checkpoint-b-identity-wiring.js
// already does.
let _idSeq = 0;
function fakeId(){
  _idSeq++;
  const hex = _idSeq.toString(16).padStart(8,'0');
  return `${hex}-0000-4000-8000-${'0'.repeat(11)}${_idSeq%10}`;
}

// A 52mm circle -- the Custom sheet's own default label size -- comfortably
// fitting content, matching the fixtures tests/print-sheet-*.js already use.
function fixture(overrides){
  return Object.assign({
    scentName:'Fixture Scent', productType:'Candle', bizName:'Crafty Mouse Gifts',
    shape:'circle', size:'custom', customW:52, customH:52,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
    // Correction (read-only impact assessment, 2026-09, Michaela's
    // decision): this fixture is documented (line ~62 above) as "comfortably
    // fitting content" for a 52mm circle -- the Custom sheet's own default
    // label size -- used across dozens of unrelated identity/quantity/UI
    // tests in this file that don't care about hazard-text density at all.
    // Its previous content (2 H-codes, 2 P-codes, 2 sensitisers) no longer
    // genuinely fits a 52mm (or even 63mm) circle once the mandatory-text
    // floor was corrected to a genuinely measured 1.2mm x-height (was
    // `1.2 * _pxPerMm`, which only ever delivered ~0.6mm real x-height).
    // Trimmed to a single H-code/P-code and no sensitisers -- confirmed
    // directly to genuinely fit at both 52mm and 63mm circles at the
    // corrected floor -- restoring this fixture's own documented intent.
    signal:'Warning', hStatements:'H315', pStatements:'P273',
    sensitisers:[], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  }, overrides);
}
// Same 52mm-circle footprint (so it passes the sheet's same-size lock) but
// with content that reliably overflows even at the smallest legible size --
// the real shared renderer's own fits:false verdict, reused verbatim from
// tests/print-sheet-fit-blocking.js's proven "doesNotFit" fixture.
function overflowingFixture(overrides){
  return Object.assign({
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
  }, overrides);
}
// A 99.1x57.3mm rectangle -- the EU30009 registry template's exact fixed
// geometry.
//
// Correction (read-only impact assessment, 2026-09, Michaela's decision):
// the original 2-P-code/2-sensitiser content no longer genuinely fits this
// geometry once the mandatory-text floor was corrected to a genuinely
// measured 1.2mm x-height -- confirmed directly. Trimmed to a single
// P-code and no sensitisers (both H-codes retained unchanged) -- confirmed
// directly to genuinely fit at the corrected floor.
function eu30009Fixture(overrides){
  return Object.assign({
    scentName:'Registry Fixture', productType:'Scented Candle', signal:'WARNING',
    shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
    bizName:'Test Biz', hStatements:'H315,H319', pStatements:'P302+P352',
    sensitisers:[], pictograms:['exclamation'],
  }, overrides);
}

// A verbatim reproduction of the real "QA Test Candle 6344" saved-record
// structure, fetched live from Preview #105 on 2026-09-06 (id substituted
// for a fresh test id -- every other field, including the genuine
// Rectangle + 63mm PRESET identity, is reproduced exactly). This is
// deliberately NOT built from fixture()'s size:'custom' default: presets
// (size:63, a number) and freeform custom entries (size:'custom') are two
// materially different stored shapes -- getLabelDims() (label-render.js)
// derives mmH itself for a preset (Math.round(mmW*0.7) for a rectangle)
// and ignores customW/customH entirely; they're carried on this real
// record but never actually read for a preset. isCustomSizeBelowSupportedMinimumSaved()
// (print.html) only ever gates on size==='custom', so this preset's real
// 44mm height is never subject to the Composer's 52mm-per-axis
// custom-entry minimum -- see checks 22/23 below, added after Michaela's
// 2026-09-06 correction that an earlier regression test substituted a
// size:'custom' 63x57mm fixture instead of proving the actual preset path.
function qaTestCandle6344Fixture(overrides){
  return Object.assign({
    schemaVersion:1, rendererVersion:'1.0.0',
    scentName:'QA Test Candle 6344', productType:'Scented Candle',
    shape:'rectangle', size:63, customW:63, customH:44,
    signal:'Warning', hStatements:'H317', pictograms:['exclamation'], sensitisers:[],
    bizName:'Crafty Mouse Gifts', bizAddress:'Stable Lodge', bizPhone:'07702451104',
    bizWebsite:'www.clpeasy.com', netWeight:'', fragLoad:'', burnTime:'', batchNum:'', supplier:'',
    hideEN15494:false, bgColour:'#ffffff', pStatements:'P273', textColour:'dark', showBorder:true,
    labelLang:'en', p280Items:[], p280Other:'',
    hazardFSOverride:null, scentFSOverride:null, bizNameFSOverride:null,
    hazardYOffset:null, typeFSOverride:null, sigFSOverride:null,
  }, overrides);
}

async function openComposer(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/print.html' + (opts.search||'');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const windowOpenCalls = { count: 0 };
  const dom = new JSDOM(printSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      stubCanvas(window);
      // jsdom's own window.crypto implements randomUUID()/getRandomValues()
      // but NOT crypto.subtle (SubtleCrypto), which LabelLibrary's legacy
      // migration path needs to assign an id-less fixture a real id (see
      // check 11 below). Same proven polyfill
      // tests/label-identity-and-spec.js already uses.
      try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => { windowOpenCalls.count++; return { document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function(){};
      window.JSZip = function(){ this.file = function(){}; this.generateAsync = async function(){ return { size:0 }; }; };
      class FakeImage { set src(v){ if (this.onload) this.onload(); } }
      window.Image = FakeImage;
      window.supabase = makeSupabaseStub(opts.session || null);
      const ns = opts.session ? opts.session.user.id : 'guest';
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_'+ns, JSON.stringify(opts.seed));
      }
    }
  });
  const { window } = dom;
  const document = window.document;
  // Checkpoint C1, requirement 1 (see check 1 below): the loading state and
  // the "getSaved() throws before init()" guarantee must both be observable
  // SYNCHRONOUSLY, right after the JSDOM constructor returns -- runScripts
  // executes the page's inline <script> (including init()) synchronously up
  // to its first await, so this is the one moment that proves auth/library
  // init have NOT resolved yet, before this helper's own settle-wait below
  // lets them.
  const preInitSavedListHTML = document.getElementById('saved-list') ? document.getElementById('saved-list').innerHTML : '';
  let getSavedThrowsBeforeInit = false;
  try{ window.eval('getSaved()'); }catch(e){ getSavedThrowsBeforeInit = true; }
  await new Promise(resolve => setTimeout(resolve, 200)); // initAuth() -> initComposerLibrary() (migration + SHA-256) settles
  return { dom, window, document, errors, windowOpenCalls, preInitSavedListHTML, getSavedThrowsBeforeInit };
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── 1. Composer waits for resolved auth before library init/render ──
  {
    const id = fakeId();
    const seed = [fixture({ id, scentName:'Pre-existing' })];
    const { window, document, errors, preInitSavedListHTML, getSavedThrowsBeforeInit } = await openComposer({ seed });
    assert(/Loading/i.test(preInitSavedListHTML), 'the saved-label list must show a visible loading state before auth/library init resolve, not sit blank or show stale/empty content');
    assert.strictEqual(getSavedThrowsBeforeInit, true, 'getSaved() must not be readable (LabelLibrary.getSaved() throws) before LabelLibrary.init() has resolved');
    assert.deepStrictEqual(errors, [], 'print.html must never throw reading the library before/after auth resolves: ' + errors.join('; '));
    assert.strictEqual(window.eval('getSaved().length'), 1, 'library must be readable once init has resolved, reflecting the pre-seeded guest collection');
    assert(!/Loading/i.test(document.getElementById('saved-list').innerHTML), 'the loading state must be replaced once the library has actually loaded');
    assert(document.getElementById('saved-list').innerHTML.includes('Pre-existing'), 'the saved-label list must render only after successful library initialisation');
    ok('Composer waits for resolved auth before library init/render (loading state shown first, getSaved() unreadable until init resolves)');
  }

  // ── 2. Every sheet item uses labelId, never a saved-array index ─────
  {
    assert(!/sheetItems\.findIndex\(s=>s\.id===/.test(printSource), 'print.html must no longer key sheetItems by a numeric/positional .id');
    assert(!/\{id:idx,\s*labelData/.test(printSource), 'print.html must no longer push {id:idx, labelData} sheetItems entries');
    assert(/sheetItems\.findIndex\(s=>s\.labelId===/.test(printSource), 'print.html must key sheetItems by .labelId');
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Item A' })];
    const { window } = await openComposer({ seed });
    window.eval(`addToSheet('${idA}')`);
    const item = window.eval('sheetItems[0]');
    assert.strictEqual(item.labelId, idA, 'a sheet item must carry the real stable labelId');
    assert.strictEqual(item.id, undefined, 'a sheet item must not carry a numeric/positional id field');
    assert.strictEqual(window.eval('LabelLibrary.isValidId(sheetItems[0].labelId)'), true, 'sheetItems[].labelId must be a real LabelLibrary-format id, not an index');
    ok('sheetItems entries are keyed by labelId, never a saved-array index');
  }

  // ── 3. Add/change/remove operations still affect the correct label
  //      after an earlier saved label is deleted ───────────────────────
  {
    const idA = fakeId(), idB = fakeId(), idC = fakeId();
    const seed = [fixture({ id:idA, scentName:'Will Be Deleted' }), fixture({ id:idB, scentName:'Stays B' }), fixture({ id:idC, scentName:'Stays C' })];
    const { window } = await openComposer({ seed });
    window.eval(`addToSheet('${idB}')`); // B occupies the position A used to sit before in the old array-index scheme
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'setup: B should be on the sheet');
    // Delete A directly through the coordinated mutate() API (the same
    // primitive builder.html/my-labels.html use for a real delete) --
    // updates this window's own LabelLibrary cache exactly as a same-tab
    // delete would.
    await window.eval(`LabelLibrary.mutate(function(arr){ return arr.filter(function(e){ return e.id!=='${idA}'; }); })`);
    window.eval(`setQty('${idB}','3')`);
    assert.strictEqual(window.eval(`sheetItems.find(s=>s.labelId==='${idB}').qty`), 3, 'setQty() on B by labelId must still affect B after an earlier saved label (A) was deleted -- never a different item shifted into A\'s old array position');
    window.eval(`addToSheet('${idC}')`);
    const itemC = window.eval(`sheetItems.find(s=>s.labelId==='${idC}')`);
    assert(itemC && itemC.qty===1, 'addToSheet() for a label added AFTER an earlier deletion must still resolve and add the correct record');
    assert.strictEqual(window.eval('getTotalQty()'), 4, 'total quantity must be exactly B(3) + C(1) after the deletion');
    assert.strictEqual(window.eval(`resolveSheetLabel('${idB}').scentName`), 'Stays B', 'resolving B by labelId after A\'s deletion must still return B\'s own content, never a shifted record');
    ok('add/change/remove operations still affect the correct label after an earlier saved label is deleted');
  }

  // ── 4. Different saved labels with matching physical specifications
  //      still share a sheet ────────────────────────────────────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [
      fixture({ id:idA, scentName:'Lavender Fields', productType:'Candle', bizName:'Biz One' }),
      fixture({ id:idB, scentName:'Sandalwood Dusk', productType:'Wax Melt', bizName:'Biz Two' }),
    ]; // distinct records/content, identical 52mm-circle physical spec
    const { window } = await openComposer({ seed });
    window.eval('window.__lastAlert = null;');
    window.eval(`addToSheet('${idA}')`);
    window.eval(`addToSheet('${idB}')`);
    assert.strictEqual(window.eval('window.__lastAlert'), null, `two different saved labels with matching physical specs were unexpectedly blocked: ${window.eval('window.__lastAlert')}`);
    assert.strictEqual(window.eval('sheetItems.length'), 2, 'both physically-matching labels must be able to share the sheet');
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'both should be placed with quantity 1 each');
    ok('different saved labels with matching physical specifications still share a sheet');
  }

  // ── 5. Deleting a selected label in another tab never causes another
  //      label to replace it ───────────────────────────────────────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Selected And Deleted' }), fixture({ id:idB, scentName:'Untouched' })];
    const { window, document } = await openComposer({ seed });
    window.eval(`addToSheet('${idA}')`);
    window.eval(`setQty('${idA}','2')`);
    assert.strictEqual(window.eval('sheetItems.length'), 1, 'setup: A should be the only sheet item');
    // Simulate ANOTHER tab deleting A specifically (B remains): write the
    // post-delete collection directly to this window's own localStorage,
    // then dispatch a genuine StorageEvent -- same technique
    // tests/checkpoint-b-identity-wiring.js's storage-event checks use.
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([{ ...seed[1] }]));
    const evt = new window.StorageEvent('storage', { key:'clpeasy_labels__u_guest', storageArea: window.localStorage });
    window.dispatchEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 300)); // reconciliation polls internally
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'the sheet item for the deleted label must be removed, never left pointing at a different record');
    assert.strictEqual(window.eval(`sheetItems.some(s=>s.labelId==='${idB}')`), false, 'B must never be silently substituted into A\'s old sheet item');
    const noticeShown = [...document.body.children].some(el => /deleted in another tab/i.test(el.textContent||''));
    assert(noticeShown, 'a clear notice must be shown when a sheet item is invalidated by a cross-tab deletion');
    assert.strictEqual(window.eval('getSaved().length'), 1, 'the library itself should now show only the surviving label (B)');
    ok('deleting a selected label in another tab removes its sheet item and shows a notice, never substitutes another label');
  }

  // ── 6. Fit-issue Edit links use builder.html?label=<id> ─────────────
  {
    const idA = fakeId();
    const seed = [overflowingFixture({ id:idA })];
    const { window, document } = await openComposer({ seed });
    window.eval('isPro=true; updateProGate();');
    window.eval(`addToSheet('${idA}')`);
    const issues = window.eval('sheetFitIssues');
    assert.strictEqual(issues.length, 1, 'setup: the overflowing fixture must produce exactly one fit issue');
    const panelHTML = document.getElementById('fit-issues-panel').innerHTML;
    assert(panelHTML.includes(`builder.html?label=${encodeURIComponent(idA)}`), 'the fit-issues panel\'s Edit link must use builder.html?label=<encoded stable id>');
    assert(!panelHTML.includes('builder.html?open='), 'the fit-issues panel must never use the legacy builder.html?open=<index> link any more');
    ok('fit-issue "Edit label" link uses builder.html?label=<encoded stable id>');
  }

  // ── 7. No saved-label inline onclick/index handlers remain ─────────
  {
    assert(!/onclick="addToSheet\(/.test(printSource), 'the saved-label Add control must not call addToSheet(...) via inline onclick any more');
    assert(!/onclick="changeQty\(/.test(printSource), 'the saved-label +/- controls must not call changeQty(...) via inline onclick any more');
    assert(/data-action="add"/.test(printSource) && /data-action="inc"/.test(printSource) && /data-action="dec"/.test(printSource), 'the saved-label list must mark its Add/+/- controls with data-action');
    assert(/data-label-id/.test(printSource), 'the saved-label list must identify its controls via data-label-id');

    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Delegated Item' })];
    const { window, document } = await openComposer({ seed });
    const addBtn = document.querySelector('#saved-list [data-action="add"]');
    assert(addBtn && addBtn.getAttribute('data-label-id') === idA, 'the rendered Add control must carry the record\'s stable id via data-label-id');
    // Prove the delegated listener actually works end to end, not just that
    // the markup looks right.
    addBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'clicking the delegated Add control must actually add the targeted record to the sheet');
    const incBtn = document.querySelector('#saved-list [data-action="inc"]');
    assert(incBtn && incBtn.getAttribute('data-label-id') === idA, 'the rendered + control must carry the record\'s stable id via data-label-id');
    incBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'clicking the delegated + control must actually increase quantity');
    const decBtn = document.querySelector('#saved-list [data-action="dec"]');
    decBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'clicking the delegated - control must actually decrease quantity');
    ok('no saved-label inline onclick/index handlers remain; delegated data-action/data-label-id controls work end to end');
  }

  // ── 8. Custom Sheet geometry and quantities are unchanged ──────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Custom A' }), fixture({ id:idB, scentName:'Custom B' })];
    const { window, document } = await openComposer({ seed });
    window.eval('isPro=true; updateProGate();');
    // JSON round-trip normalises the cross-realm jsdom object (a raw
    // deepStrictEqual across realms can spuriously fail on [[Prototype]]
    // identity even when the own-enumerable-property content is identical).
    assert.deepStrictEqual(
      JSON.parse(window.eval('JSON.stringify(TEMPLATES)')),
      { custom:{ name:'Custom sheet', labelMM:52, cols:3, rows:5, marginT:10, marginL:10, gapH:5, gapV:5, shape:'circle' } },
      'the Custom Sheet template catalogue entry must be byte-for-byte unchanged (Checkpoint C1 must not alter template catalogue entries)'
    );
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'default template must still be custom');
    const tplCfg = window.eval('getTplConfig()');
    assert.strictEqual(tplCfg.cols, 3); assert.strictEqual(tplCfg.rows, 5);
    window.eval(`addToSheet('${idA}')`);
    window.eval(`setQty('${idA}','2')`);
    window.eval(`addToSheet('${idB}')`);
    window.eval(`setQty('${idB}','3')`);
    assert.strictEqual(window.eval('getTotalQty()'), 5, 'Custom Sheet quantities must accumulate exactly as before');
    const canvasHTML = document.getElementById('sheet-canvas').innerHTML;
    const filledCount = (canvasHTML.match(/class="sheet-cell"/g)||[]).length;
    const emptyCount = (canvasHTML.match(/sheet-cell-empty/g)||[]).length;
    assert.strictEqual(filledCount, 5, `expected 5 filled positions on the 3x5=15-slot Custom sheet, got ${filledCount}`);
    assert.strictEqual(emptyCount, 10, `expected 10 blank positions, got ${emptyCount}`);
    ok('Custom Sheet geometry (template catalogue entry, cols/rows) and quantities are unchanged');
  }

  // ── 9. EU30009 geometry, reserved positions and 2x5 capacity are
  //      unchanged ─────────────────────────────────────────────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [eu30009Fixture({ id:idA, scentName:'Registry A' }), eu30009Fixture({ id:idB, scentName:'Registry B' })];
    const { window, document } = await openComposer({ seed });
    window.eval('isPro=true; updateProGate();');
    const reg = window.eval("getRegistryTemplate('eu30009')");
    assert.strictEqual(reg.columns, 2); assert.strictEqual(reg.rows, 5); assert.strictEqual(reg.labelsPerSheet, 10);
    assert.strictEqual(reg.labelWidthMm, 99.1); assert.strictEqual(reg.labelHeightMm, 57.3); assert.strictEqual(reg.cornerRadiusMm, 2);
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    assert.strictEqual(window.eval('currentTpl'), 'eu30009');
    window.eval(`addToSheet('${idA}')`);
    window.eval(`setQty('${idA}','2')`);
    window.eval(`addToSheet('${idB}')`);
    window.eval(`setQty('${idB}','3')`);
    window.eval("setReservedUsed('2')");
    assert.strictEqual(window.eval('reservedUsed'), 2);
    window.eval('rebuildSheet();');
    const canvasHTML = document.getElementById('sheet-canvas').innerHTML;
    const usedCount = (canvasHTML.match(/sheet-cell-used/g)||[]).length;
    const filledCount = (canvasHTML.match(/class="sheet-cell"/g)||[]).length;
    const emptyCount = (canvasHTML.match(/sheet-cell-empty/g)||[]).length;
    assert.strictEqual(usedCount, 2, `expected 2 already-used positions, got ${usedCount}`);
    assert.strictEqual(filledCount, 5, `expected 5 filled positions, got ${filledCount}`);
    assert.strictEqual(emptyCount, 3, `expected 3 blank positions, got ${emptyCount}`);
    assert.strictEqual(usedCount+filledCount+emptyCount, 10, 'positions must still add up to the 10-slot EU30009 sheet');
    ok('EU30009 geometry, reserved positions and 2x5 (10-slot) capacity are unchanged');
  }

  // ── 10. Every export-fit block remains effective ────────────────────
  {
    const idFits = fakeId(), idFails = fakeId();
    const seed = [fixture({ id:idFits, scentName:'Fits Fine' }), overflowingFixture({ id:idFails })];
    const { window, document, windowOpenCalls } = await openComposer({ seed });
    window.eval('isPro=true; updateProGate();');
    window.eval(`addToSheet('${idFits}')`);
    window.eval(`addToSheet('${idFails}')`);
    assert.strictEqual(window.eval('sheetFitIssues.length'), 1, 'setup: the sheet should have exactly one fit issue');
    assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), true, 'btn-pdf must be disabled while a position fails to fit');
    windowOpenCalls.count = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls.count, 0, 'a blocked downloadPDF() must not open the print/PDF popup');
    window.eval('window.__lastAlert = null;');
    window.eval('openCricutModal()');
    assert.strictEqual(window.eval('document.getElementById("cricutModal").classList.contains("show")'), false, 'the Cricut modal must not open while any position fails to fit');
    assert(window.eval('window.__lastAlert'), 'openCricutModal() must alert and refuse while blocked');
    // Removing the failing label (by labelId) must release the block.
    window.eval(`removeSheetItem('${idFails}')`);
    assert.strictEqual(window.eval('sheetFitIssues.length'), 0, 'removing the failing labelId must clear sheetFitIssues');
    assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), false, 'btn-pdf must re-enable once the failing label is removed');
    windowOpenCalls.count = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls.count, 1, 'downloadPDF() must proceed normally once no position is failing');
    ok('every export-fit block (PDF/print and the Cricut/cutting-machine paths) remains effective under labelId-based sheetItems');
  }

  // ── 11. An id-less legacy saved label is migrated, stays visible, and
  //       receives a valid stable id before it can be added to the sheet ─
  {
    // Deliberately id-LESS -- fixture() never adds an id unless one is
    // passed in overrides, so this is a genuine pre-stable-ID saved label,
    // exactly as real historical customer data looks before this Checkpoint.
    const seed = [fixture({ scentName:'Legacy No-Id Label' })];
    const { window, document } = await openComposer({ seed });
    // Before init() resolves, getSaved() must not be readable at all (see
    // check 1) -- so there is no window where an id-less record could be
    // read, let alone added, before migration has run.
    const migrated = window.eval('getSaved()');
    assert.strictEqual(migrated.length, 1, 'the legacy id-less label must survive migration, not be dropped');
    const rec = migrated[0];
    assert.strictEqual(rec.scentName, 'Legacy No-Id Label', 'migration must preserve the legacy record\'s own content');
    assert.strictEqual(window.eval(`LabelLibrary.isValidId(${JSON.stringify(rec.id)})`), true, 'the legacy label must receive a real, valid-format LabelLibrary id from migration');
    // Stays visible: rendered in the saved-label list with that real id.
    const addBtn = document.querySelector(`#saved-list [data-action="add"][data-label-id="${rec.id}"]`);
    assert(addBtn, 'the migrated legacy label must remain visible in the saved-label list, addressable by its new stable id');
    assert(document.getElementById('saved-list').innerHTML.includes('Legacy No-Id Label'), 'the migrated legacy label\'s content must actually render');
    // Only once migrated -- addressable by its real id -- can it be added.
    window.eval(`addToSheet('${rec.id}')`);
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'the migrated legacy label must be addable to the sheet by its new stable id');
    assert.strictEqual(window.eval(`sheetItems[0].labelId`), rec.id, 'the sheet item for a migrated legacy label must carry its real, migration-assigned id');
    ok('an id-less legacy saved label is migrated, stays visible, and receives a valid stable id before it can be added to the sheet');
  }

  // ── 12. A valid ?label=<id> selects exactly that record and highlights
  //       it, never a different one ───────────────────────────────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Preload Target' }), fixture({ id:idB, scentName:'Other Label' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'a valid ?label=<id> must set preloadedLabelId to exactly that record\'s id');
    assert.strictEqual(window.eval('preloadUnavailable'), false, 'a valid ?label=<id> must not set preloadUnavailable');
    const banner = document.getElementById('preload-banner');
    assert(banner, 'a "Label you chose" banner must render for a valid preload');
    assert(banner.textContent.includes('Preload Target'), 'the banner must show the preloaded record\'s own name');
    assert(!banner.textContent.includes('Other Label'), 'the banner must never show a different record\'s content');
    // Correction batch (Section 3): the preloaded label is represented ONLY
    // by the banner above -- it must never also appear as a separate row
    // in the saved-label list below (no duplicate card).
    assert.strictEqual(document.getElementById(`sli-${idA}`), null, 'the preloaded label must not be duplicated as a separate list row -- the banner above is its only representation');
    const otherRow = document.getElementById(`sli-${idB}`);
    assert(otherRow && !otherRow.className.includes('preload-selected'), 'a non-matching saved-label row must never be marked selected');
    assert(/52mm circle/.test(banner.textContent), 'the banner must display the preloaded label\'s exact shape and physical dimensions');
    ok('a valid ?label=<id> selects exactly that record and shows it once, never a different one and never duplicated');
  }

  // ── 13. Section 8 (2026-09-06 streamlined deep-link journey): a resolved
  //       ?label= preload now auto-selects a Custom Sheet calculated from
  //       the label's own real dimensions and auto-places exactly one copy
  //       -- never the generic 52mm/3x5 default, and never more than one
  //       copy ─────────────────────────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Preload Auto Placed' })]; // 52mm circle (fixture() default)
    const { window } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'a resolved ?label= preload must auto-select Custom Sheet, not leave no template chosen');
    assert.strictEqual(window.eval('sheetItems.length'), 1, 'a resolved ?label= preload must auto-place exactly one sheet item');
    assert.strictEqual(window.eval('sheetItems[0].labelId'), idA, 'the auto-placed sheet item must be the preloaded record itself');
    assert.strictEqual(window.eval('sheetItems[0].qty'), 1, 'exactly one copy must be auto-placed, never more');
    assert.strictEqual(window.eval('getTotalQty()'), 1, '?label= must place exactly one copy, automatically');
    assert.strictEqual(window.eval("document.getElementById('cust-label-mm').value"), '52', 'Custom Sheet\'s cell size must come from the label\'s own real 52mm size');
    // The generic static default is 3 cols x 5 rows -- the label's real
    // 52mm size at the default 10mm margin/5mm gaps actually only fits 3
    // cols x 4 rows on A4 ((210-20+5)/57=3.42, (297-20+5)/57=4.95), proving
    // Cols/Rows are genuinely calculated for this label, never the generic
    // default that happens to share its column count by coincidence.
    assert.strictEqual(window.eval("document.getElementById('cust-cols').value"), '3', 'Cols must be calculated from the label\'s real size and the A4 sheet, not silently left however they were');
    assert.strictEqual(window.eval("document.getElementById('cust-rows').value"), '4', 'Rows must be calculated from the label\'s real size and the A4 sheet -- never the generic 3x5 default (which does not actually fit this label\'s size)');
    ok('?label= preload auto-selects a Custom Sheet calculated from the label\'s real dimensions and auto-places exactly one copy');
  }

  // ── 14. The "Selected label" banner shows the auto-placed copy
  //       immediately, with working quantity controls -- no manual Add
  //       step required, but quantity/template remain fully user-editable
  //       (Section 8) ──────────────────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Preload Add Me' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'setup: the preloaded label must already be auto-placed on the sheet');
    const bannerOnSheet = document.querySelector('#preload-banner .preload-banner-added');
    assert(bannerOnSheet && /on this sheet/i.test(bannerOnSheet.textContent), 'the banner must show the preloaded label as already on the sheet, not offer a manual Add button');
    assert(!document.querySelector('#preload-banner [data-action="add"]'), 'the banner must not show an Add control for a label that has already been auto-placed');
    // The user must still be able to change the quantity from the banner.
    const incBtn = document.querySelector('#preload-banner [data-action="inc"]');
    assert(incBtn && incBtn.getAttribute('data-label-id') === idA, 'the banner must provide a working + control for the auto-placed label');
    incBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'clicking the banner\'s + control must increase the auto-placed label\'s quantity');
    const decBtn = document.querySelector('#preload-banner [data-action="dec"]');
    assert(decBtn && decBtn.getAttribute('data-label-id') === idA, 'the banner must provide a working - control for the auto-placed label');
    decBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'clicking the banner\'s - control must decrease the auto-placed label\'s quantity');
    // The user must still be able to switch to a different sheet template.
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    assert.strictEqual(window.eval('currentTpl'), 'eu30009', 'the user must still be able to switch away from the auto-selected Custom Sheet to a different template');
    ok('the "Label you chose" banner shows the auto-placed copy immediately with working quantity controls, and the template can still be switched');
  }

  // ── 15. Malformed and unknown ?label= ids never select another
  //       (e.g. the first) record ────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Only Label' })];
    {
      const { window, document } = await openComposer({ seed, search:'?label=not-a-real-id' });
      assert.strictEqual(window.eval('preloadedLabelId'), null, 'a malformed ?label= value must never resolve to any record');
      assert.strictEqual(window.eval('preloadUnavailable'), true, 'a malformed ?label= value must surface the unavailable notice');
      const row = document.getElementById(`sli-${idA}`);
      assert(row && !row.className.includes('preload-selected'), 'a malformed id must never cause a fallback selection of the only/first record');
      assert(document.getElementById('saved-list').innerHTML.includes('no longer available'), 'a malformed id must show the recoverable "no longer available" notice');
    }
    {
      const unknownId = fakeId();
      const { window, document } = await openComposer({ seed, search:`?label=${unknownId}` });
      assert.strictEqual(window.eval('preloadedLabelId'), null, 'a well-formed but unknown ?label= id must never resolve to any record');
      assert.strictEqual(window.eval('preloadUnavailable'), true, 'an unknown id must surface the unavailable notice');
      const row = document.getElementById(`sli-${idA}`);
      assert(row && !row.className.includes('preload-selected'), 'an unknown id must never fall back to selecting the first/only real record');
    }
    ok('malformed and unknown ?label= ids never select another (e.g. the first) record, and surface a recoverable notice');
  }

  // ── 16. Preload selection survives ordinary Composer rerenders ─────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Stays Selected' }), fixture({ id:idB, scentName:'Other' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'setup: preload should resolve');
    // Section 8: idA is already auto-placed (Custom Sheet, qty 1) the
    // moment the Composer opens -- no manual selectTemplate() call is made
    // here (that would reset sheetItems, wiping the auto-placed item,
    // since selectTemplate() always clears the sheet for a genuine template
    // switch). Adding a second, different label (idB) on the
    // already-auto-selected Custom Sheet confirms the preload survives an
    // ordinary add/quantity rerender of a DIFFERENT label.
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'setup: the preloaded label (idA) should already be auto-placed on the sheet');
    window.eval(`addToSheet('${idB}')`);
    window.eval(`changeQty('${idB}',1)`);
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'preloadedLabelId must survive an ordinary template-selection/add/quantity rerender of a DIFFERENT label');
    // Correction batch (Section 3): the preloaded label is represented only
    // by the banner -- it must never also appear as a separate list row.
    assert.strictEqual(document.getElementById(`sli-${idA}`), null, 'the preloaded label must still never appear as a duplicate list row after a rerender');
    assert(document.getElementById('preload-banner'), 'the "Label you chose" banner must survive a rerender, not just the initial render');
    ok('the preload selection (banner, never duplicated) survives ordinary Composer rerenders');
  }

  // ── 17. Deleting the preloaded label in another tab clears only the
  //       preload, never unrelated sheet items ───────────────────────
  {
    const idPreload = fakeId(), idSheet = fakeId();
    const seed = [fixture({ id:idPreload, scentName:'Preloaded And Deleted' }), fixture({ id:idSheet, scentName:'On Sheet' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idPreload}` });
    assert.strictEqual(window.eval('preloadedLabelId'), idPreload, 'setup: preload should resolve');
    // Section 8: idPreload is already auto-placed (Custom Sheet, qty 1) the
    // moment the Composer opens -- no manual selectTemplate() call needed.
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'setup: the preloaded label should already be auto-placed on the sheet');
    window.eval(`addToSheet('${idSheet}')`);
    window.eval(`setQty('${idSheet}','2')`);
    assert.strictEqual(window.eval('getTotalQty()'), 3, 'setup: the preloaded label\'s auto-placed copy (1) plus the unrelated label (2) should both be on the sheet');
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([{ ...seed[1] }]));
    const evt = new window.StorageEvent('storage', { key:'clpeasy_labels__u_guest', storageArea: window.localStorage });
    window.dispatchEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.strictEqual(window.eval('preloadedLabelId'), null, 'the preloaded label being deleted in another tab must clear preloadedLabelId');
    assert.strictEqual(window.eval('preloadUnavailable'), true, 'the preloaded label being deleted in another tab must show the unavailable notice');
    assert(document.getElementById('saved-list').innerHTML.includes('no longer available'), 'the unavailable notice must actually render after the cross-tab deletion');
    assert.strictEqual(window.eval(`sheetItems.some(s=>s.labelId==='${idPreload}')`), false, 'the preloaded label\'s own auto-placed sheet entry must be removed by the same cross-tab prune that invalidates the preload -- it no longer exists, so it cannot legitimately stay on the sheet');
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'the unrelated sheet item (a completely different label) must be preserved, untouched by the preload\'s own deletion, once only its own auto-placed entry is pruned');
    assert.strictEqual(window.eval(`sheetItems.some(s=>s.labelId==='${idSheet}')`), true, 'the unrelated sheet item must still be present after the preload is invalidated');
    ok('deleting the preloaded label in another tab removes only its own auto-placed sheet entry, never an unrelated one');
  }

  // ── 18. Unrelated query parameters and the URL hash survive
  //       resolving ?label= ─────────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'URL Preserved' })];
    const search = `?label=${idA}&utm_source=test&foo=bar#some-hash`;
    const { window } = await openComposer({ seed, search });
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'setup: the label param must still resolve alongside other params/hash');
    assert.strictEqual(window.location.search, `?label=${idA}&utm_source=test&foo=bar`, 'resolving ?label= must never strip or rewrite unrelated query parameters');
    assert.strictEqual(window.location.hash, '#some-hash', 'resolving ?label= must never strip or rewrite the URL hash');
    ok('unrelated query parameters and the URL hash are preserved while resolving ?label=');
  }

  // ── 19. No Composer ?open=<index> route exists ──────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Index Zero' })];
    // Composer has never supported ?open=<index> -- prove this Checkpoint
    // did not accidentally introduce one. '0' is a valid array index for
    // idA (the only saved label) -- it must still select nothing.
    const { window, document } = await openComposer({ seed, search:'?open=0' });
    assert.strictEqual(window.eval('preloadedLabelId'), null, 'print.html must never support a legacy ?open=<index> preload route');
    assert.strictEqual(window.eval('preloadUnavailable'), false, '?open= is simply not a parameter this page reads -- it must not even trigger the unavailable notice');
    const row = document.getElementById(`sli-${idA}`);
    assert(row && !row.className.includes('preload-selected'), '?open=0 must never select the record at that array position');
    assert(!printSource.includes('resolveLegacyIndex'), 'print.html must never call label-library.js\'s builder.html-only resolveLegacyIndex() shim');
    ok('no Composer ?open=<index> route exists -- only ?label=<stable-id> is ever read');
  }

  // ── 20. Full journey: a non-square-rectangle saved label's deep link
  //       auto-initialises a Custom Sheet from its real dimensions (the
  //       initCustomRectLockIfNeeded() rectangle-lock path, complementing
  //       check 13's circle coverage) and the sheet preview already shows
  //       it placed, with template/quantity still fully user-editable
  //       (Section 8, Michaela's 2026-09-06 review, requirement 4) ──────
  {
    const idA = fakeId();
    // 63x57mm -- both dimensions at/above the Composer's own pre-existing
    // 52mm-minimum-per-axis supported custom size (isCustomSizeBelowSupportedMinimumSaved(),
    // untouched by this feature); a genuine non-square rectangle.
    const seed = [fixture({ id:idA, scentName:'Rect Deep Link', shape:'rectangle', customW:63, customH:57 })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'a resolved ?label= deep link must auto-select Custom Sheet');
    assert.strictEqual(window.eval('sheetItems.length'), 1, 'a resolved ?label= deep link must auto-place exactly one sheet item');
    assert.strictEqual(window.eval('sheetItems[0].labelId'), idA, 'the auto-placed item must be the deep-linked label itself');
    assert.strictEqual(window.eval('sheetItems[0].qty'), 1, 'exactly one copy must be auto-placed, never more');
    // 63x57mm at the default 10mm margin/5mm gaps fits 2 cols x 4 rows on
    // A4 ((210-20+5)/68=2.87->2, (297-20+5)/62=4.55->4) -- never the
    // generic 3x5 default, which doesn't match this label's real size.
    assert.strictEqual(window.eval("document.getElementById('cust-cols').value"), '2', 'Cols must be calculated from the label\'s real 63x57mm size, never the generic default');
    assert.strictEqual(window.eval("document.getElementById('cust-rows').value"), '4', 'Rows must be calculated from the label\'s real 63x57mm size');
    const canvasHTML = document.getElementById('sheet-canvas').innerHTML;
    const filledCount = (canvasHTML.match(/class="sheet-cell"/g)||[]).length;
    const emptyCount = (canvasHTML.match(/sheet-cell-empty/g)||[]).length;
    assert.strictEqual(filledCount, 1, 'the sheet preview must already show exactly one filled position, with no extra clicks');
    assert.strictEqual(emptyCount, 7, 'the remaining 7 of the 2x4=8 calculated slots must show as empty');
    // User must still be free to change quantity and switch templates.
    window.eval(`setQty('${idA}','3')`);
    assert.strictEqual(window.eval('getTotalQty()'), 3, 'the user must still be able to change the auto-placed label\'s quantity afterwards');
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    assert.strictEqual(window.eval('currentTpl'), 'eu30009', 'the user must still be able to switch to a different sheet template afterwards');
    ok('a non-square-rectangle deep link auto-initialises a Custom Sheet calculated from its real dimensions and shows it already placed, with template/quantity still fully user-editable');
  }

  // ── 21. A saved label below the Composer's own supported minimum size
  //       (52mm per axis -- isCustomSizeBelowSupportedMinimumSaved(),
  //       pre-existing and untouched by this feature) is never
  //       auto-placed -- the Composer falls back to the plain
  //       template-choice state instead of forcing a rejected layout
  //       (Section 8's explicit fail-safe: "if automatic placement is
  //       unsafe... stop and present a clear template choice") ─────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Too Small For Sheet', shape:'circle', size:'custom', customW:45, customH:45 })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'setup: preload should still resolve to the record even though it cannot be auto-placed');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'a label below the Composer\'s own supported minimum size must never be auto-placed');
    assert.strictEqual(window.eval('currentTpl'), null, 'automatic placement being unsafe must fall back to no template selected, presenting a clear template choice');
    const bannerAddBtn = document.querySelector('#preload-banner [data-action="add"]');
    assert(bannerAddBtn && bannerAddBtn.getAttribute('data-label-id') === idA, 'the banner must fall back to its manual Add control (blocked until a template is chosen), exactly as an unresolved auto-init already did before this feature existed');
    bannerAddBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 0, 'clicking Add before a template is chosen must still refuse, exactly as before this feature existed');
    assert(window.eval('window.__lastAlert'), 'clicking Add before a template is chosen must alert, explaining a template is needed first');
    ok('a saved label below the Composer\'s own supported minimum size is never auto-placed -- the Composer safely falls back to the plain template-choice state');
  }

  // ── 22. The EXACT QA Test Candle 6344 saved-record structure (a genuine
  //       Rectangle + 63mm PRESET -- size:63, never size:'custom') is
  //       auto-placed on deep link, never rejected by the Composer's
  //       custom-entry-only 52mm-per-axis minimum (Michaela's correction,
  //       2026-09-06: that minimum applies only to size:'custom' freeform
  //       entries -- a recognised preset's identity must be preserved,
  //       however small either of its real physical axes is). ──────────
  //
  // Correction (read-only impact assessment, 2026-09, Michaela's decision)
  // -- IMPORTANT, DISCLOSED FINDING: canAddToSheet() (print.html) only ever
  // checks DIMENSION/template/grid compatibility -- it has never checked
  // whether a label's actual CONTENT fits at its size, which is instead
  // decided independently by renderSheetPosition()'s own call into
  // LabelRenderer.renderLabel() every time the sheet canvas renders (see
  // print.html's `result.fits`/`sheet-cell-invalid`/sheetFitIssues, an
  // already-existing, unrelated mechanism this fix does not touch). So
  // auto-PLACEMENT was, and remains, governed purely by dimensions: this
  // record's real 63x44mm preset footprint is dimensionally valid for a
  // Custom Sheet, and it is still correctly auto-placed exactly as before.
  //
  // What changed is the CONTENT check that runs after placement: with the
  // mandatory-text floor corrected to a genuinely measured 1.2mm x-height
  // (previously ~0.6mm real x-height under the unfixed `1.2 * _pxPerMm`
  // formula), the real QA Test Candle 6344 record's own genuine content
  // (H317, P273, its real business name/address/phone) no longer fits its
  // own genuine 63x44mm size -- confirmed directly (LabelRenderer.
  // renderLabel() on this exact structure now returns fits:false,
  // warnings:['hazard-text-overflow']). This is a real, disclosed
  // consequence of the floor correction on a genuine production record,
  // not a defect in the Composer or in this deep-link feature -- and it
  // is handled by the pre-existing, unrelated "this label doesn't fit"
  // UX (sheet-cell-invalid outline, fit-issues panel, export blocked)
  // exactly as any other occupied position that doesn't fit would be,
  // rather than being silently placed as if it were fine. The live saved
  // record itself is NOT altered by this test or by this fix -- see
  // Michaela's explicit instruction that it must stay unchanged.
  {
    const idA = fakeId();
    const seed = [qaTestCandle6344Fixture({ id:idA })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    const dims = JSON.parse(window.eval(`JSON.stringify(getLabelDimsMM(resolveSheetLabel('${idA}')))`));
    assert.deepStrictEqual(dims, { w:63, h:44 }, 'setup: the genuine 63mm rectangle preset must resolve to the real 63x44mm physical footprint used everywhere else in the app');
    assert.strictEqual(window.eval(`isCustomSizeBelowSupportedMinimumSaved(resolveSheetLabel('${idA}'))`), false, 'a recognised preset must never be treated as a below-minimum custom entry, however small either of its physical axes is');
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'the exact QA Test Candle 6344 record must auto-select Custom Sheet -- placement is a dimensions-only decision, unaffected by whether its content separately fits');
    assert.strictEqual(window.eval('sheetItems.length'), 1, 'the exact QA Test Candle 6344 record must be auto-placed, never excluded for being a 63x44mm preset');
    assert.strictEqual(window.eval('sheetItems[0].labelId'), idA, 'the auto-placed item must be QA Test Candle 6344 itself');
    assert.strictEqual(window.eval('sheetItems[0].qty'), 1, 'exactly one copy must be auto-placed');
    // 63x44mm at the default 10mm margin/5mm gaps fits 2 cols x 5 rows on
    // A4 ((210-20+5)/68=2.87->2, (297-20+5)/49=5.76->5).
    assert.strictEqual(window.eval("document.getElementById('cust-cols').value"), '2', 'Cols must be calculated from the preset\'s real 63x44mm size');
    assert.strictEqual(window.eval("document.getElementById('cust-rows').value"), '5', 'Rows must be calculated from the preset\'s real 63x44mm size');
    const canvasHTML = document.getElementById('sheet-canvas').innerHTML;
    const filledCount = (canvasHTML.match(/class="sheet-cell[" ]/g)||[]).length;
    const invalidCount = (canvasHTML.match(/sheet-cell-invalid/g)||[]).length;
    const emptyCount = (canvasHTML.match(/sheet-cell-empty/g)||[]).length;
    assert.strictEqual(filledCount, 1, 'the sheet preview must show exactly one occupied position immediately after the deep link initialises');
    assert.strictEqual(emptyCount, 9, 'the remaining 9 of the 2x5=10 calculated slots must show as empty');
    assert(canvasHTML.includes('QA Test Candle 6344'), 'the sheet preview\'s occupied position must render the correct label\'s own content (its scent name), not a placeholder or a different label');
    // The disclosed finding itself: this real record's genuine content no
    // longer fits its own genuine size at the corrected floor, so the
    // pre-existing "doesn't fit" UX must be showing, not a plain fit.
    assert.strictEqual(invalidCount, 1, 'at the corrected genuine 1.2mm x-height floor, QA Test Candle 6344\'s real content (H317/P273/its real business details) no longer fits its own real 63x44mm size -- the occupied position must be marked sheet-cell-invalid, not shown as a plain fit');
    assert.strictEqual(window.eval('sheetFitIssues.length'), 1, 'the fit-issues panel must list this exact placement as not fitting');
    assert.strictEqual(window.eval('sheetFitIssues[0].itemId'), idA, 'the fit issue must be attributed to QA Test Candle 6344 itself');
    assert(/hazard.*overflow|hazard\/precautionary text/i.test(window.eval('sheetFitIssues[0].reason')), `the fit issue's reason must name the real cause (hazard/precautionary text overflow) -- got: ${window.eval('sheetFitIssues[0].reason')}`);
    ok('the exact QA Test Candle 6344 saved-record structure (a genuine 63mm rectangle preset) is still correctly auto-placed on deep link, dimensionally, exactly as before -- but at the corrected genuine 1.2mm x-height floor its real content no longer fits its own real size, and the Composer correctly surfaces this via the pre-existing fit-issues UX rather than silently placing an illegible label');
  }

  // ── 23. A MANUALLY entered custom 63x44mm rectangle (size:'custom', a
  //       genuinely freeform entry) ────────────────────────────────────
  //
  // Correction (2026-09-08, Michaela's explicit Custom-rectangle-policy
  // decision): the below-52mm-on-either-axis rule this check used to
  // verify is exactly what was replaced. The real, current shared rule
  // (LabelRenderer.isCustomSizeBelowSupportedMinimum / ...Saved, used
  // identically by both Builder and Composer) is shape-aware: a
  // rectangle is supported at >=52mm on its long side and >=36mm on its
  // short side, either orientation -- not >=52mm on both. 63x44mm
  // (long=63>=52, short=44>=36) is one of Michaela's own explicitly
  // named supported examples, so a manually-entered Custom 63x44mm
  // rectangle must now be treated exactly like a recognised preset of
  // the same footprint (check 22 above) for placement purposes -- this
  // was the whole point of unifying Builder/Composer onto one shared
  // rule. (Whether its actual CONTENT separately fits is the unrelated,
  // pre-existing renderLabel()-driven fit check -- see check 22's own
  // comment -- not what this check is about.)
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Manual Custom 63x44', shape:'rectangle', size:'custom', customW:63, customH:44 })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval(`isCustomSizeBelowSupportedMinimumSaved(resolveSheetLabel('${idA}'))`), false, 'a freeform custom rectangle at 63x44mm (long side 63>=52mm, short side 44>=36mm) must now be treated as within the Composer\'s supported minimum, matching Michaela\'s shape-aware rectangle policy');
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'a within-minimum freeform custom rectangle must auto-select Custom Sheet, exactly like a recognised preset of the same footprint');
    assert.strictEqual(window.eval('sheetItems.length'), 1, 'a manually entered custom 63x44mm rectangle must now be auto-placed -- it is within the shape-aware minimum, not below it');
    assert.strictEqual(window.eval('sheetItems[0].labelId'), idA, 'the auto-placed item must be this manually-entered custom rectangle itself');
    ok('a manually entered (non-preset) custom 63x44mm rectangle is now correctly auto-placed under Michaela\'s shape-aware Custom-rectangle policy (long side >=52mm, short side >=36mm), matching a recognised preset of the identical physical size (check 22)');
  }

  // ── 23b. A genuinely freeform custom rectangle BELOW the shape-aware
  //        minimum on its short side (e.g. 60x30mm: long=60>=52mm ok,
  //        but short=30mm<36mm) must still be correctly rejected --
  //        proves the new rule has a real floor, not just a raised one ──
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Manual Custom 60x30', shape:'rectangle', size:'custom', customW:60, customH:30 })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval(`isCustomSizeBelowSupportedMinimumSaved(resolveSheetLabel('${idA}'))`), true, 'a freeform custom rectangle with a 30mm short side (below the 36mm shape-aware floor) must still be treated as below the Composer\'s supported minimum');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'a 60x30mm custom rectangle must not be auto-placed -- its 30mm short side is below the 36mm floor');
    assert.strictEqual(window.eval('currentTpl'), null, 'automatic placement being unsafe for a below-floor freeform custom entry must fall back to no template selected, presenting a clear template choice');
    const bannerAddBtn = document.querySelector('#preload-banner [data-action="add"]');
    assert(bannerAddBtn && bannerAddBtn.getAttribute('data-label-id') === idA, 'the banner must fall back to its manual Add control, exactly as the below-minimum fail-safe (check 21) does');
    ok('a freeform custom rectangle below the shape-aware minimum on its short side (60x30mm) is still correctly rejected -- the raised rectangle allowance has a real floor (36mm short side), it is not unlimited');
  }

  console.log(`\nAll ${passed} checkpoint-c-composer-identity.js checks passed.`);
})().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
