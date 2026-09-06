// ── CHECKPOINT B: BUILDER AND MY LABELS IDENTITY WIRING ─────────────────
// Focused regression coverage for requirement 9's explicit list. Loads the
// real builder.html and my-labels.html through the same jsdom harness
// pattern tests/builder-regression.js already established (CDN <script
// src> tags stripped and stubbed; label-render.js and, new for this
// checkpoint, label-library.js injected explicitly via window.eval() in
// beforeParse -- both files load real production HTML/JS, never a
// simplified re-implementation.
// Run from the repo root: node tests/checkpoint-b-identity-wiring.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const builderSource = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const myLabelsSource = fs.readFileSync('my-labels.html', 'utf8')
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
}

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  maybeSingle(){ return Promise.resolve({ data:null, error:null }); },
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

function fixture(overrides){
  return Object.assign({
    schemaVersion:1, rendererVersion:'test', scentName:'Fixture Scent', productType:'Scented Candle',
    shape:'circle', size:52, customW:undefined, customH:undefined, signal:'Warning', hStatements:'H317',
    pictograms:['exclamation'], sensitisers:['Linalool'], bizName:'Crafty Mouse Gifts', bizAddress:'',
    bizPhone:'01234 567890', bizWebsite:'', netWeight:'220g', fragLoad:'10%', burnTime:'', batchNum:'',
    supplier:'', hideEN15494:false, bgColour:'#ffffff', pStatements:'', textColour:'dark', showBorder:true,
    labelLang:'en', p280Items:[], p280Other:'', savedAt:'01/09/2026',
  }, overrides);
}

// Real jsdom UUID-format ids so LabelLibrary.isValidId()/findById() etc.
// all accept them exactly as they would a genuinely LabelLibrary-generated
// record -- these tests seed storage directly (bypassing the UI) purely
// to set up fixtures faster, the same way tests/label-identity-and-spec.js
// already does.
let _idSeq = 0;
function fakeId(){
  _idSeq++;
  const hex = _idSeq.toString(16).padStart(8,'0');
  return `${hex}-0000-4000-8000-${'0'.repeat(11)}${_idSeq%10}`;
}

async function openBuilder(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/builder.html' + (opts.search||'');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(builderSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      stubCanvas(window);
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.supabase = makeSupabaseStub(null); // guest, unless the caller seeds storage under 'guest'
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(opts.seed));
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 80));
  return { dom, window: dom.window, document: dom.window.document, errors };
}

