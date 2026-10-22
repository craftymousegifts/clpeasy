// Source confirmation: real Builder extraction and existing safety gates.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const scopeApi = require('../sds-section-scope.js');

const source = fs.readFileSync('builder.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const emptyQuery = { select(){ return this; }, eq(){ return this; }, update(){ return this; }, upsert(){ return this; },
  single(){ return Promise.resolve({ data:null, error:null }); }, then(r){ return Promise.resolve({ data:null, error:null }).then(r); } };
const vc = new VirtualConsole(); const jsErrors = []; vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(source, { url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t){ const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((a, c) => a + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; } });
    for (const f of ['sds-supplier-wording.js','label-render.js', 'sds-doc-check.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };


const ptext=`2.2 Label elements
Signal word: Warning
H317 Supplier skin wording.
EUH208 Contains Linalool. May produce an allergic reaction.
P280 Wear protective gloves.
P999 Supplier-selected precaution.
P272 Keep supplier-selected clothing wording.`;
const state=()=>window.eval('S');
const labelText=()=>{
 const d=new window.DOMParser().parseFromString(window.buildSVG(true),'image/svg+xml');
 return [...d.querySelectorAll('text')].filter(n=>!n.closest('.clp-fit-block')).map(n=>[...n.childNodes].map(t=>t.textContent).join(' ')).join(' ');
};
function extract(text=ptext){
 for(const [id,val] of Object.entries({'scent-name':'Synthetic','product-type':'Scented Candle','frag-load':'10%','biz-name':'Test','biz-address':'1 Test Road','biz-phone':'00000000000','custom-w':'150','custom-h':'150'}))box(id).value=val;
 window.selectShape('rectangle');window.selectSize('custom');box('custom-w').value='150';box('custom-h').value='150';window.onDimInput();
 window.setApprovedBuilderStep(3);box('smart-paste-input').value=text;box('sds-source-confirm').checked=true;window.confirmSdsSource();window.extractSDS();
}
(async()=>{try{
 await new Promise(resolve=>setImmediate(resolve));
 extract();assert.equal(state().signal,'Warning');assert(state().pStatements.includes('P280'));assert(state().pStatements.includes('P272'));assert(state().pStatements.includes('P999'));
 assert(labelText().includes('Supplier skin wording.'));assert(labelText().includes('Supplier-selected precaution.'));assert(labelText().includes('Wear protective gloves.'));
 window.__confirmSdsDoc=undefined;
 // Use the real document-check helper; no live service or entitlement consumption.
 window.eval(require('./helpers/sds-doc-answer').SCRIPT);window.__confirmSdsDoc();box('hazard-confirm').checked=true;
 assert(window.canLeaveApprovedBuilderStep(3),window.__lastAlert);
 const before=labelText();await window.saveLabel();
 const saved=window.getSaved().find(e=>e.scentName==='Synthetic');assert(saved,'saveLabel wrote a record');
 assert(saved.supplierWording.P999==='Supplier-selected precaution.');assert.equal(saved.supplierWordingVersion,1);
 window.clearHazardData();assert.equal(state().supplierWording,null);
 box('verify-checkbox').checked=true;window.loadLabelRecord(saved);assert(!box('verify-checkbox').checked,'opening a saved label needs its own final review');assert(!box('hazard-confirm').checked,'previous hazard review cannot carry over');assert.equal(labelText(),before,'clean Builder reopening keeps supplier wording');
 const composer=window.LabelRenderer.renderLabel(saved,{instanceId:'composer',forExport:true,watermark:true});
 const bd=new window.DOMParser().parseFromString(composer.svg,'image/svg+xml');
 const composerText=[...bd.querySelectorAll('text')].filter(n=>!n.closest('.clp-fit-block')).map(n=>[...n.childNodes].map(t=>t.textContent).join(' ')).join(' ');
 assert.equal(composerText,before,'Composer saved-data path equals Builder safety text');
 box('p-statements').value='';window.updateLabel();assert.equal(state().pStatements,'','cleared P field does not retain old codes');assert(window._labelBlockDownload,'source mismatch blocks instead of dropping original P wording');
 window.loadLabelRecord(saved);
 const legacy={...saved,sourceSection22:undefined,supplierWording:undefined,supplierWordingVersion:undefined,hStatements:'H317',pStatements:''};
 window.loadLabelRecord(legacy);assert(labelText().includes('May cause an allergic skin reaction.'));
 window.loadLabelRecord(saved);assert.equal(labelText(),before);
 // Frozen wording survives source-parser changes in the reopened label.
 window.ClpeasySupplierWording={...window.ClpeasySupplierWording,extract:()=>({H317:'Changed library or parser wording'})};
 window.loadLabelRecord(saved);assert.equal(labelText(),before);
 window.eval(fs.readFileSync('sds-supplier-wording.js','utf8'));
 extract(ptext+'\nContains: Supplier-only substance.');assert(labelText().includes('Contains: Supplier-only substance.'),'standalone source text appears automatically');await window.saveLabel();
 const supplementalSaved=window.getSaved().find(e=>e.scentName==='Synthetic');window.clearHazardData();window.loadLabelRecord(supplementalSaved);assert(labelText().includes('Contains: Supplier-only substance.'),'standalone supplier text survives save/reopen');
 extract('2.2 Label elements\nPictograms: GHS08\nH999 Supplier hazard.');assert.equal([...state().pictograms].join(','),'health','explicit source pictogram overrides library inference');
 extract('2.2 Label elements\nPictograms: None\nH317 Supplier hazard.');assert.equal(state().pictograms.length,0,'explicit source None is retained');box('verify-checkbox').checked=true;await window.saveLabel();const noneSaved=window.getSaved().find(e=>e.scentName==='Synthetic');window.clearHazardData();window.loadLabelRecord(noneSaved);assert.equal(state().pictograms.length,0,'saved explicit None is not silently inferred on reopening');
 extract('2.2 Label elements\nSignal word: None\nH317 Supplier statement.');assert.equal(state().signal,'','explicit None must not be inferred as Warning');window.updateLabel();assert.equal(state().signal,'');
 extract('2.2 Label elements\nSignal word: Warning\nH304 Supplier aspiration statement.');assert.equal(state().signal,'Warning','supplier Warning must not be escalated to Danger');
 window.clearHazardData();assert.equal(state().sourceSection22,'');assert.equal(state().supplierWording,null);
 assert(!jsErrors.some(e=>/ReferenceError|SyntaxError/.test(e)),jsErrors.join('\n'));
 console.log('PASS real Builder extract/review/save/reopen/legacy/Composer/signal behaviour (mock services, measured canvas stub)');
}finally{window.close()}})().catch(e=>{console.error(e);process.exitCode=1});
