'use strict';
// Download authentic public supplier SDS PDFs, preserve provenance, extract Section 2.2.
// No production app, database, accounts, or customer data are accessed.
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process'), crypto=require('node:crypto');
const SOURCE='https://nikura.com/pages/fragrance-oil-technical-documents';
const out=process.env.SDS_CORPUS_DIR||'qa-artifacts/sds-corpus';
const limit=Math.min(100,Math.max(1,Number(process.env.SDS_LIMIT||100)));
fs.mkdirSync(out,{recursive:true});
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,attempts=3){
 for(let n=0;n<attempts;n++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'CLPeasy-QA-SDS-Corpus/1.0 (public documents only)'}});
   if(!r.ok)throw Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());
  }catch(e){if(n===attempts-1)throw e;await delay((n+1)*1200);}
 }
}
function links(html){
 const found=new Map();
 for(const m of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
  const a=m[1],h=a.match(/\bhref\s*=\s*["']([^"']+)["']/i);
  if(!h)continue;
  const label=decode(m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
  if(!/(?:safety\s*data\s*sheet|\bSDS\b)/i.test(label+' '+h[1]))continue;
  let url;try{url=new URL(decode(h[1]),SOURCE).href;}catch{continue;}
  if(!/^https:\/\//.test(url)||!/\.pdf(?:[?#]|$)/i.test(url))continue;
  if(!found.has(url))found.set(url,{supplier:'Nikura',name:label,url,source_page:SOURCE});
 }
 return [...found.values()];
}
function section22(t){
 // The raw fragrance SDS is NOT necessarily a 10% finished-product CLP.
 const m=t.match(/(?:SECTION\s*2\s*[:.]\s*HAZARDS?\s+IDENTIFICATION|2\.2\s*(?:Label\s+elements)?)/i);
 if(!m)return {text:'',found:false};
 const start=t.search(/\b2\.2\s*(?:Label\s+elements)?\b/i);
 if(start<0)return {text:'',found:false};
 const rest=t.slice(start);
 const end=rest.slice(8).search(/\b(?:2\.3\s*Other\s+hazards|SECTION\s*3\s*[:.]|3\.1\s*Substances)\b/i);
 const cut=end<0?Math.min(rest.length,7500):Math.min(rest.length,end+8);
 return {text:rest.slice(0,cut).trim(),found:true};
}
async function main(){
 const html=(await get(SOURCE)).toString('utf8'),items=links(html).slice(0,limit);
 const results=new Array(items.length);let cursor=0;
 async function worker(){
  while(cursor<items.length){const i=cursor++,item=items[i],id=String(i+1).padStart(3,'0');
   const record={id,...item,download_ok:false,section_2_2_found:false};
   try{
    const pdf=await get(item.url);
    if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Not a PDF');
    const file=path.join(out,id+'.pdf');fs.writeFileSync(file,pdf);
    const text=cp.execFileSync('pdftotext',['-layout',file,'-'],{maxBuffer:8*1024*1024,timeout:15000}).toString();
    const sec=section22(text);
    record.download_ok=true;record.sha256=crypto.createHash('sha256').update(pdf).digest('hex');
    record.bytes=pdf.length;record.section_2_2_found=sec.found;
    record.section_2_2_text_file=sec.found?id+'-section-2-2.txt':null;
    if(sec.found)fs.writeFileSync(path.join(out,record.section_2_2_text_file),sec.text);
    else record.error='Section 2.2 not identified; requires manual review';
   }catch(e){record.error=String(e.message||e).slice(0,350);}
   results[i]=record;console.log(id,record.download_ok?'PDF':'FAILED',record.section_2_2_found?'Section 2.2':'',item.name);
  }
 }
 await Promise.all(Array.from({length:4},worker));
 const report={generated_at:new Date().toISOString(),source:SOURCE,discovered:links(html).length,attempted:items.length,downloaded:results.filter(x=>x.download_ok).length,section_2_2_extracted:results.filter(x=>x.section_2_2_found).length,warning:'Raw fragrance SDS may differ from finished-product 10% CLP. No compliance or UI test is claimed.',documents:results};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({discovered:report.discovered,attempted:report.attempted,downloaded:report.downloaded,section_2_2_extracted:report.section_2_2_extracted}));
 if(report.attempted<100||report.section_2_2_extracted<100)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
