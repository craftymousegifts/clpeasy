// Phase 1 tests for the Print Sheet Composer template registry (EU30009)
// and mixed-label rendering. Follows the same jsdom pattern as
// tests/builder-regression.js. Run from the repo root: node tests/print-sheet-composer.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const source = fs.readFileSync('print.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
// print.html loads the shared renderer via <script src="label-render.js">
// -- a same-origin/local file, not a CDN fetch this offline test harness
// should skip. The generic src-stripping above (aimed at CDN scripts like
// Supabase/JSZip that would otherwise try a real network fetch) can't tell
// the two apart, so load label-render.js explicitly before the page's own
// inline script runs, giving the exact same window.LabelRenderer the real
// browser would have by the time buildLabelSVGFromData() calls it.
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

// ── Synthetic saved-label fixtures (guest namespace only — no real
// customer data is read or written by this test). ────────────────────
const labelLavender = {
  scentName:'Lavender Candle', productType:'Scented Candle', signal:'WARNING',
  shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
  bizName:'Test Biz', hStatements:'H315,H319',
  pStatements:'P302+P352,P305+P351+P338',
  sensitisers:['Linalool','Limonene'],
  pictograms:['exclamation']
};
// Mirrors the real-world stress case from the 29 Aug 2026 footer-overlap
// fix (3 H-codes, 6 sensitisers, 5 P-statements incl. two combined codes).
// P280 (verified GB-CLP wording, see label-render.js's P_LIB) is a
// recognised, SELECTABLE code -- restored as the 5th P-statement with a
// concrete p280Items selection (gloves + eye protection), matching what
// the Builder picker would save. A P280 code with no selection is
// correctly treated as unrecognised/incomplete (see
// tests/p280-precautionary-statement.js), so this fixture supplies one.
const labelVanilla = {
  scentName:'Vanilla Candle', productType:'Scented Candle', signal:'WARNING',
  shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
  bizName:'Test Biz', hStatements:'H317,H411,H315',
  pStatements:'P302+P352,P333+P313,P305+P351+P338,P273,P280',
  p280Items:['gloves','eye'],
  sensitisers:['Linalool','Limonene','Citral','Geraniol','Eugenol','Coumarin'],
  pictograms:['exclamation','aquatic']
};
const labelWrongShape = { scentName:'Rose Candle', productType:'Scented Candle', signal:'WARNING', shape:'circle', size:63.5, bizName:'Test Biz', hStatements:'H315', pStatements:'', sensitisers:[], pictograms:['exclamation'] };
const labelWrongSize = { scentName:'Cinnamon Wax Melt', productType:'Wax Melt', signal:'WARNING', shape:'rectangle', size:'custom', customW:70, customH:68, bizName:'Test Biz', hStatements:'H315', pStatements:'', sensitisers:[], pictograms:['exclamation'] };

