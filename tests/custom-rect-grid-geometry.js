// Custom Sheet non-square-rectangle grid/A4-fit regression tests (30 Aug
// 2026 fix). Reported: adding a saved 57x99mm rectangle label locked the
// sheet's "Sheet locked to 57x99mm rectangle" message, but the Custom Sheet
// controls (Label mm / Cols / Rows) kept their stale 52mm/3x5 default,
// producing a physically-impossible 3x5 grid of 57x99mm labels on A4 (needs
// ~3 cols x 2 rows at 10mm margin / 5mm gaps, not 3x5 = 15).
// Follows the same jsdom pattern as tests/print-sheet-fit-blocking.js and
// tests/print-sheet-composer.js. Run from the repo root:
//   node tests/custom-rect-grid-geometry.js
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

// The exact reported case: a 57x99mm (portrait) rectangle.
const rectA = {
  scentName:'Fireside Amber', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'rectangle', size:'custom', customW:57, customH:99,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'200g', batchNum:'B101', burnTime:'',
  signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
  sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
// A second, different saved label at the SAME 57x99mm rectangle footprint
// -- proves mixed contents still work once locked to a real rectangle size.
const rectB = { ...rectA, scentName:'Coastal Driftwood', batchNum:'B102' };
// A plain circle -- used to prove circle/square Custom Sheet behaviour is
// completely untouched by this fix.
const circleC = {
  scentName:'Vanilla Bean', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'circle', size:'custom', customW:52, customH:52,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'150g', batchNum:'B201', burnTime:'',
  signal:'Warning', hStatements:'H315', pStatements:'P302+P352',
  sensitisers:['Linalool'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};
// A plain square -- used to prove the 31 Aug 2026 empty-slot-shape fix
// gives a square placeholder (not a circle), while leaving square Custom
// Sheet GEOMETRY (a single labelMM field, cellWidthMm===cellHeightMm)
// completely untouched.
const squareD = {
  scentName:'Lavender Fields', productType:'Candle', bizName:'Crafty Mouse Gifts',
  shape:'square', size:'custom', customW:60, customH:60,
  bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'150g', batchNum:'B301', burnTime:'',
  signal:'Warning', hStatements:'H315', pStatements:'P302+P352',
  sensitisers:['Linalool'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
  hideEN15494:false, labelLang:'en',
};

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
    window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size: 1, type: 'image/png' }); };
    window.eval(labelRendererSource);
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => { windowOpenCalls++; return { document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function(){ anchorClickCalls++; };
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
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([rectA, rectB, circleC, squareD]));
  }
});

const { window } = dom;
const document = window.document;

