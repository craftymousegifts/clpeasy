'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const parser=require('../sds-supplier-wording');
const dom=new JSDOM('<!doctype html>',{runScripts:'dangerously'}),w=dom.window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(t){const s=+(this.font.match(/([\d.]+)px/)||[])[1]||12;return {width:[...String(t)].reduce((n,c)=>n+s*(/[ilI1.,' ]/.test(c)?.28:/[MW@%]/.test(c)?.82:.54),0)}}});
for(const f of ['sds-supplier-wording.js','label-render.js'])w.eval(fs.readFileSync(f,'utf8'));
const source=`H317 Supplier-specific skin statement (unchanged).
EUH208 Contains ALPHA-substance. May produce an allergic reaction.
P305 / 351 / 338 IF IN EYES: Rinse cautiously with water.

Remove contact lenses, if present and easy to do.
Continue rinsing.
P280 Wear protective gloves.`;
const base={shape:'rectangle',size:'custom',customW:150,customH:150,productType:'Room Spray',scentName:'TEST',bizName:'Test',bizAddress:'1 Test Road',bizPhone:'00000000000',signal:'Warning',hStatements:'H317, EUH208',pStatements:'P305+P351+P338, P280',sensitisers:[],pictograms:[],hazardFromExtraction:true,sourceSection22:source};
const render=(data=base,opts={})=>w.LabelRenderer.renderLabel(data,{instanceId:'test',...opts});
const text=r=>{const d=new w.DOMParser().parseFromString(r.svg,'image/svg+xml');return [...d.querySelectorAll('text')].filter(n=>!n.closest('.clp-fit-block')).map(n=>[...n.childNodes].map(t=>t.textContent).join(' ')).join(' ').replace(/\s+/g,' ')};
try{
 const r=render();assert(r.fits,JSON.stringify(r.warnings));
 for(const expected of Object.values(parser.extract(source)))assert(text(r).includes(expected),expected+' absent from '+text(r));
 assert(!text(r).includes('sensitising substance'));
 const frozen={...base,supplierWording:parser.extract(source),supplierWordingVersion:1};
 assert.equal(text(render(frozen)),text(r),'saved and live source paths agree');
 for(const forExport of [false,true])assert.equal(text(render(frozen,{forExport})),text(r),'preview/export parity');
 const unknown={...base,hStatements:'H999',pStatements:'P999',sourceSection22:'H999 Supplier hazard.\nP999 Supplier precaution.'};
 assert(render(unknown).fits,'unknown codes with reliable full supplier wording fit');
 const absent=render({...unknown,sourceSection22:'H999\nP999'});assert(!absent.fits);assert(!absent.contentOverflow,'missing text is integrity, not physical fit');
 const contradictory=render({...unknown,sourceSection22:'H999 First wording.\nH999 Different wording.\nP999 Supplier precaution.'});assert(!contradictory.fits);
 assert(!render({...base,hStatements:'H317'}).fits,'removing EUH208 cannot silently omit its snapshot');
 assert(!render({...base,sourceSection22:source.replace('H317','H315'),hStatements:'H315, EUH208'}).warnings.some(v=>v==='unrecognized-code:H315'));
 const unsupported=render({...unknown,hStatements:'H401',sourceSection22:'H401 Toxic to aquatic life.\nP999 Supplier precaution.'});
 assert(unsupported.unsupportedCodes.includes('H401'),'existing GB safeguard retained even with source wording');
 const legacy={...base,hazardFromExtraction:false,sourceSection22:'',hStatements:'H317',pStatements:''};assert(render(legacy).fits);assert(text(render(legacy)).includes('May cause an allergic skin reaction.'));
 const tiny=render({...base,customW:52,customH:36});assert(!tiny.fits&&tiny.contentOverflow,'physical non-fit still blocks');
 for(const code of ['H350i','H360FD','H360Fd','H360Df','H361fd'])assert.equal(parser.extract(code+' Supplier wording.')[code],'Supplier wording.');
 assert.equal(parser.extract('P313 Same.\nP313 Same.').P313,'Same.');
 assert.equal(parser.extract('P313 First.\nP313 Different.').P313,undefined);
 assert.equal(parser.extract('P313:Supplier wording.').P313,'Supplier wording.');
 assert.equal(parser.extract('H317, Supplier wording.\nSignal word: Warning').H317,'Supplier wording.');
 const continued=parser.extract('EUH208 Contains Linalool.\nContains: Limonene.\nMay produce an allergic reaction.');
 assert.equal(continued.EUH208,'Contains Linalool. Contains: Limonene. May produce an allergic reaction.');
 assert.equal(parser.extract('P313 Get medical advice.\n2.2 Label elements (continued)\nContinue supplier text.').P313,'Get medical advice. Continue supplier text.');
 const containsReview=render({...legacy,hazardFromExtraction:true,sourceSection22:'H317 Supplier text.\nContains: Linalool.',sensitisers:['Linalool']});
 assert(!containsReview.fits&&!containsReview.contentOverflow,'uncoded Contains is an extraction review, not silently rebuilt');
 assert(!text(containsReview).includes('Contains: Linalool'),'never invent source-active Contains from a table scan');
 let matrixFits=0,matrixBlocked=0;
 for(const productType of ['Scented Candle','Wax Melt','Reed Diffuser','Room Spray'])for(const shape of ['circle','square','rectangle'])for(const mm of [52,90]){
   const m=render({...base,productType,shape,customW:mm,customH:shape==='rectangle'?Math.round(mm*.7):mm});
   if(m.fits){matrixFits++;for(const value of Object.values(parser.extract(source)))assert(text(m).includes(value),productType+' '+shape+' '+mm+' missing source text');}
   else{matrixBlocked++;assert(m.contentOverflow,'matrix non-fit must have physical reason');}
 }
 assert(matrixFits>0&&matrixBlocked>0,'matrix must exercise both complete outputs and blocked sizes');
 console.log('Synthetic product/shape/size matrix: '+matrixFits+' fit, '+matrixBlocked+' physically blocked (24 cases; stubbed canvas).');
 console.log('PASS supplier renderer behaviour: full H/P/EUH text, wrapped paragraphs, saved/export parity, unknown/missing/contradictory codes, legacy, GB safeguard and physical fit');
}finally{w.close()}
