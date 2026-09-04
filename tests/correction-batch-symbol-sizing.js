// ── GHS PICTOGRAM + CANDLE-SAFETY SYMBOL PHYSICAL SIZING — regression
// coverage for the correction batch's two regulatory geometry fixes:
//
// (A) GHS/GB-CLP pictogram minimum size (Sept 2026 fix, SECOND PASS). The
//     regulated LEGAL FLOOR is the PRE-ROTATION RED-BORDERED SQUARE itself
//     (its own side length/area) -- NOT the rotated diamond artwork's outer
//     (tip-to-tip) axis-aligned bounding box. The original defect treated
//     the 10mm/16mm figures as the bounding box directly, which rendered a
//     red square with only ~7.13mm side / ~50.85mm^2 area at the "floor" --
//     about half the legally required 100mm^2 -- while still reporting
//     "10mm". That was fixed, but the FIRST fix over-corrected the 16mm
//     "if possible" TARGET: it redefined 16mm as a second red-square side
//     too (256mm^2, ~22.63mm outer bounding box) -- inflating the preferred
//     target well past what "16mm" has ever meant in practice or in the
//     historical rendered output. The 16mm figure is correctly a preferred
//     OUTER BOUNDING BOX, equivalent to a ~11.3137mm red-square side
//     (~128.06mm^2 area) via the side*sqrt(2) relationship. Both floor and
//     target are now named via three geometry helpers exported on
//     LabelRenderer (pictoOuterBoundingBoxMm/pictoSquareSideFromBoundingBoxMm/
//     pictoSquareAreaMm2) plus three distinct, unambiguous constants:
//     PICTO_FLOOR_SQUARE_MM (10, a red-square side), PICTO_TARGET_OUTER_BBOX_MM
//     (16, an outer bounding box), and PICTO_TARGET_SQUARE_MM (the derived
//     ~11.3137mm red-square-side equivalent of that 16mm bounding-box
//     target) -- so square side, area, and bounding box can never again be
//     confused with one another.
//
// (B) BS EN 15494:2019 candle-safety icon row (burn-within-sight/keep-
//     from-fire/keep-from-children/no-draught/trim-wick): must never
//     render below its 5mm physical-height floor (BCF_FLOOR_MM, unchanged
//     -- Michaela's explicit instruction was to redesign the footer layout
//     around the floor, never lower it). The footer band's own padding/
//     icon-row-share budget (BCF_FOOTER_PAD_FRAC/BCF_FOOTER_SHARE_CAP) was
//     redesigned so the EU30009 registry template (99.1x57.3mm) and the
//     common 63mm circle -- both realistic sizes already in production use
//     -- can hold the floor. SECOND PASS: re-measuring the historically
//     sensitive 63x44mm rectangle (AGENTS.md) showed its footer band could
//     only ever offer ~4.01mm regardless of content -- a genuine layout
//     defect, not a content problem, since a simple/minimal candle fixture
//     failed there for the identical geometric reason as a dense one.
//     BCF_FOOTER_SHARE_CAP was raised again (0.66 -> 0.85) so a simple
//     63x44mm candle now holds the floor; a dense one still correctly
//     fails, but now only for its genuine hazard-text-overflow reason, not
//     also for candle-safety-symbols-too-small. As a direct, unavoidable
//     consequence (not a separate change), 45x45mm now holds the floor
//     too. Where a label is STILL genuinely too small to hold it, the row
//     must not render at all and export must be blocked (fits:false + a
//     named warning), never silently shrunk further.
//
// These assertions measure the REAL rendered SVG geometry LabelRenderer
// produces -- parsing the actual <image> element attributes and converting
// through the label's own canonical px-per-mm ratio (260/mmW, per
// getLabelDims()) -- cross-checked against LabelRenderer's own reported
// metrics. This is deliberately not a source-string/CSS/screenshot check:
// it is the same geometry every output route (Composer preview, browser
// Print/PDF, individual PNG) is built from, since they all share this one
// renderLabel() SVG -- confirmed directly below by comparing
// forExport:false (preview) against forExport:true (export) renders of the
// same label.
//
// Run from the repo root: node tests/correction-batch-symbol-sizing.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');

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

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual:true, runScripts:'dangerously' });
const { window } = dom;
stubCanvas(window);
window.eval(labelRendererSource);
const LR = window.LabelRenderer;
assert(LR && typeof LR.renderLabel === 'function', 'LabelRenderer.renderLabel must be exposed on window for this harness to work');
assert(typeof LR.pictoOuterBoundingBoxMm === 'function' && typeof LR.pictoSquareSideFromBoundingBoxMm === 'function' && typeof LR.pictoSquareAreaMm2 === 'function', 'the three named GHS geometry helpers must be exported on LabelRenderer, not left as unexported/magic-constant internals');
assert.strictEqual(LR.PICTO_FLOOR_SQUARE_MM, 10, 'PICTO_FLOOR_SQUARE_MM must be exported and equal the GB-CLP 10mm red-square-side floor');
assert.strictEqual(LR.PICTO_TARGET_OUTER_BBOX_MM, 16, 'PICTO_TARGET_OUTER_BBOX_MM must be exported and equal the 16mm "if possible" OUTER BOUNDING BOX target');
assert(Math.abs(LR.PICTO_TARGET_SQUARE_MM - LR.pictoSquareSideFromBoundingBoxMm(16)) < 1e-9, `PICTO_TARGET_SQUARE_MM must equal the red-square-side equivalent of the 16mm outer-bounding-box target (~${LR.pictoSquareSideFromBoundingBoxMm(16).toFixed(4)}mm), got ${LR.PICTO_TARGET_SQUARE_MM}`);

