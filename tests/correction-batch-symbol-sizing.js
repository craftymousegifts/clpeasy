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

  // ── B1. The label sizes Michaela named explicitly: icons hold >=5mm,
  //        nothing clipped/overlapping/silently shrunk, verified from real
  //        SVG geometry in both preview and export. 63x44mm uses this
  //        file's own candleFixture() default content unmodified -- a
  //        single H-code/P-code, no sensitisers -- i.e. a genuinely
  //        simple/minimal Scented Candle at this historically sensitive
  //        size. ──
  {
    // Regression-fix note (2026-09-06, Michaela's manual review of Preview
    // #105): fixing the footer text legibility floor (label-render.js's
    // _mandatoryMinFS, now the same genuine physical x-height standard
    // hazard text already used, replacing the previous unrelated and more
    // lenient minFooterFS-based floor) revealed a REAL, previously-hidden
    // constraint: candleFixture()'s default footer content includes
    // bizAddress + bizPhone + a combined "netWeight · Burn: Xhrs ·
    // Batch: Y" detail line -- three footer rows. On a 63mm CIRCLE
    // specifically, the bottom-most row sits where the circle's chord has
    // narrowed sharply near the shape's edge, and the full 3-part detail
    // line genuinely cannot fit there at the legal floor.
    //
    // Correction (read-only impact assessment, 2026-09, Michaela's
    // decision): the floor above was itself corrected a second time --
    // `1.2 * _pxPerMm` only ever delivered ~0.6mm of REAL x-height (DM
    // Sans's real x-height is ~51.6% of declared font-size), not the
    // genuine 1.2mm intended. With the floor now corrected to a genuinely
    // measured 1.2mm, the 63x44mm rectangle case ALSO stops fitting -- on
    // the mid-body hazard/precautionary block, which at this label's
    // reduced height cannot hold even a single H-statement + P-statement
    // at the corrected floor once the candle-safety icon row and the
    // 3-row footer have taken their share of the 44mm height (footer text
    // was believed to still fit at the time this note was written --
    // see the follow-up correction below, once the vertical-overlap fix
    // proved that belief itself was wrong). `fits` is therefore no longer
    // simply the inverse of `footerClippedExpected` -- each target now
    // states its own expected overall outcome (fitsExpected) alongside
    // its footer-specific one, rather than assuming the two always match.
    // This is exactly the "fail closed and tell the user to select a
    // larger label" behaviour Michaela's fix requires -- not a bug in the
    // fix -- so expectations are corrected here to match the newly-
    // established true boundary, rather than weakening the legibility
    // floor to keep an old (incorrect) expectation passing. The
    // candle-safety ICON sizing this block also exists to test is
    // completely unaffected either way (icons never derive from
    // _mandatoryMinFS/_minLegibleFS at all -- they use the independent
    // BCF_FLOOR_MM geometry check).
    // Correction (2026-09-07, Michaela's fail-closed footer-overlap fix):
    // the EU30009 target below used to assert footerClippedExpected:false/
    // fitsExpected:true. That was wrong -- it was only ever checked for
    // HORIZONTAL (width) footer clipping, never vertical overlap between
    // this fixture's 3 footer rows (address+phone+detail). Once
    // renderLabel() was fixed to also detect a footer row's actual font
    // size overflowing back out of its own row (the same >=120%-
    // equivalent spacing every other mandatory text block on this label
    // already requires), EU30009 with this exact 3-row footer content
    // correctly reports footer-clipped/fits:false -- confirmed this is a
    // genuine, aspect-ratio-driven boundary, not a search bug: no size
    // sharing EU30009's own 99.1x57.3 (~0.578) aspect ratio fits this
    // content up to the renderer's 150mm ceiling either (verified via
    // LabelRenderer.findSmallestFittingSize(), which returns null here).
    // The candle-safety ICON sizing this block exists to test is
    // completely unaffected (bcfTooSmall stays false, icons still hold
    // their 5mm floor below) -- only the mandatory footer TEXT is what
    // now correctly fails closed instead of silently overlapping.
    //
    // Correction #2 (2026-09-07, Michaela's "diagnose before editing
    // expectations" instruction): the SAME vertical-overlap fix also
    // exposed that the 63x44mm target below (this file's own default
    // candleFixture() content -- address+phone+website+netWeight+batchNum+
    // burnTime, i.e. every field candleFixture() sets) was NEVER actually
    // fitting its footer at footerClippedExpected:false -- it only looked
    // that way because the same silent-overlap bug this whole correction
    // fixes was hiding it. Before touching this expectation, real
    // Chromium rendering + getBBox() measurement (not estimation) proved
    // all three footer rows ("123 Test Street, Testville" / "01234
    // 567890" / "220g (middle dot) Burn: 20 hrs (middle dot) Batch: B001")
    // genuinely overlap pairwise on real rendered geometry. A full floor-
    // by-floor accounting of the footer band at this exact size then
    // proved this is a genuine, large structural shortfall, not a
    // misordered allocation: the candle-safety icon row is already pinned
    // at its absolute 5mm legal floor (27.9 canonical px reserved), the
    // 3-line footer text is already pinned at its absolute 1.2mm-x-height/
    // ~122%-line-spacing floor (35.1 canonical px needed), and the two
    // together need ~65.0 canonical px against a footer band (botH) of
    // only 33.8 canonical px at 63x44mm -- a ~31px (~7.6mm) shortfall,
    // roughly half this label's entire 44mm height, with neither
    // component able to yield any further without dropping below a legal
    // floor. This fixture also independently fails hazard-text-overflow
    // in the mid-body block, its own separate large deficit -- this is a
    // genuinely content-overloaded 63x44mm label, not a layout defect.
    // footerClippedExpected corrected from false to true to match this
    // proven, real boundary (fitsExpected is unchanged at false, already
    // correct for the hazard-text-overflow reason alone).
    const targets = [
      { label:'EU30009 registry template (99.1x57.3mm)', w:99.1, h:57.3, shape:'rectangle', footerClippedExpected:true, fitsExpected:false },
      { label:'63mm circle candle (full address+phone+netWeight+burnTime+batch footer content)', w:63, h:63, shape:'circle', footerClippedExpected:true, fitsExpected:false },
      { label:'63x44mm rectangle candle, full candleFixture() footer content', w:63, h:44, shape:'rectangle', footerClippedExpected:true, fitsExpected:false },
    ];
    for(const t of targets){
      for(const forExport of [false, true]){
        const data = candleFixture({ customW:t.w, customH:t.h, shape:t.shape });
        const result = LR.renderLabel(data, { instanceId:`bcf-${t.w}x${t.h}-${forExport}`, forExport });
        assert.strictEqual(result.metrics.bcfTooSmall, false, `${t.label} (${forExport?'export':'preview'}): must fit the candle-safety icon row after the footer redesign`);
        assert.strictEqual(result.metrics.footerClipped, t.footerClippedExpected, `${t.label} (${forExport?'export':'preview'}): footer/regulatory text clipped-state must match the genuine 1.2mm-floor result`);
        const svgMm = measureBcfSvgHeightMm(result.svg, t.w);
        assert(svgMm !== null, `${t.label} (${forExport?'export':'preview'}): expected a rendered candle-safety icon`);
        assert(svgMm >= 4.95, `${t.label} (${forExport?'export':'preview'}): candle-safety icon must be >=5mm, measured ${svgMm.toFixed(3)}mm from real SVG geometry`);
        assert.strictEqual(result.fits, t.fitsExpected, `${t.label} (${forExport?'export':'preview'}): the whole label's fits flag must match the genuine 1.2mm-floor result -- got warnings ${JSON.stringify(result.warnings)}`);
        if(!t.fitsExpected && !t.footerClippedExpected){
          // When this target is blocked for a reason OTHER than the
          // footer, name it explicitly so this test can't silently start
          // passing for the wrong reason (e.g. an unrelated regression).
          assert(result.warnings.includes('hazard-text-overflow'), `${t.label} (${forExport?'export':'preview'}): expected to be blocked specifically by hazard-text-overflow (the mid-body H/P block, not the footer) -- got warnings ${JSON.stringify(result.warnings)}`);
        }
      }
    }
    ok('EU30009 (99.1x57.3mm) holds the 5mm candle-safety icon row but correctly fails closed on its own 3-row footer text (address+phone+detail) once vertical overlap is detected, not just width -- and no size at EU30009\'s own aspect ratio fixes it up to 150mm; a 63mm circle with full footer content correctly fails closed on the footer text alone (icons still fit); the dense 63x44mm rectangle carrying every candleFixture() field -- CLPeasy\'s own smallest rectangle preset -- now correctly fails closed on BOTH its 3-row footer text (a genuine, proven ~7.6mm shortfall even with icons and text already at their absolute floors) and the mid-body hazard text, rather than silently overlapping either')
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

  // ── B3. The bcfTooSmall fail-closed path itself is still intact -- the
  //       floor (5mm) was NOT lowered, only the decorative row-height
  //       buffer around it was redesigned a second time ─────────────────
  //
  // Correction (2026-09-08, Michaela's explicit BCF_ROW_HEIGHT_RATIO
  // decision, 1.35 -> 1.15): 40x40mm and a 150x40mm strip were previously
  // listed here as still genuinely bcfTooSmall. Re-verified directly
  // against the real renderer after the buffer cut: both now hold the
  // floor (bcfSizeMm:5, bcfTooSmall:false, icon actually rendered) --
  // the same predictable, single-shared-formula consequence already
  // documented above for 45x45mm, just carried one step further. A
  // direct sweep of every combination of {40,41,42,45,50}mm x
  // {40,45,50,150}mm (the full width x height grid at and above the
  // _showBCF >=40mm gate) found NO remaining size where bcfTooSmall
  // fires -- so there is currently no genuine real-content example of
  // this state inside the candle-icon-eligible domain to assert against,
  // and asserting one anyway would misrepresent the real boundary. The
  // bcfTooSmall code path itself (label-render.js's _bcfTooSmall flag,
  // the 'candle-safety-symbols-too-small' warning, and the "never render
  // an undersized icon" behaviour) is untouched and still there as a
  // fail-closed fallback; it simply has no reachable trigger among
  // currently supported candle sizes/shapes after this fix. Both
  // sizes are folded into the "icons hold the floor" assertions below
  // instead of the old "still blocked" ones.
  {
    const nowFitSizes = [[40,40], [150,40]];
    for(const [mmW, mmH] of nowFitSizes){
      const data = candleFixture({ customW:mmW, customH:mmH });
      const result = LR.renderLabel(data, { instanceId:`bcf-nowfits-${mmW}x${mmH}`, forExport:true });
      assert.strictEqual(result.metrics.bcfTooSmall, false, `${mmW}x${mmH}mm: expected to now hold the 5mm candle-safety icon floor after the BCF_ROW_HEIGHT_RATIO 1.35->1.15 reduction -- got bcfTooSmall:true`);
      assert(Math.abs(result.metrics.bcfSizeMm - 5) < 1e-6, `${mmW}x${mmH}mm: icon must sit exactly at its 5mm floor here (never below, and this fixture leaves no room to grow above it), got ${result.metrics.bcfSizeMm}mm`);
      const svgMm = measureBcfSvgHeightMm(result.svg, mmW);
      assert(svgMm !== null, `${mmW}x${mmH}mm: expected a rendered candle-safety icon now that bcfTooSmall is false`);
      assert(svgMm >= 4.95, `${mmW}x${mmH}mm: candle-safety icon rendered at ${svgMm.toFixed(3)}mm (real SVG geometry), below the 5mm BS EN 15494:2019 floor`);
    }
    ok('40x40mm and a 150x40mm strip -- previously genuinely too small for the candle-safety icon row -- now correctly hold the 5mm floor after the BCF_ROW_HEIGHT_RATIO buffer reduction (Michaela\'s 63mm-circle decision), verified from real SVG geometry; a direct sweep across the {40-50}x{40-150}mm grid found no remaining candle-icon-eligible size where bcfTooSmall still fires, so no false "still blocked" case is asserted, while the fail-closed bcfTooSmall code path itself remains unchanged and in place')
  }

  // ── B3b. 45x45mm square: the candle-safety ICON row genuinely holds the
  //        5mm floor -- a direct, disclosed consequence of fixing
  //        63x44mm's icon-row shortfall -- proven the same way as B1/B2
  //        rather than silently dropped. The label's TEXT content is a
  //        separate question (see correction below): at this size, with
  //        candleFixture()'s full address+phone+netWeight+burnTime+batch
  //        footer, both the footer and the mid-body hazard text now
  //        correctly fail closed at the genuine x-height floor -- so this
  //        label overall still reports fits:false, for reasons entirely
  //        unrelated to (and unaffected by) the icon-row fix this block
  //        exists to prove. ──
  {
    // Correction (read-only impact assessment, 2026-09, Michaela's
    // decision): this block originally also asserted footerClipped:false
    // and fits:true, written when the mandatory-text floor was still the
    // unfixed `1.2 * _pxPerMm` (~0.6mm real x-height). At the genuinely
    // corrected 1.2mm floor, candleFixture()'s full 3-row footer content
    // no longer fits in a 45mm square, and neither does its hazard text
    // -- both now correctly fail closed rather than silently rendering
    // below the standard. This is the intended, disclosed effect of the
    // floor correction (see the B1 block above for the identical finding
    // at 63x44mm) -- it does not touch BCF_FLOOR_MM or this icon row's
    // own geometry, which is exactly what this test still confirms below.
    const data = candleFixture({ customW:45, customH:45, shape:'square' });
    const result = LR.renderLabel(data, { instanceId:'bcf-45x45-now-fits', forExport:true });
    assert.strictEqual(result.metrics.bcfTooSmall, false, '45x45mm square: a direct consequence of the 63x44mm footer-budget fix is that the candle-safety ICON row now also holds the 5mm floor -- got bcfTooSmall:true');
    assert.strictEqual(result.metrics.footerClipped, true, '45x45mm square: candleFixture()\'s full 3-row footer content genuinely does not fit at the corrected genuine 1.2mm x-height floor -- expected footerClipped:true');
    const svgMm = measureBcfSvgHeightMm(result.svg, 45);
    assert(svgMm !== null && svgMm >= 4.95, `45x45mm square: candle-safety icon must be >=5mm, measured ${svgMm}mm from real SVG geometry`);
    assert.strictEqual(result.fits, false, `45x45mm square: the label overall is still expected to fail closed (footer and hazard text both overflow the genuine floor here) -- got warnings ${JSON.stringify(result.warnings)}`);
    assert(result.warnings.includes('footer-clipped') && result.warnings.includes('hazard-text-overflow'), `45x45mm square: expected both footer-clipped and hazard-text-overflow -- got warnings ${JSON.stringify(result.warnings)}`);
    ok('45x45mm square now holds the 5mm candle-safety ICON floor too -- an unavoidable, correct side effect of fixing 63x44mm\'s icon-row shortfall -- but candleFixture()\'s full footer content and hazard text both correctly fail closed at the genuine 1.2mm x-height floor, so the label still reports fits:false overall for reasons unrelated to the icon row');
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
