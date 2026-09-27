const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const {stub,PROFILES,RPC}=require('./stubdefs.js');
const ROOT='/home/user/clpeasy';
const srv=http.createServer((q,r)=>{let f=decodeURIComponent(q.url.split('?')[0]);const p=path.join(ROOT,f);if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':'text/javascript'});fs.createReadStream(p).pipe(r);}).listen(0,async()=>{
 const base='http://127.0.0.1:'+srv.address().port;
 const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 for (const mode of ['allowed','blocked']){
  const ctx=await b.createBrowserContext();
  const t=await ctx.newPage();
  if(mode==='blocked') await t.evaluateOnNewDocument(()=>{const o=window.open;window.open=function(){return null;};});
  await t.setRequestInterception(true);
  t.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub(PROFILES.payg,RPC.charged)});if(u.startsWith(base)||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();return r.respond({status:204,body:''});});
  const errs=[];t.on('pageerror',e=>errs.push(e.message));
  await t.goto(base+'/builder.html',{waitUntil:'load'});await new Promise(r=>setTimeout(r,1500));
  await t.evaluate(async()=>{document.getElementById('scent-name').value='Real Popup QA';document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
   document.getElementById('smart-paste-input').value='Signal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P302+P352 P501';extractSDS();
   document.getElementById('biz-name').value='QA';document.getElementById('biz-address').value='1 Test St';document.getElementById('biz-phone').value='01234 567890';readForm();updateLabel();
   for(let n=2;n<=5;n++){if(n===4){const hc=document.getElementById('hazard-confirm');hc.checked=true;toggleHazardNext();}setApprovedBuilderStep(n);await new Promise(r=>setTimeout(r,150));}
   const v=document.getElementById('verify-checkbox');v.checked=true;toggleDownload();});
  await new Promise(r=>setTimeout(r,400));
  const newTarget=new Promise(res=>{b.once('targetcreated',tg=>res(tg));setTimeout(()=>res(null),4000);});
  await t.click('#btn-pdf');
  const tg=await newTarget; await new Promise(r=>setTimeout(r,1500));
  let url=null,hasSvg=null;
  if(tg){const pg=await tg.page();url=pg.url();hasSvg=await pg.evaluate(()=>!!document.querySelector('svg')&&/Real Popup QA|REAL POPUP QA/i.test(document.body.innerText+document.body.innerHTML));}
  const rpc=await t.evaluate(()=>(window.__rpc||[]).filter(x=>x[0]==='consume_download').length);
  const warn=await t.evaluate(()=>!!document.getElementById('print-popup-warn'));
  const guidance=await t.evaluate(()=>{const g=document.getElementById('dl-print-guidance');return g&&!g.hidden?g.innerText.split('\n')[0]:null;});
  console.log(JSON.stringify({mode,popupOpened:!!tg,popupUrl:url&&url.slice(0,5),labelInPopup:hasSvg,consumeCalls:rpc,popupWarning:warn,guidance,errs}));
  await ctx.close();
 }
 await b.close();srv.close();
});
