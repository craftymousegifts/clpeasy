// Measures the REAL Builder page's live preview text: which font does it actually render in?
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
p.on('pageerror',e=>{});
await p.goto('http://127.0.0.1:8765/builder.html',{waitUntil:'load'});
await p.waitForTimeout(4000);
const out=await p.evaluate(async()=>{
  const res={};
  try{ document.getElementById('scent-name').value='Lavender Fields';document.getElementById('biz-name').value='Crafty Test Studio';
  document.getElementById('biz-address').value='12 Mill Lane, Testville, TE1 2ST'; updateLabel(); }catch(e){res.err=String(e)}
  await new Promise(r=>setTimeout(r,2500)); await document.fonts.ready;
  const svg=document.querySelector('#label-svg-container svg')||document.querySelector('svg[viewBox]');
  res.previewKind=svg?'svg':(document.querySelector('#label-svg-container img')?'img(raster)':'none');
  const c=document.createElement('canvas').getContext('2d');
  if(svg){ res.samples=[...svg.querySelectorAll('text')].slice(0,6).map(t=>{const fs=t.getAttribute('font-size'),fw=t.getAttribute('font-weight')||'400',s=t.textContent.trim();
     const m=f=>{c.font=f;return +c.measureText(s).width.toFixed(2)};
     const serif=/Georgia/.test(t.getAttribute('font-family'));
     return {s:s.slice(0,30),fam:t.getAttribute('font-family'),actual:+t.getComputedTextLength().toFixed(2),asDMSans:m(`${fw} ${fs}px "DM Sans"`),asGenericFitter:m(`${+fw>=600?700:400} ${fs}px ${serif?'serif':'sans-serif'}`)}});}
  res.container=document.getElementById('label-svg-container')?.innerHTML.slice(0,200);
  return res;});
console.log(JSON.stringify(out,null,1));await b.close();})();