setTimeout(async () => {
  try {
    window.eval('isPro=true; updateProGate();'); // subscription gate can't mask the fit-block being tested

    // ── #4/#3: adding the first 57x99mm rectangle seeds the sheet's REAL
    // cell footprint from the label -- never the stale 52mm default. ──
    window.eval('addToSheet(0)'); // rectA, 57x99mm
    const tplAfterLock = window.eval('getTplConfig()');
    assert.strictEqual(tplAfterLock.rectLocked, true, 'a non-square rectangle must set rectLocked');
    assert.strictEqual(tplAfterLock.cellWidthMm, 57, 'cell width must be the real 57mm, not the old labelMM default');
    assert.strictEqual(tplAfterLock.cellHeightMm, 99, 'cell height must be the real 99mm, not the old labelMM default');
    assert.notStrictEqual(tplAfterLock.cellWidthMm, 52, 'width must not have been coupled to/replaced by the old 52mm square value');
    assert.notStrictEqual(tplAfterLock.cellHeightMm, 52, 'height must not have been coupled to/replaced by the old 52mm square value');
    // The old single field is left completely alone (still whatever it
    // defaulted to) -- it is simply not consulted while rectLocked.
    assert.strictEqual(window.eval("document.getElementById('cust-label-mm').value"), '52', 'cust-label-mm itself must be untouched by the lock');

    // ── #2: seeded Cols/Rows are the real A4-valid maximum for 57x99mm at
    // the default 10mm margin / 5mm gaps -- 3 columns x 2 rows (6 labels),
    // not the old 3x5=15. ──
    assert.strictEqual(tplAfterLock.cols, 3, 'seeded Cols should be the max that fits (3)');
    assert.strictEqual(tplAfterLock.rows, 2, 'seeded Rows should be the max that fits (2), not the stale default of 5');
    assert.strictEqual(window.eval('getCustomGridOverflow()'), null, 'the auto-seeded grid itself must not be flagged as overflowing');

    // ── Controls, lock message, preview and summary must agree ─────────
    assert.strictEqual(document.getElementById('cust-rect-dims-row').style.display, '', 'width/height controls must be shown once rectangle-locked');
    assert.strictEqual(document.getElementById('cust-label-mm-group').style.display, 'none', 'the old single Label-mm field must be hidden once rectangle-locked');
    assert.strictEqual(document.getElementById('cust-label-w').value, '57', 'the width read-out must mirror the real locked label');
    assert.strictEqual(document.getElementById('cust-label-h').value, '99', 'the height read-out must mirror the real locked label');
    const lockBanner = document.getElementById('saved-list').innerHTML;
    assert(lockBanner.includes('57×99mm'), 'the lock banner must state the real 57x99mm size');
    const sumSlots = document.getElementById('sum-slots').textContent;
    assert.strictEqual(sumSlots, '6', 'Sheet summary slots (3x2=6) must match the same geometry used everywhere else');

    // ── Preview cell aspect is the true 57:99 footprint, not squashed
    // into a square cell (Testing point #3). ──
    const canvasHTML0 = document.getElementById('sheet-canvas').innerHTML;
    const cellStyleMatch = canvasHTML0.match(/class="sheet-cell"[^>]*style="[^"]*width:(\d+)px;height:(\d+)px/);
    assert(cellStyleMatch, 'expected one rendered sheet-cell for the single added label');
    const cellPxW = Number(cellStyleMatch[1]), cellPxH = Number(cellStyleMatch[2]);
    assert(cellPxH > cellPxW, `cell must be taller than wide for a 57x99mm portrait rectangle (got ${cellPxW}x${cellPxH}px)`);
    assert(Math.abs((cellPxW/cellPxH) - (57/99)) < 0.02, `cell pixel aspect must match the real 57:99 ratio (got ${cellPxW}/${cellPxH})`);

    // ── #1: the ORIGINAL reported 3x5 grid is explicitly proven invalid
    // for 57x99mm at 10mm margin / 5mm gaps (not just "we now pick a
    // different default" -- the old combination itself must be rejected). ──
    window.eval("document.getElementById('cust-cols').value='3'; document.getElementById('cust-rows').value='5';");
    const overflow35 = window.eval('getCustomGridOverflow()');
    assert(overflow35, 'a 3x5 grid of 57x99mm labels must be flagged as not fitting on A4');
    assert.strictEqual(overflow35.maxCols, 3, 'reported max columns for 57x99mm/10mm margin/5mm gap must be 3');
    assert.strictEqual(overflow35.maxRows, 2, 'reported max rows for 57x99mm/10mm margin/5mm gap must be 2');

    // ── #8: while the grid is invalid, EVERY add/render/export path
    // refuses, with zero side effects -- mirrors tests/print-sheet-fit-blocking.js. ──
    window.eval('window.__lastAlert=null;');
    const addErr = window.eval("canAddToSheet(JSON.parse(localStorage.getItem('clpeasy_labels__u_guest'))[0], 1)");
    assert(addErr && /doesn't physically fit/i.test(addErr), 'canAddToSheet must refuse while the grid overflows A4');

    window.eval('rebuildSheet();');
    const canvasHTML1 = document.getElementById('sheet-canvas').innerHTML;
    assert(canvasHTML1.includes('Grid too large for A4'), 'the sheet preview must show a clear reason instead of a broken/overflowing grid');
    assert.strictEqual(document.getElementById('btn-pdf').disabled, true, 'btn-pdf must be disabled while the grid overflows A4');
    assert.strictEqual(document.getElementById('btn-png-all').disabled, true, 'btn-png-all must be disabled while the grid overflows A4');

    windowOpenCalls = 0;
    window.eval('window.__lastAlert=null;');
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 0, 'a blocked downloadPDF() must not open the print/PDF popup -- no side effect');
    assert(window.eval('window.__lastAlert') && /doesn't physically fit/i.test(window.eval('window.__lastAlert')), 'downloadPDF() must explain the A4-fit problem when blocked');

    window.eval('window.__lastAlert=null;');
    window.eval('openCricutModal()');
    assert.strictEqual(window.eval("document.getElementById('cricutModal').classList.contains('show')"), false, 'Cricut modal must not open while the grid overflows A4');
    assert(window.eval('window.__lastAlert'), 'openCricutModal() must alert and refuse while the grid overflows A4');

    zipFileCalls = 0; anchorClickCalls = 0;
    window.eval('window.__lastAlert=null;');
    await window.eval('cricutDownloadZip()');
    assert.strictEqual(zipFileCalls, 0, 'a blocked ZIP export must not build a single PNG file entry');
    assert.strictEqual(anchorClickCalls, 0, 'a blocked ZIP export must not trigger any download click');
    assert(window.eval('window.__lastAlert'), 'cricutDownloadZip() must still refuse when called directly while blocked');

    anchorClickCalls = 0;
    window.eval('window.__lastAlert=null;');
    await window.eval('cricutDownloadSequential()');
    assert.strictEqual(anchorClickCalls, 0, 'a blocked sequential export must not trigger any download click');
    assert(window.eval('window.__lastAlert'), 'cricutDownloadSequential() must still refuse when called directly while blocked');

    // ── Reducing back to a valid grid releases every block ──────────────
    window.eval("document.getElementById('cust-rows').value='2'; rebuildSheet();");
    assert.strictEqual(window.eval('getCustomGridOverflow()'), null, 'reducing Rows back to 2 must clear the overflow');
    assert.strictEqual(document.getElementById('btn-pdf').disabled, false, 'btn-pdf must re-enable once the grid fits again');
    windowOpenCalls = 0;
    window.eval('downloadPDF()');
    assert.strictEqual(windowOpenCalls, 1, 'downloadPDF() must proceed normally once the grid fits');

    // ── #7: mixed contents -- a second, different saved label at the SAME
    // 57x99mm rectangle footprint must still be addable and render. ──
    window.eval('window.__lastAlert=null;'); // clear the stale alert left over from the blocked-export checks above
    window.eval('addToSheet(1)'); // rectB, same 57x99mm
    assert.strictEqual(window.eval('window.__lastAlert'), null, 'a second label at the identical locked rectangle size must not be blocked');
    assert.strictEqual(window.eval('getTotalQty()'), 2, 'both same-size rectangle labels should be on the sheet');
    const canvasHTML2 = document.getElementById('sheet-canvas').innerHTML;
    assert(canvasHTML2.includes('Fireside Amber') || canvasHTML2.includes('Coastal Driftwood'), 'mixed same-size rectangle contents must actually render');

    // ── Empty-slot placeholder shape (31 Aug 2026 fix): a 57x99mm-locked
    // sheet has 2 filled + 4 empty positions here (3x2=6 slots). The empty
    // slots must draw as RECTANGLES at the true 57:99 ratio, not the old
    // hardcoded circle/oval (TEMPLATES.custom's static shape:'circle'),
    // and must occupy the exact same physical box as a filled cell. ──
    const emptyCellMatch = canvasHTML2.match(/class="sheet-cell-empty"[^>]*style="[^"]*width:(\d+)px;height:(\d+)px;"><div class="empty-slot"([^>]*)>/);
    assert(emptyCellMatch, 'expected at least one empty slot on the 3x2/2-filled 57x99mm sheet');
    const emptyPxW = Number(emptyCellMatch[1]), emptyPxH = Number(emptyCellMatch[2]);
    const emptySlotAttrs = emptyCellMatch[3];
    assert(!/border-radius:\s*50%/.test(emptySlotAttrs), 'point #1: a locked 57x99mm rectangle must NOT draw empty slots as circles/ovals (border-radius:50%)');
    assert(/border-radius:\s*4px/.test(emptySlotAttrs), 'a locked-rectangle empty slot must use a small rectangular corner radius, not a circular one');
    assert(emptyPxH > emptyPxW, `empty-slot box must be taller than wide for 57x99mm (got ${emptyPxW}x${emptyPxH}px)`);
    assert(Math.abs((emptyPxW/emptyPxH) - (57/99)) < 0.02, `point #2: empty-slot box aspect must match the true 57:99 ratio (got ${emptyPxW}/${emptyPxH})`);
    assert.strictEqual(emptyPxW, cellPxW, 'point #5: filled and empty slots must share the identical physical cell width');
    assert.strictEqual(emptyPxH, cellPxH, 'point #5: filled and empty slots must share the identical physical cell height');

    // ── #3 (export path too): the exported sheet SVG is true A4, and each
    // cell keeps the real 57x99mm footprint (not stretched to a square). ──
    windowOpenCalls = 0;
    window.eval('downloadPDF()');
    const svgDims = window.eval('window.__capturedSvg');
    assert(svgDims, 'downloadPDF must build a sheet SVG once the grid is valid');
    const DPI=300, mmW = svgDims.width/(DPI/25.4), mmH = svgDims.height/(DPI/25.4);
    assert(Math.abs(mmW-210)<0.5, `exported sheet width must stay true A4 (210mm): got ${mmW.toFixed(2)}mm`);
    assert(Math.abs(mmH-297)<0.5, `exported sheet height must stay true A4 (297mm): got ${mmH.toFixed(2)}mm`);

    // Reset for the next block.
    window.eval("selectTemplate('custom', document.querySelector('.tpl-card[data-tpl=\"custom\"]'))");

    // ── #5: circle/square Custom Sheet behaviour is completely untouched ──
    // Cols/Rows are ordinary persistent user-typed settings (unaffected by
    // clearing the sheet, exactly as before this fix -- selectTemplate()
    // never reset them) -- captured here as "whatever they currently are"
    // rather than assumed back to their page-load defaults, since an
    // earlier block in this same test deliberately changed Rows to 2.
    assert.strictEqual(window.eval('currentTpl'), 'custom');
    assert.strictEqual(document.getElementById('cust-rect-dims-row').style.display, 'none', 'width/height controls must be hidden on a fresh/empty sheet');
    assert.strictEqual(document.getElementById('cust-label-mm-group').style.display, '', 'the single Label-mm field must be visible again on a fresh/empty sheet');
    const colsBefore = document.getElementById('cust-cols').value;
    const rowsBefore = document.getElementById('cust-rows').value;
    window.eval('addToSheet(2)'); // circleC, 52mm circle
    const tplCircle = window.eval('getTplConfig()');
    assert.strictEqual(tplCircle.rectLocked, false, 'a circle must never set rectLocked');
    assert.strictEqual(tplCircle.cellWidthMm, 52, 'circle Custom Sheet must keep using the single Label-mm field (default 52), exactly as before this fix');
    assert.strictEqual(tplCircle.cellHeightMm, 52);
    assert.strictEqual(document.getElementById('cust-cols').value, colsBefore, 'adding a circle must never auto-seed/alter Cols -- that only ever happens for a non-square rectangle');
    assert.strictEqual(document.getElementById('cust-rows').value, rowsBefore, 'adding a circle must never auto-seed/alter Rows -- that only ever happens for a non-square rectangle');
    assert.strictEqual(window.eval('getCustomGridOverflow()'), null, 'circle/square Custom Sheet must never be subject to the new A4-fit block (pre-existing, unvalidated behaviour preserved)');
    assert.strictEqual(document.getElementById('cust-rect-dims-row').style.display, 'none', 'width/height controls must stay hidden for a circle label');

    // ── Empty-slot placeholder shape, circle (point #3): a circle-locked
    // Custom Sheet must keep the pre-existing default circular look
    // (.empty-slot's own CSS border-radius:50%, no override) -- exactly
    // as before this fix. ──
    window.eval('rebuildSheet();');
    const canvasCircle = document.getElementById('sheet-canvas').innerHTML;
    const emptyCircleMatch = canvasCircle.match(/<div class="empty-slot"([^>]*)>/);
    assert(emptyCircleMatch, 'expected an empty slot on the circle-only custom sheet');
    assert.strictEqual(emptyCircleMatch[1], '', 'a circle-locked Custom Sheet must keep the default circular empty-slot look (no style override), exactly as before this fix');
    window.eval('removeSheetItem(2)');

    // ── Empty-slot placeholder shape, square (point #3): geometry stays a
    // single labelMM field / cellWidthMm===cellHeightMm exactly as before
    // this fix, but the placeholder must now be a SQUARE, not a circle. ──
    window.eval('addToSheet(3)'); // squareD, 60x60mm square
    const tplSquare = window.eval('getTplConfig()');
    assert.strictEqual(tplSquare.rectLocked, false, 'a square (shape===\'square\') must never set rectLocked -- geometry unaffected, exactly as before this fix');
    assert.strictEqual(tplSquare.cellWidthMm, tplSquare.cellHeightMm, 'square Custom Sheet cell must remain literally square, exactly as before this fix');
    window.eval('rebuildSheet();');
    const canvasSquare = document.getElementById('sheet-canvas').innerHTML;
    const emptySquareMatch = canvasSquare.match(/<div class="empty-slot"([^>]*)>/);
    assert(emptySquareMatch, 'expected an empty slot on the square-only custom sheet');
    assert(!/border-radius:\s*50%/.test(emptySquareMatch[1]), 'a square-locked Custom Sheet must not draw empty slots as circles');
    assert(/border-radius:\s*4px/.test(emptySquareMatch[1]), 'a square-locked Custom Sheet must show a square placeholder (small corner radius)');
    window.eval('removeSheetItem(3)');

    // ── #6: EU30009 remains completely independent of any of this ──────
    window.eval("selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl=\"eu30009\"]'))");
    const tplEU = window.eval('getTplConfig()');
    assert.strictEqual(tplEU.registryKey, 'eu30009', 'EU30009 must still resolve through the registry path');
    assert.strictEqual(tplEU.rectLocked, undefined, 'rectLocked is a Custom-Sheet-only concept and must not appear on the registry path');
    assert.strictEqual(tplEU.cellWidthMm, 99.1);
    assert.strictEqual(tplEU.cellHeightMm, 57.3);
    assert.strictEqual(window.eval('getCustomGridOverflow()'), null, 'getCustomGridOverflow() must be a no-op while a registry template (not Custom) is selected');

    // ── Empty-slot placeholder shape, EU30009 (point #4): must keep using
    // its OWN registry cornerRadiusMm-derived rounded-rectangle look,
    // completely independently of the Custom Sheet t.shape logic above
    // (registry path never reaches the new custom-only branch). Opened via
    // setReservedUsed() so the (otherwise still-empty) sheet renders. ──
    window.eval('setReservedUsed(1);');
    const canvasEU = document.getElementById('sheet-canvas').innerHTML;
    const emptyEUMatch = canvasEU.match(/<div class="empty-slot"([^>]*)>/);
    assert(emptyEUMatch, 'expected an empty slot on the EU30009 sheet with 1 reserved/used position');
    const currentZoom = window.eval('zoom');
    const expectedEURadiusPx = Math.round(2 * 3.7795 * currentZoom); // registry cornerRadiusMm=2, same MM2PX formula as renderSheetCanvas()
    assert.strictEqual(emptyEUMatch[1], ` style="border-radius:${expectedEURadiusPx}px;"`, `EU30009 empty slots must use ITS OWN registry cornerRadiusMm (2mm → ${expectedEURadiusPx}px at current zoom), not the Custom Sheet's flat 4px value (got "${emptyEUMatch[1]}")`);
    window.eval('setReservedUsed(0);');

    if (errors.length) throw new Error('jsdom runtime errors: ' + errors.join('; '));
    console.log('custom-sheet rectangle grid/A4-fit checks passed (57x99mm real footprint, 3x2 max grid, 3x5 explicitly rejected, every add/render/export path blocked with zero side effects while invalid, mixed same-size contents, circle/square and EU30009 unaffected) + empty-slot placeholder-shape checks passed (57x99mm empty slots are true-ratio rectangles not ovals, identical physical geometry to filled cells, circle/square placeholders correct, EU30009 keeps its own registry corner radius)');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}, 50);
