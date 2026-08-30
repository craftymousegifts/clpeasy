// Physical CLP pictogram sizing — regression test.
//
// Per Michaela's approved formula: pictogram physical size is chosen once,
// in millimetres, as the LARGEST value in [10, 16] at which every
// mandatory element (pictograms, signal word, H statements, sensitisers,
// P statements, business/footer info, all at their existing legibility
// floors) still fits the label's own physical dimensions and content —
//   - 10mm is the absolute GB-CLP floor, never violated;
//   - 16mm is the "if possible" target for CLPeasy's <=3 litre scope;
//   - a roomy label reaches 16mm; a dense one shrinks only as far as it
//     must; a label that can't fit mandatory content even at 10mm keeps
//     10mm and reports fits:false (export stays blocked, same as any
//     other overflow).
// The choice must depend ONLY on physical label dimensions, label
// content, and pictogram count — never on which canvas/pixel resolution
// (Builder's fixed preview canvas, Composer's on-screen zoom, either
// page's export DPI) is doing the rendering. choosePictoMmAndRender() in
// label-render.js achieves this by checking candidate sizes against three
// FIXED reference scale formulas (never a caller's real opts.pw/ph) and
// requiring all three to fit before accepting a candidate.
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

  function mkData(shape, mm, pictos, rectDims, extra){
    const base = {
      scentName:'Parity', productType:'Candle', bizName:'Biz',
      signal:'WARNING', hStatements:'H317', pStatements:'P273',
      sensitisers:['Linalool'], pictograms: pictos,
    };
    const dims = shape==='rectangle'
      ? {shape, size:'custom', customW:rectDims[0], customH:rectDims[1]}
      : {shape, size:String(mm), customW:mm, customH:mm};
    return Object.assign(base, dims, extra||{});
  }

  // Extracts the rendered width of the FIRST GHS pictogram <image>/<use>
  // element directly from the SVG string -- the actual output, not an
  // internal/estimated bounding box. Bounded between its own SVG comment
  // markers so the EN 15494 candle-safety pictograms (same assetMarkup()
  // helper) are never confused with the GHS ones being measured.
  function renderedPictoWidth(svg){
    const blockMatch = svg.match(/<!-- PICTOGRAMS -->([\s\S]*?)<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->/);
    assert(blockMatch, 'could not locate the "<!-- PICTOGRAMS -->" block in the rendered SVG');
    const imgMatch = blockMatch[1].match(/<(?:image|use)[^>]*\/>/);
    assert(imgMatch, 'no GHS pictogram element found inside the PICTOGRAMS block: ' + blockMatch[1]);
    const widthMatch = imgMatch[0].match(/width="([\d.]+)"/);
    assert(widthMatch, 'GHS pictogram element has no width attribute: ' + imgMatch[0]);
    return Number(widthMatch[1]);
  }

  // The exact caller scales this app actually uses (see the comment on
  // choosePictoMmAndRender() in label-render.js for why these three
  // specific families matter):
  //  - Builder preview/export: pw defaults to 260/mmW (buildSVG() never
  //    passes pw/ph explicitly).
  //  - Composer on-screen preview: 3.7795 px/mm (96dpi-equivalent) * the
  //    default zoom (0.75).
  //  - Composer/Builder export (PDF/PNG): 300dpi, i.e. 300/25.4 px/mm.
  function scalesFor(mmW, mmH){
    return {
      builder: undefined,
      composerPreview: {pw: Math.round(mmW*3.7795*0.75), ph: Math.round(mmH*3.7795*0.75)},
      composerExport:  {pw: Math.round(mmW*300/25.4),     ph: Math.round(mmH*300/25.4)},
    };
  }

  function measure(data, scale){
    const opts = { instanceId:'m'+(seq++) };
    if(scale) Object.assign(opts, scale);
    const r = LR.renderLabel(data, opts);
    const dims = LR.getLabelDims(data, opts);
    const pictoW = renderedPictoWidth(r.svg);
    const pxPerMm = dims.pw / dims.mmW;
    return { pictoW, pw: dims.pw, mmW: dims.mmW, pxPerMm, fits: r.fits, pictoSizeMm: r.metrics.pictoSizeMm, ratio: pictoW/dims.pw };
  }

  function measureAllScales(data){
    const {mmW, mmH} = LR.getLabelDims(data, {});
    const scales = scalesFor(mmW, mmH);
    return {
      builder: measure(data, scales.builder),
      composerPreview: measure(data, scales.composerPreview),
      composerExport: measure(data, scales.composerExport),
    };
  }

  // 3.5% -- comfortably above integer Math.round()/Math.ceil() rounding
  // noise, well below anything visible, but still tight enough to catch a
  // real reintroduction of caller-dependent growth.
  const RATIO_TOLERANCE = 0.035;
  const PICTO_FLOOR_MM = 10;
  const PICTO_TARGET_MM = 16;

  function assertParity(label, m){
    // 1. The chosen physical mm size must be IDENTICAL across all three
    //    caller scales -- the core "depends only on physical dims/content/
    //    count, not canvas pixels" requirement.
    assert.strictEqual(m.composerPreview.pictoSizeMm, m.builder.pictoSizeMm, `${label}: Composer preview must choose the identical physical pictogram mm size as Builder`);
    assert.strictEqual(m.composerExport.pictoSizeMm, m.builder.pictoSizeMm, `${label}: Composer export must choose the identical physical pictogram mm size as Builder`);
    // 2. Never outside [10,16].
    for(const [name, r] of Object.entries(m)){
      assert(r.pictoSizeMm >= PICTO_FLOOR_MM - 1e-9 && r.pictoSizeMm <= PICTO_TARGET_MM + 1e-9, `${label} (${name}): chosen pictogram size ${r.pictoSizeMm}mm must be within [${PICTO_FLOOR_MM},${PICTO_TARGET_MM}]mm`);
    }
    // 3. Rendered pixel width must equal ceil(chosenMm * that caller's own
    //    pxPerMm) -- i.e. pictoSz = selectedPictoMm * pxPerMm, applied
    //    after the mm choice, never before.
    for(const [name, r] of Object.entries(m)){
      const expectedPx = Math.ceil(r.pictoSizeMm * r.pxPerMm);
      assert.strictEqual(r.pictoW, expectedPx, `${label} (${name}): rendered pictogram width (${r.pictoW}px) must equal the chosen mm size times this caller's own pxPerMm (${expectedPx}px)`);
    }
    // 4. Physical pictogram-to-label ratio still matches across callers
    //    (redundant with 1+3 given identical mm, kept as an explicit,
    //    human-readable end-to-end check).
    const ratios = { builder: m.builder.ratio, composerPreview: m.composerPreview.ratio, composerExport: m.composerExport.ratio };
    const values = Object.values(ratios);
    const relDiff = (Math.max(...values) - Math.min(...values)) / Math.min(...values);
    assert(relDiff <= RATIO_TOLERANCE, `${label}: pictogram-to-label ratio must match across Builder/Composer preview/export (got ${JSON.stringify(ratios)}, relative spread ${(relDiff*100).toFixed(2)}% > ${(RATIO_TOLERANCE*100)}% tolerance)`);
  }

  // ── 1. Roomy / dense / bounds across the requested size+picto matrix ──
  const cases = [
    { shape:'circle', mm:52 }, { shape:'circle', mm:63 }, { shape:'circle', mm:75 },
    { shape:'square', mm:63 },
    { shape:'rectangle', mm:null, rectDims:[99.1,57.3] }, // EU30009
  ];
  const pictoPool = ['exclamation','health','corrosive'];
  const seenSizes = []; // for the "roomy reaches 16 / dense reduces" checks below

  for(const c of cases){
    for(const n of [1,2,3]){
      const pictos = pictoPool.slice(0,n);
      const data = mkData(c.shape, c.mm, pictos, c.rectDims);
      const label = `${c.shape} ${c.mm||c.rectDims.join('x')}mm, ${n} picto(s)`;
      const m = measureAllScales(data);
      assertParity(label, m);
      assert.strictEqual(m.builder.fits, true, `${label}: this short-content fixture is expected to fit at every scale`);
      seenSizes.push({label, mm: m.builder.pictoSizeMm});
    }
  }

  // Roomy cases (single pictogram, plenty of room) must reach the 16mm
  // target -- confirms the search doesn't under-grow when content permits.
  const roomySingle = seenSizes.filter(s => / 1 picto/.test(s.label));
  for(const s of roomySingle){
    assert.strictEqual(s.mm, PICTO_TARGET_MM, `${s.label}: a roomy single-pictogram label must reach the 16mm target`);
  }

  // ── 2. Dense content reduces only as much as required (graduated, not a
  //    snap straight to the floor) -- 3 pictograms on a 52mm/63mm circle
  //    need a second row, consuming more layout space, so the search
  //    should land somewhere BETWEEN the floor and the target, not at
  //    either extreme, and a smaller physical label should need to shrink
  //    at least as much as a larger one carrying the same content. ──────
  const dense52 = seenSizes.find(s => s.label === 'circle 52mm, 3 picto(s)');
  const dense63 = seenSizes.find(s => s.label === 'circle 63mm, 3 picto(s)');
  const roomy75x3 = seenSizes.find(s => s.label === 'circle 75mm, 3 picto(s)');
  assert(dense52.mm > PICTO_FLOOR_MM && dense52.mm < PICTO_TARGET_MM, `circle 52mm/3 pictograms must reduce below the 16mm target (needs a second picto row) but stay above the 10mm floor -- got ${dense52.mm}mm`);
  assert(dense63.mm > PICTO_FLOOR_MM && dense63.mm < PICTO_TARGET_MM, `circle 63mm/3 pictograms must reduce below the 16mm target but stay above the 10mm floor -- got ${dense63.mm}mm`);
  assert(dense63.mm > dense52.mm, `a larger physical label (63mm) carrying the same dense 3-pictogram content as a smaller one (52mm) must need LESS reduction (${dense63.mm}mm) than the smaller one (${dense52.mm}mm), not more`);
  assert.strictEqual(roomy75x3.mm, PICTO_TARGET_MM, `circle 75mm/3 pictograms has enough room to still reach the 16mm target -- got ${roomy75x3.mm}mm`);

  // ── 3. Impossible content (can't fit even at the 10mm floor) keeps the
  //    floor size and reports fits:false, at every scale -- export stays
  //    blocked exactly like any other overflow. ────────────────────────
  const impossible = mkData('circle', 52, ['exclamation','health','corrosive'], null, {
    signal:'DANGER',
    hStatements:'H225,H301,H311,H314,H317,H334,H335,H336',
    pStatements:'P210,P233,P260,P261,P271,P273,P301+P310,P305+P351+P338',
    sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
  });
  const impossibleM = measureAllScales(impossible);
  for(const [name, r] of Object.entries(impossibleM)){
    assert.strictEqual(r.fits, false, `impossible-content fixture (${name}): must report fits:false, keeping export blocked`);
    assert.strictEqual(r.pictoSizeMm, PICTO_FLOOR_MM, `impossible-content fixture (${name}): must retain the 10mm floor, never shrink further or grow`);
  }
  assertParity('impossible-content circle 52mm, 3 picto(s)', impossibleM);

  // ── 4. 63x44mm as a CUSTOM regression fixture only -- per Michaela's
  //    explicit instruction, this is a recurring size from project history
  //    used to prove parity here, NOT added as a new Builder preset or
  //    Composer registry template (neither exists in this codebase; this
  //    is size:'custom', not a preset key). ─────────────────────────────
  const custom63x44 = mkData('rectangle', null, ['exclamation'], [63,44]);
  const m63x44 = measureAllScales(custom63x44);
  assertParity('63x44mm custom rectangle (regression fixture, not a preset), 1 picto', m63x44);
  assert.strictEqual(m63x44.builder.fits, true, '63x44mm custom rectangle fixture is expected to fit');

  // ── 5. Short vs. long mandatory content on the SAME physical label --
  //    proves the search actually responds to content length (not just
  //    pictogram count), consistently across all three caller scales. ──
  const shortContent = mkData('circle', 63, ['exclamation'], null, {
    hStatements:'H317', pStatements:'P273', sensitisers:['Linalool'],
  });
  const longContent = mkData('circle', 63, ['exclamation'], null, {
    signal:'DANGER',
    hStatements:'H225,H301,H311,H314,H317,H334,H335,H336,H361,H371',
    pStatements:'P210,P233,P260,P261,P271,P273,P301+P310,P305+P351+P338',
    sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
  });
  const shortM = measureAllScales(shortContent);
  const longM = measureAllScales(longContent);
  assertParity('63mm circle, short mandatory content', shortM);
  assertParity('63mm circle, long mandatory content', longM);
  assert.strictEqual(shortM.builder.pictoSizeMm, PICTO_TARGET_MM, 'short mandatory content on a 63mm circle must reach the 16mm target');
  assert(longM.builder.pictoSizeMm <= shortM.builder.pictoSizeMm, `long mandatory content (${longM.builder.pictoSizeMm}mm) must never choose a LARGER pictogram than short content (${shortM.builder.pictoSizeMm}mm) on the same physical label`);

  // ── 6. No caller-dependent growth beyond what content/physical size
  //    determines -- i.e. the OLD bug (absolute-SVG-unit single-row
  //    growth) must not have returned. Every case above already proves
  //    this via assertParity()'s exact-px check; this is a final,
  //    explicit sanity statement.
  console.log("physical CLP pictogram sizing checks passed (10-16mm bounded search; identical physical mm size and pixel ratio across Builder/Composer preview/export for 1-3 pictograms, 52/63/75mm circle, square, EU30009 rectangle, 63x44mm custom regression fixture; roomy labels and short content reach 16mm; dense labels/long content reduce only as far as required, proportional to available room and never exceed shorter content's size; content that cannot fit even at the 10mm floor keeps the floor and reports fits:false at every scale)");
})().catch(e => { console.error(e); process.exit(1); });
