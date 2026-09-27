const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const {stub,PROFILES,RPC}=require('./stubdefs.js');
const ROOT='/home/user/clpeasy', OUT=process.argv[2];
const srv=http.createServer((q,r)=>{let f=decodeURIComponent(q.url.split('?')[0]);const p=path.join(ROOT,f);if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':'application/octet-stream'});fs.createReadStream(p).pipe(r);}).listen(0,async()=>{
 const base='http://127.0.0.1:'+srv.address().port;
 const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const out=[];
 for (const [vpName,vp] of [['desktop',{width:1366,height:900}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true}]]){
  const t=await b.newPage(); await t.setViewport(vp);
  const errs=[];t.on('pageerror',e=>errs.push(e.message));t.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});
  t.on('dialog',d=>d.dismiss());
  await t.setRequestInterception(true);
  t.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub(PROFILES.payg,RPC.charged)});if(u.startsWith(base)||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();return r.respond({status:204,body:''});});
  await t.goto(base+'/builder.html',{waitUntil:'load'});await new Promise(r=>setTimeout(r,1500));
  // extract, save, reopen
  const st=await t.evaluate(async()=>{document.getElementById('scent-name').value='Lavender Candle';document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
   document.getElementById('smart-paste-input').value='Signal word: Warning\nH317 May cause an allergic skin reaction.\nEUH208 Contains Linalool. May produce an allergic reaction.\nP261 P302+P352 P501';extractSDS();
   document.getElementById('biz-name').value='QA';document.getElementById('biz-address').value='1 Test St';document.getElementById('biz-phone').value='01234 567890';readForm();updateLabel();
   await saveLabel(); const rec=getSaved().find(e=>e.scentName==='Lavender Candle'); clearHazardData(); loadLabelRecord(rec);
   const lock={box:document.getElementById('smart-paste-input').readOnly,extractDisabled:document.querySelector('.btn-extract').disabled};
   return {flag:rec.hazardFromExtraction,lock};});
  await t.evaluate(()=>setApprovedBuilderStep(3)); await new Promise(r=>setTimeout(r,300));
  await t.evaluate(()=>{const e=document.querySelector('.smart-paste-box');e.scrollIntoView({block:'start'});});
  await t.screenshot({path:`${OUT}/c3-reopened-step3-locked-${vpName}.png`});
  await t.evaluate(()=>{setApprovedBuilderStep(2);});await new Promise(r=>setTimeout(r,300));
  await t.evaluate(()=>{const i=document.getElementById('scent-name');i.value='Rose Candle';i.dispatchEvent(new Event('input',{bubbles:true}));i.scrollIntoView({block:'start'});});
  await new Promise(r=>setTimeout(r,300));
  const v=await t.evaluate(()=>{const n=[...document.querySelectorAll('.hazard-review-notice')].filter(x=>x.offsetParent!==null);const r=n[0]&&n[0].getBoundingClientRect();return {visible:n.length,review:_hazardReviewRequired(),hScroll:document.documentElement.scrollWidth>window.innerWidth+1,rect:r&&{w:Math.round(r.width),right:Math.round(r.right)},vw:window.innerWidth};});
  await t.screenshot({path:`${OUT}/c4-rename-notice-step2-${vpName}.png`});
  out.push({vpName,st,v,errs});
  await t.close();
 }
 console.log(JSON.stringify(out,null,1));await b.close();srv.close();
});
