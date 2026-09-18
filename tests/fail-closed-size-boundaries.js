// Fail-closed design (2026-09-07, Michaela's decision; floor updated
// 2026-09-08 per the targeted GB legibility-floor revert -- see
// tests/gb-legibility-floor-targeted-revert.js): CLPeasy does not compact,
// reorder or shrink its way around content that genuinely doesn't fit the
// active GB mandatory-text floor (CLPeasy's own restored "clearly legible"
// standard, not a genuine 1.2mm x-height or a GB statutory figure) / 2mm
// edge margin / 10mm GHS / 5mm candle-safety floors. H/sensitiser line
// spacing remains >=120%; P-statement line spacing is the restored 1.15x
// (see below). When content can't fit, the
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
    // Updated (2026-09-08, targeted GB legibility-floor revert -- see
    // tests/gb-legibility-floor-targeted-revert.js): P-statement line
    // spacing (pLH) was intentionally restored to its pre-PR-105 GB value
    // (1.15x), per Michaela's explicit decision that the >=120% EU/NI Reg
    // (EU) 2024/2865 figure is not an active GB requirement. hLH/sLH are
    // unrelated to that revert and remain at their >=120% value unchanged.
    const hazardLH = labelRendererSource.match(/const hLH=fs\*([\d.]+), sLH=fs\*([\d.]+), pLH=fs\*([\d.]+);/);
    assert(hazardLH, 'hLH/sLH/pLH declaration not found -- has it been restructured?');
    const [, hMul, sMul, pMul] = hazardLH.map(Number);
    assert(hMul >= 1.2 - 1e-9, `H-statement line-height must be >=120% of font size, got ${hMul}x`);
    assert(sMul >= 1.2 - 1e-9, `sensitiser line-height must be >=120% of font size, got ${sMul}x`);
    assert(pMul >= 1.15 - 1e-9, `P-statement line-height must be >=115% of font size (the restored GB value), got ${pMul}x`);
    ok('H/sensitiser mandatory-text line spacing is >=120%, P-statement is at the restored GB 1.15x, all in the real source');

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
    // must not have crept back in. (pLH=fs*1.15 is now the deliberately
    // restored GB value, not a forbidden shortcut -- the guard below checks
    // it hasn't been shrunk further, below that restored floor.)
    assert(pMul >= 1.15 - 1e-9, 'P-statement line-height must not be shrunk below the restored GB value of 1.15x');
    assert(!/_edgeMargin\s*=\s*(0\.8|1)\s*\*\s*pxPerMm/.test(labelRendererSource), 'a sub-2mm edge margin shortcut must not be present');
    assert(!/footerSlots\.sort/.test(labelRendererSource), 'footer content must never be reordered by line length');
    ok('none of the previously-rejected shortcuts (sub-2mm margin, length-based footer reordering) are present, and P-statement spacing is not shrunk below its restored 1.15x');
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
    // 3a. A case with real content that's blocked at 52mm -- must recommend
    // a size that, independently re-rendered, really fits.
    // Updated (2026-09-08, targeted GB legibility-floor revert): the
    // original, lighter version of this fixture (single H/P/sensitiser) now
    // fits already at 52mm under the restored GB floor -- a genuine,
    // measured improvement, not a bug -- so it can no longer exercise
    // findSmallestFittingSize()'s "recommend a larger size" path. Given
    // slightly denser real content instead (still an ordinary, realistic
    // fixture, not an extreme stress case) so this sub-case still verifies
    // real behaviour rather than a case that no longer needs a
    // recommendation at all.
    const lightCircle = {
      shape:'circle', size:'custom', customW:52, customH:52,
      scentName:'Lavendar', productType:'Scented Candle', bizName:'CLPeasy',
      signal:'Warning', hStatements:'H317, H412, EUH208', pStatements:'P261, P273, P302+P352, P333+P313, P501',
      sensitisers:['Benzyl Salicylate','Hydroxycitronellal','Linalool','Limonene','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
      pictograms:['exclamation'], bizAddress:'CLPeasy', bizPhone:'01234567890', bizWebsite:'www.clpeasy.com', netWeight:'200g', burnTime:'35hrs',
    };
    const before = LR.renderLabel(lightCircle, {instanceId:'x'});
    assert.strictEqual(before.fits, false, `setup: this fixture is expected to be blocked at 52mm under the restored GB floor -- got fits=${before.fits} warnings=${JSON.stringify(before.warnings)}`);
    const rec = LR.findSmallestFittingSize(lightCircle, {instanceId:'x'});
    assert(rec, `expected a size recommendation for a realistic, non-extreme circle fixture -- before.fits=${before.fits} warnings=${JSON.stringify(before.warnings)}`);
    assert(rec.mmW >= 52, `recommended size must never be below CLPeasy's own 52mm supported minimum, got ${rec.mmW}mm`);
    const verify = LR.renderLabel(Object.assign({}, lightCircle, {size:'custom', customW:rec.mmW, customH:rec.mmH}), {instanceId:'x'});
    assert.strictEqual(verify.fits, true, `the recommended size (${rec.mmW}x${rec.mmH}mm) must genuinely pass the identical content through the real renderer -- got warnings ${JSON.stringify(verify.warnings)}`);
    // The next-smaller SUPPORTED PRESET must not fit (proves the
    // recommendation is genuinely the smallest supported preset, not just
    // "a" fitting size). findSmallestFittingSize() recommends from
    // CLPeasy's supported preset list, not an arbitrary custom mm value, so
    // this checks preset-to-preset tightness rather than assuming the true
    // content boundary falls exactly 1mm below whatever preset is returned.
    if(rec.source === 'preset' && rec.presetMm > 52){
      const nextSmallerPreset = LR.renderLabel(Object.assign({}, lightCircle, {size:'custom', customW:52, customH:52}), {instanceId:'x'});
      assert.strictEqual(nextSmallerPreset.fits, false, `the next-smaller supported preset (52mm) must still fail, or ${rec.presetMm}mm was not actually the smallest fitting preset`);
    }
    ok(`findSmallestFittingSize() recommends a genuinely smallest-verified size for a realistic blocked circle (${rec.mmW}mm)`);

    // 3b. Never mutates its input.
    const snapshot = JSON.stringify(lightCircle);
    LR.findSmallestFittingSize(lightCircle, {instanceId:'x'});
    assert.strictEqual(JSON.stringify(lightCircle), snapshot, 'findSmallestFittingSize() must never mutate the label data passed to it');
    ok('findSmallestFittingSize() never mutates its input -- it only ever recommends, never changes, a size');

    // 3c. A circle carrying a full three-part footer (address + phone +
    // detail) alongside its candle-safety icon row.
    // Updated (2026-09-08, targeted GB legibility-floor revert): under the
    // pre-revert genuine-1.2mm-x-height floor this fixture had no fitting
    // size up to the renderer's own 150mm ceiling at all (a disclosed,
    // genuine boundary case). Restoring the pre-PR-105 GB floor gives it
    // real headroom again -- it now genuinely fits at 147mm (verified
    // directly by sweeping 52-150mm; the renderer's own ceiling, 150mm,
    // also fits). This sub-case now verifies the POSITIVE path instead:
    // findSmallestFittingSize() must recommend a real size, and that size
    // must independently re-render as fitting -- still never mutating the
    // input, still never recommending below CLPeasy's 52mm minimum.
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
    assert(heavyRec, `expected a genuine size recommendation for the full-footer+candle-safety fixture under the restored GB floor -- got null`);
    assert(heavyRec.mmW >= 52, `recommended size must never be below CLPeasy's own 52mm supported minimum, got ${heavyRec.mmW}mm`);
    const heavyVerify = LR.renderLabel(Object.assign({}, heavyCircleFooter, {size:'custom', customW:heavyRec.mmW, customH:heavyRec.mmH}), {instanceId:'x'});
    assert.strictEqual(heavyVerify.fits, true, `the recommended size (${heavyRec.mmW}x${heavyRec.mmH}mm) must genuinely pass the identical full-footer content through the real renderer -- got warnings ${JSON.stringify(heavyVerify.warnings)}`);
    ok(`findSmallestFittingSize() correctly recommends a genuinely-verified size (${heavyRec.mmW}mm) for the full-footer+candle-safety fixture, now fittable under the restored GB floor`);
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

    // Expected outcomes below are the MEASURED behaviour of the current
    // renderer, re-verified directly against label-render.js on 2026-09-08
    // after the targeted GB legibility-floor revert (restored pre-PR-105
    // GB_ACTIVE_MIN_FS_MM mandatory-text floor and 1.15x P-statement line
    // spacing -- see tests/gb-legibility-floor-targeted-revert.js). This
    // ordinary, single-H/single-P/no-sensitiser fixture now fits at every
    // size below that previously required footer-clipped or hazard-text-
    // overflow to block it -- a genuine, measured improvement from
    // restoring the pre-PR-105 GB floor, confirming this session's
    // acceptance criterion that an ordinary pictogram-bearing candle still
    // (now again) fits at 63mm. Only the two footer-bound rectangle cases
    // (63x44mm and the EU30009 99.1x57.3mm registry template) remain
    // blocked -- both still footer-clipped, for the same rectangle-footer-
    // band-scales-with-physical-height reason documented previously, now
    // re-confirmed under the restored floor rather than the genuine-1.2mm
    // one.
    const sweep = [
      ['circle 52mm',  ordinaryContent({shape:'circle', size:'custom', customW:52, customH:52}), true],
      ['circle 63mm',  ordinaryContent({shape:'circle', size:'custom', customW:63, customH:63}), true],
      ['circle 75mm',  ordinaryContent({shape:'circle', size:'custom', customW:75, customH:75}), true],
      ['rect 63x44mm', ordinaryContent({shape:'rectangle', size:'custom', customW:63, customH:44}), false, 'footer-clipped'],
      ['rect 76x51mm', ordinaryContent({shape:'rectangle', size:'custom', customW:76, customH:51}), true],
      ['rect 99x67mm', ordinaryContent({shape:'rectangle', size:'custom', customW:99, customH:67}), true],
      ['rect EU30009 99.1x57.3mm', ordinaryContent({shape:'rectangle', size:'custom', customW:99.1, customH:57.3}), false, 'footer-clipped'],
      ['square 60x60mm', ordinaryContent({shape:'square', size:'custom', customW:60, customH:60}), true],
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
    // decision is that this may be correctly blocked at its own 63x44mm
    // size. Its stored data is not altered by CLPeasy automatically (see
    // checkpoint-c-composer-identity.js check 22 for the Composer-side
    // coverage of this same record) -- this is the label-render.js-level
    // confirmation of the same disclosed fact. Updated (2026-09-08,
    // targeted GB legibility-floor revert): still genuinely blocked at
    // 63x44mm after restoring the pre-PR-105 GB floor, but the reason
    // changed from hazard-text-overflow to footer-clipped -- this rectangle
    // size's binding constraint is now its footer band (same
    // rectangle-footer-band-scales-with-physical-height cause as the
    // ordinary 63x44mm case in the sweep above), not the hazard/
    // precautionary text, which now has enough room.
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
    assert.strictEqual(qaResult.fits, false, 'QA Test Candle 6344 is expected to be correctly blocked at its own 63x44mm preset size (its H317/P273 combination is synthetic and not SDS-verified) -- if this now fits, a floor may have weakened');
    assert(qaResult.warnings.includes('footer-clipped'), `QA Test Candle 6344 must be blocked specifically for footer-clipped under the restored GB floor -- got ${JSON.stringify(qaResult.warnings)}`);
    ok('QA Test Candle 6344 (real production record) is correctly, honestly blocked at its own 63x44mm size -- not silently forced to fit');
  }

  console.log(`\nAll ${n} fail-closed size-boundary checks passed.`);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
