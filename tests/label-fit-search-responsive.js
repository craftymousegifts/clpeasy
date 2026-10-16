// Geometric containment is independent of font metrics. Exercise the actual
// emitted (rounded) care-icon boxes, including incomplete and export renders.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
let measurements=0,fontScale=1;
const w=new JSDOM('',{runScripts:'outside-only'}).window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(text){
 measurements++;const size=fontScale*Number((this.font.match(/([\d.]+)px/)||[])[1])||12;
 return {width:[...String(text)].reduce((n,c)=>n+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0)};
}});
w.eval(fs.readFileSync('label-render.js','utf8'));

(async()=>{try{
 const R=w.LabelRenderer;
 const d={shape:'circle',size:52,scentName:'Mint',productType:'Scented Candle',bizName:'Test Maker',bizAddress:'1 Test Lane, EX1 2AB',bizPhone:'01632 960000',hStatements:'H317',pStatements:'P102,P501',pictograms:['exclamation']};
 const opts={instanceId:'async-parity'};
 const expected=R.findSmallestFittingSize(d,opts);
 let heartbeat=false;setTimeout(()=>{heartbeat=true},0);
 const actual=await R.findSmallestFittingSizeAsync(d,opts);
 assert(heartbeat,'browser event loop runs during search');assert.deepStrictEqual(actual,expected);
 measurements=0;const cancelled=await R.findSmallestFittingSizeAsync(d,opts,()=>false);
 assert.equal(cancelled,null);assert.equal(measurements,0,'cancelled search never measures another candidate');
 const first=R.renderLabel(d,opts);fontScale=1.3;const changed=R.renderLabel(d,opts);
 assert.notEqual(changed.svg,first.svg,'later render remeasures changed font metrics');
 fontScale=1;assert.equal(R.renderLabel(d,opts).svg,first.svg,'cache cannot leak font metrics between renders');
 const normal=R.renderLabel(d,opts),live=R.renderLabel(d,{...opts,livePreview:true});
 assert.deepStrictEqual(normal.metrics,live.metrics);assert.equal(normal.fits,live.fits);
 assert.equal(R.renderLabel(d,{...opts,livePreview:true,forExport:true}).svg,R.renderLabel(d,{...opts,forExport:true}).svg,'live presentation cannot alter exports');
 console.log('PASS responsive fit search: synchronous parity, event-loop yield, cancellation, fresh font metrics and export invariance');
 }catch(e){console.error(e);process.exitCode=1}finally{w.close()}})();