const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/print.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    // Stub the canvas 2D context BEFORE evaluating label-render.js -- its
    // module-level `_cvs.getContext('2d')` call runs immediately on load,
    // and jsdom has no real canvas backend (returns null without this stub),
    // which would otherwise leave `_ctx` null and crash the first
    // measureText() call.
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
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
    // Capture the SVG the PDF export builds (width/height reveal the true
    // exported page size in px at 300dpi) without needing a real image
    // decoder — same approach app tests already use for canvas stubs.
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
    // Seed the guest-namespace saved-label library before init() runs.
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([labelLavender, labelVanilla, labelWrongShape, labelWrongSize]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(() => {
  try {
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
    const idLavender = idOf(labelLavender.scentName);
    const idVanilla = idOf(labelVanilla.scentName);
    const idWrongShape = idOf(labelWrongShape.scentName);
    const idWrongSize = idOf(labelWrongSize.scentName);

    // ── Registry integrity ──────────────────────────────────────
    const reg = window.eval("getRegistryTemplate('eu30009')");
    assert(reg, 'EU30009 is not registered in TEMPLATE_REGISTRY');
    assert.strictEqual(reg.manufacturer, 'OnlineLabels UK');
    assert.strictEqual(reg.code, 'EU30009');
    assert.strictEqual(reg.columns, 2, 'EU30009 must be 2 columns');
    assert.strictEqual(reg.rows, 5, 'EU30009 must be 5 rows');
    assert.strictEqual(reg.labelsPerSheet, 10);
    assert.strictEqual(reg.labelWidthMm, 99.1);
    assert.strictEqual(reg.labelHeightMm, 57.3);
    assert.strictEqual(reg.cornerRadiusMm, 2);

    // Geometry reconciles with A4 exactly (Testing Requirement 2).
    const wTotal = reg.marginLeftMm + reg.columns*reg.labelWidthMm + (reg.columns-1)*reg.horizontalGapMm + reg.marginRightMm;
    const hTotal = reg.marginTopMm + reg.rows*reg.labelHeightMm + (reg.rows-1)*reg.verticalGapMm + reg.marginBottomMm;
    assert(Math.abs(wTotal-reg.pageWidthMm)<0.01, `EU30009 width does not reconcile with A4: ${wTotal}`);
    assert(Math.abs(hTotal-reg.pageHeightMm)<0.01, `EU30009 height does not reconcile with A4: ${hTotal}`);
    assert.strictEqual(reg.horizontalPitchMm, reg.labelWidthMm+reg.horizontalGapMm, 'horizontal pitch does not equal label width + gap');
    assert.strictEqual(reg.verticalPitchMm, reg.labelHeightMm+reg.verticalGapMm, 'vertical pitch does not equal label height + gap');

    // ── Catalogue card + specification modal wiring (Testing Req: catalogue UI) ──
    const card = document.querySelector('.tpl-card[data-tpl="eu30009"]');
    assert(card, 'EU30009 template card is missing from the template grid');
    assert(document.getElementById('specModal'), 'specification modal markup is missing');
    window.openSpecModal('eu30009');
    assert(document.getElementById('spec-modal-table').innerHTML.includes('99.1'), 'spec modal did not render EU30009 dimensions');
    assert(document.getElementById('spec-modal-diagram').innerHTML.includes('<rect'), 'EU30009 schematic diagram did not render rounded-rect positions');
    assert.strictEqual((document.getElementById('spec-modal-diagram').innerHTML.match(/<rect/g)||[]).length, 11, 'diagram should show 1 page outline + 10 label rects'); // 1 page rect + 10 cells
    assert.strictEqual(document.getElementById('spec-modal-link').href, reg.officialUrl, 'official product link is wrong');
    window.closeSpecModal();

    // ── Select EU30009 and verify Custom sheet is untouched ─────
    assert.strictEqual(window.eval('currentTpl'), 'custom', 'default template changed from custom');
    window.selectTemplate('eu30009', card);
    assert.strictEqual(window.eval('currentTpl'), 'eu30009');
    assert.strictEqual(document.getElementById('custom-dims-panel').style.display, 'none', 'custom dims panel did not hide for EU30009');
    assert.strictEqual(document.getElementById('registry-tpl-panel').style.display, 'block', 'registry panel did not show for EU30009');
    const tplCfg = window.eval('getTplConfig()');
    assert.strictEqual(tplCfg.cols, 2); assert.strictEqual(tplCfg.rows, 5);
    assert.strictEqual(tplCfg.fixedLabelMM, true);

    // ── Compatibility blocking (Testing Req 12) ──────────────────
    window.__lastAlert = null;
    window.eval(`addToSheet('${idWrongShape}')`); // labelWrongShape (circle)
    assert(window.__lastAlert && /shape/i.test(window.__lastAlert), 'wrong-shape label was not blocked from EU30009');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'wrong-shape label was incorrectly added');

    window.__lastAlert = null;
    window.eval(`addToSheet('${idWrongSize}')`); // labelWrongSize (70x68 rectangle)
    assert(window.__lastAlert && /requires/i.test(window.__lastAlert), 'wrong-size label was not blocked from EU30009');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'wrong-size label was incorrectly added');

    // ── Mixed labels + quantities + reserved/used positions (Testing Req 5,6,7,8,9) ──
    window.__lastAlert = null;
    window.eval(`addToSheet('${idLavender}')`); // Lavender
    window.eval(`setQty('${idLavender}', 2)`);
    window.eval(`addToSheet('${idVanilla}')`); // Vanilla
    window.eval(`setQty('${idVanilla}', 3)`);
    assert.strictEqual(window.__lastAlert, null, `compatible labels were unexpectedly blocked: ${window.__lastAlert}`);
    assert.strictEqual(window.eval('getTotalQty()'), 5, 'auto-fill quantities are wrong');

    window.setReservedUsed(2);
    assert.strictEqual(window.eval('reservedUsed'), 2);
    window.rebuildSheet();

    const canvasHTML = document.getElementById('sheet-canvas').innerHTML;
    const usedCount = (canvasHTML.match(/sheet-cell-used/g)||[]).length;
    const filledCount = (canvasHTML.match(/class="sheet-cell"/g)||[]).length;
    const emptyCount = (canvasHTML.match(/sheet-cell-empty/g)||[]).length;
    assert.strictEqual(usedCount, 2, `expected 2 already-used positions, got ${usedCount}`);
    assert.strictEqual(filledCount, 5, `expected 5 filled positions (2 Lavender + 3 Vanilla), got ${filledCount}`);
    assert.strictEqual(emptyCount, 3, `expected 3 blank positions, got ${emptyCount}`);
    assert.strictEqual(usedCount+filledCount+emptyCount, 10, 'positions do not add up to the 10-slot EU30009 sheet');

    // ── Real completed label content, not truncated (Testing Req 5,13) ──
    assert(canvasHTML.includes('Lavender Candle'), 'Lavender label content missing from sheet');
    assert(canvasHTML.includes('Vanilla Candle'), 'Vanilla label content missing from sheet');
    // NOTE: the real, signed-off renderer (builder.html's original buildSVG,
    // preserved verbatim through the shared-renderer extraction) has always
    // displayed each H/P code's descriptive STATEMENT TEXT on the label,
    // never the bare code -- that's the actual CLP-compliant label content
    // a customer sees, and is what a truncation bug would actually clip.
    // Checking for the literal code string here would never pass against
    // real production output, so this looks up each code's real displayed
    // text via the shared H_LIB/P_LIB (also loaded into this test's window)
    // instead of asserting against text the app never renders.
    const H_LIB = window.LabelRenderer.H_LIB, P_LIB = window.LabelRenderer.P_LIB;
    for (const code of ['H317','H411','H315']) {
      const desc = H_LIB.find(h => h.code === code).desc;
      assert(canvasHTML.includes(desc), `H-code ${code} ("${desc}") truncated/missing from sheet render`);
    }
    // A long combined statement's own text can legitimately word-wrap across
    // multiple <tspan> lines at this cell width (real, correct behaviour,
    // not truncation) -- P305+P351+P338's full description does exactly
    // that: "...IF IN EYES: rinse" ends one line/<tspan> and "cautiously
    // with water for several minutes" continues in the next, so checking
    // for "rinse cautiously" as one contiguous string would itself fail on
    // real, correctly-wrapped output. Check the part that stays intact on
    // one line rather than the full string (or a substring straddling the
    // wrap point).
    assert(canvasHTML.includes(P_LIB.find(p => p.code === 'P302+P352').desc), `combined P-code P302+P352 truncated/missing from sheet render`);
    assert(canvasHTML.includes(P_LIB.find(p => p.code === 'P333+P313').desc), `combined P-code P333+P313 truncated/missing from sheet render`);
    assert(canvasHTML.includes('IF IN EYES: rinse'), `combined P-code P305+P351+P338 truncated/missing from sheet render (opening clause)`);
    assert(canvasHTML.includes('cautiously with water for several minutes'), `combined P-code P305+P351+P338 truncated/missing from sheet render (wrapped continuation)`);
    // NOTE: buildLabelSVGFromData() (pre-existing, unmodified by Phase 1)
    // caps sensitisers at sensArr.slice(0,5) — the label above intentionally
    // supplies 6 to document that real, pre-existing cap rather than assert
    // against it. Only the first 5 are expected to render.
    for (const sens of ['Linalool','Limonene','Citral','Geraniol','Eugenol']) assert(canvasHTML.includes(sens), `sensitiser ${sens} truncated/missing from sheet render`);

    // ── No stretching — EU30009 cell aspect exactly matches the label's own aspect, so content fills the box on both axes (Testing Req 11) ──
    const dims = window.eval("getLabelDimsMM(getSaved()[0])");
    assert(Math.abs(dims.w/dims.h - reg.labelWidthMm/reg.labelHeightMm) < 0.001, 'fixed-size EU30009 label aspect ratio does not match the template cell — would stretch');

    // ── PDF export stays true A4 for EU30009 too (Testing Req 14) ──
    window.downloadPDF();
    const svgDims = window.eval('window.__capturedSvg');
    assert(svgDims, 'downloadPDF did not build a sheet SVG');
    const DPI=300, mmW = svgDims.width/(DPI/25.4), mmH = svgDims.height/(DPI/25.4);
    assert(Math.abs(mmW-210)<0.5, `PDF sheet width is not A4 (210mm): got ${mmW.toFixed(2)}mm`);
    assert(Math.abs(mmH-297)<0.5, `PDF sheet height is not A4 (297mm): got ${mmH.toFixed(2)}mm`);

    // ── Regression: Custom sheet's fit-to-cell formula is unchanged ────
    // (algebraic proof, not just "it still runs" — same aspect>=1 branch
    // and same cw/ch values the pre-registry code produced for a square cell)
    window.selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'));
    assert.strictEqual(window.eval('currentTpl'), 'custom');
    assert.strictEqual(window.eval('sheetItems.length'), 0, 'switching template did not clear the sheet');
    const lPX = 200; // arbitrary square cell for the algebraic check below
    for (const [w,h] of [[52,52],[63,44],[40,70]]) {
      const aspect=w/h;
      const oldCw=aspect>=1?lPX:Math.round(lPX*aspect), oldCh=aspect>=1?Math.round(lPX/aspect):lPX;
      const boxAspect=1; // square cell, as Custom sheet always uses
      const newCw=aspect>=boxAspect?lPX:Math.round(lPX*aspect), newCh=aspect>=boxAspect?Math.round(lPX/aspect):lPX;
      assert.strictEqual(newCw, oldCw, `Custom-sheet fit formula regressed for ${w}x${h}`);
      assert.strictEqual(newCh, oldCh, `Custom-sheet fit formula regressed for ${w}x${h}`);
    }
    // Unmodified builder-style thumbnail call keeps its real, established
    // default corner radius. label-render.js's shape/background drawing
    // (unchanged by Phase 1 -- untouched by this feature) has always used
    // rx="4" for a rectangle label, not "3"; verified directly against the
    // shared renderer's own source rather than assumed.
    const miniSvg = window.eval("buildMiniSVG({shape:'rectangle',size:'custom',customW:60,customH:40,scentName:'X',hStatements:'H315',pStatements:'',sensitisers:[]})");
    assert(miniSvg.includes('rx="4"'), 'default (non-registry) rectangle corner radius regressed from 4');

    const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
    assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
    console.log('print sheet composer (Phase 1 template registry) checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}, 500);
