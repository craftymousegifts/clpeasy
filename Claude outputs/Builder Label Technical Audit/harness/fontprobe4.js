// Inline-SVG font timing probe: measure the same text immediately, and again after 3s.
const path=require('path');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.join(__dirname,'harness.html'));await p.waitForTimeout(1500);
const out=await p.evaluate(async()=>{
 const txt='Contains: Linalool, Limonene, Hexyl Cinnamal';const res={};const els={};
 for(const [k,fam,w] of [['dm400','DM Sans,sans-serif',400],['dm700','DM Sans,sans-serif',700],['dm800','DM Sans,sans-serif',800],['geo700','Georgia,serif',700]]){
  const h=document.createElement('div');h.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200"><text x="10" y="120" font-family="${fam}" font-size="60" font-weight="${w}">${txt}</text></svg>`;document.body.appendChild(h);
  els[k]=h.querySelector('text');res[k]={t0:+els[k].getComputedTextLength().toFixed(1)};}
 await new Promise(r=>setTimeout(r,3000));await document.fonts.ready;
 for(const k in els)res[k].t3s=+els[k].getComputedTextLength().toFixed(1);
 const c=document.createElement('canvas').getContext('2d');const m=f=>{c.font=f;return +c.measureText(txt).width.toFixed(1)};
 res.fitterAssumes={sans400:m('400 60px sans-serif'),sans700:m('700 60px sans-serif'),serif700:m('700 60px serif')};
 res.dmSansCanvas={w400:m('400 60px "DM Sans"'),w700:m('700 60px "DM Sans"')};
 return res;});
console.log(JSON.stringify(out,null,1));await b.close();})();
