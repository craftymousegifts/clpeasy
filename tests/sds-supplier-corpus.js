// Genuine historical supplier fixture; concentrations are NOT interchangeable.
// These are stored Section 2.2 extracts, not a new full-document/multi-supplier QA.
'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const parser=require('../sds-supplier-wording');
const corpus=require('./fixtures/euh208-nikura-10pct-corpus.json');
const dom=new JSDOM('<!doctype html>',{runScripts:'dangerously'}),w=dom.window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(t){const s=+(this.font.match(/([\d.]+)px/)||[])[1]||12;return {width:[...String(t)].reduce((n,c)=>n+s*(/[ilI1.,' ]/.test(c)?.28:/[MW@%]/.test(c)?.82:.54),0)}}});
for(const f of ['sds-supplier-wording.js','label-render.js'])w.eval(fs.readFileSync(f,'utf8'));
let statements=0,fit=0,blocked=0,substanceChecks=0;
try{
 for(const c of corpus.cases){
  const r=parser.analyse(c.section_2_2);
  const codes=[...new Set((c.section_2_2.match(/\b(?:EUH|H)\d{3}[a-zA-Z]*|\bP\d{3}(?:\s*[+/]\s*P?\d{3})*/g)||[]).map(v=>v.startsWith('P')?(v.match(/\d{3}/g)||[]).map(n=>'P'+n).join('+'):v))];
  assert.equal(r.issues.length,0,c.id+' ambiguous parser');
  for(const code of codes)assert(r.wording[code],c.id+' missing '+code);
  for(const [code,value] of Object.entries(r.wording)){
   assert(!/Nikura Ltd|Issue date:|SAFETY DATA SHEET|Information:|Product:/.test(value),c.id+' page furniture leaked into '+code);
   statements++;
  }
  for(const name of c.supplier_euh208_names||[]){
   assert(r.wording.EUH208?.replace(/\s+/g,' ').includes(name.replace(/\s+/g,' ')),c.id+' EUH208 independent PDF name '+name);substanceChecks++;
  }
  const data={shape:'square',size:'custom',customW:150,customH:150,scentName:'Test',productType:'Scented Candle',bizName:'Test',bizAddress:'1 Test Road',bizPhone:'00000000000',signal:c.baseline_before_fix.signal,hStatements:codes.filter(k=>!k.startsWith('P')).join(', '),pStatements:codes.filter(k=>k.startsWith('P')).join(', '),sensitisers:c.supplier_euh208_names||[],pictograms:c.baseline_before_fix.pictograms,hazardFromExtraction:true,sourceSection22:c.section_2_2,supplierWording:r.wording};
  const rendered=w.LabelRenderer.renderLabel(data,{instanceId:'corpus-'+c.id,forExport:true});
  if(rendered.fits){
   fit++;
   const d=new w.DOMParser().parseFromString(rendered.svg,'image/svg+xml');
   const text=[...d.querySelectorAll('text')].filter(n=>!n.closest('.clp-fit-block')).map(n=>[...n.childNodes].map(t=>t.textContent).join(' ')).join(' ').replace(/\s+/g,' ');
   for(const value of Object.values(r.wording))assert(text.includes(value),c.id+' rendered supplier text missing: '+value);
  }else{blocked++;assert(rendered.contentOverflow||rendered.unsupportedCodes.length,c.id+' unexplained block '+JSON.stringify(rendered.warnings));}
 }
 console.log(JSON.stringify({supplier:'Nikura',concentration:'10% in candle wax',storedSection22Cases:corpus.cases.length,statements,independentPdfSubstanceChecks:substanceChecks,renderFit150mm:fit,renderBlocked150mm:blocked,fullDocumentsTested:0,otherSuppliersTested:0,canvas:'stub; not physical print QA'}));
}finally{w.close()}