function candleFixture(overrides){
  return Object.assign({
    scentName:'Symbol Sizing Check', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
    shape:'rectangle', size:'custom', customW:57, customH:99,
    bizAddress:'123 Test Street, Testville', bizPhone:'01234 567890', bizWebsite:'test.com', netWeight:'220g', batchNum:'B001', burnTime:'20 hrs',
    signal:'Warning', hStatements:'H315', pStatements:'P302+P352',
    sensitisers:[], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  }, overrides || {});
}
function nonCandleFixture(overrides){
  return Object.assign({
    scentName:'GHS Geometry Check', productType:'Soap', bizName:'Crafty Mouse Gifts',
    shape:'rectangle', size:'custom', customW:57, customH:99,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001',
    signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:true, labelLang:'en',
  }, overrides || {});
}

// Reads the actual rendered GHS pictogram <image> geometry from the real
// SVG and derives BOTH distinct measurements from it independently (not
// trusting metrics.* alone): the outer axis-aligned bounding box directly
// from the element's own width/height attribute, and the red square's own
// side/area via the inverse of the sqrt(2) relationship -- exactly the
// real-geometry proof Michaela asked for.
function measureGhsFromSvg(svg, mmW){
  const m = svg.match(/<image href="data:image\/jpeg[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  if(!m) return null;
  const pxPerMm = 260 / mmW;
  const outerBoundingBoxMm = Number(m[4]) / pxPerMm;
  const squareSideMm = outerBoundingBoxMm / Math.SQRT2;
  const squareAreaMm2 = squareSideMm * squareSideMm;
  return { outerBoundingBoxMm, squareSideMm, squareAreaMm2 };
}

// Reads the actual rendered <image> geometry of the FIRST candle-safety
// icon in the SVG, identified via the renderer's own preceding "EN 15494"
// comment so this can never accidentally match the GHS pictogram or any
// other asset, then converts it through the label's own canonical
// px-per-mm ratio (260/mmW -- see getLabelDims(), pw is always 260
// canonical units regardless of physical mm size).
function measureBcfSvgHeightMm(svg, mmW){
  const m = svg.match(/<!-- EN 15494[\s\S]*?<image href="data:image\/jpeg[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  if(!m) return null;
  const pxPerMm = 260 / mmW;
  return Number(m[4]) / pxPerMm;
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ══════════════════════════════════════════════════════════════════
  // (A) GHS PICTOGRAM RED-SQUARE GEOMETRY
  // ══════════════════════════════════════════════════════════════════

  // ── A1. At the 10mm-square floor, the ACTUAL red square (not the
  //        rotated outer bounding box) has side >=10mm and area
  //        >=100mm^2 -- the exact regulatory requirement, measured from
  //        real rendered SVG geometry, both preview and export ─────────
  {
    const data = nonCandleFixture({ customW:57, customH:99 });
    for(const forExport of [false, true]){
      const overrideMm = LR.pictoOuterBoundingBoxMm(LR.PICTO_FLOOR_SQUARE_MM);
      const result = LR.renderLabel(data, { instanceId:`ghs-floor-${forExport}`, forExport, _pictoMmOverride: overrideMm });
      const geo = measureGhsFromSvg(result.svg, data.customW);
      assert(geo, `${forExport?'export':'preview'}: expected a rendered GHS pictogram <image> element`);
      assert(geo.squareSideMm >= 9.999, `${forExport?'export':'preview'}: red-square side must be >=10mm, measured ${geo.squareSideMm.toFixed(3)}mm from real SVG geometry`);
      assert(geo.squareAreaMm2 >= 99.98, `${forExport?'export':'preview'}: red-square area must be >=100mm^2, measured ${geo.squareAreaMm2.toFixed(2)}mm^2 from real SVG geometry`);
      // Outer bounding box reported SEPARATELY -- must be ~side*sqrt(2)
      // (~14.14mm at the 10mm-square floor), never conflated with the
      // square side itself.
      assert(Math.abs(geo.outerBoundingBoxMm - geo.squareSideMm * Math.SQRT2) < 0.01, `${forExport?'export':'preview'}: outer bounding box (${geo.outerBoundingBoxMm.toFixed(3)}mm) must equal square side * sqrt(2)`);
      assert(geo.outerBoundingBoxMm > 14.0 && geo.outerBoundingBoxMm < 14.3, `${forExport?'export':'preview'}: at the 10mm-square floor the rotated outer bounding box must be approximately 14.14mm (allowing for real stroke/image geometry), got ${geo.outerBoundingBoxMm.toFixed(3)}mm`);
      // Cross-check against LabelRenderer's own reported metrics -- the
      // rendered pixel size is Math.ceil()'d up to a whole canonical pixel
      // (see minPictoSz in renderLabel()), so the real SVG geometry is
      // always >= the exact requested metrics value, by at most one
      // rounded-up pixel's worth (never smaller -- rounding can only help
      // compliance here, never hurt it). Tolerance is intentionally a bit
      // looser than a pure floating-point epsilon to account for that.
      assert(geo.squareSideMm >= result.metrics.pictoSquareSideMm - 0.01, `${forExport?'export':'preview'}: real-SVG square side (${geo.squareSideMm.toFixed(3)}mm) must never be smaller than metrics.pictoSquareSideMm (${result.metrics.pictoSquareSideMm})`);
      assert(geo.squareSideMm - result.metrics.pictoSquareSideMm < 0.2, `${forExport?'export':'preview'}: real-SVG square side (${geo.squareSideMm.toFixed(3)}mm) drifted too far above metrics.pictoSquareSideMm (${result.metrics.pictoSquareSideMm}) -- more than one rounded pixel's worth`);
      assert(geo.squareAreaMm2 >= result.metrics.pictoSquareAreaMm2 - 0.5, `${forExport?'export':'preview'}: real-SVG square area (${geo.squareAreaMm2.toFixed(2)}mm^2) must never be smaller than metrics.pictoSquareAreaMm2 (${result.metrics.pictoSquareAreaMm2})`);
      assert(geo.outerBoundingBoxMm >= result.metrics.pictoOuterBoundingBoxMm - 0.01, `${forExport?'export':'preview'}: real-SVG outer bounding box (${geo.outerBoundingBoxMm.toFixed(3)}mm) must never be smaller than metrics.pictoOuterBoundingBoxMm (${result.metrics.pictoOuterBoundingBoxMm})`);
    }
    ok('at the 10mm-square GB-CLP floor, the actual red-bordered square (not the rotated outer bounding box) measures >=10mm side / >=100mm^2 area in both preview and export SVG geometry, with the ~14.14mm outer bounding box reported as a distinct, separate measurement');
  }

  // ── A2. The preferred 16mm target is an OUTER BOUNDING BOX, not a second
  //        red-square side -- its red-square-side equivalent (~11.3137mm,
  //        ~128.06mm^2) remains comfortably compliant, verified from real
  //        geometry in both routes ────────────────────────────────────
  {
    const data = nonCandleFixture({ customW:57, customH:99 });
    for(const forExport of [false, true]){
      const overrideMm = LR.pictoOuterBoundingBoxMm(LR.PICTO_TARGET_SQUARE_MM);
      const result = LR.renderLabel(data, { instanceId:`ghs-target-${forExport}`, forExport, _pictoMmOverride: overrideMm });
      const geo = measureGhsFromSvg(result.svg, data.customW);
      assert(geo.outerBoundingBoxMm >= 15.99, `${forExport?'export':'preview'}: 16mm target outer bounding box must be >=16mm, got ${geo.outerBoundingBoxMm.toFixed(3)}mm`);
      assert(geo.squareSideMm >= 11.30, `${forExport?'export':'preview'}: 16mm-bbox target's red-square side must be >=~11.3137mm, got ${geo.squareSideMm.toFixed(3)}mm`);
      assert(geo.squareAreaMm2 >= 127.5, `${forExport?'export':'preview'}: 16mm-bbox target's red-square area must be >=~128.06mm^2, got ${geo.squareAreaMm2.toFixed(2)}mm^2 -- comfortably compliant, well above the 100mm^2 legal floor`);
    }
    ok('the preferred 16mm OUTER BOUNDING BOX target (NOT a second red-square side) yields a red square with ~11.3137mm side / ~128.06mm^2 area -- comfortably GB-CLP compliant, verified from real SVG geometry in both preview and export');
  }

  // ── A3. The top-level search (no override -- what every real label
  //        actually uses) never returns a square side below the floor or
  //        above the target, and preview vs export choose IDENTICAL
  //        geometry for the same label (one shared renderer, no drift) ──
  {
    const data = nonCandleFixture({ customW:57, customH:99 });
    const preview = LR.renderLabel(data, { instanceId:'ghs-search-preview', forExport:false });
    const exportR = LR.renderLabel(data, { instanceId:'ghs-search-export', forExport:true });
    for(const [label, r] of [['preview', preview], ['export', exportR]]){
      assert(r.metrics.pictoSquareSideMm >= LR.PICTO_FLOOR_SQUARE_MM - 1e-9 && r.metrics.pictoSquareSideMm <= LR.PICTO_TARGET_SQUARE_MM + 1e-9, `${label}: chosen red-square side ${r.metrics.pictoSquareSideMm}mm must stay within [${LR.PICTO_FLOOR_SQUARE_MM},${LR.PICTO_TARGET_SQUARE_MM}]mm`);
      const geo = measureGhsFromSvg(r.svg, data.customW);
      assert(geo.squareAreaMm2 >= 99.98, `${label}: even the search's own chosen size must clear the 100mm^2 legal minimum, got ${geo.squareAreaMm2.toFixed(2)}mm^2`);
    }
    assert.strictEqual(preview.metrics.pictoSquareSideMm, exportR.metrics.pictoSquareSideMm, 'Composer preview and export must choose the identical red-square side for the same label (one shared renderer)');
    assert.strictEqual(preview.metrics.pictoOuterBoundingBoxMm, exportR.metrics.pictoOuterBoundingBoxMm, 'Composer preview and export must render the identical outer bounding box for the same label');
    ok(`the real (non-overridden) size search never picks a red-square side outside [${LR.PICTO_FLOOR_SQUARE_MM},${LR.PICTO_TARGET_SQUARE_MM.toFixed(4)}]mm, always clears the 100mm^2 minimum, and preview/export agree exactly on the same label -- confirming every output route (Composer preview, browser Print/PDF, PNG) shares this one geometry`);
  }

  // ══════════════════════════════════════════════════════════════════
  // (B) CANDLE-SAFETY (BS EN 15494:2019) ICON ROW SIZING
  // ══════════════════════════════════════════════════════════════════

  // ── B1. The label sizes Michaela named explicitly now fit, with icons
  //        >=5mm, nothing clipped/overlapping, verified from real SVG
  //        geometry in both preview and export. 63x44mm (second pass) is
  //        this file's own candleFixture() default content unmodified --
  //        a single H-code/P-code, no sensitisers -- i.e. a genuinely
  //        simple/minimal Scented Candle at this historically sensitive
  //        size, proving the FOOTER LAYOUT itself can now hold the floor
  //        here, not merely that a stripped-down fixture can dodge it. ──
  {
    const targets = [
      { label:'EU30009 registry template (99.1x57.3mm)', w:99.1, h:57.3, shape:'rectangle' },
      { label:'63mm circle candle', w:63, h:63, shape:'circle' },
      { label:'63x44mm rectangle candle, simple content', w:63, h:44, shape:'rectangle' },
    ];
    for(const t of targets){
      for(const forExport of [false, true]){
        const data = candleFixture({ customW:t.w, customH:t.h, shape:t.shape });
        const result = LR.renderLabel(data, { instanceId:`bcf-${t.w}x${t.h}-${forExport}`, forExport });
        assert.strictEqual(result.metrics.bcfTooSmall, false, `${t.label} (${forExport?'export':'preview'}): must fit the candle-safety icon row after the footer redesign`);
        assert.strictEqual(result.metrics.footerClipped, false, `${t.label} (${forExport?'export':'preview'}): footer/regulatory text must not be clipped`);
        const svgMm = measureBcfSvgHeightMm(result.svg, t.w);
        assert(svgMm !== null, `${t.label} (${forExport?'export':'preview'}): expected a rendered candle-safety icon`);
        assert(svgMm >= 4.95, `${t.label} (${forExport?'export':'preview'}): candle-safety icon must be >=5mm, measured ${svgMm.toFixed(3)}mm from real SVG geometry`);
        assert.strictEqual(result.fits, true, `${t.label} (${forExport?'export':'preview'}): the whole label must report fits:true once icons and text both fit -- got warnings ${JSON.stringify(result.warnings)}`);
      }
    }
    ok('EU30009 (99.1x57.3mm), 63mm circle, and (second pass) a simple-content 63x44mm rectangle candle label all now hold the 5mm candle-safety icon row without clipping the footer text, in both preview and export SVG geometry');
  }

  // ── B2. Wherever the icon row IS shown more broadly, it is never below
  //        the 5mm floor, across further representative sizes ─────────
  {
    const sizes = [[73,73], [80,80], [100,100], [120,120], [150,150], [57,99], [100,60]];
    let renderedCount = 0;
    for(const [mmW, mmH] of sizes){
      const data = candleFixture({ customW:mmW, customH:mmH });
      const result = LR.renderLabel(data, { instanceId:`bcf-${mmW}x${mmH}`, forExport:true });
      assert.strictEqual(result.metrics.bcfTooSmall, false, `${mmW}x${mmH}mm was expected to fit the candle-safety icon row after the footer redesign (test fixture assumption) -- got bcfTooSmall:true`);
      const svgMm = measureBcfSvgHeightMm(result.svg, mmW);
      assert(svgMm !== null, `${mmW}x${mmH}mm: expected a rendered EN15494 icon <image> element when bcfTooSmall is false`);
      assert(svgMm >= 4.95, `${mmW}x${mmH}mm: candle-safety icon rendered at ${svgMm.toFixed(3)}mm (real SVG geometry), below the 5mm BS EN 15494:2019 floor`);
      assert(Math.abs(svgMm - result.metrics.bcfSizeMm) < 0.05, `${mmW}x${mmH}mm: rendered SVG geometry (${svgMm.toFixed(3)}mm) must match metrics.bcfSizeMm (${result.metrics.bcfSizeMm}) within toFixed(1) rounding`);
      renderedCount++;
    }
    assert(renderedCount === sizes.length, 'sanity check: every fixture size in this block must actually render an icon row, or the assertions above are vacuous');
    ok('candle-safety icons never render below the 5mm physical floor, verified from real SVG geometry across representative label sizes (including sizes that only became fittable after the footer redesign)');
  }

  // ── B3. Genuinely impossible labels still fail CLOSED with the
  //       specific warning, never a silent under-floor shrink -- the
  //       floor itself (5mm) was NOT lowered, only the footer budget
  //       around it was redesigned ──────────────────────────────────
  //
  // 45x45mm square was previously listed here as still-impossible, but
  // the second-pass footer-budget fix (BCF_FOOTER_SHARE_CAP 0.66 -> 0.85,
  // driven by 63x44mm's own genuine ~4.01mm shortfall) is a single shared
  // formula, not a per-size carve-out: 45mm is geometrically EASIER to
  // satisfy than 63x44mm's 44mm height (a square keeps the full canonical
  // footer-band height regardless of its physical size, where a wide-short
  // rectangle's canonical footer band shrinks with its aspect ratio), so
  // any fix that clears 63x44mm's shortfall necessarily also clears
  // 45x45mm's smaller one -- confirmed directly below, not silently
  // dropped. 40x40mm and a 150x40mm strip remain genuinely below the
  // floor even after this fix and are unaffected.
  {
    const tooSmallSizes = [[40,40], [150,40]];
    for(const [mmW, mmH] of tooSmallSizes){
      const data = candleFixture({ customW:mmW, customH:mmH });
      const result = LR.renderLabel(data, { instanceId:`bcf-toosmall-${mmW}x${mmH}`, forExport:true });
      assert.strictEqual(result.metrics.bcfTooSmall, true, `${mmW}x${mmH}mm was expected to still be flagged bcfTooSmall (genuinely impossible even after the footer redesign)`);
      assert.strictEqual(result.fits, false, `${mmW}x${mmH}mm: a bcfTooSmall label must not be reported as fits:true`);
      assert(result.warnings.includes('candle-safety-symbols-too-small'), `${mmW}x${mmH}mm: warnings must include the specific candle-safety-symbols-too-small warning so print.html can block export and explain why`);
      const svgMm = measureBcfSvgHeightMm(result.svg, mmW);
      assert.strictEqual(svgMm, null, `${mmW}x${mmH}mm: a bcfTooSmall label must not render any candle-safety icon at all (no silent under-floor shrink)`);
    }
    ok('labels genuinely too small to hold the 5mm floor (even after the footer redesign) still fail closed: export blocked via fits:false + the specific candle-safety-symbols-too-small warning, no undersized icon rendered');
  }

  // ── B3b. 45x45mm square: a direct, disclosed consequence of fixing
  //        63x44mm's shortfall -- now genuinely holds the 5mm floor too,
  //        proven the same way as B1/B2 rather than silently dropped. ──
  {
    const data = candleFixture({ customW:45, customH:45, shape:'square' });
    const result = LR.renderLabel(data, { instanceId:'bcf-45x45-now-fits', forExport:true });
    assert.strictEqual(result.metrics.bcfTooSmall, false, '45x45mm square: a direct consequence of the 63x44mm footer-budget fix is that this now also holds the 5mm floor -- got bcfTooSmall:true');
    assert.strictEqual(result.metrics.footerClipped, false, '45x45mm square: footer/regulatory text must not be clipped');
    const svgMm = measureBcfSvgHeightMm(result.svg, 45);
    assert(svgMm !== null && svgMm >= 4.95, `45x45mm square: candle-safety icon must be >=5mm, measured ${svgMm}mm from real SVG geometry`);
    assert.strictEqual(result.fits, true, `45x45mm square must now report fits:true -- got warnings ${JSON.stringify(result.warnings)}`);
    ok('45x45mm square now holds the 5mm candle-safety floor too -- an unavoidable, correct side effect of fixing 63x44mm\'s shortfall, not a separate change');
  }

  // ── B3c. The dense scented-candle 63x44mm fixture (the one
  //        tests/builder-regression.js exercises in full) stays blocked
  //        after this footer-budget fix -- proving the fix corrects the
  //        genuine layout defect without forcing dense/regulated content
  //        to pass. It still fails for its hazard-text-overflow reason
  //        (unaffected by this footer-only change); the candle-safety row
  //        itself now fits even on this fixture, which is exactly the
  //        intended, narrowly-scoped effect. ─────────────────────────
  {
    const dense = candleFixture({
      customW:63, customH:44, shape:'rectangle',
      hStatements:'H317, H411', pStatements:'P102, P273',
      sensitisers:['Geraniol','Linalool'],
    });
    const result = LR.renderLabel(dense, { instanceId:'bcf-dense-63x44-still-blocked', forExport:true });
    assert.strictEqual(result.fits, false, 'the dense 63x44mm scented-candle fixture must still fail to fit after the footer-budget fix -- it must never be forced to pass by shrinking regulated content');
    assert(result.warnings.includes('hazard-text-overflow'), `dense 63x44mm fixture must still report hazard-text-overflow -- got warnings ${JSON.stringify(result.warnings)}`);
    ok('the dense 63x44mm scented-candle fixture still fails to fit after the footer-budget fix (hazard-text-overflow) -- the fix corrects the genuine footer-layout defect without forcing dense/regulated content to pass');
  }

  // ── B4. A comfortably large label grows the icons toward their target
  //       size, not just to the bare floor ──────────────────────────
  {
    const data = candleFixture({ customW:150, customH:150 });
    const result = LR.renderLabel(data, { instanceId:'bcf-comfortable', forExport:true });
    assert.strictEqual(result.metrics.bcfTooSmall, false, '150x150mm must comfortably fit the candle-safety icon row');
    const svgMm = measureBcfSvgHeightMm(result.svg, 150);
    assert(svgMm > 5.5, `a comfortably large label should render icons above the 5mm floor (target 8mm for the >50mm tier), got ${svgMm.toFixed(3)}mm`);
    ok('a comfortably large candle label renders candle-safety icons above the bare 5mm floor, growing toward its target size');
  }

  // ── B5. hideEN15494 still fully suppresses the row (unrelated toggle,
  //       must keep working exactly as before this fix) ──────────────
  {
    const data = candleFixture({ customW:150, customH:150, hideEN15494:true });
    const result = LR.renderLabel(data, { instanceId:'bcf-hidden', forExport:true });
    assert.strictEqual(result.metrics.bcfSizeMm, null, 'hideEN15494:true must suppress the candle-safety icon row (metrics.bcfSizeMm must be null)');
    assert.strictEqual(result.metrics.bcfTooSmall, false, 'hideEN15494:true is a deliberate suppression, not a fit failure -- bcfTooSmall must stay false');
    const svgMm = measureBcfSvgHeightMm(result.svg, 150);
    assert.strictEqual(svgMm, null, 'hideEN15494:true must not render any EN15494 icon image');
    ok('hideEN15494 still fully suppresses the candle-safety icon row, unaffected by the sizing/footer fix');
  }

  // ── B6. Preview and export agree exactly on the same candle label
  //       (one shared renderer, no per-route drift) ───────────────────
  {
    const data = candleFixture({ customW:99.1, customH:57.3, shape:'rectangle' });
    const preview = LR.renderLabel(data, { instanceId:'bcf-parity-preview', forExport:false });
    const exportR = LR.renderLabel(data, { instanceId:'bcf-parity-export', forExport:true });
    assert.strictEqual(preview.metrics.bcfSizeMm, exportR.metrics.bcfSizeMm, 'Composer preview and export must choose the identical candle-safety icon mm size for the same label');
    assert.strictEqual(preview.metrics.bcfTooSmall, exportR.metrics.bcfTooSmall, 'Composer preview and export must agree on bcfTooSmall for the same label');
    ok('Composer preview and export choose identical candle-safety icon geometry for the same label -- confirming every output route shares this one renderer');
  }

  console.log(`\nAll ${passed} correction-batch-symbol-sizing.js checks passed.`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
