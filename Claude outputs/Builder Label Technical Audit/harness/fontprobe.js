// Controlled font-fidelity probe: does inline preview use DM Sans, does export <img> use it, and what does the fitter assume?
const path=require('path');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.join(__dirname,'harness.html'));
const out=await p.evaluate(async()=>{
 await document.fonts.load('400 20px "DM Sans"');await document.fonts.load('700 20px "DM Sans"');await document.fonts.ready;
 const txt='Contains: Linalool, Limonene, Hexyl Cinnamal, Benzyl Salicylate';
 const c=document.createElement('canvas').getContext('2d');const cm=f=>{c.font=f;return +c.measureText(txt).width.toFixed(1)};
 const res={loaded700:document.fonts.check('700 20px "DM Sans"'),canvas:{'700 sans-serif (fitter assumes)':cm('700 60px sans-serif'),'700 "DM Sans"':cm('700 60px "DM Sans"'),'400 sans-serif (fitter)':cm('400 60px sans-serif'),'400 "DM Sans"':cm('400 60px "DM Sans"'),'700 serif (fitter, biz name)':cm('700 60px serif'),'700 Georgia,serif':cm('700 60px Georgia,serif')}};
 const mk=(fam,w)=>`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200" viewBox="0 0 3000 200"><defs><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;900&amp;display=swap');</style></defs><rect width="3000" height="200" fill="#fff"/><text id="t" x="10" y="120" font-family="${fam}" font-size="60" font-weight="${w}" fill="#000">${txt}</text></svg>`;
 res.inline={};res.exportImg={};
 for(const [fam,w] of [['DM Sans,sans-serif',400],['DM Sans,sans-serif',700],['Georgia,serif',700]]){
   const h=document.createElement('div');h.innerHTML=mk(fam,w);document.body.appendChild(h);await document.fonts.ready;
   res.inline[fam+' '+w]=+h.querySelector('#t').getComputedTextLength().toFixed(1);h.remove();
   res.exportImg[fam+' '+w]=await new Promise(r=>{const img=new Image();img.onload=()=>{const cv=document.createElement('canvas');cv.width=3000;cv.height=200;const x=cv.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,3000,200).data;let L=3000,R=0;for(let yy=0;yy<200;yy++)for(let xx=0;xx<3000;xx++){const i=(yy*3000+xx)*4;if(d[i]<128){if(xx<L)L=xx;if(xx>R)R=xx}}r(R-L)};img.src=URL.createObjectURL(new Blob([mk(fam,w)],{type:'image/svg+xml'}))});
 }
 return res;});
console.log(JSON.stringify(out,null,1));await b.close();})();
