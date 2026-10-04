// Real-file download harness used for DOWNLOAD-DELIVERY-SIGNOFF-2026-10-04.md. Simulated accounts only; no real credentials.
// composer-dl.js / revisit.js expect JSZip 3.10.1 at ./package/dist/jszip.min.js (npm pack jszip@3.10.1) because the CDN is blocked here.
// Builder -> save -> reopen -> Composer -> real downloads (A4 print view, ZIP, sequential PNGs).
const puppeteer=require('/home/user/clpeasy/node_modules/puppeteer');
const fs=require('fs'),path=require('path');
const [BASE,OUT,WIDTH='1366']=process.argv.slice(2);
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const JSZIP=fs.readFileSync(path.join(__dirname,'package/dist/jszip.min.js'),'utf8');
const H=fs.readFileSync(path.join(__dirname,'builder-dl.js'),'utf8');
const ACCOUNT=eval(H.match(/const ACCOUNT=(`[\s\S]*?`);/)[1]);
const SDS=eval(H.match(/const SDS=(`[\s\S]*?`);/)[1]);
(async()=>{
  const browser=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const bcdp=await browser.target().createCDPSession();
  await bcdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:OUT,eventsEnabled:true});
  const dls={};bcdp.on('Browser.downloadWillBegin',e=>{dls[e.guid]={name:e.suggestedFilename,state:'started'};});
  bcdp.on('Browser.downloadProgress',e=>{if(dls[e.guid]){dls[e.guid].state=e.state;dls[e.guid].bytes=e.receivedBytes;}});
  const out={alerts:[],errors:[]};
  const prep=async p=>{await p.setViewport({width:+WIDTH,height:900});p.on('dialog',d=>{out.alerts.push(d.message().slice(0,160));d.dismiss();});p.on('pageerror',e=>out.errors.push(e.message));
    await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();
      if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:ACCOUNT});
      if(u.includes('jszip'))return r.respond({status:200,contentType:'text/javascript',body:JSZIP});
      if(u.startsWith(BASE)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();
      return r.respond({status:204,body:''});});};
  // 1. Builder: create and save
  const b=await browser.newPage();await prep(b);
  await b.goto(BASE+'/builder.html',{waitUntil:'load'});await sleep(2500);
  out.saved=await b.evaluate(async(SDS)=>{const set=(id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};const w=ms=>new Promise(r=>setTimeout(r,ms));
    selectShape('rectangle');selectSize('custom');set('custom-w','100');set('custom-h','70');onDimInput&&onDimInput();
    setApprovedBuilderStep(2);await w(200);set('scent-name','Lavender Fields');set('product-type','Scented Candle');onProductTypeChange&&onProductTypeChange();set('frag-load','10%');set('net-weight','200g');
    setApprovedBuilderStep(3);await w(300);document.getElementById('smart-paste-input').value=SDS;extractSDS();await w(500);
    const hc=document.getElementById('hazard-confirm');if(hc&&!hc.checked)hc.click();toggleHazardNext&&toggleHazardNext();
    setApprovedBuilderStep(4);await w(300);set('biz-name','Crafty Mouse Gifts');set('biz-address','1 Test Street, Testtown, TE1 1ST');set('biz-phone','01234 567890');
    setApprovedBuilderStep(5);await w(500);const v=document.getElementById('verify-checkbox');if(v&&!v.checked)v.click();toggleDownload&&toggleDownload();
    nudgeHazardFS&&nudgeHazardFS(1);readForm();updateLabel();
    await saveLabel();const id=editingLabelId;const rec=JSON.parse(JSON.stringify(LabelLibrary.findById(getSaved(),id)));return {id,step:approvedBuilderStep,rec:{shape:rec.shape,customW:rec.customW,customH:rec.customH,scentName:rec.scentName,productType:rec.productType,h:rec.hStatements,sens:rec.sensitisers,pictos:rec.pictograms,biz:[rec.bizName,rec.bizAddress,rec.bizPhone],hazardFS:rec.hazardFSOverride}};},SDS);
  // 2. Reopen in Builder
  await b.goto(BASE+'/builder.html?label='+out.saved.id,{waitUntil:'load'});await sleep(2500);
  out.reopened=await b.evaluate(()=>({step:approvedBuilderStep,name:S.scentName,shape:S.shape,w:S.customW,h:S.customH,hz:S.hStatements,sens:[...S.sensitisers],biz:S.bizName,hazardFS:S.hazardFSOverride}));
  await b.close();
  // 3. Composer
  const c=await browser.newPage();await prep(c);
  await c.goto(BASE+'/print.html',{waitUntil:'load'});await sleep(3000);
  out.composer=await c.evaluate(async(id)=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
    const r=resolveSheetLabel(id);addToSheet(id);setQty&&setQty(id,2);await w(800);updateExportButtonState();
    const pl=getSheetPlacementsMM();
    return {found:!!r,qty:getTotalQty(),gate:getSheetFitBlockMessage(),pdfDisabled:document.getElementById('btn-pdf').disabled,isPro,placements:pl.map(p=>[p.w,p.h,Math.round(p.x),Math.round(p.y)]),rpc:(window.__rpc||[]).slice()};},out.saved.id);
  // A4 print view
  const n0=(await browser.pages()).length;
  await c.click('#btn-pdf');await sleep(6000);
  const pages=await browser.pages();
  if(pages.length>n0){const pop=pages[pages.length-1];await sleep(1000);
    out.a4=await pop.evaluate(()=>({title:document.title,img:!!document.querySelector('img'),imgW:document.querySelector('img')&&document.querySelector('img').naturalWidth,imgH:document.querySelector('img')&&document.querySelector('img').naturalHeight}));
    const src=await pop.evaluate(()=>document.querySelector('img').src);fs.writeFileSync(path.join(OUT,'a4-sheet.png'),Buffer.from(src.split(',')[1],'base64'));
    await pop.emulateMediaType('print');await pop.pdf({path:path.join(OUT,'a4-print-view.pdf'),preferCSSPageSize:true,printBackground:true});await pop.close();}
  out.rpcAfterA4=await c.evaluate(()=>(window.__rpc||[]).length);
  // ZIP
  await c.evaluate(()=>openCricutModal());await sleep(500);
  await c.evaluate(()=>cricutDownloadZip());await sleep(8000);
  out.rpcAfterZip=await c.evaluate(()=>(window.__rpc||[]).length);
  // Sequential
  await c.evaluate(()=>{closeCricutModal&&closeCricutModal();});await sleep(3000);await c.evaluate(()=>openCricutModal());await sleep(500);
  await c.evaluate(()=>cricutDownloadSequential());await sleep(9000);
  out.rpcAfterSeq=await c.evaluate(()=>(window.__rpc||[]).length);
  out.downloads=Object.values(dls);
  out.files=fs.readdirSync(OUT).map(f=>({f,size:fs.statSync(path.join(OUT,f)).size}));
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
