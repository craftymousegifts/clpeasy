const path=require('path');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.join(__dirname,'harness.html'));
const out=await p.evaluate(async()=>{
 await document.fonts.load('400 20px "DM Sans"');await document.fonts.ready;
 const txt='Contains: Linalool, Limonene, Hexyl Cinnamal';const res={};
 for(const fam of ['DM Sans,sans-serif',"'DM Sans',sans-serif",'DM Sans']){
  const h=document.createElement('div');h.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200"><text id="t" x="10" y="120" font-family="${fam.replace(/'/g,'&apos;')}" font-size="60" font-weight="400">${txt}</text></svg>`;document.body.appendChild(h);
  const t=h.querySelector('#t');res[fam]={len:+t.getComputedTextLength().toFixed(1),computed:getComputedStyle(t).fontFamily};h.remove();}
 const d=document.createElement('span');d.style.font='400 60px "DM Sans"';d.textContent=txt;document.body.appendChild(d);res.htmlSpanDMSans=d.getBoundingClientRect().width;
 res.fontsList=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight).slice(0,10);
 return res;});
console.log(JSON.stringify(out,null,1));await b.close();})();
