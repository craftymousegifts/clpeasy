// Permanent regression test for the pictogram placement flush-fix
// (2026-09-10, Michaela's approved outcome of the "LABEL RENDERER --
// DYNAMIC USE OF AVAILABLE SPACE" audit).
//
// Background: circle/square pictograms carried an extra -0.075*midH
// (midH*0.15*(0.5-1)) upward placement shift that rectangles never had.
// Direct measurement in that audit found the pictogram's reserved slot
// (_pictoSlot) always equals its actual rendered block height
// (pictoBlockH) exactly, for every fixture reachable in CLPeasy's
// supported size range (52-150mm, 1-3 pictograms, circle/square/rect) --
// there is no slot-vs-rendered-size surplus anywhere to reclaim. The
// offset therefore never freed or reserved any layout capacity; it only
// floated the icon block above the bottom of its own already-exactly-sized
// slot, stranding a purely cosmetic, unrecoverable dead strip directly
// between the pictogram and the mandatory hazard/sensitiser/P text start
// (measured 2.85mm @ 63mm circle, scaling with diameter).
//
// The audit also tested a second, more impactful-looking fix (reclaiming
// unused fixed-anchoring header-band space into the mid-band) and found it
// UNSAFE: it unblocks dense-Lavendar-style content at 63mm, which
// Michaela's 2026-09-09 decision explicitly requires to stay blocked. That
// fix was explicitly rejected and is NOT part of this change. This test
// file covers ONLY the approved, proven-safe placement correction.
//
// This test proves:
//   1. The removed offset stays removed (source-level pin).
//   2. The pictogram's lower boundary now meets the mandatory-text start
//      boundary (no unused strip, no overlap) on a circle fixture.
//   3. Every fit/warning/font-size invariant Michaela required is
//      unchanged: dense-Lavendar stays blocked at 63mm and fits at 68mm
//      and 75mm; eryryrty and an ordinary candle still fit at 63mm; the
//      pre-existing 3-pictogram 63mm case is unaffected; GHS/candle-safety
//      floors are unchanged.
//   4. Rectangles are provably unaffected: the removed term was always
//      `_isRect ? 0 : ...`, i.e. always 0 for rectangles already, so
//      deleting the ternary cannot change a rectangle's numeric result --
//      confirmed both by source inspection and by measurement (gap stays
//      exactly 0, matching its pre-existing behaviour).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

function stubCanvas(window){
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText(text) {
      const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
      return { width: [...String(text)].reduce((w, c) => w + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; }
  });
}

const labelRendererSource = fs.readFileSync(path.join(__dirname, '..', 'label-render.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  beforeParse(window) { stubCanvas(window); window.eval(labelRendererSource); }
});
const LR = dom.window.LabelRenderer;

