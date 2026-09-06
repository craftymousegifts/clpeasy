// ── PRINT/PDF EXPORT FIDELITY — regression coverage for the correction
// batch's Section 4 fix (SharedAssetPool.register()).
//
// Root cause that was fixed: SharedAssetPool.register() used to emit a
// bare `<image id="asset-..." href="...">` with no width/height/viewBox
// of its own. A later `<use href="#id" width=".." height="..">` referencing
// that bare, sized-less <image> is not reliably honoured by every SVG
// rendering path -- specifically the combined-sheet SVG in downloadPDF(),
// which is rasterised through an <img>-loaded "static image" mode. That is
// why the live on-screen Composer preview (which never uses the pool --
// every preview cell is its own fully self-contained <svg>) rendered
// correctly while the exported/printed sheet lost the GHS pictogram
// entirely and rendered the EN15494/candle-safety icons hugely oversized
// and clipped. The fix wraps each pooled asset in a `<symbol viewBox="0 0
// 100 100">`, the spec-correct construct for one embedded raster asset
// reused at different sizes via <use>.
//
// IMPORTANT SCOPE NOTE: jsdom does not rasterise/paint SVG, so it cannot
// itself reproduce the original bug (a rendering-engine-level intrinsic-
// sizing quirk) or prove the fix visually. What these tests CAN and DO
// prove structurally: (a) the pool never again emits a bare unsized
// <image id="asset-...">, only <symbol>-wrapped assets instantiated via
// <use>; (b) the pooled/export path and the unpooled/preview path embed
// the IDENTICAL underlying asset data (same href/src) and request the
// IDENTICAL rendered width/height for a given placement; (c) sheet-wide
// asset de-duplication actually happens (one <symbol> per distinct asset,
// not one per label position); (d) every pictogram/icon placement stays
// within its own label's canonical viewport bounds; (e) the exported A4
// sheet is exactly 210x297mm at the export DPI, front to back. Real
// browser/rasteriser verification remains the only way to confirm the
// visual symptom itself is gone.
//
// Run from the repo root: node tests/print-sheet-export-fidelity.js
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

let _idSeq = 0;
function fakeId(){
  _idSeq++;
  const hex = _idSeq.toString(16).padStart(8,'0');
  return `${hex}-0000-4000-8000-${'0'.repeat(11)}${_idSeq%10}`;
}

// A 57x99mm rectangle candle -- the exact size Preview #105 testing
// reported the print/PDF mismatch on -- with a GHS pictogram AND EN15494
// candle-safety icons both showing (hideEN15494:false, productType Candle,
// mmW/mmH both >=40).
function candleFixture(overrides){
  return Object.assign({
    scentName:'Export Fidelity Candle', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
    shape:'rectangle', size:'custom', customW:57, customH:99,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'20 hrs',
    signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  }, overrides);
}

// Captures the exact data-URI src downloadPDF() sets on its internal
// <img> element (the real combined-sheet SVG it feeds to the canvas
// rasteriser) instead of letting the stock FakeImage swallow it.
function makeCapturingImage(captured){
  return class CapturingImage {
    set src(v){
      captured.push(v);
      if (this.onload) this.onload();
    }
  };
}

async function openComposerForExport(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/print.html' + (opts.search||'');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const capturedImgSrcs = [];
  const dom = new JSDOM(printSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
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
      window.JSZip = function(){ this.file = function(){}; this.generateAsync = async function(){ return { size:0 }; }; };
      window.Image = makeCapturingImage(capturedImgSrcs);
      window.supabase = makeSupabaseStub(opts.session || null);
      const ns = opts.session ? opts.session.user.id : 'guest';
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_'+ns, JSON.stringify(opts.seed));
      }
    }
  });
  const { window } = dom;
  const document = window.document;
  await new Promise(resolve => setTimeout(resolve, 200));
  return { dom, window, document, errors, capturedImgSrcs };
}

