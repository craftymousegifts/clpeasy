// Renderer resolution-invariance — regression test.
//
// Per Michaela's correction: the shared renderer must run EVERY layout
// calculation, text-fit calculation, pictogram search and the final fits
// decision in ONE canonical internal coordinate system (260 units wide,
// 260*mmH/mmW tall — Builder's own existing, signed-off geometry), and
// must separate that from the OUTER rendered <svg width/height>, which is
// controlled only by the caller's opts.pw/opts.ph (a display or export
// size). Preview zoom, export DPI, or any other caller resolution may
// resize the outer <svg> element; it must NEVER change fits, warnings,
// the chosen pictogram mm size, text wrapping, font sizes, or element
// positions (all of the latter measured in canonical/viewBox units).
//
// This replaces the earlier three-fixed-reference-resolution workaround
// (Builder scale / Composer 75% / 300dpi) — which only covered those
// three specific pixel resolutions and left every other resolution
// (Composer 50%/100%, a future zoom level, an arbitrary export width)
// unverified — with an architectural guarantee tested here across a much
// wider set of resolutions, including one deliberately non-standard width
// that was never one of the old reference points.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

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

const labelRendererSource = fs.readFileSync(path.join(__dirname,'..','label-render.js'),'utf8');

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    beforeParse(window) { stubCanvas(window); window.eval(labelRendererSource); }
  });
  const LR = dom.window.LabelRenderer;
  let seq = 0;

  // The resolutions requested for explicit coverage, expressed as opts.pw
  // (opts.ph mirrors the label's own aspect ratio) -- Composer 50/75/100%
  // on-screen zoom, Builder's own default (no override), 96dpi and 300dpi
  // export-style resolutions, and one deliberately arbitrary/non-standard
  // width that was never one of the old three fixed reference points.
  function resolutionsFor(mmW, mmH){
    const aspect = mmH/mmW;
    const at = (pxPerMm) => ({ pw: Math.round(mmW*pxPerMm), ph: Math.round(mmW*pxPerMm*aspect) });
    return {
      'Composer 50% zoom': at(3.7795*0.50),
      'Composer 75% zoom (default)': at(3.7795*0.75),
      'Composer 100% zoom': at(3.7795*1.00),
      'Builder preview (no override)': undefined,
      '96dpi': at(96/25.4),
      '300dpi': at(300/25.4),
      'arbitrary non-standard width (137px/mm-ish)': at(13.37),
    };
  }

  function stripOuterSvgTag(svg){
    // Everything from the first '>' onward -- i.e. the SVG body, with the
    // opening <svg ...> tag's own (deliberately caller-varying) width/
    // height attributes removed from the comparison.
    return svg.slice(svg.indexOf('>'));
  }

  function parseOuterAttrs(svg){
    const openTag = svg.slice(0, svg.indexOf('>')+1);
    const w = Number((openTag.match(/\swidth="([\d.]+)"/)||[])[1]);
    const h = Number((openTag.match(/\sheight="([\d.]+)"/)||[])[1]);
    const vb = (openTag.match(/viewBox="([^"]+)"/)||[])[1];
    return { w, h, viewBox: vb };
  }

  function assertInvariant(label, data){
    const {mmW, mmH} = LR.getLabelDims(data, {});
    const resolutions = resolutionsFor(mmW, mmH);
    const results = {};
    // Use ONE fixed instanceId for every resolution scenario within a given
    // case. instanceId only scopes internal SVG element ids (clipPath,
    // textPath) so multiple labels on one sheet don't collide -- it is not
    // part of the layout, and a real caller re-renders the SAME label
    // instance at a different zoom/DPI, not a new instance each time. Using
    // a shared id here lets the body-byte-identical check (below) actually
    // prove layout invariance instead of tripping on unrelated id churn.
    const fixedInstanceId = 'inv'+(seq++);
    for(const [name, res] of Object.entries(resolutions)){
      const opts = { instanceId: fixedInstanceId };
      if(res) Object.assign(opts, res);
      results[name] = { r: LR.renderLabel(data, opts), requested: res };
    }
    const names = Object.keys(results);
    const first = results[names[0]].r;
    const firstBody = stripOuterSvgTag(first.svg);
    const firstOuter = parseOuterAttrs(first.svg);

    for(const name of names){
      const { r, requested } = results[name];
      // 1. fits must be identical -- preview zoom must never enable or
      //    disable export.
      assert.strictEqual(r.fits, first.fits, `${label} (${name}): fits must be identical across all resolutions (got ${r.fits}, expected ${first.fits})`);
      // 2. warnings must be identical.
      assert.deepStrictEqual(r.warnings, first.warnings, `${label} (${name}): warnings must be identical across all resolutions`);
      // 3. Chosen pictogram physical mm size must be identical.
      assert.strictEqual(r.metrics.pictoSizeMm, first.metrics.pictoSizeMm, `${label} (${name}): chosen pictogram mm size must be identical across all resolutions`);
      // 4. Canonical layout dims (viewBox) must be identical -- 260 x
      //    260*mmH/mmW, regardless of what outer size was requested.
      assert.strictEqual(r.metrics.labelDims.pw, first.metrics.labelDims.pw, `${label} (${name}): canonical layout width (pw) must be identical across all resolutions`);
      assert.strictEqual(r.metrics.labelDims.ph, first.metrics.labelDims.ph, `${label} (${name}): canonical layout height (ph) must be identical across all resolutions`);
      // 5. Font sizes (canonical/viewBox units) must be identical.
      assert.deepStrictEqual(r.metrics.fontSizes, first.metrics.fontSizes, `${label} (${name}): font sizes (in canonical units) must be identical across all resolutions`);
      // 6. Element positions (canonical/viewBox units) must be identical.
      assert.deepStrictEqual(r.metrics.hazardBounds, first.metrics.hazardBounds, `${label} (${name}): hazard text bounds (canonical units) must be identical across all resolutions`);
      assert.deepStrictEqual(r.metrics.footerBounds, first.metrics.footerBounds, `${label} (${name}): footer bounds (canonical units) must be identical across all resolutions`);
      assert.deepStrictEqual(r.metrics.pictogramBounds, first.metrics.pictogramBounds, `${label} (${name}): pictogram block bounds (canonical units) must be identical across all resolutions`);
      // 7. The ENTIRE SVG body (everything except the outer <svg> tag's own
      //    width/height, which is expected to differ) must be BYTE-IDENTICAL
      //    -- the strongest possible proof that text wrapping and every
      //    other layout decision never changed.
      assert.strictEqual(stripOuterSvgTag(r.svg), firstBody, `${label} (${name}): the rendered SVG body must be byte-identical to Builder's own default (${names[0]}) output -- only the outer <svg> tag's width/height may differ`);
      // 8. Outer <svg> viewBox must be identical (canonical) too, while
      //    width/height are expected to match what THIS scenario asked
      //    for (proving the outer size really is caller-controlled, not
      //    just coincidentally unused).
      const outer = parseOuterAttrs(r.svg);
      assert.strictEqual(outer.viewBox, firstOuter.viewBox, `${label} (${name}): outer <svg> viewBox must be the same canonical value across all resolutions`);
      if(requested){
        assert.strictEqual(outer.w, requested.pw, `${label} (${name}): outer <svg> width must equal the caller's requested pw (${requested.pw}), got ${outer.w}`);
        assert.strictEqual(outer.h, requested.ph, `${label} (${name}): outer <svg> height must equal the caller's requested ph (${requested.ph}), got ${outer.h}`);
      }
    }
    // 9. At least two scenarios must have produced genuinely DIFFERENT
    //    outer sizes (sanity check that this test isn't accidentally
    //    comparing identical opts and passing vacuously).
    const outerSizes = new Set(names.map(n => { const o = parseOuterAttrs(results[n].r.svg); return o.w+'x'+o.h; }));
    assert(outerSizes.size > 1, `${label}: sanity check failed -- expected multiple distinct outer sizes across resolutions, got only ${outerSizes.size}`);
  }

  // ── Coverage matrix: shapes/sizes x content types, per Michaela's list ──
  function mk(shape, mm, pictos, rectDims, extra){
    const base = {
      scentName:'Invariance Test', productType:'Candle', bizName:'Crafty Mouse Gifts',
      bizPhone:'01234 567890', signal:'WARNING', hStatements:'H317', pStatements:'P273',
      sensitisers:['Linalool'], pictograms: pictos,
    };
    const dims = shape==='rectangle'
      ? {shape, size:'custom', customW:rectDims[0], customH:rectDims[1]}
      : {shape, size:String(mm), customW:mm, customH:mm};
    return Object.assign(base, dims, extra||{});
  }

  const shapeSizeCases = [
    { shape:'circle', mm:52 }, { shape:'circle', mm:63 }, { shape:'circle', mm:75 },
    { shape:'square', mm:63 },
    { shape:'rectangle', mm:null, rectDims:[99.1,57.3] }, // EU30009
    { shape:'rectangle', mm:null, rectDims:[63,44] },     // custom regression fixture, not a preset
  ];
  for(const c of shapeSizeCases){
    for(const n of [1,2,3]){
      const pictos = ['exclamation','health','corrosive'].slice(0,n);
      const label = `${c.shape} ${c.mm||c.rectDims.join('x')}mm, ${n} picto(s)`;
      assertInvariant(label, mk(c.shape, c.mm, pictos, c.rectDims));
    }
  }

  // Short vs. long/dense mandatory content.
  assertInvariant('63mm circle, short content', mk('circle', 63, ['exclamation']));
  assertInvariant('63mm circle, long/dense content', mk('circle', 63, ['exclamation'], null, {
    signal:'DANGER',
    hStatements:'H225,H301,H311,H314,H317,H334,H335,H336,H361,H371',
    pStatements:'P210,P233,P260,P261,P271,P273,P301+P310,P305+P351+P338',
    sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
  }));

  // Impossible content (can't fit even at the 10mm floor) -- fits:false
  // must ALSO be invariant across resolutions (never let a bigger preview
  // canvas make an unfittable label appear to fit, or vice versa).
  assertInvariant('impossible content, 52mm circle', mk('circle', 52, ['exclamation','health','corrosive'], null, {
    signal:'DANGER',
    hStatements:'H225,H301,H304,H311,H314,H317,H318,H319,H331,H332,H334,H335,H336,H361,H371,H373',
    pStatements:'P210,P211,P233,P260,P261,P271,P273,P301+P310,P305+P351+P338,P370+P378,P391,P403+P233',
    sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin','Eugenol','Benzyl Benzoate','Cinnamal','Farnesol'],
  }));

  // P280 (selectable precautionary wording) -- both a valid selection and
  // the legacy/incomplete (unrecognised) case.
  assertInvariant('P280 valid selection, 63mm circle', mk('circle', 63, ['exclamation'], null, {
    pStatements:'P280', p280Items:['gloves','eye'],
  }));
  assertInvariant('P280 legacy/incomplete (unrecognised), 63mm circle', mk('circle', 63, ['exclamation'], null, {
    pStatements:'P280', p280Items:[], p280Other:'',
  }));

  // Full sensitiser list (all 26 EU-recognised allergens named at once) --
  // deliberately not truncated per the U8 fix documented elsewhere in this
  // file; must still be resolution-invariant.
  const ALL_SENSITISERS = ['Limonene','Linalool','Citral','Geraniol','Citronellol','Coumarin','Eugenol','Farnesol','Cinnamal','Cinnamyl Alcohol','Benzyl Alcohol','Benzyl Benzoate','Benzyl Cinnamate','Benzyl Salicylate','Isoeugenol','Anise Alcohol','Amyl Cinnamal','Amylcinnamyl Alcohol','Hexyl Cinnamal','Hydroxycitronellal','Alpha-Isomethyl Ionone','Butylphenyl Methylpropional','Evernia Prunastri','Evernia Furfuracea','Methyl Heptin Carbonate','Oakmoss'];
  assertInvariant('full sensitiser list, 75mm circle', mk('circle', 75, ['exclamation'], null, {
    sensitisers: ALL_SENSITISERS,
  }));

  // Unrecognised hazard/precautionary code (must block fits identically at
  // every resolution -- this failure mode is unrelated to layout size, so
  // it must never vary either).
  assertInvariant('unrecognised code (EUH999), 63mm circle', mk('circle', 63, ['exclamation'], null, {
    hStatements:'H317,EUH999',
  }));

  console.log('renderer resolution-invariance checks passed (canonical 260-unit internal layout; outer <svg> width/height is the only thing that varies with caller resolution; fits/warnings/pictogram mm/font sizes/element positions/text wrapping all byte-identical across Composer 50/75/100% zoom, Builder default, 96dpi, 300dpi and an arbitrary non-standard width; covers 1-3 pictograms, 52/63/75mm circle, square, EU30009 rectangle, 63x44mm custom fixture, short/long/impossible content, P280 valid + legacy cases, a full 26-item sensitiser list, and an unrecognised code)');
})().catch(e => { console.error(e); process.exit(1); });
