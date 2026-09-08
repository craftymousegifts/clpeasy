// Fail-closed design (2026-09-07, Michaela's decision): CLPeasy does not
// compact, reorder or shrink its way around content that genuinely doesn't
// fit the genuine 1.2mm x-height / >=120% mandatory line-spacing / 2mm edge
// margin / 10mm GHS / 5mm candle-safety floors. When content can't fit, the
// size stays selectable, the full preview still renders, the label is
// marked not-fitting, every export path is blocked, the specific failing
// category is named, and -- the one new piece of behaviour this file
// covers -- LabelRenderer.findSmallestFittingSize() is asked, and only ever
// asked, "what size WOULD genuinely pass this exact content through the
// real renderer" (never a guess, never applied automatically).
//
// This file asserts:
//  1. The three retained floors/margins/spacing rules are still exactly
//     what they were declared to be (a source-text regression guard, since
//     none of hLH/sLH/pLH/scentLH/_edgeMargin are part of the public
//     metrics contract).
//  2. Footer content keeps its logical address -> phone -> detail order.
//  3. findSmallestFittingSize() genuinely works: it returns a size that
//     really fits when verified through renderLabel() again, it never
//     recommends going below CLPeasy's own 52mm minimum, and it correctly
//     returns null (rather than a false recommendation) for content that
//     cannot fit at any supported size.
//  4. A boundary sweep across the specific sizes Michaela named -- 52/63/
//     75mm circles; 63x44, 76x51, 99x67 and EU30009 (99.1x57.3) rectangles;
//     60x60 and 75x75 squares -- classifying each as fits or genuinely-
//     blocked, with every floor checked directly in the metrics on every
//     single render, never just on the ones that pass.
// Run from the repo root: node tests/fail-closed-size-boundaries.js
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
const { window } = dom;
const LR = window.LabelRenderer;

let n = 0;
function ok(msg){ n++; console.log(`  ok ${n} - ${msg}`); }