function decodeSheetSVG(dataUri){
  assert(dataUri && dataUri.startsWith('data:image/svg+xml'), 'downloadPDF() must feed the rasteriser an SVG data URI: ' + String(dataUri).slice(0,60));
  const comma = dataUri.indexOf(',');
  return decodeURIComponent(dataUri.slice(comma+1));
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── 1. The pool never emits a bare, unsized <image id="asset-...">;
  //       every pooled asset is <symbol>-wrapped and instantiated via
  //       <use> ─────────────────────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [candleFixture({ id:idA })];
    const { window, capturedImgSrcs } = await openComposerForExport({ seed });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    window.eval('downloadPDF()');
    assert.strictEqual(capturedImgSrcs.length, 1, 'downloadPDF() must set exactly one rasteriser <img> src for the sheet');
    const sheetSVG = decodeSheetSVG(capturedImgSrcs[0]);
    assert(!/<image[^>]*\bid="asset-/.test(sheetSVG), 'the exported sheet must never contain a bare, unsized <image id="asset-..."> -- this is the exact construct that caused the pictogram to vanish/oversize; every pooled asset must be <symbol>-wrapped instead');
    assert(/<symbol id="asset-ghs-[^"]*" viewBox="0 0 100 100"/.test(sheetSVG), 'the exported sheet must wrap the GHS pictogram asset in a <symbol viewBox="0 0 100 100">');
    assert(/<symbol id="asset-bcf-[^"]*" viewBox="0 0 100 100"/.test(sheetSVG), 'the exported sheet must wrap each EN15494/candle-safety icon asset in a <symbol viewBox="0 0 100 100">');
    assert(/<use href="#asset-ghs-[^"]*"[^>]*\/>/.test(sheetSVG), 'the exported sheet must instantiate the GHS pictogram via <use>, never inline it directly');
    assert(/<use href="#asset-bcf-[^"]*"[^>]*\/>/.test(sheetSVG), 'the exported sheet must instantiate each EN15494 icon via <use>, never inline it directly');
    ok('the exported sheet never emits a bare unsized <image id="asset-...">; every pooled GHS/EN15494 asset is <symbol>-wrapped and used via <use>');
  }

  // ── 2. Sheet-wide de-duplication: the SAME distinct asset used by
  //       multiple label positions is embedded exactly once ──────────
  {
    const idA = fakeId();
    const seed = [candleFixture({ id:idA })];
    const { window, capturedImgSrcs } = await openComposerForExport({ seed });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    window.eval(`setQty('${idA}','3')`); // 3 identical positions, same pictogram/icons
    window.eval('downloadPDF()');
    const sheetSVG = decodeSheetSVG(capturedImgSrcs[capturedImgSrcs.length-1]);
    const ghsSymbolCount = (sheetSVG.match(/<symbol id="asset-ghs-exclamation"/g)||[]).length;
    const ghsUseCount = (sheetSVG.match(/<use href="#asset-ghs-exclamation"/g)||[]).length;
    assert.strictEqual(ghsSymbolCount, 1, `the GHS pictogram symbol must be embedded exactly once regardless of how many positions use it (found ${ghsSymbolCount})`);
    assert.strictEqual(ghsUseCount, 3, `each of the 3 label positions must still reference the shared symbol via its own <use> (found ${ghsUseCount})`);
    const bcfKeys = ['burn_within_sight','keep_from_fire','keep_from_children','no_draught','trim_wick'];
    for(const key of bcfKeys){
      const symCount = (sheetSVG.match(new RegExp(`<symbol id="asset-bcf-${key}"`,'g'))||[]).length;
      const useCount = (sheetSVG.match(new RegExp(`<use href="#asset-bcf-${key}"`,'g'))||[]).length;
      assert.strictEqual(symCount, 1, `EN15494 icon "${key}" symbol must be embedded exactly once across the sheet (found ${symCount})`);
      assert.strictEqual(useCount, 3, `EN15494 icon "${key}" must be referenced by all 3 positions via <use> (found ${useCount})`);
    }
    ok('repeated pictogram/icon assets across multiple sheet positions are embedded exactly once and shared via <use>, never duplicated per position');
  }

  // ── 3. Pooled (export) and unpooled (preview) renders of the SAME
  //       label request the IDENTICAL underlying asset data and the
  //       IDENTICAL rendered width/height for the GHS pictogram and
  //       every EN15494 icon -- proving preview and print stay in
  //       proportional lock-step ─────────────────────────────────────
  {
    const idA = fakeId();
    const rec = candleFixture({ id:idA });
    // Render directly through the shared renderer, exactly the way
    // print.html's renderSheetPosition()/buildLabelSVGFromData() do.
    const { JSDOM: JSDOM2 } = require('jsdom');
    const dom2 = new JSDOM2('<!doctype html><html><body></body></html>', {
      runScripts:'dangerously',
      beforeParse(window){ stubCanvas(window); window.eval(labelRendererSource); }
    });
    const LabelRenderer = dom2.window.LabelRenderer;

    const previewSVG = LabelRenderer.renderLabel(rec, { instanceId:'preview1' }).svg;
    const pool = new LabelRenderer.SharedAssetPool();
    const exportSVG = LabelRenderer.renderLabel(rec, { instanceId:'export1', sharedDefs: pool }).svg;
    const defsMarkup = pool.defsMarkup();

    function pictogramBlock(svg){
      const m = svg.match(/<!-- PICTOGRAMS -->([\s\S]*?)<!-- H STATEMENTS -->/);
      assert(m, 'could not locate the PICTOGRAMS block');
      return m[1];
    }
    function candleBlock(svg){
      const m = svg.match(/<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->([\s\S]*?)<!-- WATERMARK -->/);
      assert(m, 'could not locate the EN15494 CANDLE SAFETY PICTOGRAMS block');
      return m[1];
    }

    // GHS pictogram: preview's self-contained <image>, export's <use>.
    const previewGhsImg = pictogramBlock(previewSVG).match(/<image[^>]*\/>/)[0];
    const exportGhsUse = pictogramBlock(exportSVG).match(/<use[^>]*\/>/)[0];
    const pWG = Number(previewGhsImg.match(/width="([\d.]+)"/)[1]);
    const pHG = Number(previewGhsImg.match(/height="([\d.]+)"/)[1]);
    const eWG = Number(exportGhsUse.match(/width="([\d.]+)"/)[1]);
    const eHG = Number(exportGhsUse.match(/height="([\d.]+)"/)[1]);
    assert.strictEqual(eWG, pWG, `the exported/pooled GHS pictogram width (${eWG}) must exactly match the live preview's own width (${pWG}) -- never enlarged or shrunk relative to preview`);
    assert.strictEqual(eHG, pHG, `the exported/pooled GHS pictogram height (${eHG}) must exactly match the live preview's own height (${pHG})`);
    const previewGhsHref = previewGhsImg.match(/href="([^"]*)"/)[1];
    const ghsSymbolMatch = defsMarkup.match(/<symbol id="asset-ghs-[^"]*"[^>]*><image href="([^"]*)"/);
    assert(ghsSymbolMatch, 'the pooled defs must contain a <symbol> wrapping an <image href="..."> for the GHS pictogram');
    assert.strictEqual(ghsSymbolMatch[1], previewGhsHref, 'the pooled/exported GHS pictogram must embed the exact same underlying image data (href) as the live preview -- no content loss');

    // EN15494 icons: same comparison, for every candle-safety icon shown.
    const previewCandleImgs = candleBlock(previewSVG).match(/<image[^>]*\/>/g) || [];
    const exportCandleUses = candleBlock(exportSVG).match(/<use[^>]*\/>/g) || [];
    assert(previewCandleImgs.length >= 5, `expected all 5 EN15494 candle-safety icons to render in preview, found ${previewCandleImgs.length}`);
    assert.strictEqual(exportCandleUses.length, previewCandleImgs.length, 'the exported sheet must reference the same number of EN15494 icon placements as the live preview shows');
    for(let i=0;i<previewCandleImgs.length;i++){
      const pImg = previewCandleImgs[i], eUse = exportCandleUses[i];
      const pW = Number(pImg.match(/width="([\d.]+)"/)[1]);
      const pH = Number(pImg.match(/height="([\d.]+)"/)[1]);
      const eW = Number(eUse.match(/width="([\d.]+)"/)[1]);
      const eH = Number(eUse.match(/height="([\d.]+)"/)[1]);
      assert.strictEqual(eW, pW, `EN15494 icon #${i+1}: exported width (${eW}) must exactly match preview width (${pW}) -- this is the exact "candle-safety icons become enormous and clipped" regression`);
      assert.strictEqual(eH, pH, `EN15494 icon #${i+1}: exported height (${eH}) must exactly match preview height (${pH})`);
    }
    ok('exported/pooled GHS pictogram and every EN15494 icon match the live preview\'s own asset content (href) and rendered width/height exactly -- preview and print stay in lock-step');
  }

  // ── 4. No exported pictogram/icon placement exceeds its own label's
  //       canonical viewport, for the exact 57x99mm rectangle reported ──
  {
    const { JSDOM: JSDOM3 } = require('jsdom');
    const dom3 = new JSDOM3('<!doctype html><html><body></body></html>', {
      runScripts:'dangerously',
      beforeParse(window){ stubCanvas(window); window.eval(labelRendererSource); }
    });
    const LabelRenderer = dom3.window.LabelRenderer;
    const rec = candleFixture({});
    const dims = LabelRenderer.getLabelDims(rec, {});
    const pool = new LabelRenderer.SharedAssetPool();
    const exportSVG = LabelRenderer.renderLabel(rec, { instanceId:'bounds1', sharedDefs: pool }).svg;

    // Every <use> placement in the rendered label (GHS + EN15494 alike)
    // must stay within [0,pw] x [0,ph] of this label's OWN canonical
    // internal layout space (see getLabelDims()) -- never bleed outside
    // its own label position once assembled into the sheet.
    const useEls = exportSVG.match(/<use[^>]*\/>/g) || [];
    assert(useEls.length >= 6, `expected at least 6 pooled <use> placements (1 GHS + 5 EN15494) for this fixture, found ${useEls.length}`);
    for(const el of useEls){
      const x = Number(el.match(/x="([\d.-]+)"/)[1]);
      const y = Number(el.match(/y="([\d.-]+)"/)[1]);
      const w = Number(el.match(/width="([\d.]+)"/)[1]);
      const h = Number(el.match(/height="([\d.]+)"/)[1]);
      assert(x >= -0.5, `a pooled asset must not start left of its label's own viewport (x=${x}): ${el}`);
      assert(y >= -0.5, `a pooled asset must not start above its label's own viewport (y=${y}): ${el}`);
      assert(x + w <= dims.pw + 0.5, `a pooled asset must not extend past its label's own right edge (x+w=${x+w}, pw=${dims.pw}): ${el}`);
      assert(y + h <= dims.ph + 0.5, `a pooled asset must not extend past its label's own bottom edge (y+h=${y+h}, ph=${dims.ph}): ${el}`);
    }
    ok('every pooled GHS/EN15494 asset placement stays within its own 57x99mm label\'s canonical viewport bounds -- none bleeds outside its label position');
  }

  // ── 5. The exported sheet is exactly A4 (210x297mm) at the export
  //       DPI, front to back -- never overflows/crops ────────────────
  {
    const idA = fakeId();
    const seed = [candleFixture({ id:idA })];
    const { window, capturedImgSrcs } = await openComposerForExport({ seed });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    window.eval('downloadPDF()');
    const sheetSVG = decodeSheetSVG(capturedImgSrcs[capturedImgSrcs.length-1]);
    const outerTag = sheetSVG.match(/<svg[^>]*>/)[0];
    const w = Number(outerTag.match(/width="(\d+)"/)[1]);
    const h = Number(outerTag.match(/height="(\d+)"/)[1]);
    const DPI = 300, MM2PX = DPI/25.4;
    const expectedW = Math.round(210*MM2PX), expectedH = Math.round(297*MM2PX);
    assert.strictEqual(w, expectedW, `the exported sheet width (${w}px) must be exactly A4's 210mm at ${DPI}dpi (${expectedW}px)`);
    assert.strictEqual(h, expectedH, `the exported sheet height (${h}px) must be exactly A4's 297mm at ${DPI}dpi (${expectedH}px)`);
    const viewBoxMatch = outerTag.match(/viewBox="0 0 (\d+) (\d+)"/);
    assert(viewBoxMatch, 'the exported sheet must declare a matching viewBox');
    assert.strictEqual(Number(viewBoxMatch[1]), w, 'the exported sheet viewBox width must match its own declared width -- no cropping/scaling mismatch');
    assert.strictEqual(Number(viewBoxMatch[2]), h, 'the exported sheet viewBox height must match its own declared height -- no cropping/scaling mismatch');
    ok('the exported print/PDF sheet is exactly A4 (210x297mm) at the export DPI, with a matching viewBox -- no overflow or cropping');
  }

  console.log(`\nAll ${passed} print-sheet-export-fidelity.js checks passed.`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
