'use strict';
// Independent supplier 10%-in-candle-wax document collector.
// This is a DIFFERENT corpus from the fragrance-concentrate SDS set.
// Public GET requests only; no CLPeasy credentials, customer data or production writes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const SOURCE='https://nikura.com/pages/clp-labels-at-10';
const OUT=process.env.CLP10_CORPUS_DIR||'qa-artifacts/clp10-corpus';
const LIMIT=Math.max(1,Math.min(100,Number(process.env.CLP10_LIMIT||20)));
fs.mkdirSync(OUT,{recursive:true});
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'CLPeasy-QA-10percent/1.0 (public supplier documents)'}});if(!r.ok)throw Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
function discover(html){
 const map=new Map();
 for(const m of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
  const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  let url;try{url=new URL(decode(href),SOURCE).href;}catch{continue;}
  if(!/^https:\/\//.test(url)||!/(?:CLP10|10.?percent|10.?%)/i.test(url)||!(/\.pdf(?:[?#]|$)/i.test(url)))continue;
  const name=decode(m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
  map.set(url,{supplier:'Nikura',name,url,source_page:SOURCE,discovery_method:'catalogue_link'});
 }
 return [...map.values()];
}
function section22(text){
 // Match numbered headings at the start of a line, not references in a
 // contents table or prose. Prefer a labelled Section 2.2 heading.
 const lines=text.split(/\r?\n/);
 const candidates=[];
 for(let i=0;i<lines.length;i++){
  if(/^\s*2\.2(?:\s+|\s*[:.\-]\s*)(?:Label\s+elements|Labelling|Labeling)\b/i.test(lines[i]))candidates.push(i);
 }
 if(!candidates.length)return null;
 const start=candidates[candidates.length-1];
 let end=Math.min(lines.length,start+150);
 for(let i=start+1;i<end;i++){
  if(/^\s*(?:2\.3\b|SECTION\s*3\b|3\.1\b)/i.test(lines[i])){end=i;break;}
 }
 return lines.slice(start,end).join('\n').slice(0,7500).trim()||null;
}
(async()=>{
 let html='',catalogueError=null;
 try{html=(await get(SOURCE)).toString('utf8');}catch(e){catalogueError=String(e.message||e);console.warn('Supplier catalogue unavailable; no unverified historical fallback will be used:',catalogueError);}
 const links=discover(html);
// Optional LOCAL corrected supplier SDS, provided by the owner for offline QA.
// This file is read locally, never committed, and is not fetched from an outdated public URL.
const localPdf=process.env.CLP10_LOCAL_PDF||'';
if(localPdf)links.unshift({supplier:'Nikura',name:'Nag Champa 10% corrected Regulatory Affairs SDS',url:'local://corrected-nag-champa-10-percent',source_page:'owner-supplied corrected document',discovery_method:'owner_supplied_local'});
// No historical CLP10 Nag Champa seed: Nikura confirmed its old public document contained an incorrect H316 classification.
// Only discover currently linked supplier documents, and verify their actual Section 2.2 before using as reference.
 // The catalogue points to one-page CLP10Label PDFs. The corresponding full
 // supplier SDS uses CLP10_ (confirmed against the owner's Bergamot SDS).
 // Verify the downloaded document itself: never count a label sheet as an SDS.
 const sdsLinks=links.map(item=>({...item,url:item.url.replace(/CLP10Label_/i,'CLP10_'),name:item.name.replace(/CLP Label at 10%/i,'10% full SDS'),source_label_url:item.url}));
 const docs=[];
 for(const item of sdsLinks){
  if(docs.filter(d=>d.download_ok&&d.section_2_2_found&&d.supplier_10_percent_evidence&&!d.historical_supplier_error).length>=LIMIT)break;
  const id=String(docs.length+1).padStart(3,'0');const d={id,...item,download_ok:false,section_2_2_found:false};
  try{
   const pdf=item.discovery_method==='owner_supplied_local'?fs.readFileSync(localPdf):await get(item.url);if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Not PDF');
   const pdfFile=id+'.pdf';fs.writeFileSync(path.join(OUT,pdfFile),pdf);
   const raw=cp.execFileSync('pdftotext',['-layout',path.join(OUT,pdfFile),'-'],{maxBuffer:8*1024*1024,timeout:15000}).toString();
   // Supplier CLP10 PDFs can be standalone label sheets, not full SDS files.
   // Accept a label-only PDF only when it visibly contains hazard/precautionary
   // codes and label wording; never pretend that it has a Section 2.2.
   const sdsSection=section22(raw);
   const labelSheet=!sdsSection&&raw.trim().length>=80&&(/\b(?:H\d{3}|P\d{3}|EUH\d{3})\b/i.test(raw)||/\b(?:Warning|Danger|Hazard\s+statements?|Precautionary\s+statements?|Contains|CLP\s+Label)\b/i.test(raw));
   const fullSds=/\bSAFETY\s+DATA\s+SHEET\b/i.test(raw)&&/\bSection\s*1\b/i.test(raw)&&/\bSection\s*16\b/i.test(raw)&&/\b10\s*%\s*in\s*Candle\s*Wax\b/i.test(raw.slice(0,16000));
   const sec=fullSds?sdsSection:null;
   d.document_format=fullSds&&sdsSection?'Full 10% candle-wax SDS Section 2.2':'rejected: not full 10% SDS';
   d.section_2_2_found=!!sec;
   d.sha256=crypto.createHash('sha256').update(pdf).digest('hex');d.bytes=pdf.length;d.pdf_file=pdfFile;d.download_ok=true;
   d.label_text_found=!!sec;
   // Historical supplier error: the pre-correction Nag Champa 10% document included H316.
   // Never count it as authoritative ground truth for a finished-mixture QA pass.
   d.historical_supplier_error=/Nag.Champa/i.test(item.name+' '+item.url)&&/\bH316\b/.test(sec||'');
   if(d.historical_supplier_error)d.review_note='Historical Nikura Nag Champa 10% H316 error; obtain corrected Regulatory Affairs SDS';
   if(sec){d.section_2_2_text_file=id+'-section-2-2.txt';d.label_text_sha256=crypto.createHash('sha256').update(sec,'utf8').digest('hex');fs.writeFileSync(path.join(OUT,d.section_2_2_text_file),sec);}
   const head=raw.slice(0,16000);
   // A mere 10% mention in an ingredient or regulatory threshold does not
   // establish the actual formulation. Require a 10% mixture description.
   d.is_10_percent=/(?:\b(?:fragrance(?:\s+oil)?|perfume|mixture|dilution|concentration)\s*[:=-]?\s*10\s*%(?!\d)|\b10\s*%\s*(?:fragrance(?:\s+oil)?|perfume|(?:in|of)\s+(?:candle\s+wax|wax|fragrance(?:\s+oil)?))\b|\b10\s*percent\s*(?:fragrance|in\s+wax))/i.test(head);
   d.mentions_candle_wax=/candle\s+wax/i.test(raw.slice(0,16000));
   d.supplier_10_percent_evidence=fullSds&&d.is_10_percent&&d.mentions_candle_wax;
   d.scope_evidence=d.supplier_10_percent_evidence?(item.discovery_method==='owner_supplied_local'?'Owner-supplied corrected 10% SDS, verified by PDF formulation text':'Supplier-hosted CLP10 PDF linked on 10% catalogue'):d.is_10_percent&&d.mentions_candle_wax?'Explicit 10% candle-wax text in PDF':'Insufficient source evidence';
   if(!d.supplier_10_percent_evidence&&!(d.is_10_percent&&d.mentions_candle_wax))d.review_note='10% document scope not established by supplier catalogue/file identity or PDF text';
  }catch(e){d.error=String(e.message||e).slice(0,250);}
  docs.push(d);console.log(id,d.download_ok?'PDF':'FAILED',d.section_2_2_found?'Section 2.2':'',item.name);
 }
 const verified=docs.filter(d=>d.download_ok&&d.section_2_2_found&&d.supplier_10_percent_evidence&&!d.historical_supplier_error);
 const manifest={generated_at:new Date().toISOString(),source:SOURCE,catalogue_error:catalogueError,source_class:'Supplier 10% candle-wax SDS (not raw fragrance concentrate)',discovered:links.length,attempted:docs.length,verified_10_percent:verified.length,documents:verified,rejected_or_review:docs.filter(d=>!verified.includes(d))};
 fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({discovered:links.length,attempted:docs.length,verified_10_percent:verified.length}));
 if(verified.length<LIMIT)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
