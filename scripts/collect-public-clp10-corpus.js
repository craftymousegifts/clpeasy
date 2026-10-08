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
  map.set(url,{supplier:'Nikura',name,url,source_page:SOURCE});
 }
 return [...map.values()];
}
function section22(text){
 const start=text.search(/\b2\.2\s*(?:Label\s+elements)?\b/i);if(start<0)return null;
 const rest=text.slice(start);
 const end=rest.slice(8).search(/\b(?:2\.3\s*(?:Other\s+hazards)?|SECTION\s*3\s*[:.]|3\.1\s*Substances)\b/i);
 return rest.slice(0,end<0?Math.min(rest.length,7500):Math.min(rest.length,end+8)).trim();
}
(async()=>{
 let html='',catalogueError=null;
 try{html=(await get(SOURCE)).toString('utf8');}catch(e){catalogueError=String(e.message||e);console.warn('Supplier catalogue unavailable; attempting independently verified public PDF seed:',catalogueError);}
 const links=discover(html);
// Independently documented public supplier PDF: keep one genuine 10% seed even
// when Shopify renders its catalogue links through scripts rather than anchors.
const SEED='https://nikura.blob.core.windows.net/pdfs/CLP10_Nag_Champa_Premium_Fragrance_Oil_FO-FR-NAG.pdf';
if(!links.some(d=>d.url===SEED))links.unshift({supplier:'Nikura',name:'Nag Champa Premium Fragrance Oil — 10% in candle wax',url:SEED,source_page:SOURCE});
 const docs=[];
 for(const item of links){
  if(docs.filter(d=>d.download_ok&&d.section_2_2_found&&d.is_10_percent&&d.mentions_candle_wax).length>=LIMIT)break;
  const id=String(docs.length+1).padStart(3,'0');const d={id,...item,download_ok:false,section_2_2_found:false};
  try{
   const pdf=await get(item.url);if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Not PDF');
   const pdfFile=id+'.pdf';fs.writeFileSync(path.join(OUT,pdfFile),pdf);
   const raw=cp.execFileSync('pdftotext',['-layout',path.join(OUT,pdfFile),'-'],{maxBuffer:8*1024*1024,timeout:15000}).toString();
   const sec=section22(raw);
   d.sha256=crypto.createHash('sha256').update(pdf).digest('hex');d.bytes=pdf.length;d.pdf_file=pdfFile;d.download_ok=true;
   d.section_2_2_found=!!sec;
   if(sec){d.section_2_2_text_file=id+'-section-2-2.txt';fs.writeFileSync(path.join(OUT,d.section_2_2_text_file),sec);}
   const head=raw.slice(0,16000);
   // A mere 10% mention in an ingredient or regulatory threshold does not
   // establish the actual formulation. Require a 10% mixture description.
   d.is_10_percent=/(?:\b(?:fragrance(?:\s+oil)?|perfume|mixture|dilution|concentration)\s*[:=-]?\s*10\s*%\b|\b10\s*%\s*(?:fragrance(?:\s+oil)?|perfume|(?:in|of)\s+(?:candle\s+wax|wax|fragrance(?:\s+oil)?))\b|\b10\s*percent\s*(?:fragrance|in\s+wax))/i.test(head);
   d.mentions_candle_wax=/candle\s+wax/i.test(raw.slice(0,16000));
   if(!d.is_10_percent||!d.mentions_candle_wax)d.review_note='10% candle-wax scope not confidently established; do not count as verified';
  }catch(e){d.error=String(e.message||e).slice(0,250);}
  docs.push(d);console.log(id,d.download_ok?'PDF':'FAILED',d.section_2_2_found?'Section 2.2':'',item.name);
 }
 const verified=docs.filter(d=>d.download_ok&&d.section_2_2_found&&d.is_10_percent&&d.mentions_candle_wax);
 const manifest={generated_at:new Date().toISOString(),source:SOURCE,catalogue_error:catalogueError,source_class:'Supplier 10% candle-wax SDS (not raw fragrance concentrate)',discovered:links.length,attempted:docs.length,verified_10_percent:verified.length,documents:verified,rejected_or_review:docs.filter(d=>!verified.includes(d))};
 fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({discovered:links.length,attempted:docs.length,verified_10_percent:verified.length}));
 if(!verified.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
