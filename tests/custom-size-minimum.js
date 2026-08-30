// Custom-size minimum (52mm) regression test.
//
// CLPeasy-supported minimum for a CUSTOM label size (not a claim about
// GB-CLP's own legal minimum -- see the exact wording asserted below):
// circle diameter, square side, and rectangle width AND height must all be
// >=52mm. Approved PRESET sizes are exempt, even one below 52mm. Builder
// must block Step 1 progression, saving, and every export path (PNG/SVG/
// PDF, via the existing window._labelBlockDownload gate); Composer must
// refuse a legacy/custom saved label under 52mm rather than silently
// rendering it. The entered value itself is never silently altered --
// only blocked.
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

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

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const builderSource = fs.readFileSync('builder.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const printSource = fs.readFileSync('print.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

const EXPECTED_MSG = 'CLPeasy supports custom label dimensions from 52mm. Choose 52mm or larger.';

(async () => {
  // ── Builder ────────────────────────────────────────────────────────
  const builderErrors = [];
  const bvc = new VirtualConsole();
  bvc.on('jsdomError', e => builderErrors.push(e.message));
  const bdom = new JSDOM(builderSource, {
    url: 'https://local.clpeasy.test/builder.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: bvc,
    beforeParse(window) {
      stubCanvas(window);
      window.eval(labelRendererSource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data:{ session:null } }),
          onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
          signOut: async () => ({})
        },
        from: () => Object.create(emptyQuery),
        rpc: async () => ({ data:false, error:null })
      }) };
    }
  });
  await new Promise(resolve => setTimeout(resolve, 60));
  const bwindow = bdom.window;
  const bdocument = bwindow.document;

  // Minimal valid label content so the ONLY thing under test is the
  // custom-size gate, not an unrelated "please enter a scent name" etc.
  // scentName is unique per call (saveLabel() dedupes existing saved
  // entries by scentName+productType, overwriting in place -- an existing,
  // unrelated behaviour that must not be mistaken for the gate under test
  // failing to add a new entry).
  let fillSeq = 0;
  function fillMinimalValidForm(){
    const name = 'Size Test ' + (fillSeq++);
    bdocument.getElementById('scent-name').value = name;
    bdocument.getElementById('product-type').value = 'Candle';
    bdocument.getElementById('biz-name').value = 'Crafty Mouse Gifts';
    bdocument.getElementById('biz-phone').value = '01234 567890';
    bwindow.eval(`S.scentName=${JSON.stringify(name)}; S.productType='Candle'; S.bizName='Crafty Mouse Gifts'; S.bizPhone='01234 567890'; S.signal='Warning'; S.hSelected=['H317']; S.hStatements='H317'; S.sensitisers=['Linalool']; S.pictograms=['exclamation'];`);
    bdocument.getElementById('h-statements').value = 'H317';
  }

  function setCustomDims(shape, w, h){
    bwindow.selectShape(shape);
    bwindow.selectSize('custom');
    bdocument.getElementById('custom-w').value = String(w);
    if(shape==='rectangle') bdocument.getElementById('custom-h').value = String(h);
    bwindow.onDimInput();
  }

  const boundaryValues = [0, -5, 51, 51.9, 52, 60];
  const shapes = ['circle', 'square', 'rectangle'];

  // Mirrors readForm()'s own (pre-existing, unrelated-to-this-feature)
  // parsing exactly: parseInt() truncates decimals, and a falsy parsed
  // result (only 0, since parseInt('-5') is truthy) falls back to a
  // default rather than surfacing as 0 -- both quirks predate this change
  // and are reproduced here only so the test predicts the CORRECT
  // pre-existing behaviour rather than a hand-guessed threshold.
  function readFormWidth(raw){ return Math.min(parseInt(raw)||50, 150); }

  for(const shape of shapes){
    for(const w of boundaryValues){
      const h = shape==='rectangle' ? w : w; // isolate width; height tested separately below for rectangle
      setCustomDims(shape, w, h);
      fillMinimalValidForm();
      const expectBlocked = w < 52;
      const isBelow = bwindow.eval('isCustomSizeBelowSupportedMinimum()');
      assert.strictEqual(isBelow, expectBlocked, `${shape} width=${w}: isCustomSizeBelowSupportedMinimum() should be ${expectBlocked}`);

      // Step 1 progression. Note: canLeaveApprovedBuilderStep(1) calls the
      // PRE-EXISTING readForm() first, which re-parses the raw DOM input
      // with only an upper Math.min(...,150) cap and NO lower floor (unlike
      // onDimInput()'s Math.max(rawW,10) floor) -- so a raw value below 10
      // (0, -5) still trips the older, pre-existing "valid label size"
      // guard (width<10) before ever reaching the new 52mm check. That
      // pre-existing guard and its generic message are untouched, unrelated
      // functionality -- not something this feature should alter -- so
      // values <10 are expected to surface the OLDER message, and only
      // values in [10,52) are expected to surface the new CLPeasy-supported-
      // minimum message.
      bwindow.__lastAlert = null;
      const canLeave = bwindow.canLeaveApprovedBuilderStep(1);
      assert.strictEqual(canLeave, !expectBlocked, `${shape} width=${w}: Step 1 progression should be ${expectBlocked?'blocked':'allowed'}`);
      if(expectBlocked){
        const parsedW = readFormWidth(w);
        const expectedStep1Msg = parsedW < 10 ? 'Please choose a valid label size before continuing.' : EXPECTED_MSG;
        assert.strictEqual(bwindow.__lastAlert, expectedStep1Msg, `${shape} width=${w}: Step 1 block must show the expected message`);
      }

      // Save
      bwindow.__lastAlert = null;
      const savedBefore = bwindow.eval('getSaved().length');
      bwindow.saveLabel();
      const savedAfter = bwindow.eval('getSaved().length');
      if(expectBlocked){
        assert.strictEqual(savedAfter, savedBefore, `${shape} width=${w}: saveLabel() must not save a label below the supported minimum`);
        assert.strictEqual(bwindow.__lastAlert, EXPECTED_MSG, `${shape} width=${w}: saveLabel() block must show the exact message`);
      } else {
        assert.strictEqual(savedAfter, savedBefore+1, `${shape} width=${w}: saveLabel() must succeed for a valid custom size`);
      }

      // Export gate (window._labelBlockDownload, the one gate all of
      // PNG/SVG/PDF funnel through via _downloadAllowed())
      bwindow.updateLabel();
      const blockedForExport = bwindow.eval('window._labelBlockDownload');
      assert.strictEqual(blockedForExport, expectBlocked, `${shape} width=${w}: window._labelBlockDownload should be ${expectBlocked}`);
      // The entered value itself must never be silently altered -- the
      // input still shows exactly what was typed.
      assert.strictEqual(bdocument.getElementById('custom-w').value, String(w), `${shape} width=${w}: the custom-w input must still show the exact value the user entered, not a silently-corrected one`);
    }
  }

  // Rectangle: width and height must each independently gate (a valid
  // width with an invalid height must still block, and vice versa).
  setCustomDims('rectangle', 60, 40);
  fillMinimalValidForm();
  assert.strictEqual(bwindow.eval('isCustomSizeBelowSupportedMinimum()'), true, 'rectangle 60x40: height alone below 52mm must still block');
  setCustomDims('rectangle', 40, 60);
  fillMinimalValidForm();
  assert.strictEqual(bwindow.eval('isCustomSizeBelowSupportedMinimum()'), true, 'rectangle 40x60: width alone below 52mm must still block');
  setCustomDims('rectangle', 60, 60);
  fillMinimalValidForm();
  assert.strictEqual(bwindow.eval('isCustomSizeBelowSupportedMinimum()'), false, 'rectangle 60x60: both dimensions >=52mm must not block');

  // Preset sizes are exempt, even one below 52mm -- simulate a preset
  // (S.size a fixed value, not 'custom') carrying a sub-52mm dimension;
  // the real app's own presets (52/63mm) are already >=52mm, so this
  // proves the exemption logic itself rather than relying on a preset
  // that happens not to exist yet.
  bwindow.eval(`S.size='40'; S.customW=40; S.customH=40; S.shape='circle';`);
  assert.strictEqual(bwindow.eval('isCustomSizeBelowSupportedMinimum()'), false, 'a non-custom (preset) size must be exempt from the custom-size minimum, even below 52mm');

  // HTML min="52" on both custom dimension inputs.
  assert.strictEqual(bdocument.getElementById('custom-w').getAttribute('min'), '52', 'custom-w input must have min="52"');
  assert.strictEqual(bdocument.getElementById('custom-h').getAttribute('min'), '52', 'custom-h input must have min="52"');

  if (builderErrors.length) throw new Error('jsdom runtime errors (builder): ' + builderErrors.join('; '));

  // ── Composer: must refuse a legacy/custom saved label below 52mm ────
  const printErrors = [];
  const pvc = new VirtualConsole();
  pvc.on('jsdomError', e => printErrors.push(e.message));
  const legacySmallLabel = {
    scentName:'Legacy Tiny Custom', productType:'Candle', bizName:'Crafty Mouse Gifts',
    shape:'circle', size:'custom', customW:40, customH:40,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
    signal:'Warning', hStatements:'H317', pStatements:'P273',
    sensitisers:['Linalool'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  };
  const validCustomLabel = { ...legacySmallLabel, scentName:'Valid Custom 60mm', customW:60, customH:60 };
  const presetBelow52 = { ...legacySmallLabel, scentName:'Synthetic Preset Below 52', size:'40', customW:40, customH:40 };
  const pdom = new JSDOM(printSource, {
    url: 'https://local.clpeasy.test/print.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: pvc,
    beforeParse(window) {
      stubCanvas(window);
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
      window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size:1, type:'image/png' }); };
      window.eval(labelRendererSource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => { window.__windowOpenCalls=(window.__windowOpenCalls||0)+1; return { document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function(){};
      window.JSZip = function(){ this.file=function(){}; this.generateAsync=async function(){ return { size:0 }; }; };
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
      window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([legacySmallLabel, validCustomLabel, presetBelow52]));
    }
  });
  await new Promise(resolve => setTimeout(resolve, 60));
  const pwindow = pdom.window;

  pwindow.eval('isPro=true; updateProGate();');
  const legacyErr = pwindow.eval('canAddToSheet(getSaved()[0], 1)');
  assert(legacyErr && legacyErr.includes(EXPECTED_MSG), `Composer must refuse a legacy sub-52mm custom label with the exact CLPeasy-supported-minimum message, got: ${legacyErr}`);

  const validErr = pwindow.eval('canAddToSheet(getSaved()[1], 1)');
  assert.strictEqual(validErr, null, `Composer must allow a valid (>=52mm) custom label, got error: ${validErr}`);

  // A "preset" (size!=='custom') below 52mm must NOT be refused by this
  // check specifically -- mirrors Builder's own exemption.
  const presetCheck = pwindow.eval('isCustomSizeBelowSupportedMinimumSaved(getSaved()[2])');
  assert.strictEqual(presetCheck, false, 'a non-custom (preset) saved size must be exempt from the custom-size minimum check, even below 52mm');

  if (printErrors.length) throw new Error('jsdom runtime errors (print): ' + printErrors.join('; '));

  console.log('custom-size-minimum checks passed (0/negative/51/51.9/52/>52 for circle/square/rectangle, Step 1 + save + export all blocked with the exact CLPeasy-supported-minimum wording, entered value never silently altered, presets exempt, Composer refuses legacy sub-52mm custom labels)');
})().catch(e => { console.error(e); process.exit(1); });
