// Run against retained supplier text: node tests/sds-multi-supplier-full-documents.js /path/to/qa-sds
// Supplier documents have different products/concentrations; this tests copying, not applicability.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const scope=require('../sds-section-scope'),parser=require('../sds-supplier-wording');
const dir=process.argv[2];assert(dir,'Supply the directory containing the source text files recorded in the QA report');
const cases=[
 {file:'nikura-nag-champa-full.txt',sha:'43dfc98b37817f13918a2eb08b30b70747a311298504dafb30884bc41d6d0db9',codes:'H317 H412 EUH208 P261 P272 P273 P280 P302+P352 P333+P313 P363 P501',signal:'Warning',pics:['exclamation'],type:'Scented Candle'},
 {file:'candle-shack-black-pomegranate-full.txt',sha:'13f49de5a700e26775db62ce16a5513f2eb4e9343a4de9d26a4e172da67d9c94',codes:'H317 H315 H410 EUH208 P264 P261 P273 P272 P280 P302+P352 P333+P313 P362 P391 P501 P102',signal:'Warning',pics:['exclamation','aquatic'],ufi:'UFI: 2TDC-F04Y-Y005-5RAR',type:'Room Spray'},
 {file:'151-pan-aroma-room-spray-full.txt',sha:'c7c6366c5c36714918c3da5fdd7a6c9955a62fce7a87b4a180423672967fa504',codes:'EUH208 P102 P103 P264 P501',signal:'',pics:[],type:'Room Spray'},
 {file:'sfc-natural-diffuser-base-web-text.txt',sha:'8c0fbf739d1dacc146264765dc2fffb3852dbe043cd4ef90d976f0599b9fa22b',codes:'H225 H319 P210 P403+P235 P501',signal:'Danger',pics:['flame','exclamation'],type:'Reed Diffuser'},
];
const dom=new JSDOM('<!doctype html>',{runScripts:'dangerously'}),w=dom.window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(t){const s=+(this.font.match(/([\d.]+)px/)||[])[1]||12;return {width:[...String(t)].reduce((n,c)=>n+s*(/[ilI1.,' ]/.test(c)?.28:/[MW@%]/.test(c)?.82:.54),0)}}});
for(const f of ['sds-supplier-wording.js','label-render.js'])w.eval(fs.readFileSync(f,'utf8'));
try{for(const c of cases){
 const raw=fs.readFileSync(path.join(dir,c.file),'utf8');assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),c.sha,c.file+' input anchor');
 const scoped=scope.scope(raw);assert.equal(scoped.status,'scoped',c.file+' one Section 2.2');
 const r=parser.analyse(scoped.text),codes=c.codes.split(' ');assert.deepEqual(Object.keys(r.wording),codes,c.file+' independent code list');assert.deepEqual(r.issues,[],c.file+' reliable wording');
 if(c.ufi)assert(r.supplemental.includes(c.ufi));
 assert(!Object.values(r.wording).some(s=>/SAFETY DATA SHEET|SECTION 3|Section 16/.test(s)),c.file+' no page furniture');
 const data={shape:'square',size:'custom',customW:150,customH:150,scentName:'Source format QA',productType:c.type,bizName:'Test',bizAddress:'1 Test Road',bizPhone:'00000000000',signal:c.signal,pictograms:c.pics,hStatements:codes.filter(k=>!k.startsWith('P')).join(', '),pStatements:codes.filter(k=>k.startsWith('P')).join(', '),hazardFromExtraction:true,sourceSection22:scoped.text,supplierWording:r.wording,supplierSupplemental:r.supplemental};
 const output=w.LabelRenderer.renderLabel(data,{instanceId:'supplier-qa',forExport:true});assert(output.fits,c.file+' 150 mm text preservation: '+JSON.stringify(output.warnings));
 const svg=new w.DOMParser().parseFromString(output.svg,'image/svg+xml');assert(!svg.querySelector('parsererror'),c.file+' valid SVG');
 const text=[...svg.querySelectorAll('text')].filter(n=>!n.closest('.clp-fit-block')).map(n=>[...n.childNodes].map(t=>t.textContent).join(' ')).join(' ').replace(/\s+/g,' ');
 for(const value of [...Object.values(r.wording),...r.supplemental])assert(text.includes(value),c.file+' rendered full supplier wording: '+value);
 console.log('PASS '+c.file+': '+codes.length+' statements, '+r.supplemental.length+' supplemental, scoped whole-document input and 150 mm rendering (canvas stub)');
}
 const web=parser.analyse(scope.scope(fs.readFileSync(path.join(dir,'candle-shack-black-pomegranate-web-text.txt'),'utf8')).text);
 const pdf=parser.analyse(scope.scope(fs.readFileSync(path.join(dir,'candle-shack-black-pomegranate-full.txt'),'utf8')).text);
 assert.deepEqual(web,pdf,'Candle Shack PDF layout and web reading order preserve identical wording/UFI');
 console.log('PASS Candle Shack reading-order/control-hyphen parity');
}finally{w.close()}
