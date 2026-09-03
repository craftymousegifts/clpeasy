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
    signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
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
function eu30009Fixture(overrides){
  return Object.assign({
    scentName:'Registry Fixture', productType:'Scented Candle', signal:'WARNING',
    shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
    bizName:'Test Biz', hStatements:'H315,H319', pStatements:'P302+P352,P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'],
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
    assert(banner, 'a "Selected label" banner must render for a valid preload');
    assert(banner.textContent.includes('Preload Target'), 'the banner must show the preloaded record\'s own name');
    assert(!banner.textContent.includes('Other Label'), 'the banner must never show a different record\'s content');
    const row = document.getElementById(`sli-${idA}`);
    assert(row && row.className.includes('preload-selected'), 'the matching saved-label row must carry a clear "selected" visual state');
    const otherRow = document.getElementById(`sli-${idB}`);
    assert(otherRow && !otherRow.className.includes('preload-selected'), 'a non-matching saved-label row must never be marked selected');
    assert(/52mm circle/.test(banner.textContent), 'the banner must display the preloaded label\'s exact shape and physical dimensions');
    ok('a valid ?label=<id> selects exactly that record and highlights it, never a different one');
  }

  // ── 13. Preload never auto-adds to sheetItems, never auto-selects/
  //       changes a template, never sets a quantity ──────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Preload Only' })];
    const { window } = await openComposer({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('sheetItems.length'), 0, '?label= must never automatically add the label to sheetItems');
    assert.strictEqual(window.eval('getTotalQty()'), 0, '?label= must never set any quantity by itself');
    assert.strictEqual(window.eval('currentTpl'), 'custom', '?label= must never automatically select/change the template');
    ok('?label= preload never adds the record to sheetItems, changes the template, or sets a quantity by itself');
  }

  // ── 14. The "Selected label" banner provides a working manual Add
  //       action ──────────────────────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Preload Add Me' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idA}` });
    const bannerAddBtn = document.querySelector('#preload-banner [data-action="add"]');
    assert(bannerAddBtn && bannerAddBtn.getAttribute('data-label-id') === idA, 'the "Selected label" banner must provide a manual Add control for the preloaded record');
    bannerAddBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    assert.strictEqual(window.eval('getTotalQty()'), 1, 'clicking the banner\'s manual Add control must actually add the preloaded record to the sheet');
    assert.strictEqual(window.eval('sheetItems[0].labelId'), idA, 'the added sheet item must be the preloaded record');
    ok('the "Selected label" banner provides a working manual Add action, never an automatic one');
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
    window.eval(`addToSheet('${idB}')`);
    window.eval(`changeQty('${idB}',1)`);
    assert.strictEqual(window.eval('preloadedLabelId'), idA, 'preloadedLabelId must survive an ordinary add/quantity rerender of a DIFFERENT label');
    const rowAfter = document.getElementById(`sli-${idA}`);
    assert(rowAfter && rowAfter.className.includes('preload-selected'), 'the preloaded row\'s highlighted state must survive a rerender');
    assert(document.getElementById('preload-banner'), 'the "Selected label" banner must survive a rerender, not just the initial render');
    ok('the preload selection (highlight + banner) survives ordinary Composer rerenders');
  }

  // ── 17. Deleting the preloaded label in another tab clears only the
  //       preload, never unrelated sheet items ───────────────────────
  {
    const idPreload = fakeId(), idSheet = fakeId();
    const seed = [fixture({ id:idPreload, scentName:'Preloaded And Deleted' }), fixture({ id:idSheet, scentName:'On Sheet' })];
    const { window, document } = await openComposer({ seed, search:`?label=${idPreload}` });
    assert.strictEqual(window.eval('preloadedLabelId'), idPreload, 'setup: preload should resolve');
    window.eval(`addToSheet('${idSheet}')`);
    window.eval(`setQty('${idSheet}','2')`);
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'setup: an unrelated label should be on the sheet');
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([{ ...seed[1] }]));
    const evt = new window.StorageEvent('storage', { key:'clpeasy_labels__u_guest', storageArea: window.localStorage });
    window.dispatchEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.strictEqual(window.eval('preloadedLabelId'), null, 'the preloaded label being deleted in another tab must clear preloadedLabelId');
    assert.strictEqual(window.eval('preloadUnavailable'), true, 'the preloaded label being deleted in another tab must show the unavailable notice');
    assert(document.getElementById('saved-list').innerHTML.includes('no longer available'), 'the unavailable notice must actually render after the cross-tab deletion');
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'the unrelated sheet item (a completely different label) must be preserved, untouched by the preload\'s own deletion');
    assert.strictEqual(window.eval(`sheetItems.some(s=>s.labelId==='${idSheet}')`), true, 'the unrelated sheet item must still be present after the preload is invalidated');
    ok('deleting the preloaded label in another tab clears only the preload (never unrelated sheet items)');
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

  console.log(`\nAll ${passed} checkpoint-c-composer-identity.js checks passed.`);
})().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
