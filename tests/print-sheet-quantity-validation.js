// Isolated boundary tests for Codex correction #6: setQty() (direct
// quantity entry) must not be able to bypass any check that addToSheet()/
// changeQty() enforce -- capacity, registry shape/size compatibility, or
// the sheet's same-shape-and-size lock. All three entry points now funnel
// through the single canAddToSheet() authority in print.html; these tests
// exercise setQty() specifically, since it is the path Codex named as the
// bypass risk (a typed number, not a button click).
// Run from the repo root: node tests/print-sheet-quantity-validation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('print.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

// A 52mm circle, matching the default Custom-sheet label size (#cust-label-mm
// defaults to 52) -- ordinary, comfortably-fitting content.
const circleFits = {
  scentName:'Lavender Fields', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
  signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
  sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
// A different footprint (80mm circle) -- used to prove the same-size lock
// can't be bypassed via setQty() once the sheet already holds circleFits.
const wrongSizeCircle = { ...circleFits, scentName:'Big Circle', customW:80, customH:80 };
// A rectangle -- used against the EU30009 registry template (which requires
// a 99.1x57.3mm rectangle), to prove setQty() can't bypass registry
// shape/size compatibility either.
const wrongShapeRect = { ...circleFits, scentName:'Wrong Shape Rect', shape:'rectangle', customW:60, customH:40 };

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
    window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size: 1, type: 'image/png' }); };
    window.eval(labelRendererSource);
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
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([circleFits, wrongSizeCircle, wrongShapeRect]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(async () => {
  try {
    window.eval('isPro=true; updateProGate();');

    // ── Configure a 10-position Custom sheet (2 cols x 5 rows) so "a
    // ten-position sheet" matches Codex's own wording exactly. ─────────
    document.getElementById('cust-cols').value = '2';
    document.getElementById('cust-rows').value = '5';
    window.eval('rebuildSheet();');
    assert.strictEqual(window.eval("getTplConfig().cols*getTplConfig().rows"), 10, 'setup: sheet must be exactly 10 positions');

    // ── Boundary 1: entering 99 on a ten-position sheet, direct entry,
    // nothing on the sheet yet -- must be refused entirely, not clamped
    // and partially applied. ─────────────────────────────────────────
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(0,'99')");
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'setQty(0,99) on an empty 10-slot sheet must add nothing (99 > 10 available)');
    assert.strictEqual(window.eval('getTotalQty()'), 0, 'total sheet quantity must remain 0 after the refused 99 entry');
    assert(window.eval('window.__lastAlert'), 'setQty() must alert when refusing an over-capacity direct entry');

    // ── Boundary 2: entering a negative value must never produce a
    // negative (or any) stored quantity -- clamps to 0, which removes the
    // item if present. ──────────────────────────────────────────────
    window.eval("setQty(0,'4')"); // put 4 on the sheet first (valid, well within 10)
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 4, 'setup: 4 should be on the sheet before the negative-entry test');
    window.eval("setQty(0,'-5')");
    const afterNegative = window.eval('sheetItems.find(s=>s.id===0)');
    assert.strictEqual(afterNegative, undefined, 'a negative direct-entry value must clamp to 0 and remove the item, never store a negative quantity');
    assert.strictEqual(window.eval('getTotalQty()'), 0, 'total sheet quantity must be 0 after clamping a negative entry to 0');

    // ── Boundary 3: adding an incompatible label through direct quantity
    // input, on an EU30009 registry sheet (shape mismatch: rectangle
    // required, this label is a circle). ───────────────────────────────
    assert(document.querySelector('.tpl-card[data-tpl="eu30009"]'), 'setup: could not find the EU30009 template card to select');
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'setup: selecting a template must clear the sheet');
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(0,'3')"); // circleFits -- wrong shape for EU30009 (rectangle)
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'setQty() must not add a shape-incompatible label to a registry sheet, even via direct entry');
    assert(window.eval('window.__lastAlert') && /shape/i.test(window.eval('window.__lastAlert')), 'setQty() must surface the same registry shape-mismatch message as Add/±');
    // A correctly-shaped but wrong-SIZE rectangle must be refused the same way.
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(2,'3')"); // wrongShapeRect is actually a rectangle, but 60x40mm, not 99.1x57.3mm
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'setQty() must not add a size-incompatible rectangle to the EU30009 sheet, even via direct entry');
    assert(window.eval('window.__lastAlert'), 'setQty() must alert on the size-incompatible direct entry too');

    // ── Boundary 4: capacity with reserved positions -- reserved slots
    // must count against what setQty() will allow, exactly like Add. ───
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    document.getElementById('cust-cols').value = '2';
    document.getElementById('cust-rows').value = '5';
    window.eval('rebuildSheet();');
    window.eval("setReservedUsed('4')"); // 10 slots - 4 reserved = 6 available
    assert.strictEqual(window.eval('reservedUsed'), 4, 'setup: reservedUsed should be 4');
    window.eval("setQty(0,'6')"); // exactly fills the remaining 6 -- must succeed
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 6, 'setQty() must allow filling exactly the remaining capacity after reserved positions are subtracted');
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(0,'7')"); // one more than available -- must be refused, not partially applied
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 6, 'setQty() must refuse (and not partially apply) a quantity that exceeds capacity once reserved positions are accounted for');
    assert(window.eval('window.__lastAlert') && /slot/i.test(window.eval('window.__lastAlert')), 'setQty() must explain the reserved-position capacity refusal');

    // ── Boundary 5: replacement/removal releases capacity correctly --
    // reducing quantity via setQty() must free slots for a subsequent
    // direct-entry increase, taking reservedUsed back into account. ────
    window.eval("setQty(0,'2')"); // reduce from 6 to 2 -- frees 4 slots (6 available again minus the 2 kept = 4 free)
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 2, 'setQty() must allow reducing quantity freely (never blocked going down)');
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(0,'6')"); // back up to 6 (2+4 free = exactly 6) -- must succeed now that capacity was released
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 6, 'setQty() must allow re-increasing into capacity freed by an earlier reduction');
    assert.strictEqual(window.eval('window.__lastAlert'), null, 'a within-capacity re-increase after a release must not be refused');
    // Full removal (0) must free the entire reserved-adjusted capacity.
    window.eval("setQty(0,'0')");
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'setQty(...,0) must remove the item entirely');
    window.eval('window.__lastAlert = null;');
    window.eval("setQty(0,'6')"); // full 6-slot capacity (10 - 4 reserved) must be available again
    assert.strictEqual(window.eval('sheetItems.find(s=>s.id===0).qty'), 6, 'removing an item via setQty() must fully release its capacity, including relative to reservedUsed');
    assert.strictEqual(window.eval('window.__lastAlert'), null, 'a full re-fill after complete removal must not be refused');

    if (errors.length) throw new Error('jsdom runtime errors: ' + errors.join('; '));
    console.log('print-sheet quantity-validation (setQty bypass) checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 50);
