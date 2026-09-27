const puppeteer=require('puppeteer');const {stub,PROFILES,RPC}=require('./stubdefs.js');
const BASE='https://clpeasy-pr156-payg-test-v10.netlify.app', OUT=process.argv[2];
// Deployed files are fetched by curl, which verifies TLS against the agent
// proxy CA bundle (Chromium's own trust store is not configured here), and
// handed to Chromium unchanged via request interception.
const {execFileSync}=require('child_process');const cache={};
function fetchDeployed(u){if(cache[u])return cache[u];
 const hdr=execFileSync('curl',['-sS','--cacert','/root/.ccr/ca-bundle.crt','-D','-','-o','/dev/null',u]).toString();
 const body=execFileSync('curl',['-sS','--cacert','/root/.ccr/ca-bundle.crt',u],{maxBuffer:64*1024*1024});
 const status=Number((hdr.match(/HTTP\/[\d.]+ (\d+)/g)||[]).pop().split(' ')[1]);
 const ct=((hdr.match(/content-type: *([^\r\n]+)/ig)||[]).pop()||'').replace(/content-type: */i,'');
 return cache[u]={status,contentType:ct||'application/octet-stream',body};}
(async()=>{
 const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const results=[];
 async function open(url,vp,profile,rpc,opts={}){
  const t=await b.newPage();await t.setViewport(vp);t.errs=[];t.dialogs=[];
  t.on('pageerror',e=>t.errs.push(e.message));
  t.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_|net::/.test(m.text()))t.errs.push(m.text());});
  t.on('dialog',d=>{t.dialogs.push(d.message());d.dismiss();});
  if(opts.popupBlocked)await t.evaluateOnNewDocument(()=>{window.open=function(){return null;};});
  await t.setRequestInterception(true);
  t.on('request',r=>{const u=r.url();
   if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub(PROFILES[profile],RPC[rpc])});
   if(u.startsWith(BASE)){const f=fetchDeployed(u);return r.respond({status:f.status,contentType:f.contentType,body:f.body});}
   if(u.startsWith('blob:')||u.startsWith('data:'))return r.continue();
   return r.respond({status:204,body:''});});
  const resp=await t.goto(url,{waitUntil:'load',timeout:60000});t.status=resp.status();
  await new Promise(r=>setTimeout(r,2500));return t;}
 const VPS=[['desktop',{width:1366,height:900}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true}]];
 // 1. page loads
 for(const [vn,vp] of VPS)for(const pg of ['index.html','pricing.html','builder.html','print.html','account.html','dashboard.html','my-labels.html']){
  const t=await open(`${BASE}/${pg}`,vp,'payg','charged');
  const info=await t.evaluate(()=>({title:document.title,hScroll:document.documentElement.scrollWidth>window.innerWidth+1,env:/\[TEST\]/.test(document.title),noindex:!!document.querySelector('meta[name=robots][content*=noindex]')}));
  results.push({check:'load',vn,pg,status:t.status,...info,errs:t.errs});await t.close();}
 // 2. builder flows (desktop + mobile)
 for(const [vn,vp] of VPS){
  const t=await open(`${BASE}/builder.html`,vp,'payg','charged');
  const r=await t.evaluate(async()=>{const o={};
   document.getElementById('scent-name').value='Lavender Candle';document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
   document.getElementById('smart-paste-input').value='Signal word: Warning\nH317 May cause an allergic skin reaction.\nEUH208 Contains Linalool. May produce an allergic reaction.\nP261 P302+P352 P501';extractSDS();
   document.getElementById('biz-name').value='QA';document.getElementById('biz-address').value='1 Test St';document.getElementById('biz-phone').value='01234 567890';readForm();updateLabel();
   o.lockAfterExtract=document.getElementById('smart-paste-input').readOnly&&document.querySelector('.btn-extract').disabled;
   await saveLabel();const rec=getSaved().find(e=>e.scentName==='Lavender Candle');o.savedFlag=rec&&rec.hazardFromExtraction;
   clearHazardData();loadLabelRecord(rec);o.lockAfterReopen=document.getElementById('smart-paste-input').readOnly&&document.querySelector('.btn-extract').disabled;
   o.labelKey=computeLabelKey();
   const i=document.getElementById('scent-name');i.value='Rose Candle';i.dispatchEvent(new Event('input',{bubbles:true}));
   o.reviewRequired=_hazardReviewRequired();o.notices=[...document.querySelectorAll('.hazard-review-notice')].filter(n=>n.style.display==='block').length;
   o.downloadBlocked=!_downloadAllowed();
   document.querySelector('.hazard-review-keep').click();o.afterKeep=_hazardReviewRequired();
   for(let n=2;n<=5;n++){if(n===4){const hc=document.getElementById('hazard-confirm');hc.checked=true;toggleHazardNext();}setApprovedBuilderStep(n);await new Promise(r=>setTimeout(r,150));}
   o.step=approvedBuilderStep;const v=document.getElementById('verify-checkbox');v.checked=true;toggleDownload();o.downloadAllowed=_downloadAllowed();
   return o;});
  // C6: PDF with real window.open (allowed)
  const tgP=new Promise(res=>{b.once('targetcreated',tg=>res(tg));setTimeout(()=>res(null),5000);});
  await t.evaluate(()=>printToPDF());const tg=await tgP;await new Promise(r=>setTimeout(r,1500));
  r.pdfWindow=!!tg;r.pdfUrl=tg?(await tg.page()).url().slice(0,5):null;
  r.pdfCharges=await t.evaluate(()=>(window.__rpc||[]).filter(x=>x[0]==='consume_download').length);
  r.guidance=await t.evaluate(()=>{const g=document.getElementById('dl-print-guidance');return g&&!g.hidden?g.innerText.replace(/\s+/g,' ').trim():null;});
  r.hScroll=await t.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  await t.evaluate(()=>{document.getElementById('dl-print-guidance').scrollIntoView({block:'center'});});
  await t.screenshot({path:`${OUT}/v12-deployed-builder-guidance-${vn}.png`});
  results.push({check:'builder-flow',vn,...r,errs:t.errs});await t.close();
  if(tg){try{await (await tg.page()).close();}catch(e){}}
  // C6: pop-up blocked
  const t2=await open(`${BASE}/builder.html`,vp,'payg','charged',{popupBlocked:true});
  const r2=await t2.evaluate(async()=>{document.getElementById('scent-name').value='Blocked QA';document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
   document.getElementById('smart-paste-input').value='Signal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P302+P352 P501';extractSDS();
   document.getElementById('biz-name').value='QA';document.getElementById('biz-address').value='1 Test St';document.getElementById('biz-phone').value='01234 567890';readForm();updateLabel();
   for(let n=2;n<=5;n++){if(n===4){const hc=document.getElementById('hazard-confirm');hc.checked=true;toggleHazardNext();}setApprovedBuilderStep(n);await new Promise(r=>setTimeout(r,150));}
   const v=document.getElementById('verify-checkbox');v.checked=true;toggleDownload();
   await printToPDF();await new Promise(r=>setTimeout(r,600));
   return {charges:(window.__rpc||[]).filter(x=>x[0]==='consume_download').length,warning:!!document.getElementById('print-popup-warn')};});
  results.push({check:'pdf-popup-blocked',vn,...r2,errs:t2.errs});await t2.close();
 }
 // 3. Composer wording served
 const t3=await open(`${BASE}/print.html`,VPS[0][1],'payg','charged');
 results.push({check:'composer-wording',served:await t3.evaluate(()=>/Print sheet downloaded/.test(String(showSheetPrintGuidance))&&!/Print sheet ready/.test(document.documentElement.innerHTML)),errs:t3.errs});await t3.close();
 console.log(JSON.stringify(results,null,1));await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
