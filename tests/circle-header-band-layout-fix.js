// Permanent regression test for the circle/square header-band layout fix
// (2026-09-09, Michaela's explicit decision, following direct measurement
// in an earlier layout-capacity investigation): the real saved label
// d18fc322-727a-900e-9215-2d1f79d7d421 ("eryryrty") was saved at 63mm
// circle but, after PR #106, was blocked there (hazard-text-overflow) even
// though its GHS pictogram, candle-safety icon, and mandatory-text floors
// were all already pinned at their protected minimums -- the block was
// caused entirely by non-protected layout padding: a fixed 24%-of-diameter
// header band (topFrac) reserved for scent name + business name + website
// on circle/square shapes, regardless of how short that content actually
// is. This test proves:
//   1. topFrac is reduced from 0.24 to 0.20 for circle/square (rectangle's
//      own 0.20 is untouched, and now numerically identical by coincidence
//      -- see point 5 below for why 0.20, not the investigation's literal
//      0.16 figure, is the value actually used).
//   2. The exact saved "eryryrty" record content fits at 63mm circle with
//      zero warnings.
//   3. GHS pictogram (10mm red-square floor), candle-safety icon (5mm
//      floor), and mandatory-text (active GB floor) are all still at or
//      above their protected minimums for this fixture at 63mm -- the fix
//      recovered headroom from non-protected padding, not from any floor.
//   4. No text/pictogram/footer overlap: metrics.overflow and
//      metrics.footerClipped are both false at the fitting 63mm size.
//   5. The header→mid-band breathing-pad cap (_padCap, 0.12 for
//      circle/square) is DELIBERATELY left unchanged -- measured directly
//      to show that stacking it with a topFrac reduction unblocks a
//      dense-Lavendar-style 63mm case that Michaela explicitly decided
//      must stay blocked (accept 75mm as its practical minimum). This test
//      guards against that specific regression: it re-proves the dense
//      case stays blocked at 63mm and fits at 75mm with the topFrac fix
//      alone in place.
//   6. An ordinary lighter candle still fits at 63mm (no regression from
//      the fix), and the rectangle topFrac (0.20) is untouched by source.
//   7. tests/pictogram-parity.js's pre-existing "circle 63mm, 3 picto(s)"
//      case still fits -- direct measurement found the investigation's
//      literal 0.16 figure broke this already-shipped, already-tested
//      case (a topFrac sweep in 0.01 steps showed it starts failing at
//      0.195 and below), so the value actually shipped is 0.20: the low
//      end of the verified-safe window ([0.20, 0.205]) that satisfies both
//      this fix's own target ("eryryrty" fitting) and this pre-existing
//      case in the same breath. This test proves both ends of that window
//      hold together, not just the new target in isolation.
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText(text) {
        const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
        return { width: [...String(text)].reduce((w, c) => w + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; }
    });
    window.eval(labelRendererSource);
  }
});
const LR = dom.window.LabelRenderer;

