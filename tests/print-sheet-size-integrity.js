// ── PRINT SHEET COMPOSER — STAGE 1 SIZE INTEGRITY & PAGE BOUNDARY ────────
// Regression coverage for the Stage 1 fix (27 Sep 2026).
//
// Defects this guards against (both reproduced in real Chromium output
// during the print audit before the fix):
//   1. The editable Custom-sheet "Label mm" field set a circle/square's
//      cell size, and downloadPDF() scaled each label to fill that cell --
//      a 60mm label exported at ~69.2mm (Label mm 70) or ~51.5mm (Label mm
//      52), with no warning.
//   2. The A4-fit check only ran for non-square rectangles, so a circle or
//      square grid could run off the page (a third 70mm column was clipped
//      at the page edge) and still be exported.
//
// What this proves, from the REAL export path (downloadPDF() builds one
// combined A4 SVG; the test captures it before rasterisation and measures
// every placed label in millimetres at the export's own 300dpi):
//   - every label is exported at exactly its saved width x height;
//   - every label lies fully inside the 210 x 297mm page;
//   - no Composer control (Cols/Rows/margin/gaps, or the now read-only
//     Label size read-out) can change a label's physical size;
//   - grids wider or taller than the page are refused, never clipped or
//     shrunk, and a refused export opens no print window;
//   - same-size mixed-design sheets still work; different sizes are still
//     refused.
//
// Run from the repo root: node tests/print-sheet-size-integrity.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const source = fs.readFileSync('print.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const entitlementSource = fs.readFileSync(path.join(__dirname, '..', 'entitlement.js'), 'utf8');

const EXPORT_PX_PER_MM = 300 / 25.4;   // downloadPDF()'s own export DPI
const TOL_MM = 0.05;                   // one size rounded to whole 300dpi pixels: <= 0.042mm
const EDGE_TOL_MM = 0.09;              // position + size each rounded: <= 1px = 0.085mm
const A4_W = 210, A4_H = 297;

function label(name, shape, w, h) {
  return {
    scentName:name, productType:'Candle', bizName:'Crafty Mouse Gifts',
    shape, size:'custom', customW:w, customH:(shape === 'rectangle' ? h : w),
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'150g', batchNum:'B1', burnTime:'',
    signal:'Warning', hStatements:'H315', pStatements:'P302+P352',
    sensitisers:['Linalool'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  };
}

// Every size the Stage 1 brief asks for, plus a portrait custom rectangle.
const CASES = [
  label('Circle 52', 'circle', 52),
  label('Circle 60', 'circle', 60),
  label('Circle 60 Fig', 'circle', 60),      // second design, same size (mixed sheet)
  label('Circle 63', 'circle', 63),
  label('Circle 75', 'circle', 75),
  label('Square 52', 'square', 52),
  label('Square 60', 'square', 60),
  label('Square 75', 'square', 75),
  label('Rect 63x44', 'rectangle', 63, 44),
  label('Rect 76x51', 'rectangle', 76, 51),
  label('Rect 99x67', 'rectangle', 99, 67),
  label('Rect 57x99 custom', 'rectangle', 57, 99),
  label('Rect 44x63 portrait', 'rectangle', 44, 63),
];

let windowOpenCalls = 0;
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
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
    window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size:1, type:'image/png' }); };
    try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
    window.eval(labelRendererSource);
    window.eval(labelLibrarySource);
    window.eval(entitlementSource);
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => { windowOpenCalls++; return { document:{ open(){}, write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    // Capture the exact combined A4 sheet SVG downloadPDF() hands to the
    // rasteriser (never fire onload, so nothing is charged or printed).
    window.__sheetSvg = null;
    class FakeImage {
      set src(v){ window.__sheetSvg = decodeURIComponent(String(v).split(',').slice(1).join(',')); }
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
    window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(CASES));
  }
});
const { window } = dom;
const document = window.document;

function ok(msg){ console.log('  ✓ ' + msg); }

