// Regression coverage for the content-aware label body allocator.
// Run from repo root: node tests/dynamic-label-space-allocation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('label-render.js', 'utf8');
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
    window.eval(source);
  }
});
const LR = dom.window.LabelRenderer;

const eryryrty = {
  shape:'circle', size:'custom', customW:63, customH:63,
  scentName:'eryryrty', productType:'Scented Candle',
  hStatements:'H317, H412, EUH208',
  pStatements:'P261, P273, P302+P352, P333+P313, P501',
  sensitisers:['Geranyl Acetate'], pictograms:['exclamation'], signal:'Warning',
  bizName:'CLPeasy', bizAddress:'CLPeasy', bizPhone:'01234567890', bizWebsite:'www.clpeasy.com',
  netWeight:'200g', burnTime:'35hrs', textColour:'dark', showBorder:true,
};
const lavendar = {
  ...eryryrty,
  scentName:'Lavendar',
  sensitisers:['Benzyl Salicylate','Hydroxycitronellal','Linalool','Limonene','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
};
const ordinary = {
  ...eryryrty, scentName:'Vanilla Bean', bizAddress:'1 Test Street', bizWebsite:'',
  hStatements:'H315', pStatements:'P273', sensitisers:['Linalool'],
};

let seq=0;
const render = data => LR.renderLabel(data, {instanceId:'dynamic-'+(++seq)});
function assertSafe(name, result){
  assert.strictEqual(result.fits, true, `${name} must fit safely; warnings=${JSON.stringify(result.warnings)}`);
  assert.strictEqual(result.warnings.length, 0, `${name} must have zero warnings`);
  const m=result.metrics, b=m.layoutBands;
  assert(b, `${name}: measured layoutBands metrics must be exposed`);
  const ordered=[b.header.y1,b.body.y0,b.productType.y1,b.signal.y0,b.signal.y1,b.pictograms&&b.pictograms.y0,b.pictograms&&b.pictograms.y1,b.mandatoryText.y0,b.mandatoryText.y1,b.footer.y0].filter(v=>v!=null);
  for(let i=1;i<ordered.length;i++) assert(ordered[i]>=ordered[i-1]-0.01, `${name}: content regions overlap or run backward at ${ordered[i-1]} -> ${ordered[i]}`);
  const ppm=m.labelDims.pw/m.labelDims.mmW;
  assert(m.fontSizes.hazard/ppm>=1.2-1e-9, `${name}: mandatory text fell below the active 1.2mm GB floor`);
  assert(m.mandatoryLines.length>0, `${name}: expected measured mandatory lines`);
  for(const line of m.mandatoryLines) assert(line.width<=line.availableWidth+0.01, `${name}: ${line.kind} line exceeds its real chord at y=${line.y}: ${line.width} > ${line.availableWidth}`);
  assert(m.pictoSquareSideMm>=LR.PICTO_FLOOR_SQUARE_MM-1e-9, `${name}: GHS pictogram fell below its 10mm red-square floor`);
  if(m.bcfSizeMm!=null) assert(m.bcfSizeMm>=LR.BCF_FLOOR_MM-1e-9, `${name}: candle-safety symbols fell below 5mm`);
}

try {
  assert(!/curY\s*\+=\s*slot\.(type|signal|picto)/.test(source), 'body elements must advance by measured rendered height, not fixed percentage slots');
  assert(source.includes('function _wrapAtY('), 'mandatory text must be wrapped against the chord width at each real line Y');
  assert(/const pictoBlockTopY\s*=\s*curY\s*;/.test(source), 'pictogram block must start at the allocator cursor');

  const er=render(eryryrty), lav63=render(lavendar), lav68=render({...lavendar,customW:68,customH:68}), lav75=render({...lavendar,customW:75,customH:75}), ord=render(ordinary);
  for(const [name,r] of [['eryryrty 63mm',er],['dense Lavendar 63mm',lav63],['dense Lavendar 68mm',lav68],['dense Lavendar 75mm',lav75],['ordinary 63mm',ord]]) assertSafe(name,r);

  const erPpm=er.metrics.labelDims.pw/er.metrics.labelDims.mmW;
  const ordPpm=ord.metrics.labelDims.pw/ord.metrics.labelDims.mmW;
  assert(er.metrics.fontSizes.hazard/erPpm>1.30, `eryryrty mandatory text must materially exceed its old 1.200mm floor; got ${(er.metrics.fontSizes.hazard/erPpm).toFixed(3)}mm`);
  assert(ord.metrics.fontSizes.hazard/ordPpm>3.0, `ordinary mandatory text must exceed its old 2.345mm size; got ${(ord.metrics.fontSizes.hazard/ordPpm).toFixed(3)}mm`);
  assert(lav63.metrics.fontSizes.hazard/(lav63.metrics.labelDims.pw/63)>1.2, 'dense Lavendar 63mm must fit above, not merely at, the mandatory-text floor');

  const noPicto=render({...ordinary,pictograms:[]});
  assert.strictEqual(noPicto.metrics.layoutBands.pictograms,null,'a label with no GHS pictograms must reserve no empty pictogram row');
  assertSafe('ordinary 63mm without GHS pictograms',noPicto);

  console.log('dynamic label-space allocation checks passed (real header boundary + measured type/signal/pictogram heights; per-line circle chords; no empty pictogram row; protected floors; dense Lavendar safely fits at 63/68/75mm; eryryrty and ordinary mandatory text materially enlarged)');
} catch(error){
  console.error(error.stack||error.message);
  process.exitCode=1;
}
