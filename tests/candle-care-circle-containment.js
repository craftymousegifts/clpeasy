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
let renders=0,passing=0,checked=0;
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
  assert(b.width*mm/260>=R.BCF_FLOOR_MM-0.02,'physical icon floor is preserved (SVG rounding tolerance)');
  for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){
   assert(Math.hypot(x-130,y-130)<=128.5+1e-8,mm+'mm care icon corner outside circle');
  }
  checked++;
 }
 assert.equal(result.fits,!result.blocked);
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
console.log(`PASS care-circle containment: ${renders} renders, ${passing} fitting, ${checked} icon boxes; 52–150mm, final/export/draft, with/without footer details`);
w.close();
