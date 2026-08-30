// Pictogram parity regression test.
//
// Prior bug: single-row pictograms were grown "for visual balance" up to
// clamp(BASE*0.22, 8, 40) -- an ABSOLUTE SVG-viewBox-unit ceiling, not tied
// to the caller's own px-per-mm scale (pxPerMm = pw/mmW). Because Builder's
// preview canvas (fixed ~260 viewBox units regardless of the label's real
// mm size) and Composer's sheet-cell canvas (viewBox scaled to the label's
// actual physical mm size) pass very different `pw` for the identical real
// label, that one shared absolute cap produced a DIFFERENT fraction of the
// label's own size in each caller -- up to ~34% larger in Composer than
// Builder for the same 63mm circle (confirmed by on-screen Playwright
// measurement + screenshots during investigation).
//
// Fix: pictogram size is always minPictoSz = ceil(10 * pxPerMm) -- the
// physical-10mm-per-icon floor -- with no caller-dependent growth on top.
// Since pxPerMm = pw/mmW, this is a pure ratio (pictoSz/pw = 10/mmW):
// mathematically invariant to whatever absolute pw a caller uses, as long
// as that pw genuinely represents the label's real mm size at that
// caller's own resolution (Builder's fixed-260 preview scale, Composer's
// on-screen zoom scale, or either page's higher-DPI export scale).
//
// This test proves that invariant holds for the *actual rendered SVG*
// output (not just the formula in isolation), across the exact caller
// scales this app uses -- Builder preview/export and Composer
// preview/export -- for 1/2/3 pictograms, three circle sizes, a square,
// and a rectangle.
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

  function mkData(shape, mm, pictos, rectDims){
    const base = {
      scentName:'Parity', productType:'Candle', bizName:'Biz',
      signal:'WARNING', hStatements:'H317', pStatements:'P273',
      sensitisers:['Linalool'], pictograms: pictos,
    };
    if(shape==='rectangle') return {...base, shape, size:'custom', customW:rectDims[0], customH:rectDims[1]};
    return {...base, shape, size:String(mm), customW:mm, customH:mm};
  }

  // Extracts the rendered width of the FIRST GHS pictogram <image>/<use>
  // element directly from the SVG string -- the actual output, not an
  // internal/estimated bounding box (metrics.pictogramBounds is a layout
  // *slot* width, not the icon's own rendered size, and must not be used
  // here for that reason). ghsPicto()/assetMarkup() emit a bare
  // `<image href="..." x=.. y=.. width=.. .../>` with no distinguishing
  // id/class when unpooled, so isolate the GHS block specifically between
  // its own SVG comment markers (the EN 15494 candle-safety pictograms
  // that can follow use the same assetMarkup() helper and must not be
  // confused with the GHS ones being measured here).
  function renderedPictoWidth(svg){
    const blockMatch = svg.match(/<!-- PICTOGRAMS -->([\s\S]*?)<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->/);
    assert(blockMatch, 'could not locate the "<!-- PICTOGRAMS -->" block in the rendered SVG');
    const imgMatch = blockMatch[1].match(/<(?:image|use)[^>]*\/>/);
    assert(imgMatch, 'no GHS pictogram element found inside the PICTOGRAMS block: ' + blockMatch[1]);
    const widthMatch = imgMatch[0].match(/width="([\d.]+)"/);
    assert(widthMatch, 'GHS pictogram element has no width attribute: ' + imgMatch[0]);
    return Number(widthMatch[1]);
  }

  // The exact caller scales this app actually uses:
  //  - Builder preview/export: pw defaults to 260/mmW (buildSVG() never
  //    passes pw/ph explicitly -- see getLabelDims()'s opts.pw fallback).
  //    forExport doesn't change pw/ph (checked against builder.html's
  //    downloadPNG/printToPDF/downloadSVG -- all call buildSVG(true) with
  //    no different pw), so preview and export share one scale here.
  //  - Composer on-screen preview: 3.7795 px/mm (96dpi-equivalent) * the
  //    default zoom (0.75).
  //  - Composer export (PDF/PNG): 300dpi, i.e. 300/25.4 px/mm.
  function scalesFor(mm){
    return {
      builder: undefined, // let getLabelDims default to 260/mmW
      composerPreview: Math.round(mm*3.7795*0.75),
      composerExport: Math.round(mm*300/25.4),
    };
  }

  function measure(data, pw){
    const opts = { instanceId:'m'+(seq++) };
    if(pw!==undefined) opts.pw = pw; // ph omitted -> square/aspect handled by renderLabel itself via getLabelDims
    if(data.shape==='rectangle' && pw!==undefined){
      // Preserve the label's real aspect ratio when overriding pw for a
      // non-square shape, exactly as print.html's real callers do.
      opts.ph = Math.round(pw * (data.customH/data.customW));
    }
    const r = LR.renderLabel(data, opts);
    const dims = LR.getLabelDims(data, opts);
    const pictoW = renderedPictoWidth(r.svg);
    const pxPerMm = dims.pw / dims.mmW;
    const expectedFloor = Math.ceil(10 * pxPerMm);
    return { pictoW, pw: dims.pw, mmW: dims.mmW, pxPerMm, expectedFloor, ratio: pictoW/dims.pw };
  }

  // 3.5% -- comfortably above the integer Math.round()/Math.ceil() rounding
  // noise this introduces at small absolute pw (observed up to ~2.6% at
  // 52mm during investigation), and well below anything a person could see,
  // but still tight enough to catch a real reintroduction of the old bug
  // (which produced 12-34% spreads).
  const TOLERANCE = 0.035;

  const cases = [
    { shape:'circle', mm:52 }, { shape:'circle', mm:63 }, { shape:'circle', mm:75 },
    { shape:'square', mm:63 },
    { shape:'rectangle', mm:null, rectDims:[99.1,57.3] }, // EU30009
  ];
  const pictoPool = ['exclamation','health','corrosive'];

  for(const c of cases){
    for(const n of [1,2,3]){
      const pictos = pictoPool.slice(0,n);
      const data = mkData(c.shape, c.mm, pictos, c.rectDims);
      const scales = scalesFor(c.mm || Math.max(...c.rectDims));

      const builder = measure(data, scales.builder);
      const composerPreview = measure(data, scales.composerPreview);
      const composerExport = measure(data, scales.composerExport);

      const label = `${c.shape} ${c.mm||c.rectDims.join('x')}mm, ${n} picto(s)`;

      // 1. Every caller's rendered pictogram must sit exactly at its own
      //    physical-10mm floor -- no growth beyond it, confirming the
      //    caller-dependent single-row growth is gone.
      for(const [name, m] of [['builder',builder],['composerPreview',composerPreview],['composerExport',composerExport]]){
        assert.strictEqual(m.pictoW, m.expectedFloor, `${label} (${name}): rendered pictogram width (${m.pictoW}) must equal the physical-10mm floor (${m.expectedFloor}) -- no caller-dependent growth`);
      }

      // 2. Same physical pictogram-to-label ratio across all three callers
      //    for the identical real label -- the actual parity requirement.
      const ratios = { builder: builder.ratio, composerPreview: composerPreview.ratio, composerExport: composerExport.ratio };
      const values = Object.values(ratios);
      const maxRatio = Math.max(...values), minRatio = Math.min(...values);
      const relDiff = (maxRatio - minRatio) / minRatio;
      assert(relDiff <= TOLERANCE, `${label}: pictogram-to-label ratio must match across Builder/Composer preview/export (got ${JSON.stringify(ratios)}, relative spread ${(relDiff*100).toFixed(2)}% > ${(TOLERANCE*100)}% tolerance)`);

      // 3. Never below the CLP 10mm-equivalent floor for that caller's own
      //    scale (redundant with check 1's exact-equality, kept as an
      //    explicit, human-readable floor assertion).
      for(const [name, m] of [['builder',builder],['composerPreview',composerPreview],['composerExport',composerExport]]){
        assert(m.pictoW >= Math.ceil(10*m.pxPerMm) - 0.5, `${label} (${name}): pictogram must never render below the CLP 10mm minimum at this resolution`);
      }
    }
  }

  console.log('pictogram parity checks passed (same physical pictogram-to-label ratio across Builder/Composer preview/export, 1-3 pictograms, 52/63/75mm circle, square, EU30009 rectangle; no caller-dependent growth beyond the physical 10mm floor)');
})().catch(e => { console.error(e); process.exit(1); });
