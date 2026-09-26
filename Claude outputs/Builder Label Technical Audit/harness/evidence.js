// Focused evidence capture: preview + export PNG for specific FIT-but-defective cases, plus an
// "unclipped" diagnostic render (clip-path removed) so text that the label's clip silently hides becomes visible.
const path=require('path'),fs=require('fs');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const {CASES,GEOMS}=require('./fixtures');const SH=path.resolve(__dirname,'../screenshots');
const want=[['18-long-room-spray','circle-100'],['16-long-wax-melt','circle-63'],['05-max-P','circle-100'],['01-short-simple','circle-100'],['01-short-simple','circle-52-default'],['15-long-candle','circle-100']];
(async()=>{const b=await chromium.launch();const p=await b.newPage({deviceScaleFactor:3});await p.goto('file://'+path.join(__dirname,'harness.html'));await p.waitForTimeout(1500);
for(const [c,g] of want){const d=Object.assign({},CASES.find(x=>x[0]===c)[1],GEOMS.find(x=>x[0]===g)[1]);
 const r=await p.evaluate(([d,id])=>{const r=LabelRenderer.renderLabel(d,{instanceId:id});const s=document.getElementById('stage');
   // clipped (as shipped)
   s.innerHTML='<div id=a style="display:inline-block;margin:8px"></div><div id=b style="display:inline-block;margin:8px"></div>';
   s.querySelector('#a').innerHTML=r.svg.replace(/width="[\d.]+" height="[\d.]+" viewBox/,'width="520" height="'+Math.round(520*r.metrics.labelDims.ph/r.metrics.labelDims.pw)+'" viewBox');
   // diagnostic: same SVG with clip removed + red outline of the real label edge
   let u=r.svg.replace(/clip-path="url\([^)]*\)"/,'').replace(/width="[\d.]+" height="[\d.]+" viewBox/,'width="520" height="'+Math.round(520*r.metrics.labelDims.ph/r.metrics.labelDims.pw)+'" viewBox');
   const {pw,ph}=r.metrics.labelDims;const R=Math.min(pw,ph)/2-1.5;
   u=u.replace('</g></svg>',`</g><circle cx="${pw/2}" cy="${ph/2}" r="${R}" fill="none" stroke="red" stroke-width="0.6"/></svg>`);
   s.querySelector('#b').innerHTML=u;return {fits:r.fits,warnings:[...r.warnings]};},[d,'ev'+c.replace(/\W/g,'')+g.replace(/\W/g,'')]);
 await p.waitForTimeout(300);
 await (await p.$('#stage')).screenshot({path:path.join(SH,`EVIDENCE__${c}__${g}__clipped-vs-unclipped.png`)});
 console.log(c,g,JSON.stringify(r));}
await b.close();})();