try {
  // ── 1. Source-text regression guards: the retained floors/margin/spacing
  //    are still exactly what Michaela's fail-closed decision requires.
  //    These read the real file, not a copy, so a future edit that weakens
  //    any of them fails this test immediately. ─────────────────────────
  {
    const hazardLH = labelRendererSource.match(/const hLH=fs\*([\d.]+), sLH=fs\*([\d.]+), pLH=fs\*([\d.]+);/);
    assert(hazardLH, 'hLH/sLH/pLH declaration not found -- has it been restructured?');
    const [, hMul, sMul, pMul] = hazardLH.map(Number);
    assert(hMul >= 1.2 - 1e-9, `H-statement line-height must be >=120% of font size, got ${hMul}x`);
    assert(sMul >= 1.2 - 1e-9, `sensitiser line-height must be >=120% of font size, got ${sMul}x`);
    assert(pMul >= 1.2 - 1e-9, `P-statement line-height must be >=120% of font size, got ${pMul}x`);
    ok('H/sensitiser/P mandatory-text line spacing is >=120% of font size in the real source');

    const scentLH = labelRendererSource.match(/const scentLH\s*=\s*scentFS\s*\*\s*([\d.]+);/);
    assert(scentLH, 'scentLH declaration not found -- has it been restructured?');
    assert(Number(scentLH[1]) >= 1.2 - 1e-9, `scent-name line-height must be >=120% of font size, got ${scentLH[1]}x`);
    ok('scent-name mandatory-text line spacing is >=120% of font size in the real source');

    const bizLH = labelRendererSource.match(/svgWrapped\(\[bizName\],cx,_bizYf,_bizFSf\*([\d.]+),/);
    assert(bizLH, 'business-name line-height call not found -- has it been restructured?');
    assert(Number(bizLH[1]) >= 1.2 - 1e-9, `business-name line-height must be >=120% of font size, got ${bizLH[1]}x`);
    ok('business-name mandatory-text line spacing is >=120% of font size in the real source (unchanged)');

    const margin = labelRendererSource.match(/const _edgeMargin\s*=\s*([\d.]+)\s*\*\s*pxPerMm/);
    assert(margin, '_edgeMargin declaration not found -- has it been restructured?');
    assert.strictEqual(Number(margin[1]), 2, `the safe print/cut edge margin must remain 2mm, got ${margin[1]}mm`);
    ok('the safe print/cut edge margin is still exactly 2mm in the real source (not reduced to recover capacity)');

    assert(/const MANDATORY_XHEIGHT_MM\s*=\s*1\.2/.test(labelRendererSource), 'the genuine 1.2mm mandatory-text x-height constant must still read 1.2');
    ok('the genuine 1.2mm mandatory-text x-height floor constant is intact');

    assert(/const PICTO_FLOOR_SQUARE_MM\s*=\s*10/.test(labelRendererSource), 'the 10mm GHS red-square floor constant must still read 10');
    ok('the 10mm GHS pictogram red-square floor constant is intact');

    assert(/const BCF_FLOOR_MM\s*=\s*5/.test(labelRendererSource), 'the 5mm candle-safety symbol floor constant must still read 5');
    ok('the 5mm BS EN 15494:2019 candle-safety symbol floor constant is intact');

    // Footer's second (final) fitFont() recompute must still floor at the
    // genuine mandatory minimum, not the old, much smaller aesthetic value
    // -- the "silent-shrink" fix from an earlier phase.
    const footerRecompute = labelRendererSource.match(/const fs = fitFont\(elem\.text, availW, elem\.fs, ([A-Za-z_]+),/);
    assert(footerRecompute, 'footer final-fit recompute call not found -- has it been restructured?');
    assert.strictEqual(footerRecompute[1], '_mandatoryMinFS', `footer text must never be floored below the genuine mandatory minimum on its final recompute pass, found floor argument "${footerRecompute[1]}"`);
    ok('footer text\'s final-fit recompute still floors at the genuine mandatory minimum (silent-shrink protection intact)');

    // The forbidden shortcuts this fail-closed decision explicitly rejected
    // must not have crept back in.
    assert(!/pLH\s*=\s*fs\s*\*\s*1\.1/.test(labelRendererSource), 'a sub-120% P-statement line-height shortcut must not be present');
    assert(!/_edgeMargin\s*=\s*(0\.8|1)\s*\*\s*pxPerMm/.test(labelRendererSource), 'a sub-2mm edge margin shortcut must not be present');
    assert(!/footerSlots\.sort/.test(labelRendererSource), 'footer content must never be reordered by line length');
    ok('none of the previously-rejected shortcuts (sub-120% spacing, sub-2mm margin, length-based footer reordering) are present');
  }

  // ── 2. Footer keeps its logical address -> phone -> detail order ─────
  {
    const data = {
      shape:'rectangle', size:'custom', customW:99.1, customH:57.3,
      scentName:'Order Check', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
      signal:'Warning', hStatements:'H315', pStatements:'P273', sensitisers:[],
      pictograms:['exclamation'], bizAddress:'12 High Street, Kelso, Scottish Borders, TD5 7AB',
      bizPhone:'01573 000000', netWeight:'220g',
    };
    const r = LR.renderLabel(data, {instanceId:'order-check'});
    const iAddr = r.svg.indexOf('12 High Street');
    const iPhone = r.svg.indexOf('01573 000000');
    const iDetail = r.svg.indexOf('220g');
    assert(iAddr > -1 && iPhone > -1 && iDetail > -1, 'expected all three footer parts to be present in the rendered SVG');
    assert(iAddr < iPhone && iPhone < iDetail, `footer must render in logical address -> phone -> detail order, got positions addr=${iAddr} phone=${iPhone} detail=${iDetail}`);
    ok('footer content renders in logical address -> phone -> detail order, never reordered by length');
  }

  // ── 3. findSmallestFittingSize(): genuinely verified, never suggests
  //    below 52mm, correctly returns null when nothing fits ────────────
  {
    // 3a. A case with light-but-real content that's blocked at 52mm --
    // must recommend a size that, independently re-rendered, really fits.
    const lightCircle = {
      shape:'circle', size:'custom', customW:52, customH:52,
      scentName:'Rose Garden', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
      signal:'Warning', hStatements:'H315', pStatements:'P302+P352', sensitisers:['Linalool'],
      pictograms:['exclamation'], bizAddress:'Stable Lodge', bizPhone:'07702451104',
    };
    const before = LR.renderLabel(lightCircle, {instanceId:'x'});
    const rec = LR.findSmallestFittingSize(lightCircle, {instanceId:'x'});
    assert(rec, `expected a size recommendation for a realistic, non-extreme circle fixture -- before.fits=${before.fits} warnings=${JSON.stringify(before.warnings)}`);
    assert(rec.mmW >= 52, `recommended size must never be below CLPeasy's own 52mm supported minimum, got ${rec.mmW}mm`);
    const verify = LR.renderLabel(Object.assign({}, lightCircle, {size:'custom', customW:rec.mmW, customH:rec.mmH}), {instanceId:'x'});
    assert.strictEqual(verify.fits, true, `the recommended size (${rec.mmW}x${rec.mmH}mm) must genuinely pass the identical content through the real renderer -- got warnings ${JSON.stringify(verify.warnings)}`);
    // One mm smaller than the recommendation must NOT fit (proves "smallest").
    if(rec.mmW > 52){
      const oneSmaller = LR.renderLabel(Object.assign({}, lightCircle, {size:'custom', customW:rec.mmW-1, customH:rec.mmW-1}), {instanceId:'x'});
      assert.strictEqual(oneSmaller.fits, false, `1mm below the recommended size (${rec.mmW-1}mm) must still fail, or ${rec.mmW}mm was not actually the smallest fitting size`);
    }
    ok(`findSmallestFittingSize() recommends a genuinely smallest-verified size for a realistic blocked circle (${rec.mmW}mm)`);

    // 3b. Never mutates its input.
    const snapshot = JSON.stringify(lightCircle);
    LR.findSmallestFittingSize(lightCircle, {instanceId:'x'});
    assert.strictEqual(JSON.stringify(lightCircle), snapshot, 'findSmallestFittingSize() must never mutate the label data passed to it');
    ok('findSmallestFittingSize() never mutates its input -- it only ever recommends, never changes, a size');

    // 3c. A circle carrying a full three-part footer (address + phone +
    // detail) alongside its candle-safety icon row is a genuine, disclosed
    // boundary case: correctly returns null up to the renderer's own 150mm
    // ceiling rather than falsely recommending a size that doesn't work.
    const heavyCircleFooter = {
      shape:'circle', size:'custom', customW:52, customH:52,
      scentName:'Rose Garden', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
      signal:'Warning', hStatements:'H315', pStatements:'P302+P352', sensitisers:['Linalool'],
      pictograms:['exclamation'], bizAddress:'12 High Street, Kelso, Scottish Borders, TD5 7AB',
      bizPhone:'01573 000000', bizWebsite:'www.craftymousegifts.com',
      netWeight:'180g', burnTime:'35 hrs approx', batchNum:'B015', hideEN15494:false,
    };
    const heavyBefore = LR.renderLabel(heavyCircleFooter, {instanceId:'x'});
    assert.strictEqual(heavyBefore.fits, false, 'setup: this fixture is expected to be blocked at 52mm');
    const heavyRec = LR.findSmallestFittingSize(heavyCircleFooter, {instanceId:'x'});
    // Spot-check the renderer's own ceiling genuinely still fails, so a
    // null recommendation here is a true "nothing works", not a search bug.
    const atCeiling = LR.renderLabel(Object.assign({}, heavyCircleFooter, {size:'custom', customW:150, customH:150}), {instanceId:'x'});
    assert.strictEqual(atCeiling.fits, false, `setup check: 150mm circle should still be blocked for this fixture (got fits=true, warnings=${JSON.stringify(atCeiling.warnings)}) -- if this now fits, findSmallestFittingSize should have found it too`);
    assert.strictEqual(heavyRec, null, `expected no size recommendation up to 150mm for a circle carrying a full three-part footer plus candle-safety icons (a disclosed, genuine boundary case) -- got ${JSON.stringify(heavyRec)}`);
    ok('findSmallestFittingSize() correctly reports no fitting size (null), never a false recommendation, for a genuinely unfittable circle+full-footer case');
  }

  // ── 4. Boundary sweep across the specific sizes Michaela named ───────
  // Every render below is checked for every retained floor directly in its
  // own metrics, whether it fits or not -- a blocked label must still never
  // show a pictogram/candle-icon/text size below its floor.
  {
    function checkFloors(r, label){
      if(r.metrics.pictoSquareSideMm != null){
        assert(r.metrics.pictoSquareSideMm >= LR.PICTO_FLOOR_SQUARE_MM - 1e-9, `${label}: GHS pictogram must never render below the 10mm floor, got ${r.metrics.pictoSquareSideMm}mm`);
      }
      if(r.metrics.bcfSizeMm != null){
        assert(r.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM - 1e-9, `${label}: candle-safety icon must never render below the 5mm floor, got ${r.metrics.bcfSizeMm}mm`);
      }
    }
    const ordinaryContent = (extra) => Object.assign({
      scentName:'Ordinary Scent', productType:'Scented Candle', bizName:'Crafty Mouse Gifts',
      signal:'Warning', hStatements:'H315', pStatements:'P273', sensitisers:[],
      pictograms:['exclamation'], bizAddress:'Stable Lodge', bizPhone:'07702451104',
      hideEN15494:false,
    }, extra);

    // Expected outcomes below are the MEASURED behaviour of the current,
    // fully-compliant renderer (verified directly against label-render.js
    // with the genuine floors in force -- not an assumption). Confirmed by
    // direct comparison against the renderer's pre-compliance-fix line
    // spacing (pLH/scentLH at their old, non-compliant 1.15x) that the two
    // smallest boundary cases below (circle 52mm, rect 63x44mm) were
    // *already* blocked before this session's line-spacing fix -- so these
    // are genuine, pre-existing content/size boundaries being disclosed
    // here for the first time, not a regression introduced by retaining the
    // >=120% line-spacing standard.
    const sweep = [
      ['circle 52mm',  ordinaryContent({shape:'circle', size:'custom', customW:52, customH:52}), false, 'footer-clipped'],
      ['circle 63mm',  ordinaryContent({shape:'circle', size:'custom', customW:63, customH:63}), true],
      ['circle 75mm',  ordinaryContent({shape:'circle', size:'custom', customW:75, customH:75}), true],
      ['rect 63x44mm', ordinaryContent({shape:'rectangle', size:'custom', customW:63, customH:44}), false, 'hazard-text-overflow'],
      // Correction (2026-09-08, evidence gathered under Michaela's
      // Custom-rectangle-policy decision): 76x51mm is one of her explicitly
      // named supported examples (long side >=52mm, short side >=36mm) --
      // enterable in Custom -- but she was explicit that "an allowed
      // physical size does not guarantee all content will fit", and this
      // is measured proof of exactly that, not a code defect. Direct
      // render: footer-clipped, with a genuine ~2.17mm shortfall (7.44
      // canonical px) between the 2-line address+phone footer's mandatory
      // floor need and the space left after the BCF icon row -- both the
      // icon (pinned at its 5mm floor) and the footer text (pinned at its
      // 1.2mm/~122%-spacing floor) are already at their absolute minimums,
      // same method as the already-verified 63mm-circle case, just a
      // bigger gap here because a 76x51mm rectangle's canonical footer
      // band is much shorter than a 63mm circle/square's (a rectangle's
      // footer band scales with its own physical height, not the full
      // canonical 260 units). This is larger than the 63mm-circle shortfall
      // that BCF_ROW_HEIGHT_RATIO's reduction (1.35->1.15) was sized to
      // close, so the same fix does not (and per "apply the adjustment
      // only as far as necessary" should not) also cover this case.
      ['rect 76x51mm', ordinaryContent({shape:'rectangle', size:'custom', customW:76, customH:51}), false, 'footer-clipped'],
      ['rect 99x67mm', ordinaryContent({shape:'rectangle', size:'custom', customW:99, customH:67}), true],
      // Correction (2026-09-08, same evidence-gathering pass as the
      // 76x51mm case above): direct render confirms footer-clipped here
      // too -- icon at its 5mm floor (bcfSizeMm:5), footer text at its
      // 1.2mm/~122%-spacing floor, hazardYSlack still positive (mid-body
      // hazard text is unaffected) -- a genuine shortfall from the same
      // rectangle-footer-band-scales-with-physical-height cause as
      // 76x51mm, not a defect. Unaffected by the 63mm-circle-scoped
      // BCF_ROW_HEIGHT_RATIO fix for the same reason.
      ['rect EU30009 99.1x57.3mm', ordinaryContent({shape:'rectangle', size:'custom', customW:99.1, customH:57.3}), false, 'footer-clipped'],
      // Correction (2026-09-08): a square shares the circle's full-
      // canonical-height footer band (see this file's own established
      // circle-vs-rectangle comment elsewhere), so it shares the circle's
      // boundary too -- direct sweep (55/58/60/62/63/65/70/75mm) confirms
      // the real boundary is exactly 63mm: 62mm and below genuinely fail
      // closed (footer-clipped), 63mm and above genuinely fit. 60mm was
      // never actually verified to fit; corrected to the measured result.
      ['square 60x60mm', ordinaryContent({shape:'square', size:'custom', customW:60, customH:60}), false, 'footer-clipped'],
      ['square 75x75mm', ordinaryContent({shape:'square', size:'custom', customW:75, customH:75}), true],
    ];
    for(const [label, data, expectFits, expectWarning] of sweep){
      const r = LR.renderLabel(data, {instanceId:'sweep'});
      checkFloors(r, label);
      assert.strictEqual(r.fits, expectFits, `${label}: expected fits=${expectFits} for ordinary single-H/single-P/no-sensitiser content -- got fits=${r.fits}, warnings ${JSON.stringify(r.warnings)}`);
      if(expectWarning) assert(r.warnings.includes(expectWarning), `${label}: expected to be blocked specifically for "${expectWarning}" -- got ${JSON.stringify(r.warnings)}`);
      ok(expectFits
        ? `${label}: ordinary content fits, all retained floors intact`
        : `${label}: ordinary content is genuinely, honestly blocked (${expectWarning}) at this size -- not silently forced to fit, all retained floors still intact`);
    }

    // The real QA Test Candle 6344 record: Michaela's explicit, disclosed
    // decision is that this may now be correctly blocked at its own
    // 63x44mm size under the genuine 1.2mm floor. Its stored data is not
    // altered by CLPeasy automatically (see checkpoint-c-composer-identity.js
    // check 22 for the Composer-side coverage of this same record) -- this
    // is the label-render.js-level confirmation of the same disclosed fact.
    const qaTestCandle6344 = {
      scentName:'QA Test Candle 6344', productType:'Scented Candle',
      shape:'rectangle', size:63, customW:63, customH:44,
      signal:'Warning', hStatements:'H317', pictograms:['exclamation'], sensitisers:[],
      bizName:'Crafty Mouse Gifts', bizAddress:'Stable Lodge', bizPhone:'07702451104',
      bizWebsite:'www.clpeasy.com', netWeight:'', burnTime:'', batchNum:'',
      hideEN15494:false, pStatements:'P273', textColour:'dark', showBorder:true, labelLang:'en',
    };
    const qaResult = LR.renderLabel(qaTestCandle6344, {instanceId:'qa6344'});
    checkFloors(qaResult, 'QA Test Candle 6344 (real record)');
    assert.strictEqual(qaResult.fits, false, 'QA Test Candle 6344 is expected to be correctly blocked at its own 63x44mm preset size under the genuine 1.2mm floor (its H317/P273 combination is synthetic and not SDS-verified) -- if this now fits, the floor may have weakened');
    assert(qaResult.warnings.includes('hazard-text-overflow'), `QA Test Candle 6344 must be blocked specifically for hazard-text-overflow -- got ${JSON.stringify(qaResult.warnings)}`);
    ok('QA Test Candle 6344 (real production record) is correctly, honestly blocked at its own 63x44mm size -- not silently forced to fit');
  }

  console.log(`\nAll ${n} fail-closed size-boundary checks passed.`);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
