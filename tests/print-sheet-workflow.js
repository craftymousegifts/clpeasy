// Print Sheet Composer workflow batch (Sections 1-8 of the "complete the
// remaining Print Sheet Composer workflow" instruction): navigation entry,
// Builder/My Labels -> Composer wiring, template compatibility routed
// through LabelRenderer.getPhysicalSpec()/checkCompatibility() with only a
// negligible floating-point epsilon (never the old 0.05mm tolerance),
// Compatible/Other saved-label grouping, and the preview-side dimensions
// summary never leaking into exported artwork.
// Run from the repo root: node tests/print-sheet-workflow.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

function stripScriptSrc(html){
  return html.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
}
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const printSource = stripScriptSrc(fs.readFileSync('print.html', 'utf8'));
const builderSource = fs.readFileSync('builder.html', 'utf8');
const myLabelsSource = fs.readFileSync('my-labels.html', 'utf8');
const dashboardSource = fs.readFileSync('dashboard.html', 'utf8');
const accountSource = fs.readFileSync('account.html', 'utf8');

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

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
  window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size: 1, type: 'image/png' }); };
}

// ── Fixture labels ──────────────────────────────────────────────────
const eu30009ExactCustom = {
  id:'00000000-0000-4000-8000-000000000001', scentName:'Exact EU30009 (custom)', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
  signal:'Warning', hStatements:'H315', pStatements:'P302+P352', sensitisers:['Linalool'],
  pictograms:['exclamation'], textColour:'dark', showBorder:true, hideEN15494:false, labelLang:'en',
};
// Exactly the EU30009 template's own 99.1x57.3mm rectangle with width and
// height swapped -- a real "would fit if rotated" case (matchType
// rotation-unavailable), distinct from an unrelated-size mismatch.
const portrait57x99 = { ...eu30009ExactCustom, id:'00000000-0000-4000-8000-000000000002', scentName:'Portrait (swapped) 57.3x99.1', customW:57.3, customH:99.1 };
const near63p45 = { ...eu30009ExactCustom, id:'00000000-0000-4000-8000-000000000003', scentName:'63.45 rect', shape:'rectangle', customW:63.45, customH:57.3 };
const circle63mm = { ...eu30009ExactCustom, id:'00000000-0000-4000-8000-000000000004', scentName:'Circle 63', shape:'circle', size:'custom', customW:63, customH:63 };