async function openMyLabels(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/my-labels.html';
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const session = { user: { id:'ml-user-1', email:'maker@example.com', user_metadata:{} } };
  const dom = new JSDOM(myLabelsSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      stubCanvas(window);
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.confirm = () => true;
      window.supabase = makeSupabaseStub(session);
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_ml-user-1', JSON.stringify(opts.seed));
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 80));
  return { dom, window: dom.window, document: dom.window.document, errors };
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── 1. Auth-before-library initialisation ──────────────────────────
  {
    const seed = [fixture({ id: fakeId(), scentName:'Pre-existing' })];
    const { window, errors } = await openBuilder({ seed });
    assert.deepStrictEqual(errors, [], 'builder.html must never throw reading the library before/after auth resolves: ' + errors.join('; '));
    assert.strictEqual(window.eval('getSaved().length'), 1, 'library must be readable once init has resolved, reflecting the pre-seeded guest collection');
    ok('auth-before-library-init: no premature read, library readable once auth+init resolve (builder)');
  }
  {
    const seed = [fixture({ id: fakeId(), scentName:'Pre-existing' })];
    const { window, errors } = await openMyLabels({ seed });
    assert.deepStrictEqual(errors, [], 'my-labels.html must never throw reading the library before/after auth resolves: ' + errors.join('; '));
    assert.strictEqual(window.eval('getSaved().length'), 1, 'library must be readable once init has resolved (my-labels)');
    ok('auth-before-library-init: no premature read, library readable once auth+init resolve (my-labels)');
  }

  // ── 2. Stable-ID open/edit (builder.html?label=<id>) ────────────────
  // Regression coverage for the Preview #105 / commit 6087b05 report:
  // opening builder.html?label=<id> must not just land on Step 5 with the
  // right URL -- editingLabelId, the full builder state, the rendered SVG
  // preview content, and the contextual Print Sheet Composer action must
  // all be correctly populated too, and this must hold up even though
  // renderSaved() (which computes the Composer link) is first called
  // earlier during initSavedLabelLibrary(), before _clpHandleOpenParam()
  // has resolved LabelLibrary.init() and called loadLabelRecord().
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Label A' }), fixture({ id:idB, scentName:'Label B' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${idB}` });
    assert.strictEqual(document.getElementById('scent-name').value, 'Label B', '?label=<id> must open exactly that record');
    assert.strictEqual(window.eval('editingLabelId'), idB, 'opening via ?label= must set editingLabelId to that record\'s id');
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, '?label= deep link must land on Step 5, same as the legacy ?open= shim did');

    // Preview must genuinely render this record's content via the shared
    // renderer (buildSVG()/LabelRenderer.renderLabel()), not merely land on
    // Step 5 with stale/blank/default content. jsdom never computes layout
    // (offsetParent is always null -- see updateLabel()'s visibility gate
    // around #label-svg-container), so the actual DOM write into
    // #label-svg-container cannot be observed in this harness; calling the
    // same shared renderer entry point the real page calls is the
    // established way this suite already verifies rendered content (see
    // tests/builder-regression.js's window.buildSVG(false) assertions).
    const svg = window.buildSVG(false);
    assert(svg.includes('Label B'), 'the Label Preview SVG must contain the opened record\'s actual scent name, not blank/default/other-record content');
    assert(!svg.includes('Label A'), 'the Label Preview SVG must not contain a different record\'s content');

    // Contextual Print Sheet Composer / "Print multiple" action must now be
    // visible and point at this exact record.
    const psLink = document.getElementById('print-sheet-link');
    const psLinkPreview = document.getElementById('print-sheet-link-preview');
    assert.notStrictEqual(psLink.style.display, 'none', 'the contextual Print Sheet Composer action (#print-sheet-link) must be visible once a saved label is opened via ?label=<id>');
    assert.strictEqual(psLink.getAttribute('href'), 'print.html?label=' + encodeURIComponent(idB), 'the contextual Composer action must link to print.html?label=<the same encoded id>');
    assert.notStrictEqual(psLinkPreview.style.display, 'none', 'the Step-5 preview-panel copy of the contextual Composer action (#print-sheet-link-preview) must also be visible on Step 5');
    assert.strictEqual(psLinkPreview.getAttribute('href'), 'print.html?label=' + encodeURIComponent(idB), 'the Step-5 contextual Composer action must also link to print.html?label=<the same encoded id>');
    ok('stable-ID open/edit: builder.html?label=<id> opens the exact record, sets editingLabelId, renders that record\'s content, and shows the contextual Composer action with the correct URL');
  }

  // ── 2b. Manually clicking "Open" from a rendered My Labels card ─────
  // Proves the actual rendered anchor in my-labels.html (not just a
  // hand-built ?label=<id> query string) leads to the identical correct
  // result end to end.
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Label A' }), fixture({ id:idB, scentName:'Label B' })];
    const { document: myLabelsDoc } = await openMyLabels({ seed });
    const openLink = myLabelsDoc.querySelector(`a[href*="${encodeURIComponent(idB)}"]`);
    assert(openLink, 'My Labels must render an "Open" link for the seeded record');
    assert(/^builder\.html\?label=/.test(openLink.getAttribute('href')), 'the rendered Open link must point at builder.html?label=<id>, not an index-based or other URL');
    const openHref = openLink.getAttribute('href');
    const search = openHref.slice(openHref.indexOf('?'));

    const { window, document } = await openBuilder({ seed, search });
    assert.strictEqual(document.getElementById('scent-name').value, 'Label B', 'following the rendered My Labels Open link must open the exact same record');
    assert.strictEqual(window.eval('editingLabelId'), idB, 'following the rendered My Labels Open link must set editingLabelId correctly');
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, 'following the rendered My Labels Open link must land on Step 5');
    assert(window.buildSVG(false).includes('Label B'), 'following the rendered My Labels Open link must render the correct record\'s content');
    const psLink = document.getElementById('print-sheet-link');
    assert.notStrictEqual(psLink.style.display, 'none', 'following the rendered My Labels Open link must also show the contextual Composer action');
    assert.strictEqual(psLink.getAttribute('href'), 'print.html?label=' + encodeURIComponent(idB), 'following the rendered My Labels Open link must give the Composer action the correct URL');
    ok('manually clicking Open from a rendered My Labels card produces the identical correct route, state, preview content and Composer action as a direct ?label=<id> open');
  }

  // ── 3. Unknown/deleted/malformed id never opens index 0 or another label ─
  for(const badId of ['not-a-real-id', '00000000-0000-4000-8000-000000000099']){
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Should Not Open' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${badId}` });
    assert.notStrictEqual(document.getElementById('scent-name').value, 'Should Not Open', `unknown/malformed id (${badId}) must never silently fall back to index 0 / any other label`);
    assert.strictEqual(window.eval('approvedBuilderStep'), 1, `unknown/malformed id (${badId}) must leave the wizard at Step 1, not force it to Step 5`);
    assert.strictEqual(window.eval('editingLabelId'), null, `unknown/malformed id (${badId}) must never set editingLabelId to any record`);
    const psLink = document.getElementById('print-sheet-link');
    assert.strictEqual(psLink.style.display, 'none', `unknown/malformed id (${badId}) must never expose the contextual Composer action for any other record`);
    ok(`unknown/deleted/malformed id (${badId}) never opens index 0 or another label, and never exposes the Composer action`);
  }

  // ── 4. Legacy ?open=<index> strictly resolved + URL rewritten ───────
  {
    const idA = fakeId(), idB = fakeId(), idC = fakeId();
    const seed = [fixture({ id:idA, scentName:'Zeroth' }), fixture({ id:idB, scentName:'First' }), fixture({ id:idC, scentName:'Second' })];
    const { window, document } = await openBuilder({ seed, search:'?open=1&utm_source=test#frag' });
    assert.strictEqual(document.getElementById('scent-name').value, 'First', '?open=1 must resolve to the record at index 1 of the already-migrated collection');
    assert.strictEqual(window.eval('editingLabelId'), idB, 'the legacy shim must still set editingLabelId to the resolved record\'s real id');
    const rewritten = new window.URL(window.location.href);
    assert.strictEqual(rewritten.searchParams.get('label'), idB, 'the URL must be rewritten to ?label=<id> after resolving a legacy ?open= index');
    assert.strictEqual(rewritten.searchParams.get('open'), null, '?open= must be removed from the rewritten URL');
    assert.strictEqual(rewritten.searchParams.get('utm_source'), 'test', 'unrelated query parameters must be preserved across the URL rewrite');
    assert.strictEqual(rewritten.hash, '#frag', 'the URL hash must be preserved across the rewrite');
    ok('legacy ?open=<index>: strictly resolved via resolveLegacyIndex(), URL rewritten to ?label=<id> preserving other params + hash');
  }
  {
    // A garbage-suffixed/out-of-range legacy index must fail closed, never
    // resolve to any record.
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Only One' })];
    const { window, document } = await openBuilder({ seed, search:'?open=5' });
    assert.notStrictEqual(document.getElementById('scent-name').value, 'Only One', 'an out-of-range legacy ?open= index must never fall back to any real record');
    ok('legacy ?open=<index>: out-of-range index fails closed, never opens a real record');
  }

  // ── 5. Editing/resaving preserves the id even after renaming ────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Original Name' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${idA}` });
    document.getElementById('scent-name').value = 'Renamed Scent';
    window.eval("S.scentName='Renamed Scent';");
    await window.saveLabel();
    const arr = window.eval('getSaved()');
    assert.strictEqual(arr.length, 1, 'renaming and resaving an explicitly-edited record must update it in place, never create a second record');
    assert.strictEqual(arr[0].id, idA, 'the id must be unchanged after renaming an explicitly-edited record');
    assert.strictEqual(arr[0].scentName, 'Renamed Scent', 'the new name must be persisted');
    ok('editing state: resaving an explicitly-opened label after renaming preserves its id, no duplicate created');
  }

  // ── 6. New Label / Start Over clears editingLabelId ──────────────────
  {
    const { window } = await openBuilder({});
    assert.strictEqual(window.eval('editingLabelId'), null, 'a fresh, nothing-opened page load must start with no editingLabelId');
    assert(/location\s*\.\s*reload\s*\(\s*\)/.test(window.startOver.toString()), 'startOver() must remain a full page reload, which trivially clears editingLabelId along with all other in-memory wizard state');
    ok('New Label / Start Over: fresh load has no editingLabelId; startOver() is still a full reload');
  }

  // ── 7. Stale edit requires explicit "Save as new" ───────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Will Be Deleted Elsewhere' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('editingLabelId'), idA, 'setup: editing id must be set after opening');
    // Simulate another tab deleting this exact record via the coordinated
    // mutate() API (not a raw localStorage write) so this exercises the
    // same NO_CHANGE-on-missing-id path saveLabel() itself relies on.
    await window.LabelLibrary.mutate(current => current.filter(x => x.id !== idA));
    document.getElementById('scent-name').value = 'Edited After Deletion';
    window.eval("S.scentName='Edited After Deletion';");
    await window.saveLabel();
    assert.strictEqual(window.eval('getSaved().length'), 0, 'saving over a since-deleted record must never silently recreate it');
    const notice = document.getElementById('stale-edit-notice');
    assert(notice, 'a stale-edit inline notice must appear when Save is pressed on a since-deleted record');
    assert(/Save as new label/i.test(notice.textContent), 'the stale-edit notice must offer an explicit "Save as new" action');
    const saveAsNewBtn = notice.querySelector('button');
    saveAsNewBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.strictEqual(window.eval('getSaved().length'), 1, '"Save as new" must create a new record');
    const newRecord = window.eval('getSaved()[0]');
    assert.strictEqual(newRecord.scentName, 'Edited After Deletion', 'the new record must carry the edited content');
    assert.notStrictEqual(newRecord.id, idA, '"Save as new" must attach a genuinely new id, never the deleted record\'s old id');
    assert.strictEqual(window.eval('editingLabelId'), newRecord.id, '"Save as new" must attach editingLabelId to the newly-created record\'s id, so further edits continue to update it');
    ok('stale edit: deleted-elsewhere save shows inline notice with explicit Save-as-new, never silently recreates, and attaches editingLabelId to the new record');
  }

  // ── 8. Save double-click prevention ──────────────────────────────────
  {
    const { window, document } = await openBuilder({});
    document.getElementById('scent-name').value = 'Double Click Test';
    document.getElementById('product-type').value = 'Scented Candle';
    document.getElementById('biz-name').value = 'Crafty Mouse Gifts';
    document.getElementById('biz-phone').value = '01234 567890';
    window.eval("S.scentName='Double Click Test'; S.productType='Scented Candle'; S.bizName='Crafty Mouse Gifts'; S.bizPhone='01234 567890'; S.signal='Warning'; S.hSelected=['H317']; S.hStatements='H317'; S.sensitisers=['Linalool']; S.pictograms=['exclamation'];");
    const first = window.saveLabel();
    const second = window.saveLabel(); // fired before the first has resolved -- must be a no-op
    await Promise.all([first, second]);
    assert.strictEqual(window.eval('getSaved().length'), 1, 'a double-click (two overlapping saveLabel() calls) must never create two records');
    ok('save double-click prevention: an overlapping second saveLabel() call is a no-op');
  }

  // ── 9. Duplicate receives a new id (My Labels) ───────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Duplicate Me', productType:'Scented Candle' })];
    const { window } = await openMyLabels({ seed });
    await window.duplicateLabelById(idA);
    const arr = window.eval('getSaved()');
    assert.strictEqual(arr.length, 2, 'duplicating must add exactly one new record');
    const copy = arr.find(e => e.id !== idA);
    assert(copy, 'the duplicate must exist as a distinct record');
    assert.notStrictEqual(copy.id, idA, 'the duplicate must receive a fresh id, never copying the source\'s identity');
    assert.strictEqual(copy.scentName, 'Duplicate Me (Copy)', 'the duplicate must be named with the existing (Copy) suffix convention');
    assert.strictEqual(copy.productType, 'Scented Candle', 'the duplicate must retain the source\'s label content');
    ok('duplicate: receives a fresh id, retains content, does not copy identity');
  }

  // ── 10. Deleting an earlier label does not alter later ids/URL targets ─
  {
    const idA = fakeId(), idB = fakeId(), idC = fakeId();
    const seed = [fixture({ id:idA, scentName:'A' }), fixture({ id:idB, scentName:'B' }), fixture({ id:idC, scentName:'C' })];
    const { window } = await openMyLabels({ seed });
    const urlForCBefore = window.buildPrintSheetUrl(idC);
    await window.deleteLabelById(idA);
    const arr = window.eval('getSaved()');
    assert.strictEqual(arr.length, 2, 'delete must remove exactly the targeted record');
    assert(arr.some(e => e.id === idC), 'a later record must be completely unaffected by an earlier record\'s deletion');
    const urlForCAfter = window.buildPrintSheetUrl(idC);
    assert.strictEqual(urlForCAfter, urlForCBefore, 'a later record\'s id-based URL must be byte-identical before and after an earlier record is deleted -- no index to shift');
    ok('deleting an earlier label leaves later records\' ids and URL targets completely unaffected');
  }

  // ── 11. My Labels uses no saved-label indexes ────────────────────────
  {
    assert(!/\bopen=\$\{i\}/.test(myLabelsSource), 'my-labels.html must not build an index-based ?open= link any more');
    assert(!/onclick="duplicateLabel\(\$\{i\}\)"/.test(myLabelsSource), 'my-labels.html must not call duplicateLabel(index) via inline onclick any more');
    assert(!/onclick="deleteLabel\(\$\{i\}\)"/.test(myLabelsSource), 'my-labels.html must not call deleteLabel(index) via inline onclick any more');
    assert(/data-label-id/.test(myLabelsSource), 'my-labels.html must identify saved-label actions via data-label-id attributes');
    assert(/addEventListener\(\s*['"]click['"]/.test(myLabelsSource), 'my-labels.html must wire saved-label actions via addEventListener, not inline onclick, per requirement 5');
    const { document } = await openMyLabels({ seed:[fixture({ id: fakeId(), scentName:'Card' })] });
    const card = document.querySelector('[data-action="delete"]');
    assert(card, 'a rendered card must carry a data-action="delete" control');
    assert(card.getAttribute('data-label-id'), 'the rendered delete control must carry the record\'s stable id via data-label-id');
    ok('My Labels actions are id-based via data-label-id + addEventListener, never index-based inline onclick');
  }

  // ── 12/13. Custom dimension display + decimals preserved ────────────
  {
    const cases = [
      { rec: fixture({ shape:'circle', size:52 }), expect:'Circle · 52 mm' },
      { rec: fixture({ shape:'square', size:60 }), expect:'Square · 60 × 60 mm' },
      { rec: fixture({ shape:'rectangle', size:'custom', customW:57, customH:99 }), expect:'Rectangle · 57 × 99 mm' },
      { rec: fixture({ shape:'rectangle', size:'custom', customW:57.5, customH:99.25 }), expect:'Rectangle · 57.5 × 99.25 mm' },
    ];
    const { window: bw } = await openBuilder({});
    const { window: mw } = await openMyLabels({});
    for(const { rec, expect } of cases){
      const bText = bw.dimensionLabel(rec);
      const mText = mw.dimensionLabel(rec);
      assert.strictEqual(bText, expect, `builder.html dimensionLabel() mismatch for ${JSON.stringify(rec.shape)}/${rec.size}`);
      assert.strictEqual(mText, expect, `my-labels.html dimensionLabel() mismatch for ${JSON.stringify(rec.shape)}/${rec.size}`);
      assert(!/custommm/i.test(bText) && !/custommm/i.test(mText), 'the "custommm" display bug must never reappear');
    }
    ok('custom/preset dimension display is correct on both pages, decimals preserved, "custommm" bug fixed');
  }

  // ── 14. Print Composer URL helper uses a stable encoded id ──────────
  {
    const { window: bw } = await openBuilder({});
    const { window: mw } = await openMyLabels({});
    const id = fakeId();
    assert.strictEqual(bw.buildPrintSheetUrl(id), 'print.html?label=' + encodeURIComponent(id), 'builder.html buildPrintSheetUrl() must produce an id-safe print.html?label= URL');
    assert.strictEqual(mw.buildPrintSheetUrl(id), 'print.html?label=' + encodeURIComponent(id), 'my-labels.html buildPrintSheetUrl() must produce an id-safe print.html?label= URL');
    ok('Print Composer URL helper (dormant until Checkpoint C) uses a stable encoded id on both pages');
  }

  // ── 15. Storage event deletion of the currently-edited label ────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Open In This Tab' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('editingLabelId'), idA, 'setup: editing id must be set');
    document.getElementById('scent-name').value = 'Unsaved Edit In Progress';
    // Simulate ANOTHER tab deleting this exact record: write the post-
    // delete collection directly to this window's own localStorage (the
    // same backing store a real 'storage' event would report a change
    // against), then dispatch a genuine StorageEvent with storageArea
    // pointing at this window's own localStorage -- handleStorageEvent()
    // only requires the event's storageArea to match global.localStorage,
    // which this genuinely does.
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([]));
    const evt = new window.StorageEvent('storage', { key:'clpeasy_labels__u_guest', storageArea: window.localStorage });
    window.dispatchEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 250)); // reconciliation polls internally
    const notice = document.getElementById('stale-edit-notice');
    assert(notice, 'requirement 8: the builder must detect and surface that its currently-edited label was deleted by another tab');
    assert.strictEqual(document.getElementById('scent-name').value, 'Unsaved Edit In Progress', 'requirement 8: detecting the deletion must never overwrite the user\'s unsaved in-progress form edit');
    ok('storage event: deletion of the currently-edited label is detected and surfaced, unsaved form edits untouched');
  }

  // ── 16. Unrelated storage event does not overwrite unsaved form data ─
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'A' }), fixture({ id:idB, scentName:'B' })];
    const { window, document } = await openBuilder({ seed, search:`?label=${idA}` });
    document.getElementById('scent-name').value = 'My Unsaved Edit';
    window.eval("S.scentName='My Unsaved Edit';");
    // Another tab renames the OTHER (not currently-edited) label.
    const renamed = JSON.parse(JSON.stringify(seed));
    renamed[1].scentName = 'B Renamed Elsewhere';
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(renamed));
    const evt = new window.StorageEvent('storage', { key:'clpeasy_labels__u_guest', storageArea: window.localStorage });
    window.dispatchEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.strictEqual(document.getElementById('scent-name').value, 'My Unsaved Edit', 'a storage event for a DIFFERENT label must never overwrite this tab\'s unsaved form edit');
    assert.strictEqual(window.eval('editingLabelId'), idA, 'editingLabelId must be unaffected when the change concerns a different record');
    assert(!document.getElementById('stale-edit-notice'), 'no stale-edit notice should appear when the currently-edited record was not the one that changed');
    ok('storage event: an unrelated label change never overwrites unsaved form data or the current editing id');
  }

  // ── 17. A genuinely new save becomes the currently-edited record ────
  {
    const { window, document } = await openBuilder({});
    assert.strictEqual(window.eval('editingLabelId'), null, 'setup: nothing open yet');
    document.getElementById('scent-name').value = 'Brand New Label';
    document.getElementById('product-type').value = 'Scented Candle';
    document.getElementById('biz-name').value = 'Crafty Mouse Gifts';
    document.getElementById('biz-phone').value = '01234 567890';
    window.eval("S.scentName='Brand New Label'; S.productType='Scented Candle'; S.bizName='Crafty Mouse Gifts'; S.bizPhone='01234 567890'; S.signal='Warning'; S.hSelected=['H317']; S.hStatements='H317'; S.sensitisers=['Linalool']; S.pictograms=['exclamation'];");
    await window.saveLabel();
    const arr = window.eval('getSaved()');
    assert.strictEqual(arr.length, 1, 'the first save must create exactly one record');
    const newId = arr[0].id;
    assert.strictEqual(window.eval('editingLabelId'), newId, 'a genuinely new save must become the currently-edited record (editingLabelId set to its new id)');

    // Rename and save again -- must update the SAME record, never dedupe
    // by name+productType now that it has a confirmed id.
    document.getElementById('scent-name').value = 'Renamed After First Save';
    window.eval("S.scentName='Renamed After First Save';");
    await window.saveLabel();
    const arr2 = window.eval('getSaved()');
    assert.strictEqual(arr2.length, 1, 'renaming and resaving right after the first save must still leave exactly one record');
    assert.strictEqual(arr2[0].id, newId, 'the id must be unchanged across the rename+resave');
    assert.strictEqual(arr2[0].scentName, 'Renamed After First Save', 'the new name must be persisted');
    assert.strictEqual(window.eval('editingLabelId'), newId, 'editingLabelId must remain the same id after the rename+resave');
    ok('a genuinely new save becomes the currently-edited record; renaming and resaving updates the same id, never dedupe, exactly one record throughout');
  }

  // ── 18. The visible "New Label" action clears editingLabelId ────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Currently Open' })];
    const { window } = await openBuilder({ seed, search:`?label=${idA}` });
    assert.strictEqual(window.eval('editingLabelId'), idA, 'setup: editing id must be set after opening');
    window.splashNewLabel();
    assert.strictEqual(window.eval('editingLabelId'), null, 'the visible "New Label" action (splashNewLabel(), the done-splash\'s "Make another label" button) must clear editingLabelId, not just a full page reload/Start Over');
    ok('the visible New Label action (splashNewLabel()) clears editingLabelId');
  }

  // ── 19. Builder's internal library panel uses data-label-id / delegated listeners ─
  {
    assert(!/onclick="loadLabelAndGotoStep5\(/.test(builderSource), 'builder.html saved-label Load control must not call loadLabelAndGotoStep5(...) via inline onclick any more');
    assert(!/onclick="deleteLabelById\(/.test(builderSource), 'builder.html saved-label Delete control must not call deleteLabelById(...) via inline onclick any more');
    assert(!/onclick="showLabelHistory\(/.test(builderSource), 'builder.html saved-label history control must not call showLabelHistory(...) via inline onclick any more');
    assert(/data-label-id/.test(builderSource), 'builder.html must identify its internal saved-label controls via data-label-id');
    assert(/data-action="load"/.test(builderSource) && /data-action="delete"/.test(builderSource), 'builder.html must mark its saved-label Load/Delete controls with data-action');
    const idB = fakeId();
    const seed = [fixture({ id:idB, scentName:'Panel Item' })];
    const { window, document } = await openBuilder({ seed });
    const loadBtn = document.querySelector('#saved-list [data-action="load"]');
    const delBtn = document.querySelector('#saved-list [data-action="delete"]');
    assert(loadBtn && loadBtn.getAttribute('data-label-id') === idB, 'the rendered Load control must carry the record\'s stable id via data-label-id');
    assert(delBtn && delBtn.getAttribute('data-label-id') === idB, 'the rendered Delete control must carry the record\'s stable id via data-label-id');
    // Prove the delegated listener actually works end to end, not just that
    // the markup looks right.
    delBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(window.eval('getSaved().length'), 0, 'clicking the delegated Delete control must actually delete the targeted record');
    ok('Builder\'s internal saved-label panel uses data-label-id/data-action with a working delegated listener, no inline identity handlers');
  }

  console.log(`\nAll ${passed} checkpoint-b-identity-wiring.js checks passed.`);
})().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
