// Isolated boundary tests for Codex correction #5: reservedUsed (positions
// already used on a physical sheet from a previous print run) must be
// clamped to 0 <= reservedUsed <= rows*columns, must never let the sheet's
// used+reserved total exceed capacity (which would otherwise produce a
// negative "slots remaining" summary), and switching to a different
// template (including back to Custom Sheet) must reset it to 0 rather than
// carrying a stale reservation over onto different sheet geometry.
// Run from the repo root: node tests/print-sheet-reserved-bounds.js
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

const circleFits = {
  scentName:'Lavender Fields', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
  signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
  sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};

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
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([circleFits]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(() => {
  try {
    window.eval('isPro=true; updateProGate();');

    // Resolve the fixture's stable LabelLibrary-assigned id at runtime --
    // this fixture is intentionally id-less (a legitimate pre-stable-ID
    // saved label put through LabelLibrary's legacy migration on init()).
    const idCircle = window.eval('getSaved()')[0].id;

    // 10-position Custom sheet (2 x 5).
    document.getElementById('cust-cols').value = '2';
    document.getElementById('cust-rows').value = '5';
    window.eval('rebuildSheet();');
    assert.strictEqual(window.eval('getTplConfig().cols*getTplConfig().rows'), 10, 'setup: sheet must be exactly 10 positions');

    // ── A negative reserved-count input must clamp to 0, never go negative. ──
    window.eval("setReservedUsed('-3')");
    assert.strictEqual(window.eval('reservedUsed'), 0, 'a negative reserved-used entry must clamp to 0');
    assert.strictEqual(document.getElementById('reserved-used').value, '0', 'the reserved-used input itself must be synced back to the clamped value');

    // ── A value greater than the sheet's own capacity must clamp to slots
    // (10), never exceed it. ─────────────────────────────────────────
    window.eval("setReservedUsed('999')");
    assert.strictEqual(window.eval('reservedUsed'), 10, 'a reserved-used entry above sheet capacity must clamp to the sheet\'s own slot count (10)');
    assert.strictEqual(document.getElementById('reserved-used').value, '10', 'the reserved-used input must reflect the capacity-clamped value');

    // ── reservedUsed must never be allowed to push (reservedUsed + placed
    // labels) over capacity -- setting a large reservation after labels are
    // already on the sheet must clamp to what's actually still available,
    // not silently produce a negative "remaining slots" summary. ───────
    window.eval("setReservedUsed('0')");
    window.eval(`setQty('${idCircle}','6')`); // 6 labels placed, 4 slots free
    assert.strictEqual(window.eval('getTotalQty()'), 6, 'setup: 6 labels should be placed on the 10-slot sheet');
    window.eval("setReservedUsed('9')"); // would leave -5 remaining if unclamped (6 used + 9 reserved > 10)
    assert.strictEqual(window.eval('reservedUsed'), 4, 'reservedUsed must clamp so that reservedUsed + already-placed labels never exceeds sheet capacity (10 - 6 placed = 4 max)');
    const available = window.eval('getTplConfig().cols*getTplConfig().rows - reservedUsed - getTotalQty()');
    assert(available >= 0, 'slots-remaining summary must never go negative as a result of a reserved-used entry');
    assert.strictEqual(available, 0, 'with 6 placed and reservedUsed clamped to 4, the sheet should read as exactly full (0 remaining), not oversubscribed');

    // ── Switching templates (including back to the same Custom sheet)
    // must reset reservedUsed to 0 -- a stale reservation from one
    // template's physical geometry must never carry over and corrupt a
    // different template's state. ───────────────────────────────────
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    assert.strictEqual(window.eval('reservedUsed'), 0, 'selecting a different (registry) template must reset reservedUsed to 0');
    assert.strictEqual(document.getElementById('reserved-used').value, '0', 'the reserved-used input must be reset to 0 in the DOM too, not just in memory');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'selecting a different template must also clear sheetItems (registry reservation must not leak into it)');

    window.eval("setReservedUsed('5')"); // reserve on the EU30009 (10-slot) sheet
    assert.strictEqual(window.eval('reservedUsed'), 5, 'setup: EU30009 sheet should have 5 reserved');
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    assert.strictEqual(window.eval('reservedUsed'), 0, 'switching back to Custom Sheet must not inherit the registry template\'s reservedUsed -- Custom Sheet state must not be corrupted by a prior registry-template reservation');
    assert.strictEqual(document.getElementById('reserved-used').value, '0', 'Custom Sheet\'s reserved-used input must read 0 after switching back to it');

    if (errors.length) throw new Error('jsdom runtime errors: ' + errors.join('; '));
    console.log('print-sheet reserved-position bounds checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 50);