const dom = new JSDOM(printSource, {
  url: 'https://local.clpeasy.test/print.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: (()=>{ const vc=new VirtualConsole(); vc.on('jsdomError', ()=>{}); return vc; })(),
  beforeParse(window) {
    stubCanvas(window);
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
    window.HTMLAnchorElement.prototype.click = function(){};
    window.JSZip = function(){ this.file = function(){}; this.generateAsync = async function(){ return { size: 0 }; }; };
    class FakeImage { set src(v){ if (this.onload) this.onload(); } }
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
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([
      eu30009ExactCustom, portrait57x99, near63p45, circle63mm,
    ]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(() => {
  try {
    window.eval('isPro=true; updateProGate();');

    // ── Section 1: navigation ────────────────────────────────────────
    const printSidebar = document.querySelector('.sidebar');
    assert(printSidebar, 'print.html must have the shared .sidebar shell');
    const printActive = document.querySelector('.sidebar-nav-item.active');
    assert(printActive && /print\.html/.test(printActive.getAttribute('href')||'') , 'print.html must mark its own Print Sheet Composer nav entry active');
    assert(document.getElementById('sidebar-toggle') && document.getElementById('sidebar-toggle-inline'), 'print.html must have the responsive mobile sidebar toggle controls');
    for(const [name, src] of [['dashboard.html',dashboardSource],['builder.html',builderSource],['my-labels.html',myLabelsSource],['account.html',accountSource]]){
      const d = new JSDOM(src).window.document;
      const navItems = [...d.querySelectorAll('.sidebar-nav-item, .sidebar-nav a')].map(a=>a.textContent.trim());
      const myLabelsIdx = navItems.findIndex(t=>t==='My Labels');
      const kbIdx = navItems.findIndex(t=>t==='Knowledge Base');
      const psIdx = navItems.findIndex(t=>t==='Print Sheet Composer');
      assert(psIdx>=0, `${name}: Print Sheet Composer nav entry is missing`);
      assert(myLabelsIdx>=0 && kbIdx>=0 && psIdx===myLabelsIdx+1 && psIdx<kbIdx, `${name}: Print Sheet Composer must sit between My Labels and Knowledge Base`);
    }

    // ── Section 2: Builder -> Composer (editingLabelId, never index) ──
    const bdom = new JSDOM(stripScriptSrc(builderSource), {
      url: 'https://local.clpeasy.test/builder.html', runScripts:'dangerously', pretendToBeVisual:true,
      beforeParse(w){
        stubCanvas(w);
        try{ w.crypto.subtle = webcrypto.subtle; }catch(e){}
        w.eval(labelRendererSource); w.eval(labelLibrarySource);
        w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
        w.fetch=async()=>({ok:true,json:async()=>({})});
        w.supabase={ createClient:()=>({ auth:{ getSession:async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}) }, from:()=>Object.create(emptyQuery), rpc:async()=>({data:false,error:null}) }) };
        w.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([eu30009ExactCustom]));
      }
    });
    setTimeout(() => {
      const bw = bdom.window, bdoc = bw.document;
      try {
        // Before any save this session, editingLabelId is unset -- the
        // Print Sheet action must not be enabled as if a label were saved.
        bw.eval("editingLabelId=null; renderSaved();");
        const psLinkInitial = bdoc.getElementById('print-sheet-link');
        assert(psLinkInitial && psLinkInitial.style.display==='none', 'Builder: Print multiple must stay disabled while nothing is genuinely saved this session, even if the library already has other saved labels');

        bw.eval("editingLabelId='00000000-0000-4000-8000-000000000001'; renderSaved();");
        const psLink = bdoc.getElementById('print-sheet-link');
        assert.strictEqual(psLink.style.display, 'flex', 'Builder: Print multiple must enable once editingLabelId names a real saved label');
        assert.strictEqual(psLink.getAttribute('href'), 'print.html?label=00000000-0000-4000-8000-000000000001', 'Builder: Print multiple must link to print.html?label=<editingLabelId>, never an index');

        // Simulate the current label being deleted elsewhere (cross-tab):
        // it must go back to disabled, not keep pointing at a dead id.
        // mutate() is async (coordinated read-modify-write), so its
        // renderSaved() re-render is chained with .then() rather than
        // raced against synchronously.
        bw.eval("LabelLibrary.mutate(arr=>arr.filter(x=>x.id!=='00000000-0000-4000-8000-000000000001')).then(()=>{renderSaved();});");
      } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
      }

      setTimeout(() => {
        try {
          assert.strictEqual(bdoc.getElementById('print-sheet-link').style.display, 'none', 'Builder: Print multiple must disable again once the current label no longer exists');
          console.log('PASS: Builder Print multiple action uses editingLabelId, never enables for an unsaved/deleted label');
        } catch (error) {
          console.error(error.stack || error.message);
          process.exitCode = 1;
        }
        bdom.window.close();
        runMyLabelsChecks();
      }, 40);

      // ── Section 3: My Labels -> Composer ───────────────────────────
      function runMyLabelsChecks(){
      const mdom = new JSDOM(stripScriptSrc(myLabelsSource), {
        url:'https://local.clpeasy.test/my-labels.html', runScripts:'dangerously', pretendToBeVisual:true,
        beforeParse(w){
          stubCanvas(w);
          try{ w.crypto.subtle = webcrypto.subtle; }catch(e){}
          w.eval(labelRendererSource); w.eval(labelLibrarySource);
          w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
          w.fetch=async()=>({ok:true,json:async()=>({})});
          // my-labels.html has no guest mode -- it redirects to sign-in
          // unless a real session resolves, so this stub must return one.
          const fakeUser={id:'test-user-0001', email:'test@example.com'};
          w.supabase={ createClient:()=>({ auth:{ getSession:async()=>({data:{session:{user:fakeUser}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}) }, from:()=>Object.assign(Object.create(emptyQuery),{maybeSingle(){return Promise.resolve({data:null,error:null});}}), rpc:async()=>({data:false,error:null}) }) };
          w.localStorage.setItem('clpeasy_labels__u_test-user-0001', JSON.stringify([eu30009ExactCustom, portrait57x99]));
        }
      });
      setTimeout(() => {
        try {
          const mw = mdom.window, mdoc = mw.document;
          mw.eval('renderGrid();');
          // GUI correction: icon-only card actions were replaced with
          // readable text pill buttons (no title-only tooltip) -- Print
          // multiple is now identified by its href pattern and visible
          // text, not a title attribute.
          const printLinks = [...mdoc.querySelectorAll('a[href^="print.html?label="]')];
          assert.strictEqual(printLinks.length, 2, 'My Labels: every card must have a Print multiple action');
          printLinks.forEach(a=>assert.strictEqual(a.textContent.trim(), 'Print multiple', 'My Labels: the Print multiple action must be readable text, not an icon-only/title-only control'));
          const hrefs = printLinks.map(a=>a.getAttribute('href')).sort();
          assert.deepStrictEqual(hrefs, ['print.html?label=00000000-0000-4000-8000-000000000001','print.html?label=00000000-0000-4000-8000-000000000002'], 'My Labels: Print multiple must link by stable id');
          assert(mdoc.querySelector('button[data-action="delete"]'), 'My Labels: Delete action must still exist');
          assert.strictEqual(mdoc.querySelector('button[data-action="delete"]').textContent.trim(), 'Delete', 'My Labels: Delete must be readable text, not an icon-only control');
          assert(mdoc.querySelector('button[data-action="duplicate"]'), 'My Labels: Duplicate action must still exist');
          assert.strictEqual(mdoc.querySelector('button[data-action="duplicate"]').textContent.trim(), 'Duplicate', 'My Labels: Duplicate must be readable text, not an icon-only control');
          assert(mdoc.querySelector('a.btn-outline.btn-sm'), 'My Labels: Open action must still exist');
          assert.strictEqual(mdoc.querySelectorAll('.icon-btn').length, 0, 'My Labels: no icon-only card action controls must remain');
          console.log('PASS: My Labels shows four readable text actions (Open/Print multiple/Duplicate/Delete), no icon-only controls remain');
          mdom.window.close();
        } catch (error) {
          console.error(error.stack || error.message);
          process.exitCode = 1;
        }
        runPrintDomChecks();
      }, 60);
      }
    }, 60);

    function runPrintDomChecks(){
      // ── Section 5: template compatibility, routed through LabelRenderer,
      // negligible-epsilon only ─────────────────────────────────────────
      const idExact = '00000000-0000-4000-8000-000000000001', idPortrait='00000000-0000-4000-8000-000000000002', id6345='00000000-0000-4000-8000-000000000003', idCircle='00000000-0000-4000-8000-000000000004';

      // Exact 99.1x57.3 rectangle: EU30009 template card must be enabled.
      window.eval(`resolvePreloadFromURLForTest=function(id){ preloadedLabelId=id; preloadUnavailable=false; renderSavedList(); };`);
      window.eval(`resolvePreloadFromURLForTest('${idExact}')`);
      let eu30009Card = document.querySelector('.tpl-card[data-tpl="eu30009"]');
      assert(!eu30009Card.classList.contains('tpl-disabled'), 'EU30009 card must be enabled for an exact 99.1x57.3mm rectangle');
      let customCard = document.querySelector('.tpl-card[data-tpl="custom"]');
      assert(!customCard.classList.contains('tpl-disabled'), 'Custom Sheet must always stay enabled -- it adapts to the selected label');

      // Portrait 57x99 must NOT match landscape 99.1x57.3 -- swapped
      // dimensions are a real mismatch (rotation-unavailable), never a
      // silent match.
      window.eval(`resolvePreloadFromURLForTest('${idPortrait}')`);
      eu30009Card = document.querySelector('.tpl-card[data-tpl="eu30009"]');
      assert(eu30009Card.classList.contains('tpl-disabled'), 'EU30009 card must be disabled for a 57x99mm (portrait) label -- 57x99 != 99x57');
      const reasonEl = eu30009Card.querySelector('.tpl-reason');
      assert(reasonEl && reasonEl.textContent && reasonEl.style.display!=='none', 'A disabled template card must show its exact incompatibility reason');
      const portraitCompat = window.eval(`checkTemplateCompatibility(getSaved().find(x=>x.id==='${idPortrait}'), 'eu30009')`);
      assert.strictEqual(portraitCompat.matchType, 'rotation-unavailable', 'Portrait 57x99 vs landscape 99.1x57.3 must report rotation-unavailable, never a silent match');

      // 63.45 must not match a 99.1x57.3 template either (unrelated size) --
      // and, more specifically, must not match a synthetic 63.5mm template
      // through the old 0.05mm tolerance.
      const near = window.eval(`LabelRenderer.checkCompatibility(LabelRenderer.getPhysicalSpec(getSaved().find(x=>x.id==='${id6345}')), {kind:'registry',shape:'rectangle',widthMm:63.5,heightMm:57.3})`);
      assert.strictEqual(near.compatible, false, '63.45mm must NOT match a 63.5mm template -- only a negligible floating-point epsilon is acceptable, not the old 0.05mm tolerance');
      const exactSame = window.eval(`LabelRenderer.checkCompatibility(LabelRenderer.getPhysicalSpec(getSaved().find(x=>x.id==='${id6345}')), {kind:'registry',shape:'rectangle',widthMm:63.45,heightMm:57.3})`);
      assert.strictEqual(exactSame.compatible, true, '63.45mm must match a template that is exactly 63.45mm');

      // Preset vs custom origin must not affect compatibility: a synthetic
      // preset-origin spec with the exact same shape/dims as the exact
      // custom fixture must get an identical result.
      const customResult = window.eval(`checkTemplateCompatibility(getSaved().find(x=>x.id==='${idExact}'), 'eu30009')`);
      const presetSpecResult = window.eval(`LabelRenderer.checkCompatibility({shape:'rectangle',widthMm:99.1,heightMm:57.3,diameterMm:null,orientation:'landscape',source:'preset',presetId:'99'}, getTemplateSpec('eu30009'))`);
      assert.strictEqual(customResult.matchType, presetSpecResult.matchType, 'Preset vs custom label origin must not change the compatibility result');
      assert.strictEqual(customResult.compatible, presetSpecResult.compatible, 'Preset vs custom label origin must not change the compatibility result');

      console.log('PASS: template compatibility is routed through LabelRenderer.getPhysicalSpec()/checkCompatibility() with only a negligible floating-point epsilon');

      // ── Section 6: Compatible/Other grouping ───────────────────────
      window.eval(`resolvePreloadFromURLForTest(null); preloadedLabelId=null; preloadUnavailable=false;`);
      window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
      window.eval('renderSavedList();');
      // Correction batch (Section 3): "Compatible labels" -> "Other
      // compatible labels" and "Other labels (N)" -> "Different size
      // labels (N)", now that the chosen/preloaded label (when present) is
      // shown once, separately, above -- this list is always the OTHER
      // labels beyond it.
      const compatHead = [...document.querySelectorAll('.section-head')].find(h=>h.textContent==='Other compatible labels');
      const otherDetails = document.querySelector('.other-labels-details');
      assert(compatHead, 'Selecting EU30009 must show an "Other compatible labels" section for the matching label');
      assert(otherDetails, 'Selecting EU30009 must show a "Different size labels" section for the non-matching labels');
      assert(otherDetails.querySelector('.other-labels-summary').textContent.includes('Different size labels'), 'the collapsed group must be titled "Different size labels"');
      const otherIds = [...otherDetails.querySelectorAll('.saved-label-item')].map(el=>el.id);
      assert(otherIds.includes(`sli-${idPortrait}`), 'Portrait 57x99 must be grouped under Other labels for EU30009');
      assert(otherIds.includes(`sli-${idCircle}`), 'The circle label must be grouped under Other labels for EU30009 (wrong shape)');
      const otherItem = document.getElementById(`sli-${idPortrait}`);
      assert(otherItem.querySelector('.sli-incompat-reason').textContent.length>0, 'Each Other label must show its precise incompatibility reason inline');
      // Never hidden entirely -- present in the DOM even while <details> is closed.
      assert(document.getElementById(`sli-${idPortrait}`), 'Other labels must remain in the DOM, never removed entirely');

      console.log('PASS: Compatible/Other saved-label grouping shows exact reasons and never hides Other labels entirely');

      // ── Custom Sheet first-label lock + mixed same-size contents ────
      window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
      window.eval(`addToSheet('${idExact}')`);
      window.eval('renderSavedList();');
      const lockedOther = document.querySelector('.other-labels-details');
      assert(lockedOther, 'Once Custom Sheet is locked by the first label, non-matching labels must move to Other labels');
      assert.strictEqual(window.eval('sheetItems.length'), 1, 'setup: exactly one item on the sheet after addToSheet');

      console.log('PASS: Custom Sheet first-label lock still groups non-matching saved labels under Other labels');

      // ── Section 8 / correction batch (compaction item 6): preview-side
      // dimensions summary -- Reserved/Filled/Remaining are now three
      // separate fields, never one combined ellipsis-truncated string. ──
      window.eval('updateSummary();');
      const pdsTpl = document.getElementById('pds-tpl').textContent;
      const pdsLabelSize = document.getElementById('pds-label-size').textContent;
      const pdsLayout = document.getElementById('pds-layout').textContent;
      const pdsReserved = document.getElementById('pds-reserved').textContent;
      const pdsFilled = document.getElementById('pds-filled').textContent;
      const pdsRemaining = document.getElementById('pds-remaining').textContent;
      assert(pdsTpl.length>0, 'Preview summary must show the selected template name');
      assert(/99\.1|57\.3|Rectangle/.test(pdsLabelSize), `Preview summary must show the exact label shape/size, got: ${pdsLabelSize}`);
      assert(/\d+\s*×\s*\d+/.test(pdsLayout), `Preview summary must show rows x cols, got: ${pdsLayout}`);
      assert(pdsReserved.length>0 && pdsReserved!=='—', `Preview summary must show a Reserved value, got: ${pdsReserved}`);
      assert(pdsFilled.length>0 && pdsFilled!=='—', `Preview summary must show a Filled value, got: ${pdsFilled}`);
      assert(pdsRemaining.length>0 && pdsRemaining!=='—', `Preview summary must show a Remaining value, got: ${pdsRemaining}`);
      assert(!document.getElementById('pds-positions'), 'the old combined pds-positions field must no longer exist -- Reserved/Filled/Remaining are separate elements now');
      assert(/A4/.test(document.getElementById('preview-info').textContent), 'Preview summary must show the A4 sheet size');

      console.log('PASS: preview-side summary shows template name, exact label shape/size, rows x cols and reserved/occupied/remaining positions');

      // Dimension/summary text must never be drawn into the exported
      // artwork itself -- the per-label SVG/PNG build path never touches
      // any of the new pds-*/sum-*/workflow-steps/preload-banner text.
      const rec = window.eval(`getSaved().find(x=>x.id==='${idExact}')`);
      const svg = window.eval(`buildLabelSVGFromData(getSaved().find(x=>x.id==='${idExact}'), 260)`);
      assert(!/Compatible labels|Other labels|remaining|occupied|reserved|Choose sheet template|Selected label/i.test(svg), 'Exported label SVG must never contain Composer summary/workflow chrome text');

      console.log('PASS: dimension/summary/workflow text never appears inside exported label artwork');

      console.log('\nAll print-sheet-workflow.js checks passed.');
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 60);