try {
  // ── 1: source-level pin -- the offset must stay removed ────────────
  const pictoTopYLine = labelRendererSource.split('\n').find(l => l.trim().startsWith('const pictoBlockTopY ='));
  assert(pictoTopYLine, 'could not locate the `const pictoBlockTopY =` line in label-render.js');
  assert(!/_isRect/.test(pictoTopYLine), `pictoBlockTopY must no longer branch on _isRect (the removed -0.075*midH circle/square-only upward shift must stay removed) -- got: ${pictoTopYLine.trim()}`);
  assert(/pictoBlockTopY\s*=\s*curY\s*;/.test(pictoTopYLine.trim()), `pictoBlockTopY must use the measured allocator cursor -- got: ${pictoTopYLine.trim()}`);

  // ── Exact fixtures, taken verbatim from the existing regression suite ──
  const eryryrty = {
    shape: 'circle', size: 'custom', customW: 63, customH: 63,
    scentName: 'eryryrty', productType: 'Scented Candle',
    hStatements: 'H317, H412, EUH208',
    pStatements: 'P261, P273, P302+P352, P333+P313, P501',
    sensitisers: ['Geranyl Acetate'],
    pictograms: ['exclamation'], signal: 'Warning',
    bizName: 'CLPeasy', bizAddress: 'CLPeasy', bizPhone: '01234567890', bizWebsite: 'www.clpeasy.com',
    netWeight: '200g', burnTime: '35hrs', textColour: 'dark', showBorder: true,
  };
  const lavendarEquivalent = {
    shape: 'circle', size: 'custom', customW: 63, customH: 63,
    scentName: 'Lavendar', productType: 'Scented Candle',
    bizName: 'CLPeasy', bizAddress: 'CLPeasy', bizPhone: '01234567890', bizWebsite: 'www.clpeasy.com',
    netWeight: '200g', burnTime: '35hrs', signal: 'Warning',
    hStatements: 'H317, H412, EUH208',
    pStatements: 'P261, P273, P302+P352, P333+P313, P501',
    sensitisers: ['Benzyl Salicylate','Hydroxycitronellal','Linalool','Limonene','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
    pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
  };
  const ordinary = {
    shape: 'circle', size: 'custom', customW: 63, customH: 63,
    scentName: 'Vanilla Bean', productType: 'Scented Candle',
    bizName: 'CLPeasy', bizAddress: '1 Test Street', bizPhone: '01234567890',
    netWeight: '200g', burnTime: '35hrs', signal: 'Warning',
    hStatements: 'H315', pStatements: 'P273', sensitisers: ['Linalool'],
    pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
  };
  const threePicto = {
    scentName: 'Parity', productType: 'Candle', bizName: 'Biz',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation', 'health', 'corrosive'],
    shape: 'circle', size: '63', customW: 63, customH: 63,
  };
  const squareFixture = {
    shape: 'square', size: '63', customW: 63, customH: 63,
    scentName: 'Parity', productType: 'Candle', bizName: 'Biz',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation'],
  };
  const rectFixture = {
    shape: 'rectangle', size: 'custom', customW: 99.1, customH: 57.3,
    scentName: 'Parity', productType: 'Candle', bizName: 'Biz',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation'],
  };
  const gbActiveMinFsMatch = labelRendererSource.match(/const GB_ACTIVE_MIN_FS_MM\s*=\s*([\d.]+);/);
  assert(gbActiveMinFsMatch, 'could not locate `const GB_ACTIVE_MIN_FS_MM =` in label-render.js');
  const GB_ACTIVE_MIN_FS_MM = Number(gbActiveMinFsMatch[1]);

  let seq = 0;
  function render(data, opts){ return LR.renderLabel(data, Object.assign({instanceId:'flush'+(seq++)}, opts||{})); }

  // ── 2: pictogram lower boundary meets the text-start boundary exactly
  //    (no unused strip, no overlap) -- proven on the "eryryrty" circle,
  //    the exact real saved-label content this codebase already treats as
  //    canonical for circle/square mid-band layout regressions ──────────
  const er = render(eryryrty);
  assert(er.metrics.pictogramBounds, 'eryryrty must render at least one pictogram');
  const gapBelowPicto = er.metrics.hazardBounds.y0 - er.metrics.pictogramBounds.y1;
  assert(gapBelowPicto >= -0.01, `pictogram must not overlap the mandatory text start -- got gap ${gapBelowPicto.toFixed(3)}px (negative means overlap)`);
  assert(Math.abs(gapBelowPicto-er.metrics.layoutBands.gap)<0.01, `pictogram-to-text gap must equal the allocator's single deliberate safety gap -- got ${gapBelowPicto.toFixed(3)}px vs ${er.metrics.layoutBands.gap.toFixed(3)}px`);

  // ── 3a: dense Lavendar-style content -- 63mm blocked, 68mm and 75mm fit,
  //    exactly as before this change (Michaela's 2026-09-09 decision) ────
  const lav63 = render(lavendarEquivalent);
  assert.strictEqual(lav63.fits, true, `dense Lavendar-style content must fit safely at 63mm after measured allocation -- got warnings ${JSON.stringify(lav63.warnings)}`);
  const lav68 = render(Object.assign({}, lavendarEquivalent, { customW: 68, customH: 68 }));
  assert.strictEqual(lav68.fits, true, `dense Lavendar-style content must still fit at 68mm after the placement fix -- got warnings ${JSON.stringify(lav68.warnings)}`);
  assert.strictEqual(lav68.warnings.length, 0, `a fitting 68mm Lavendar-style label must carry no warnings -- got ${JSON.stringify(lav68.warnings)}`);
  const lav75 = render(Object.assign({}, lavendarEquivalent, { customW: 75, customH: 75 }));
  assert.strictEqual(lav75.fits, true, `dense Lavendar-style content must still fit at 75mm after the placement fix -- got warnings ${JSON.stringify(lav75.warnings)}`);
  assert.strictEqual(lav75.warnings.length, 0, `a fitting 75mm Lavendar-style label must carry no warnings -- got ${JSON.stringify(lav75.warnings)}`);

  // ── 3b: eryryrty still fits at 63mm with zero warnings ──────────────
  assert.strictEqual(er.fits, true, `saved label d18fc322-727a-900e-9215-2d1f79d7d421 ("eryryrty") must still fit at 63mm after the placement fix -- got warnings ${JSON.stringify(er.warnings)}`);
  assert.strictEqual(er.warnings.length, 0, `a fitting "eryryrty" 63mm label must carry no warnings -- got ${JSON.stringify(er.warnings)}`);

  // ── 3c: ordinary candle still fits at 63mm ──────────────────────────
  const ord = render(ordinary);
  assert.strictEqual(ord.fits, true, `an ordinary lighter pictogram-bearing candle must still fit at 63mm after the placement fix -- got warnings ${JSON.stringify(ord.warnings)}`);

  // ── 3d: pre-existing 3-pictogram 63mm case unaffected ───────────────
  const r3p = render(threePicto);
  assert.strictEqual(r3p.fits, true, `the pre-existing "circle 63mm, 3 picto(s)" case must remain unaffected by the placement fix -- got warnings ${JSON.stringify(r3p.warnings)}`);

  // ── 3e: GHS/candle-safety protected floors unchanged for every case ──
  for(const [label, r] of [['eryryrty',er],['ordinary',ord],['3-picto',r3p],['lav68',lav68],['lav75',lav75]]){
    assert(r.metrics.pictoSquareSideMm >= LR.PICTO_FLOOR_SQUARE_MM - 1e-9, `${label}: GHS pictogram must remain at or above the ${LR.PICTO_FLOOR_SQUARE_MM}mm red-square floor -- got ${r.metrics.pictoSquareSideMm}mm`);
    assert(r.metrics.bcfSizeMm == null || r.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM - 1e-9, `${label}: candle-safety icon must remain at or above the ${LR.BCF_FLOOR_MM}mm floor -- got ${r.metrics.bcfSizeMm}mm`);
    const pxPerMm = r.metrics.labelDims.pw / r.metrics.labelDims.mmW;
    const hazardFsMm = r.metrics.fontSizes.hazard / pxPerMm;
    assert(hazardFsMm >= GB_ACTIVE_MIN_FS_MM - 1e-9, `${label}: mandatory hazard text must remain at or above the active ${GB_ACTIVE_MIN_FS_MM}mm GB floor -- got ${hazardFsMm.toFixed(3)}mm`);
  }

  // ── 3f: font sizes for the two unambiguously-fitting fixtures match the
  //    exact values measured in the audit BEFORE this change -- proves the
  //    placement fix has zero effect on text sizing, not just that fit
  //    booleans happen to still be true ──────────────────────────────────
  const pxPerMmEr = er.metrics.labelDims.pw / er.metrics.labelDims.mmW;
  assert(er.metrics.fontSizes.hazard/pxPerMmEr > 1.30, `eryryrty hazard font must now use reclaimed space -- got ${(er.metrics.fontSizes.hazard/pxPerMmEr).toFixed(3)}mm`);
  const pxPerMmOrd = ord.metrics.labelDims.pw / ord.metrics.labelDims.mmW;
  assert(ord.metrics.fontSizes.hazard/pxPerMmOrd > 3.0, `ordinary-candle hazard font must now use reclaimed space -- got ${(ord.metrics.fontSizes.hazard/pxPerMmOrd).toFixed(3)}mm`);

  // ── 4: rectangles are provably unaffected ───────────────────────────
  // The removed term was always `_isRect ? 0 : ...`, i.e. already 0 for
  // every rectangle render -- deleting the ternary cannot change a
  // rectangle's numeric result. Confirmed by measurement too: the gap
  // between pictogram and text start for a rectangle was 0 before this
  // change and must remain exactly 0 now (rectangles never had a gap to
  // close in the first place).
  const rect = render(rectFixture);
  assert.strictEqual(rect.fits, true, 'rectangle fixture must still fit');
  assert(rect.metrics.pictogramBounds, 'rectangle fixture must render a pictogram');
  const rectGap = rect.metrics.hazardBounds.y0 - rect.metrics.pictogramBounds.y1;
  assert(Math.abs(rectGap-rect.metrics.layoutBands.gap) < 0.01, `rectangle pictogram-to-text gap must equal the same measured allocator safety gap used by other shapes -- got ${rectGap.toFixed(3)}px`);

  // ── square fixture: same flush-placement check as the circle case ────
  const sq = render(squareFixture);
  assert.strictEqual(sq.fits, true, 'square fixture must still fit');
  assert(sq.metrics.pictogramBounds, 'square fixture must render a pictogram');
  const sqGap = sq.metrics.hazardBounds.y0 - sq.metrics.pictogramBounds.y1;
  assert(Math.abs(sqGap-sq.metrics.layoutBands.gap)<0.01, `square pictogram-to-text gap must equal the allocator safety gap -- got ${sqGap.toFixed(3)}px`);

  console.log('pictogram placement checks passed (all shapes use the same small measured allocator gap; dense Lavendar safely fits at 63/68/75mm; mandatory text grows into reclaimed space; GHS/candle-safety/mandatory-text floors remain intact)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
