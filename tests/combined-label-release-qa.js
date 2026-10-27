// Offline integration QA for PRs #237/#240/#241/#242. Synthetic fixtures,
// signed in as a synthetic trial customer, all non-local requests intercepted; never uses customer services.
// Saves real SVG/PNG downloads and Chromium Save-as-PDF output for measurement.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const puppeteer=require('puppeteer');
const ROOT=process.env.CLPEASY_ROOT||path.resolve(__dirname,'..');
const OUT=process.env.CLPEASY_QA_OUT||path.join(ROOT,'qa-artifacts','combined-label-release');
fs.mkdirSync(OUT,{recursive:true});
// Signed-in trial customer (the Builder requires sign-in): watermarked exports, as before.
const MOCK=require('./helpers/signed-in-builder-mock').MOCK;
const SDS='SYNTHETIC TEST DATA — NOT A SUPPLIER SDS\n2.2 Label elements\nSignal word: Warning\nPictograms: GHS07, GHS09\nH317 May cause an allergic skin reaction.\nH411 Toxic to aquatic life with long lasting effects.\nEUH208 Contains Linalool, Limonene. May produce an allergic reaction.\nP261 Avoid breathing vapours.\nP273 Avoid release to the environment.\nP280 Wear protective gloves.\nP302+P352 IF ON SKIN: Wash with plenty of water.\nP333+P313 If skin irritation or rash occurs: Get medical advice/attention.\nP501 Dispose of contents/container in accordance with local regulations.';
const server=http.createServer((req,res)=>{
  const rel=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(ROOT,'.'+rel);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--no-sandbox'],protocolTimeout:120000});
  const downloads=[];const cdp=await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:OUT,eventsEnabled:true});
  cdp.on('Browser.downloadWillBegin',e=>downloads.push(e));
  const results={base,backend:'mocked; signed-in trial; external requests intercepted',cases:[],mobile:[],errors:[]};
  async function newPage(width=1366,height=900){
    const p=await browser.newPage();await p.setViewport({width,height,deviceScaleFactor:1});
    p.on('pageerror',e=>results.errors.push(e.message));p.on('dialog',d=>d.dismiss());
    await p.setRequestInterception(true);p.on('request',r=>{
      const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:MOCK});
      if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();
      return r.respond({status:204,body:''});
    });
    await p.goto(base+'/builder.html',{waitUntil:'load'});await p.waitForFunction(()=>typeof updateLabel==='function'&&typeof LabelRenderer!=='undefined');
    await p.evaluate(require('./helpers/sds-doc-answer').SCRIPT);return p;
  }
  async function fixture(p,mm,manual){
    return p.evaluate(({mm,manual,SDS})=>{
      document.getElementById('scent-name').value='Synthetic Test';document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
      selectShape('circle');selectSize('custom');document.getElementById('custom-w').value=mm;document.getElementById('custom-h').value=mm;onDimInput();
      document.getElementById('biz-name').value='Synthetic Test Business';document.getElementById('biz-address').value='1 Test Street, Test Town, TE1 1ST';document.getElementById('biz-phone').value='00000000000';document.getElementById('biz-website').value='https://example.invalid';document.getElementById('batch-num').value='TEST-001';
      document.getElementById('smart-paste-input').value=SDS;extractSDS();
      if(manual){
        // CLP-007 Smart Paste lockdown: manual entry no longer exists. This
        // exercises an older, manually created label registered before the
        // lockdown (the only remaining non-Smart-Paste route), without
        // changing the extraction filter or supplying real regulatory data.
        const h=document.getElementById('h-statements').value,pp=document.getElementById('p-statements').value;
        clearHazardData();document.getElementById('h-statements').value=h;document.getElementById('p-statements').value=pp;
        S.hStatements=h;S.pStatements=pp;
        S.hSelected=h.split(',').map(x=>x.trim());S.pSelected=pp.split(',').map(x=>x.trim());S.sensitisers=['Linalool','Limonene'];S.signal='Warning';S.pictograms=['exclamation','aquatic'];
        S.p280Items=['gloves'];S.p280Other='';
        S.legacySourceId=S.legacySourceId||'00000000-0000-4000-8000-0000000000fe';window._clpLegacyRegister=HazardProvenance.addLegacy(window._clpLegacyRegister,S.legacySourceId,_hazardProvenanceRecord());
      }
      readForm();updateLabel();
      for(let n=2;n<=5;n++){if(n===4){document.getElementById('hazard-confirm').checked=true;toggleHazardNext();}setApprovedBuilderStep(n);}
      __confirmSdsDoc();document.getElementById('verify-checkbox').checked=true;toggleDownload();updateLabel();
      const svg=buildSVG(true),d=new DOMParser().parseFromString(svg,'image/svg+xml');
      return {mm,manual,step:approvedBuilderStep,allowed:_downloadAllowed(),blocked:window._labelBlockDownload,pCodes:document.getElementById('p-statements').value,warning:document.getElementById('label-warn-step5')?.textContent||'',recommendation:LabelRenderer.findSmallestFittingSize(window._lastLabelData,{instanceId:"qa-recommendation"}),fonts:[...d.querySelectorAll('text')].filter(t=>!t.closest('.clp-fit-block')).map(t=>({text:t.textContent,fs:+t.getAttribute('font-size'),family:t.getAttribute('font-family')})),hazardPct:document.getElementById('hazard-fs-pct').textContent};
    },{mm,manual,SDS});
  }
  for(const manual of [false,true])for(const mm of [52,63,75]){
    const p=await newPage();const row=await fixture(p,mm,manual);const tag=(manual?'manual-six':'extracted-five')+'-'+mm;
    if(manual)assert(row.pCodes.includes('P280'),'manual fixture must include P280');else assert(row.pCodes.includes('P280'),'supplier P280 is retained (#270, founder direction 22/25 Oct 2026: no automatic exclusion of supplier statements)');
    if(row.allowed){
      const old=downloads.length;await p.click('#btn-svg-preview');
      await p.waitForFunction(()=>!document.querySelector('#btn-svg-preview').disabled);
      const limit=Date.now()+15000;while(downloads.length===old&&Date.now()<limit)await new Promise(r=>setTimeout(r,50));
      assert(downloads.length>old,'SVG click must start a download');const svgFile=downloads.at(-1).suggestedFilename;
      while(!fs.existsSync(path.join(OUT,svgFile))&&Date.now()<limit)await new Promise(r=>setTimeout(r,50));
      fs.renameSync(path.join(OUT,svgFile),path.join(OUT,tag+'.svg'));
      const beforePng=downloads.length;await p.click('#btn-png-preview');
      const pngLimit=Date.now()+15000;while(downloads.length===beforePng&&Date.now()<pngLimit)await new Promise(r=>setTimeout(r,50));
      assert(downloads.length>beforePng,'PNG click must start a download');const pngFile=downloads.at(-1).suggestedFilename;
      while(!fs.existsSync(path.join(OUT,pngFile))&&Date.now()<pngLimit)await new Promise(r=>setTimeout(r,50));
      fs.renameSync(path.join(OUT,pngFile),path.join(OUT,tag+'.png'));
      const targetPromise=browser.waitForTarget(t=>t.opener()===p.target());await p.click('#btn-pdf-preview');const popup=await (await targetPromise).page();
      await popup.waitForSelector('svg');await popup.pdf({path:path.join(OUT,tag+'.pdf'),preferCSSPageSize:true,printBackground:true});
      row.printView=await popup.evaluate(()=>({svgW:document.querySelector('svg').getAttribute('width'),svgH:document.querySelector('svg').getAttribute('height'),pageCss:[...document.styleSheets].flatMap(s=>[...s.cssRules].map(r=>r.cssText)).filter(r=>r.startsWith('@page'))}));
      await popup.close();row.exports=['SVG','PNG','PDF'];
    }else{
      const before=downloads.length;await p.evaluate(async()=>{await downloadSVG();await downloadPNG();await printToPDF();});assert.equal(downloads.length,before,'blocked labels cannot download');row.exports='blocked before download';
    }
    await p.click('#btn-view-label').catch(()=>{});await p.screenshot({path:path.join(OUT,tag+'.jpg'),type:'jpeg',quality:85});results.cases.push(row);await p.close();console.log(tag,row.allowed?'EXPORTED':'BLOCKED');
  }
  for(const width of [375,390,430]){
    const p=await newPage(width,844);await fixture(p,75,false);await p.evaluate(()=>setApprovedBuilderStep(4));
    const m=await p.evaluate(()=>{
      const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};};
      return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,fields:['biz-website','batch-num'].map(rect),controls:[...document.querySelectorAll('#step-4 button')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))};
    });
    results.mobile.push(m);await p.screenshot({path:path.join(OUT,'mobile-'+width+'.jpg'),type:'jpeg',quality:85,fullPage:true});await p.close();
  }
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert.equal(results.errors.length,0,'no uncaught browser errors');console.log('PASS combined offline export scenarios; measurements in results.json');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