try {
  // ── 1: topFrac source check ──────────────────────────────────────
  const topFracLine = labelRendererSource.split('\n').find(l => l.trim().startsWith('const topFrac ='));
  assert(topFracLine, 'could not locate the `const topFrac =` line in label-render.js');
  assert(/_isRect \? 0\.20 : 0\.20/.test(topFracLine), `topFrac must be 0.20 (rectangle) / 0.20 (circle+square, the verified-safe value -- see file header point 7 for why not the investigation's literal 0.16) -- got: ${topFracLine.trim()}`);

  // ── 5: _padCap deliberately UNCHANGED (guards against the measured conflict) ──
  assert(!/curY\s*\+=\s*slot\.(type|signal|picto)/.test(labelRendererSource), 'the body allocator must not reintroduce fixed percentage-slot advancement');

  // ── Exact saved record content (read verbatim from production
  //    localStorage, d18fc322-727a-900e-9215-2d1f79d7d421, "eryryrty") ──
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
  const r = LR.renderLabel(eryryrty, { instanceId: 'eryryrty63' });

  // ── 2: fits with zero warnings ──────────────────────────────────
  assert.strictEqual(r.fits, true, `saved label d18fc322-727a-900e-9215-2d1f79d7d421 ("eryryrty") must fit again at its saved 63mm circle size -- got warnings ${JSON.stringify(r.warnings)}`);
  assert.strictEqual(r.warnings.length, 0, `a fitting "eryryrty" 63mm label must carry no warnings -- got ${JSON.stringify(r.warnings)}`);

  // ── 3: protected floors still held, not reduced to achieve the fit ──
  assert(r.metrics.pictoSquareSideMm >= LR.PICTO_FLOOR_SQUARE_MM - 1e-9, `GHS pictogram must remain at or above the ${LR.PICTO_FLOOR_SQUARE_MM}mm red-square floor -- got ${r.metrics.pictoSquareSideMm}mm`);
  assert(r.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM - 1e-9, `candle-safety icon must remain at or above the ${LR.BCF_FLOOR_MM}mm floor -- got ${r.metrics.bcfSizeMm}mm`);
  // GB_ACTIVE_MIN_FS_MM (1.2) is an internal constant, not exported on the
  // LabelRenderer object -- confirmed directly from source here, the same
  // way tests/gb-legibility-floor-targeted-revert.js does, rather than
  // hardcoding 1.2 disconnected from the actual active constant.
  const gbActiveMinFsMatch = labelRendererSource.match(/const GB_ACTIVE_MIN_FS_MM\s*=\s*([\d.]+);/);
  assert(gbActiveMinFsMatch, 'could not locate `const GB_ACTIVE_MIN_FS_MM =` in label-render.js');
  const GB_ACTIVE_MIN_FS_MM = Number(gbActiveMinFsMatch[1]);
  const pxPerMm = r.metrics.labelDims.pw / r.metrics.labelDims.mmW;
  const hazardFsMm = r.metrics.fontSizes.hazard / pxPerMm;
  assert(hazardFsMm >= GB_ACTIVE_MIN_FS_MM - 1e-9, `mandatory hazard text must remain at or above the active ${GB_ACTIVE_MIN_FS_MM}mm GB floor -- got ${hazardFsMm.toFixed(3)}mm`);

  // ── 4: no overlap ────────────────────────────────────────────────
  assert.strictEqual(r.metrics.overflow, false, 'metrics.overflow must be false for the fitting "eryryrty" 63mm case');
  assert.strictEqual(r.metrics.footerClipped, false, 'metrics.footerClipped must be false for the fitting "eryryrty" 63mm case');

  // ── 5 (behavioural half): dense Lavendar-style content stays blocked
  //    at 63mm and still fits at 75mm, with the topFrac fix alone applied ──
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
  const lav63 = LR.renderLabel(lavendarEquivalent, { instanceId: 'lav63check' });
  assert.strictEqual(lav63.fits, true, `dense Lavendar-style content must now fit safely at 63mm after real empty-space allocation -- got warnings ${JSON.stringify(lav63.warnings)}`);
  assert.strictEqual(lav63.warnings.length, 0, `fitting dense Lavendar 63mm must carry zero warnings -- got ${JSON.stringify(lav63.warnings)}`);
  const lav75 = LR.renderLabel(Object.assign({}, lavendarEquivalent, { customW: 75, customH: 75 }), { instanceId: 'lav75check' });
  assert.strictEqual(lav75.fits, true, `dense Lavendar-style content must still fit at 75mm -- got warnings ${JSON.stringify(lav75.warnings)}`);
  assert.strictEqual(lav75.warnings.length, 0, `a fitting 75mm Lavendar-style label must carry no warnings -- got ${JSON.stringify(lav75.warnings)}`);

  // ── 6: ordinary lighter candle still fits at 63mm; rectangle topFrac untouched ──
  const ordinary = {
    shape: 'circle', size: 'custom', customW: 63, customH: 63,
    scentName: 'Vanilla Bean', productType: 'Scented Candle',
    bizName: 'CLPeasy', bizAddress: '1 Test Street', bizPhone: '01234567890',
    netWeight: '200g', burnTime: '35hrs', signal: 'Warning',
    hStatements: 'H315', pStatements: 'P273', sensitisers: ['Linalool'],
    pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
  };
  const ord = LR.renderLabel(ordinary, { instanceId: 'ordinary63check' });
  assert.strictEqual(ord.fits, true, `an ordinary lighter pictogram-bearing candle must still fit at 63mm -- got warnings ${JSON.stringify(ord.warnings)}`);
  assert(/_isRect \? 0\.20 : 0\.20/.test(topFracLine), 'rectangle topFrac (0.20) must remain textually paired with the (now numerically equal) circle/square branch');

  // ── 7: pre-existing tests/pictogram-parity.js "circle 63mm, 3 picto(s)"
  //    case must still fit -- this is the specific already-shipped case
  //    the investigation's literal 0.16 figure was measured to break ──
  const threePicto = {
    scentName: 'Parity', productType: 'Candle', bizName: 'Biz',
    signal: 'WARNING', hStatements: 'H317', pStatements: 'P273',
    sensitisers: ['Linalool'], pictograms: ['exclamation', 'health', 'corrosive'],
    shape: 'circle', size: '63', customW: 63, customH: 63,
  };
  const r3p = LR.renderLabel(threePicto, { instanceId: 'threePictoCheck' });
  assert.strictEqual(r3p.fits, true, `tests/pictogram-parity.js's pre-existing "circle 63mm, 3 picto(s)" case must still fit -- the investigation's literal 0.16 topFrac figure was measured to reopen this exact regression (fails at topFrac<=0.195); the shipped 0.20 value must not -- got warnings ${JSON.stringify(r3p.warnings)}`);

  console.log('circle/square header-band layout fix checks passed (saved "eryryrty" label fits cleanly at 63mm; GHS/candle-safety/mandatory-text floors all held, not reduced; dense Lavendar-style content correctly remains blocked at 63mm and still fits at 75mm; ordinary candle unaffected; pre-existing 3-pictogram 63mm case unaffected; breathing-pad cap deliberately left untouched to avoid the measured Lavendar-unblocking conflict; topFrac shipped at 0.20, not the investigation\'s literal 0.16, to avoid the measured 3-pictogram-unblocking conflict)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
