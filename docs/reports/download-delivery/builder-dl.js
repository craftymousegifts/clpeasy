// Real-file download harness used for DOWNLOAD-DELIVERY-SIGNOFF-2026-10-04.md. Simulated accounts only; no real credentials.
// composer-dl.js / revisit.js expect JSZip 3.10.1 at ./package/dist/jszip.min.js (npm pack jszip@3.10.1) because the CDN is blocked here.
// Real-file download harness: Builder exports captured by Chromium to disk.
// usage: node builder-dl.js <BASE> <OUTDIR> [mode=guest|account] [width]
const puppeteer=require('/home/user/clpeasy/node_modules/puppeteer');
const fs=require('fs'),path=require('path');
const [BASE,OUT,MODE='guest',WIDTH='1366']=process.argv.slice(2);
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SDS=`2.2 Label elements
Signal word: Warning
Hazard statements
H317 May cause an allergic skin reaction.
H412 Harmful to aquatic life with long lasting effects.
Precautionary statements
P261 Avoid breathing vapours.
P272 Contaminated work clothing should not be allowed out of the workplace.
P302+P352 IF ON SKIN: Wash with plenty of water.
P333+P313 If skin irritation or rash occurs: Get medical advice/attention.
P501 Dispose of contents/container in accordance with local regulations.
EUH208 Contains Linalool, Citral, Coumarin. May produce an allergic reaction.`;
// account mode: signed-in stub + accounting RPC recorder (no network).
const ACCOUNT=`window.__rpc=[];window.__rpcMode=window.__rpcMode||'ok';window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'payg',status:'active',subscription_status:'payg',trial_end:new Date(Date.now()-2*864e5).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:8,created_at:'2026-09-01T00:00:00Z'};var q={select:function(){return q},eq:function(){return q},neq:function(){return q},order:function(){return q},limit:function(){return q},update:function(){return q},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},single:async function(){return {data:row,error:null}},maybeSingle:async function(){return {data:row,error:null}},then:function(r){return Promise.resolve({data:[row],error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(n,a){window.__rpc.push(n);if(n==='consume_download'){row.topup_credits=Math.max(0,row.topup_credits-1);return {data:{ok:true,consumed:true,free_redownload:false,source:'purchased',clean_export:true,purchased_downloads:row.topup_credits,downloads_used:0,downloads_limit:0},error:null};}return {data:null,error:null};},functions:{invoke:async function(){return {data:null,error:null}}}}}};`;
const GUEST="window.supabase={createClient:function(){var q={select:function(){return q},eq:function(){return q},update:function(){return q},upsert:function(){return q},single:async function(){return {data:null,error:null}},maybeSingle:async function(){return {data:null,error:null}},then:function(r){return Promise.resolve({data:null,error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};";
(async()=>{
  const browser=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const out={mode:MODE,width:+WIDTH,downloads:[],popups:[],alerts:[],errors:[]};
  const bcdp=await browser.target().createCDPSession();
  await bcdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:OUT,eventsEnabled:true});
  const dls={};
  bcdp.on('Browser.downloadWillBegin',e=>{dls[e.guid]={name:e.suggestedFilename,urlScheme:e.url.split(':')[0],urlLength:e.url.length,state:'started'};});
  bcdp.on('Browser.downloadProgress',e=>{if(dls[e.guid]){dls[e.guid].state=e.state;dls[e.guid].bytes=e.receivedBytes;}});
  browser.on('targetcreated',async t=>{if(t.type()==='page'){const pg=await t.page();if(pg){out.popups.push({url:t.url().slice(0,40)});pg.__isPopup=true;}}});
  const p=await browser.newPage();
  await p.setViewport({width:+WIDTH,height:WIDTH<600?844:900,isMobile:+WIDTH<600,hasTouch:+WIDTH<600});
  p.on('dialog',d=>{out.alerts.push(d.message().slice(0,200));d.dismiss();});
  p.on('pageerror',e=>out.errors.push(e.message));
  await p.setRequestInterception(true);
  p.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:MODE==='account'?ACCOUNT:GUEST});
    if(u.startsWith(BASE)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();
    if(u.includes('jszip'))return r.continue();
    return r.respond({status:204,body:''});});
  await p.goto(BASE+'/builder.html',{waitUntil:'load'});await sleep(2500);
  // Build a realistic label through the real steps.
  const nav=await p.evaluate(async(SDS)=>{
    const log=[];const set=(id,v)=>{const el=document.getElementById(id);if(!el){log.push('missing '+id);return;}el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    selectShape('rectangle');selectSize('custom');set('custom-w','100');set('custom-h','70');onDimInput&&onDimInput();
    setApprovedBuilderStep(2);await w(200);
    set('scent-name','Lavender Fields');set('product-type','Scented Candle');if(typeof onProductTypeChange==='function')onProductTypeChange();
    set('frag-load','10%');set('net-weight','200g');
    setApprovedBuilderStep(3);await w(300);log.push('at '+approvedBuilderStep);
    document.getElementById('smart-paste-input').value=SDS;extractSDS();await w(500);
    const hc=document.getElementById('hazard-confirm');if(hc&&!hc.checked){hc.click();}
    if(typeof toggleHazardNext==='function')toggleHazardNext();
    setApprovedBuilderStep(4);await w(300);log.push('at '+approvedBuilderStep);
    set('biz-name','Crafty Mouse Gifts');set('biz-address','1 Test Street, Testtown, TE1 1ST');set('biz-phone','01234 567890');
    setApprovedBuilderStep(5);await w(500);log.push('at '+approvedBuilderStep);
    const v=document.getElementById('verify-checkbox');if(v&&!v.checked)v.click();if(typeof toggleDownload==='function')toggleDownload();
    await w(300);
    return {log,allowed:_downloadAllowed(),msg:_downloadAllowed()?'':_downloadBlockedMessage(),h:S.hStatements,sens:[...S.sensitisers],pictos:[...S.pictograms],block:!!window._labelBlockDownload};
  },SDS);
  out.setup=nav;
  // Measure SVG data URI length the SVG export would use.
  out.svgDataUriLength=await p.evaluate(()=>{const s=buildSVG(true);return ('data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<?xml version="1.0" encoding="UTF-8"?>\n'+s)).length;});
  const before=await p.evaluate(()=>(window.__rpc||[]).length);
  const MOB=+WIDTH<600; const sel=k=>MOB?'#btn-'+k+'-sheet':'#btn-'+k+'-preview';
  const openSheet=async()=>{if(!MOB)return;await p.evaluate(()=>viewReviewLabel());await sleep(800);};
  if(MOB){await openSheet();out.mobileSheet=await p.evaluate(()=>{const v=id=>{const e=document.getElementById(id);if(!e)return 'missing';const r=e.getBoundingClientRect();return {vis:r.width>0&&r.height>0,inView:r.top>=0&&r.bottom<=innerHeight,op:getComputedStyle(e).opacity,pe:getComputedStyle(e).pointerEvents};};return {png:v('btn-png-sheet'),pdf:v('btn-pdf-sheet'),svg:v('btn-svg-sheet'),overflow:document.documentElement.scrollWidth>innerWidth};});await p.screenshot({path:path.join(OUT,'mobile-view-label.png')});}
  // PNG
  await p.click(sel('png')).catch(e=>out.errors.push('click png: '+e.message));await sleep(6000);
  // SVG
  await openSheet();await p.click(sel('svg')).catch(e=>out.errors.push('click svg: '+e.message));await sleep(4000);
  // PDF (print view)
  const pagesBefore=(await browser.pages()).length;
  await openSheet();await p.click(sel('pdf')).catch(e=>out.errors.push('click pdf: '+e.message));await sleep(4000);
  const pages=await browser.pages();
  if(pages.length>pagesBefore){const pop=pages[pages.length-1];await sleep(1500);
    try{const info=await pop.evaluate(()=>({title:document.title,hasSvg:!!document.querySelector('svg'),text:document.body.innerText.slice(0,200),svgW:document.querySelector('svg')&&document.querySelector('svg').getAttribute('width')}));out.pdfView=info;
      await pop.emulateMediaType('print');await pop.pdf({path:path.join(OUT,'print-view.pdf'),preferCSSPageSize:true,printBackground:true});}catch(e){out.pdfView={error:e.message};}}
  out.rpc=await p.evaluate(()=>window.__rpc||[]);
  out.downloads=Object.values(dls);
  out.files=fs.readdirSync(OUT).map(f=>({f,size:fs.statSync(path.join(OUT,f)).size}));
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1).slice(0,4000));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
