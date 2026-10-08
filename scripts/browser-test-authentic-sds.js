'use strict';
// Real Chromium runs the actual builder.html Smart Paste extractSDS() on authentic
// supplier Section 2.2 text. Offline guest mode; no production API requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('puppeteer');
const ROOT=path.resolve(__dirname,'..'),DIR=path.resolve(process.env.SDS_CORPUS_DIR||'qa-artifacts/sds-corpus');
const manifestPath=path.join(DIR,'manifest.json');
if(!fs.existsSync(manifestPath))throw Error('Missing authentic SDS manifest');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const IS_CLP10=process.env.SDS_SOURCE_CLASS==='clp10';
const MIN_EXPECTED=IS_CLP10?Math.max(1,Number(process.env.CLP10_MIN_EXPECTED||1)):100;
if(IS_CLP10&&manifest.source_class!=='Supplier 10% candle-wax SDS (not raw fragrance concentrate)')throw Error('10% run requires verified 10% candle-wax manifest');
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
  .replace(/-\s*\r?\n\s*Nikura Ltd,[\s\S]{0,1200}?\f[\s\S]{0,1200}?SAFETY DATA SHEET[\s\S]{0,600}?\n\s*Version:\s*\d+\s*\r?\n\s*(?=[A-Za-z])/gi,'-')
  .replace(/-\s*\r?\n\s*Information:\s*/gi,'-')
  .replace(/-\s*\r?\n\s*(?=[A-Za-z0-9])/g,'-')
  .replace(/\r?\n\s*Information:\s*/gi,' ')
  .replace(/\r?\n[ \t]{8,}(?=[A-Za-z0-9(])/g,' ');
 const match=clean.match(/EUH208\s*[,;:]?\s*Contains\s+([\s\S]{1,4000}?)\.\s*May\s+(?:produce|cause)\s+an\s+allergic\s+reaction/i);
 return match?match[1].replace(/\s+/g,' ').trim():null;
}
const canonicalNames=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
const expectedPCodes=t=>[...new Set([...t.matchAll(/\bP\d{3}(?:\s*[+/]\s*P?\d{3})*\b/g)].map(m=>(m[0].match(/\d{3}/g)||[]).map(x=>'P'+x).join('+')))];
const expectedCodes=t=>[...new Set([...t.matchAll(/\bH\d{3}(?:i|FD|Fd|fD|fd|F|D|f|d)?\b/g)].map(m=>m[0]))].sort();
// Compare only the supplier's Section 2.2 label elements, not later Section 2.3
// prose, Section 3 ingredients, or Section 16 code glossaries.
const labelSectionOnly=t=>{const lines=String(t).split(/\r?\n/);const start=lines.findIndex(x=>/^\s*2\.2\s*(?:Label\s+elements|Labelling|Labeling)\b/i.test(x));if(start<0)return t;let end=lines.length;for(let i=start+1;i<lines.length;i++){if(/^\s*(?:2\.3\b|SECTION\s*3\b|3\.1\b)/i.test(lines[i])){end=i;break;}}return lines.slice(start,end).join('\n');};
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
     // Smart Paste lives in Step 3; exercise it while its actual panel is visible.
     // Earlier corpus runs invoked extractSDS() from the hidden initial Step 1.
     if(typeof forceGoToStep==='function')forceGoToStep(3);
     el.value=t;extractSDS();
     const notice=document.getElementById('sds-excluded-p-review');
     const noticeVisible=!!(notice&&notice.checkVisibility({checkVisibilityCSS:true}));
     // Exercise the reset only after capturing extracted values, without
     // re-running the supplier corpus or altering its classification checks.
     const snapshot={pReviewVisible:noticeVisible,h:(document.getElementById('h-statements')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),p:document.getElementById('p-statements')?.value||'',signal:document.getElementById('signal-danger')?.classList.contains('sel-danger')?'Danger':document.getElementById('signal-warning')?.classList.contains('sel-warn')?'Warning':'',sensitisers:[...S.sensitisers],pCodes:[...S.pSelected],hCodes:[...S.hSelected],sdsSignal:S.sdsSignal,pReviewText:document.getElementById('sds-excluded-p-review')?.textContent||''};
     if(typeof clearHazardData!=='function')throw Error('Clear hazard data unavailable');
     clearHazardData();
     snapshot.stalePReviewAfterClear=!!document.getElementById('sds-excluded-p-review');
     snapshot.stalePSelectionAfterClear=!!(S.pSelected&&S.pSelected.length);
     snapshot.staleInputAfterClear=!!document.getElementById('smart-paste-input')?.value.trim();
     snapshot.staleHazardsAfterClear=!!(S.hSelected?.length||S.sensitisers?.length||S.hazardFromExtraction);
     return snapshot;
    },text);
    const expected=expectedCodes(labelSectionOnly(text));
    const missing=expected.filter(x=>!actual.h.includes(x));
    const extraH=actual.h.filter(x=>!expected.includes(x)&&!/^EUH\d{3}$/.test(x));
    const supplierEUH=[...new Set([...labelSectionOnly(text).matchAll(/\bEUH\d{3}\b/g)].map(m=>m[0]))];
    const unexpectedEUH=actual.h.filter(x=>/^EUH\d{3}$/.test(x)&&!supplierEUH.includes(x));
    const contaminatedSensitisers=actual.sensitisers.filter(x=>/(?:Information:|statements:|Page\s+\d+)/i.test(x));
    const supplierP=expectedPCodes(labelSectionOnly(text));
    const unexpectedP=actual.pCodes.filter(x=>!supplierP.includes(x));
    const excludedP=supplierP.filter(x=>!actual.pCodes.includes(x));
    const knownWithheldPCodes=['P272','P264','P270','P280','P303+P361+P353','P362','P362+P364','P363','P405'];
    const unaccountedMissingP=excludedP.filter(code=>!knownWithheldPCodes.includes(code));
    // A missing code from a supplier's verified 10% finished-mixture label
    // is a fidelity review finding even when deliberately excluded by policy.
    // Do not present this as a clean 10% label match or as a legal verdict.
    const finishedMixturePReview=IS_CLP10&&excludedP.length>0;
    const exclusionNoticeMismatch=excludedP.length>0&&(!actual.pReviewText.includes('not added automatically')||excludedP.some(x=>!actual.pReviewText.includes(x)));
    const unexpectedExclusionNotice=excludedP.length===0&&!!actual.pReviewText;
    const exclusionNoticeHidden=excludedP.length>0&&!actual.pReviewVisible;
    const resetFailed=actual.stalePReviewAfterClear||actual.stalePSelectionAfterClear||actual.staleInputAfterClear||actual.staleHazardsAfterClear;
    const explicitSignal=(text.match(/(?:^|\n)\s*Signal\s+word\s*[:\-]?\s*(Danger|Warning|None|Not applicable)/im)||[])[1]||'';
    const signalMismatch=!!(explicitSignal&&/^(Danger|Warning|None)$/i.test(explicitSignal)&&((explicitSignal.toLowerCase()==='none'?'':explicitSignal.toLowerCase())!==actual.signal.toLowerCase()));
    const signalCodes=actual.h.filter(x=>/^H\d{3}$/.test(x));
    const supplierSignalAnomaly=!IS_CLP10&&signalMismatch&&((signalCodes.includes('H317')&&actual.signal==='Warning')||(signalCodes.length>0&&signalCodes.every(x=>['H402','H412'].includes(x))&&actual.signal===''));
    const technicalSignalMismatch=signalMismatch&&!supplierSignalAnomaly;
    const sensitiserClause=(text.match(/Contains\s+([^\n]{1,500}?)\.\s*May\s+(?:produce|cause)\s+an\s+allergic\s+reaction/i)||[])[1]||'';
    const supplierNames=supplierEuh208Names(text);
    const sensitiserMismatch=supplierNames!==null&&canonicalNames(supplierNames)!==canonicalNames(actual.sensitisers.join(', '));
    results.push({id:doc.id,source:doc.url,sha256:doc.sha256,status:(finishedMixturePReview||missing.length||extraH.length||unaccountedMissingP.length||unexpectedP.length||unexpectedEUH.length||contaminatedSensitisers.length||technicalSignalMismatch||sensitiserMismatch||exclusionNoticeMismatch||unexpectedExclusionNotice||exclusionNoticeHidden||resetFailed)?'review':'extracted',expected_h_codes:expected,actual_h_codes:actual.h,missing_h_codes:missing,unexpected_h_codes:extraH,supplier_euh_codes:supplierEUH,unexpected_euh_codes:unexpectedEUH,contaminated_sensitiser_names:contaminatedSensitisers,supplier_p_codes:supplierP,actual_p_codes:actual.pCodes,unexpected_p_codes:unexpectedP,excluded_p_codes:excludedP,finished_mixture_p_review:finishedMixturePReview,unaccounted_missing_p_codes:unaccountedMissingP,exclusion_notice_mismatch:exclusionNoticeMismatch,unexpected_exclusion_notice:unexpectedExclusionNotice,exclusion_notice_hidden:exclusionNoticeHidden,reset_failed:resetFailed,stale_input_after_clear:actual.staleInputAfterClear,stale_hazards_after_clear:actual.staleHazardsAfterClear,explicit_supplier_signal:explicitSignal,actual_signal_word:actual.signal,signal_mismatch:signalMismatch,supplier_signal_anomaly:supplierSignalAnomaly,technical_signal_mismatch:technicalSignalMismatch,supplier_euh208_clause:supplierNames,actual_sensitisers:actual.sensitisers,sensitiser_mismatch:sensitiserMismatch});
   }catch(e){results.push({id:doc.id,source:doc.url,status:'error',error:String(e.message).slice(0,300)});}
  }
 }finally{await browser.close();server.close();}
 const report={timestamp:new Date().toISOString(),supplier_signal_discrepancies:results.filter(x=>x.signal_mismatch).map(x=>({id:x.id,source:x.source,supplier:x.explicit_supplier_signal,builder:x.actual_signal_word})),supplier_signal_anomalies:results.filter(x=>x.supplier_signal_anomaly).length,technical_signal_mismatches:results.filter(x=>x.technical_signal_mismatch).length,supplier_p_code_exclusions:results.reduce((n,x)=>n+(x.excluded_p_codes||[]).length,0),finished_mixture_p_review_count:results.filter(x=>x.finished_mixture_p_review).length,unaccounted_missing_p_codes:results.reduce((n,x)=>n+(x.unaccounted_missing_p_codes||[]).length,0),scope:IS_CLP10?'10% candle-wax supplier Section 2.2 versus builder Smart Paste; NOT compliance certification':'Actual builder.html Smart Paste UI extraction of supplier Section 2.2; NOT compliance certification',count:results.length,extracted:results.filter(x=>x.status==='extracted').length,needs_review:results.filter(x=>x.status==='review').length,errors:results.filter(x=>x.status==='error').length,results};
 fs.writeFileSync(path.join(DIR,'browser-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({count:report.count,extracted:report.extracted,needs_review:report.needs_review,errors:report.errors}));
 const technicalFailures=results.filter(x=>x.status==='error'||x.missing_h_codes?.length||x.unexpected_h_codes?.length||x.unexpected_euh_codes?.length||x.unaccounted_missing_p_codes?.length||x.unexpected_p_codes?.length||x.contaminated_sensitiser_names?.length||x.technical_signal_mismatch||x.sensitiser_mismatch||x.exclusion_notice_mismatch||x.unexpected_exclusion_notice||x.exclusion_notice_hidden||x.reset_failed);
 report.technical_failures=technicalFailures.length;
 report.review_only=results.filter(x=>x.status==='review'&&!technicalFailures.includes(x)).length;
 fs.writeFileSync(path.join(DIR,'browser-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({technical_failures:report.technical_failures,review_only:report.review_only}));
 if(report.count<MIN_EXPECTED||report.technical_failures||(IS_CLP10?false:report.needs_review))process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