// Parses every placed label out of the exported sheet SVG, in mm.
function measureSheet(svg) {
  const root = svg.match(/^<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  assert(root, 'exported sheet SVG root not found');
  const labels = [];
  const re = /<g transform="translate\(([\d.]+),([\d.]+)\)"><svg[^>]*?\swidth="([\d.]+)"\s+height="([\d.]+)"\s+viewBox="0 0 ([\d.]+) ([\d.]+)"/g;
  let m;
  while ((m = re.exec(svg))) {
    labels.push({
      x: +m[1] / EXPORT_PX_PER_MM, y: +m[2] / EXPORT_PX_PER_MM,
      w: +m[3] / EXPORT_PX_PER_MM, h: +m[4] / EXPORT_PX_PER_MM,
      vbAspect: +m[5] / +m[6],
    });
  }
  return { pageW: +root[1] / EXPORT_PX_PER_MM, pageH: +root[2] / EXPORT_PX_PER_MM, labels };
}

async function exportSheet() {
  window.__sheetSvg = null;
  const before = windowOpenCalls;
  await window.eval('downloadPDF()');
  return { svg: window.__sheetSvg, opened: windowOpenCalls - before };
}

function freshCustomSheet({ cols = '3', rows = '5', margin = '10', gapH = '5', gapV = '5' } = {}) {
  window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
  document.getElementById('cust-cols').value = cols;
  document.getElementById('cust-rows').value = rows;
  document.getElementById('cust-margin').value = margin;
  document.getElementById('cust-gapH').value = gapH;
  document.getElementById('cust-gapV').value = gapV;
  window.eval('rebuildSheet()');
}

function idOf(name) { return window.__byName[name]; }

function assertSheetExact(sheet, w, h, count, ctx) {
  assert(Math.abs(sheet.pageW - A4_W) < TOL_MM && Math.abs(sheet.pageH - A4_H) < TOL_MM, `${ctx}: exported page must be A4 210x297mm, got ${sheet.pageW.toFixed(2)}x${sheet.pageH.toFixed(2)}`);
  assert.strictEqual(sheet.labels.length, count, `${ctx}: expected ${count} exported labels, got ${sheet.labels.length}`);
  sheet.labels.forEach((p, i) => {
    assert(Math.abs(p.w - w) <= TOL_MM, `${ctx}: label ${i + 1} exported ${p.w.toFixed(3)}mm wide, expected exactly ${w}mm`);
    assert(Math.abs(p.h - h) <= TOL_MM, `${ctx}: label ${i + 1} exported ${p.h.toFixed(3)}mm tall, expected exactly ${h}mm`);
    assert(Math.abs(p.vbAspect - w / h) < 0.01, `${ctx}: label ${i + 1} artwork aspect ${p.vbAspect.toFixed(4)} must match ${w}:${h} (no distortion)`);
    assert(p.x >= -TOL_MM && p.y >= -TOL_MM, `${ctx}: label ${i + 1} starts off the page (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    assert(p.x + p.w <= A4_W + TOL_MM, `${ctx}: label ${i + 1} runs past the right page edge (${(p.x + p.w).toFixed(2)}mm)`);
    assert(p.y + p.h <= A4_H + TOL_MM, `${ctx}: label ${i + 1} runs past the bottom page edge (${(p.y + p.h).toFixed(2)}mm)`);
  });
}

setTimeout(async () => {
  try {
    await window.LabelLibrary.whenReady?.();
    // Entitlement is not what this test is about: grant it so downloadPDF()
    // reaches the geometry/SVG stage (charging only happens in the image
    // onload, which the FakeImage above never fires).
    window.eval('isPro=true; window.refreshProEntitlement=async()=>true; updateProGate&&updateProGate();');
    window.__byName = {};
    window.eval('getSaved()').forEach(e => { window.__byName[e.scentName] = e.id; });
    assert.strictEqual(Object.keys(window.__byName).length, CASES.length, 'setup: every fixture label must load into the library');

    // ── 1. Every size: saved = Composer = exported, filling the whole
    //       seeded grid, all inside the page ─────────────────────────────
    const qaRows = [];
    for (const c of CASES) {
      freshCustomSheet();
      window.eval(`addToSheet('${idOf(c.scentName)}')`);
      const t = window.eval('getTplConfig()');
      const slots = t.cols * t.rows;
      window.eval(`setQty('${idOf(c.scentName)}','${slots}')`);
      assert.strictEqual(window.eval('getTotalQty()'), slots, `${c.scentName}: the whole seeded grid (${t.cols}x${t.rows}) must be fillable`);
      assert.strictEqual(t.cellWidthMm, c.customW, `${c.scentName}: Composer cell width must be the saved ${c.customW}mm`);
      assert.strictEqual(t.cellHeightMm, c.customH, `${c.scentName}: Composer cell height must be the saved ${c.customH}mm`);
      assert.strictEqual(window.eval('getCustomGridOverflow()'), null, `${c.scentName}: the seeded grid must fit inside the A4 margins`);
      assert.strictEqual(window.eval('sheetFitIssues.length'), 0, `${c.scentName}: fixture content must fit its label (setup)`);
      const { svg, opened } = await exportSheet();
      assert(svg && opened === 1, `${c.scentName}: export must proceed`);
      const sheet = measureSheet(svg);
      assertSheetExact(sheet, c.customW, c.customH, slots, c.scentName);
      const exW = sheet.labels[0].w, exH = sheet.labels[0].h;
      qaRows.push(`${c.scentName.padEnd(22)} saved ${c.customW}x${c.customH} | Composer ${t.cellWidthMm}x${t.cellHeightMm} | exported ${exW.toFixed(3)}x${exH.toFixed(3)}mm | ${t.cols}x${t.rows}=${slots}`);
    }
    ok('every tested circle/square/rectangle exports at exactly its saved size, whole grid on the page');
    qaRows.forEach(r => console.log('      ' + r));

    // ── 2. Layout controls never change the label's size ───────────────
    freshCustomSheet();
    window.eval(`addToSheet('${idOf('Circle 60')}')`);
    window.eval(`setQty('${idOf('Circle 60')}','3')`);
    for (const [ctl, val] of [['cust-gapH', '0'], ['cust-gapH', '12'], ['cust-gapV', '15'], ['cust-margin', '5'], ['cust-margin', '20'], ['cust-rows', '1'], ['cust-cols', '3']]) {
      document.getElementById(ctl).value = val;
      window.eval('rebuildSheet()');
      if (window.eval('getSheetFitBlockMessage()')) continue; // a refused layout is fine -- never a resize
      const { svg } = await exportSheet();
      assertSheetExact(measureSheet(svg), 60, 60, 3, `60mm circle after ${ctl}=${val}`);
    }
    ok('changing gaps, margin, Cols or Rows never changes a 60mm circle\'s exported size');

    // ── 3. The old "Label mm" control can no longer resize anything ─────
    freshCustomSheet();
    window.eval(`addToSheet('${idOf('Circle 60')}')`);
    const mmEl = document.getElementById('cust-label-mm');
    assert.strictEqual(mmEl.disabled, true, 'Label size must be a disabled, read-only read-out');
    assert.strictEqual(mmEl.getAttribute('oninput'), null, 'Label size must have no input handler');
    assert.strictEqual(mmEl.value, '60', 'Label size must mirror the label\'s real 60mm size');
    for (const forced of ['70', '52']) {
      mmEl.value = forced; // what the audit typed; ignored now even if forced programmatically
      window.eval('rebuildSheet()');
      assert.strictEqual(window.eval('getTplConfig().cellWidthMm'), 60, `forcing Label size to ${forced} must not change the cell (still 60mm)`);
      const { svg } = await exportSheet();
      assertSheetExact(measureSheet(svg), 60, 60, 1, `60mm circle with Label size forced to ${forced}`);
      assert.strictEqual(mmEl.value, '60', 'the read-out must snap back to the real size on the next render');
    }
    ok('audit reproduction: "Label mm" 70/52 no longer turns a 60mm label into ~69.2mm/~51.5mm');

    // ── 4. Wider / taller than the page: refused, never clipped/shrunk ──
    freshCustomSheet();
    window.eval(`addToSheet('${idOf('Circle 60')}')`);
    document.getElementById('cust-cols').value = '4';          // 4x60 + 3x5 = 255mm > 190mm
    window.eval('rebuildSheet()');
    assert(window.eval('getCustomGridOverflow()'), 'a 4-column 60mm grid (too wide for A4) must be flagged');
    let res = await exportSheet();
    assert.strictEqual(res.opened, 0, 'a too-wide grid must not open a print window');
    assert.strictEqual(res.svg, null, 'a too-wide grid must never build an export');
    assert(/doesn't physically fit/.test(window.__lastAlert || ''), 'the user must be told the grid does not fit');
    assert.strictEqual(document.getElementById('btn-pdf').disabled, true, 'Print/PDF must be disabled while the grid does not fit');
    document.getElementById('cust-cols').value = '3';
    document.getElementById('cust-rows').value = '5';           // 5x60 + 4x5 = 320mm > 277mm
    window.eval('rebuildSheet()');
    assert(window.eval('getCustomGridOverflow()'), 'a 5-row 60mm grid (too tall for A4) must be flagged');
    res = await exportSheet();
    assert.strictEqual(res.opened, 0, 'a too-tall grid must not open a print window');
    ok('grids wider or taller than the page are refused with a message -- nothing exported, nothing resized');

    // ── 5. Third-column regression from the audit ─────────────────────
    // 60mm circles, 3 columns: 10 + 3x60 + 2x5 = 200mm -> exactly the
    // right margin (floating-point exact fit must be allowed), and the
    // third column must end inside the page, never at/over the edge.
    freshCustomSheet({ rows:'4' });
    window.eval(`addToSheet('${idOf('Circle 60')}')`);
    window.eval(`setQty('${idOf('Circle 60')}','3')`);
    assert.strictEqual(window.eval('getCustomGridOverflow()'), null, 'an exact 3-column 60mm fit must be allowed');
    res = await exportSheet();
    const third = measureSheet(res.svg).labels[2];
    assert(Math.abs(third.x - 140) < EDGE_TOL_MM && Math.abs(third.x + third.w - 200) < EDGE_TOL_MM, `third column must sit at 140-200mm, got ${third.x.toFixed(2)}-${(third.x + third.w).toFixed(2)}`);
    // The audit's failing layout: 70mm cells in 3 columns (230mm) -- now
    // impossible, because the cell is always the label's own 60mm.
    ok('third column of 60mm circles ends at 200mm (inside the page); the 70mm off-page layout can no longer arise');

    // ── 6. Negative margin/gaps are clamped -- never off the left/top ──
    freshCustomSheet({ margin:'-5', gapH:'-3', gapV:'-3', rows:'4' });
    window.eval(`addToSheet('${idOf('Circle 52')}')`);
    const tNeg = window.eval('getTplConfig()');
    assert(tNeg.marginL >= 0 && tNeg.gapH >= 0 && tNeg.gapV >= 0, 'negative margin/gaps must clamp to 0');
    res = await exportSheet();
    assertSheetExact(measureSheet(res.svg), 52, 52, 1, 'negative margin');
    ok('a negative margin or gap can never place a label before the page edge or overlapping');

    // ── 7. Mixed designs, same size: still supported; different sizes refused ──
    freshCustomSheet({ rows:'4' });
    window.eval(`addToSheet('${idOf('Circle 60')}')`);
    window.eval(`setQty('${idOf('Circle 60')}','4')`);
    window.eval(`addToSheet('${idOf('Circle 60 Fig')}')`);
    window.eval(`setQty('${idOf('Circle 60 Fig')}','2')`);
    assert.strictEqual(window.eval('getTotalQty()'), 6, 'two different 60mm designs must share one sheet');
    window.__lastAlert = null;
    window.eval(`addToSheet('${idOf('Circle 63')}')`);
    assert.strictEqual(window.eval('getTotalQty()'), 6, 'a different-size label must still be refused on a 60mm sheet');
    assert(/one label shape and size/.test(window.__lastAlert || ''), 'the refusal must explain one shape and size per sheet');
    res = await exportSheet();
    assertSheetExact(measureSheet(res.svg), 60, 60, 6, 'mixed 60mm designs');
    assert((res.svg.match(/Circle 60 Fig/g) || []).length >= 2, 'the second design must actually be in the exported sheet');
    ok('mixed-design sheets of one size export every label at 60mm; different sizes are still refused');

    // ── 8. Belt-and-braces export guard ─────────────────────────────────
    // If a future change ever made a cell differ from its label's saved
    // size, the export itself must refuse rather than resize.
    window.eval('window.__origCell = getCellSizeMM; getCellSizeMM = t => ({ w:t.cellWidthMm + 10, h:t.cellHeightMm + 10 });');
    assert(/never resizes a label/.test(window.eval('getSheetGeometryBlockMessage()') || ''), 'a cell/label size mismatch must block export');
    res = await exportSheet();
    assert.strictEqual(res.opened, 0, 'a size mismatch must never open a print window');
    window.eval('getCellSizeMM = window.__origCell;');
    ok('export guard refuses any placement whose size differs from the label\'s saved size');

    // ── 9. EU30009 registry geometry is unchanged ──────────────────────
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);
    const tEU = window.eval('getTplConfig()');
    assert.strictEqual(tEU.cellWidthMm, 99.1); assert.strictEqual(tEU.cellHeightMm, 57.3);
    assert.strictEqual(tEU.cols, 2); assert.strictEqual(tEU.rows, 5);
    window.__lastAlert = null;
    window.eval(`addToSheet('${idOf('Rect 99x67')}')`);
    assert.strictEqual(window.eval('getTotalQty()'), 0, 'a non-matching label must still be refused by EU30009');
    ok('EU30009 template geometry and exact-size compatibility are unchanged');

    assert.deepStrictEqual(errors, [], 'no page errors expected');
    console.log('\nprint-sheet-size-integrity: all checks passed');
  } catch (err) {
    console.error('FAIL:', err && err.stack || err);
    process.exit(1);
  }
}, 400);
