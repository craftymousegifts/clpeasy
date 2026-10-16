// Geometric containment is independent of font metrics. Exercise the actual
// emitted (rounded) care-icon boxes, including incomplete and export renders.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const w=new JSDOM('',{runScripts:'outside-only'}).window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(text){
 const size=Number((this.font.match(/([\d.]+)px/)||[])[1])||12;
 return {width:[...String(text)].reduce((n,c)=>n+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0)};
}});
w.eval(fs.readFileSync('label-render.js','utf8'));
const R=w.LabelRenderer;
const base={shape:'circle',size:'custom',scentName:'Mint',productType:'Scented Candle',bizName:'Test Maker',bizAddress:'1 Test Lane, EX1 2AB',bizPhone:'01632 960000',hStatements:'H317',pStatements:'P102,P501',pictograms:['exclamation'],sensitisers:[]};
let renders=0,passing=0,checked=0,edgeOnly=0,minClearance=Infinity;
for(let mm=52;mm<=150;mm++)for(const footer of [{},{netWeight:'180g',burnTime:'40 hrs',batchNum:'B2310'}])for(const opts of [{},{forExport:true},{incompletePreview:true}]){
 const d={...base,customW:mm,customH:mm,...footer};
 const result=R.renderLabel(d,{instanceId:'care-containment',...opts});renders++;
 const row=result.svg.split('<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->')[1].split('<!-- WATERMARK -->')[0];
 const boxes=Array.from(row.matchAll(/<(?:image|use)\b[^>]*>/g),m=>{
  const attrs=Object.fromEntries(Array.from(m[0].matchAll(/\b(x|y|width|height)="([\d.-]+)"/g),a=>[a[1],Number(a[2])]));
  return attrs;
 });
 if(result.fits){passing++;assert.equal(boxes.length,5,'a passing candle keeps all care icons');}
 for(const b of boxes){
  if(result.fits)assert(b.y>=result.metrics.hazardBounds.y1+result.metrics.fontSizes.hazard*0.3-0.1,'care icons cannot overlap hazard/precautionary layout');
  assert(b.width*mm/260>=R.BCF_FLOOR_MM-0.02,'physical icon floor is preserved (SVG rounding tolerance)');
  for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){
   const clearanceMm=(128.5-Math.hypot(x-130,y-130))*mm/260;
   minClearance=Math.min(minClearance,clearanceMm);
   assert(clearanceMm>=1,mm+'mm care icon corner needs 1mm clearance, got '+clearanceMm);
  }
  checked++;
 }
 assert.equal(result.fits,!result.blocked);
 if(result.metrics.candleCareEdgeClipped && result.metrics.pictoSearchFits){
  edgeOnly++;assert(!result.fits,'GHS selection eligibility cannot bypass final care clearance');
  assert(result.warnings.includes('candle-safety-edge-clearance'));
 }
 if(opts.forExport&&result.blocked)assert(result.svg.includes('FULL CONTENT DOES NOT FIT'),'blocked exports cannot use draft messaging');
}
// Before final review only the presentation changes; fit and export guards do not.
const small={...base,customW:52,customH:52,netWeight:'180g'};
const final=R.renderLabel(small,{instanceId:'care-final'});
const draft=R.renderLabel(small,{instanceId:'care-draft',incompletePreview:true});
assert(!final.fits);assert.equal(draft.fits,final.fits);assert.deepStrictEqual(draft.warnings,final.warnings);
assert(draft.svg.includes('Preview in progress'));assert(!draft.svg.includes('FULL CONTENT DOES NOT FIT'));
const exported=R.renderLabel(small,{instanceId:'care-export',incompletePreview:true,forExport:true});
assert(exported.svg.includes('FULL CONTENT DOES NOT FIT'));assert(!exported.svg.includes('Preview in progress'));
assert(passing>0&&passing<renders);
assert(edgeOnly>0,'matrix exercises care-clearance-only blocking without resizing GHS/text');
// Production v1.2.0 (8a675d0) baseline with this test's deterministic font
// metrics. Extra care clearance must not feed back into GHS/text sizing.
const baseline64=R.renderLabel({...base,customW:64,customH:64},{instanceId:'care-baseline64'});
assert.equal(JSON.stringify(baseline64.metrics.fontSizes),JSON.stringify({scent:13.878000000000002,biz:13,web:9.450000000000001,type:16.848971999999996,signal:19.220308799999994,hazard:8.6689453125,footer:7.5}));
assert.equal(baseline64.metrics.pictoSquareSideMm,11.31370849898476);
assert(!baseline64.fits && baseline64.metrics.candleCareEdgeClipped,'keep original layout and block rather than shrink GHS to rescue care clearance');
console.log(`PASS care-circle containment: ${renders} renders, ${passing} fitting, ${checked} icon boxes, minimum clearance ${minClearance.toFixed(3)}mm; 52–150mm, final/export/draft, with/without footer details`);
w.close();
