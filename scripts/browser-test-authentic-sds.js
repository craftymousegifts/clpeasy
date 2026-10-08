'use strict';
// Real Chromium runs the actual builder.html Smart Paste extractSDS() on authentic
// supplier Section 2.2 text. Offline guest mode; no production API requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('puppeteer');
const ROOT=path.resolve(__dirname,'..'),DIR=path.resolve(process.env.SDS_CORPUS_DIR||'qa-artifacts/sds-corpus');
const manifestPath=path.join(DIR,'manifest.json');
if(!fs.existsSync(manifestPath))throw Error('Missing authentic SDS manifest');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const mock="window.supabase={createClient:function(){var q={select:function(){return q},eq:function(){return q},single:async function(){return {data:null,error:null}},then:function(f){return Promise.resolve({data:null,error:null}).then(f)}};return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};";
const server=http.createServer((req,res)=>{
 let f;try{f=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 const full=path.resolve(ROOT,'.'+f);
 if(!full.startsWith(ROOT+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404);return res.end();}
 const ext=path.extname(full);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'text/javascript':'application/octet-stream');fs.createReadStream(full).pipe(res);
});
// Independent supplier EUH208 content comparison: original Section 2.2 phrase,
// with known PDF column/page layout artefacts removed, against builder names.
function supplierEuh208Names(raw){
 const clean=String(raw||'')
  .replace(/-\\s*\\r?\\n\\s*Nikura Ltd,[\\s\\S]{0,1200}?\\f[\\s\\S]{0,1200}?SAFETY DATA SHEET[\\s\\S]{0,600}?\\n\\s*Version:\\s*\\d+\\s*\\r?\\n\\s*(?=[A-Za-z])/gi,'-')
  .replace(/-\\s*\\r?\\n\\s*Information:\\s*/gi,'-')
  .replace(/-\\s*\\r?\\n\\s*(?=[A-Za-z0-9])/g,'-')
  .replace(/\\r?\\n\\s*Information:\\s*/gi,' ')
  .replace(/\\r?\\n[ \\t]{8,}(?=[A-Za-z0-9(])/g,' ');
 const match=clean.match(/EUH208\\s*[,;:]?\\s*Contains\\s+([\\s\\S]{1,4000}?)\\.\\s*May\\s+(?:produce|cause)\\s+an\\s+allergic\\s+reaction/i);
 return match?match[1].replace(/\\s+/g,' ').trim():null;
}
const canonicalNames=s=>String(s||'').replace(/\\s+/g,' ').trim().toLowerCase();
const expectedPCodes=t=>[...new Set([...t.matchAll(/\bP\d{3}(?:\s*[+/]\s*P?\d{3})*\b/g)].map(m=>(m[0].match(/\d{3}/g)||[]).map(x=>'P'+x).join('+')))];
const expectedCodes=t=>[...new Set([...t.matchAll(/\bH\d{3}(?:i|FD|Fd|fD|fd|F|D|f|d)?\b/g)].map(m=>m[0]))].sort();
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  const page=await browser.newPage();page.on('dialog',d=>d.dismiss());
  await page.setRequestInterception(true);
  page.on('request',r=>{
   const u=r.url();
   if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:mock});
   if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();
   return r.respond({status:204,body:''});
  });
  await page.goto(base+'/builder.html',{waitUntil:'load',timeout:45000});
  for(const doc of manifest.documents){
   if(!doc.section_2_2_found){results.push({id:doc.id,source:doc.url,status:'not-extracted'});continue;}
   const text=fs.readFileSync(path.join(DIR,doc.section_2_2_text_file),'utf8');
   try{
    const actual=await page.evaluate(t=>{
     const el=document.getElementById('smart-paste-input');
     if(!el||typeof extractSDS!=='function')throw Error('Smart Paste UI unavailable');
     el.value=t;extractSDS();
     return {h:(document.getElementById('h-statements')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),p:document.getElementById('p-statements')?.value||'',signal:document.getElementById('signal-danger')?.classList.contains('sel-danger')?'Danger':document.getElementById('signal-warning')?.classList.contains('sel-warn')?'Warning':'',sensitisers:[...S.sensitisers],pCodes:[...S.pSelected],hCodes:[...S.hSelected],sdsSignal:S.sdsSignal};
    },text);
    const expected=expectedCodes(text);
    const missing=expected.filter(x=>!actual.h.includes(x));
    const extraH=actual.h.filter(x=>!expected.includes(x)&&!/^EUH\d{3}$/.test(x));
    const supplierEUH=[...new Set([...text.matchAll(/\bEUH\d{3}\b/g)].map(m=>m[0]))];
    const unexpectedEUH=actual.h.filter(x=>/^EUH\d{3}$/.test(x)&&!supplierEUH.includes(x));
    const contaminatedSensitisers=actual.sensitisers.filter(x=>/(?:Information:|statements:|Page\s+\d+)/i.test(x));
    const supplierP=expectedPCodes(text);
    const unexpectedP=actual.pCodes.filter(x=>!supplierP.includes(x));
    const excludedP=supplierP.filter(x=>!actual.pCodes.includes(x));
    const explicitSignal=(text.match(/(?:^|\n)\s*Signal\s+word\s*[:\-]?\s*(Danger|Warning|None|Not applicable)/im)||[])[1]||'';
    const signalMismatch=!!(explicitSignal&&/^(Danger|Warning)$/i.test(explicitSignal)&&actual.signal&&explicitSignal.toLowerCase()!==actual.signal.toLowerCase());
    const sensitiserClause=(text.match(/Contains\s+([^\n]{1,500}?)\.\s*May\s+(?:produce|cause)\s+an\s+allergic\s+reaction/i)||[])[1]||'';
    const supplierNames=supplierEuh208Names(text);
    const sensitiserMismatch=supplierNames!==null&&canonicalNames(supplierNames)!==canonicalNames(actual.sensitisers.join(', '));
    results.push({id:doc.id,source:doc.url,sha256:doc.sha256,status:(missing.length||extraH.length||unexpectedP.length||unexpectedEUH.length||contaminatedSensitisers.length||signalMismatch||sensitiserMismatch)?'review':'extracted',expected_h_codes:expected,actual_h_codes:actual.h,missing_h_codes:missing,unexpected_h_codes:extraH,supplier_euh_codes:supplierEUH,unexpected_euh_codes:unexpectedEUH,contaminated_sensitiser_names:contaminatedSensitisers,supplier_p_codes:supplierP,actual_p_codes:actual.pCodes,unexpected_p_codes:unexpectedP,excluded_p_codes:excludedP,explicit_supplier_signal:explicitSignal,actual_signal_word:actual.signal,signal_mismatch:signalMismatch,supplier_euh208_clause:supplierNames,actual_sensitisers:actual.sensitisers,sensitiser_mismatch:sensitiserMismatch});
   }catch(e){results.push({id:doc.id,source:doc.url,status:'error',error:String(e.message).slice(0,300)});}
  }
 }finally{await browser.close();server.close();}
 const report={timestamp:new Date().toISOString(),scope:'Actual builder.html Smart Paste UI extraction of supplier Section 2.2; NOT compliance certification',count:results.length,extracted:results.filter(x=>x.status==='extracted').length,needs_review:results.filter(x=>x.status==='review').length,errors:results.filter(x=>x.status==='error').length,results};
 fs.writeFileSync(path.join(DIR,'browser-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({count:report.count,extracted:report.extracted,needs_review:report.needs_review,errors:report.errors}));
 if(report.count<100||report.extracted<100||report.needs_review||report.errors)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
