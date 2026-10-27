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
    for (const f of ['sds-supplier-wording.js','label-render.js', 'sds-doc-check.js', 'hazard-provenance.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: {user:{id:'00000000-0000-4000-8000-00000000a11d',email:'qa-trial@example.invalid',user_metadata:{}}} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };


const paste = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P264 P302+P352 P501';
box('scent-name').value='Synthetic';box('product-type').value='Scented Candle';box('frag-load').value='10%';
window.setApprovedBuilderStep(3);
box('smart-paste-input').value=paste;
const state=()=>JSON.stringify(window.eval('({h:S.hStatements,p:S.pStatements,signal:S.signal})'));
const confirm=()=>{box('sds-source-confirm').checked=true;window.confirmSdsSource();};
const before=state();window.extractSDS();
assert.strictEqual(state(),before);assert.strictEqual(document.activeElement.id,'sds-source-confirm');
assert(box('sds-source-confirm-error').textContent.includes('Before extracting'));
ok('unticked extraction is refused without changing existing data');
confirm();window.extractSDS();assert(window.eval('S.hStatements').includes('H317'));
assert(window.eval('S.pStatements').includes('P264'),'supplier code retained');
assert(!box('smart-paste-excluded-note'),'no exclusion notice: no supplier statement is excluded (D5)');
assert(!box('hazard-confirm').checked && !box('verify-checkbox').checked);
const accepted=state();window.extractSDS();assert.strictEqual(state(),accepted);
ok('confirmed extraction retains all supplier codes and both later confirmations; unchanged retry works');
for(const [id,value,event] of [['smart-paste-input',paste+'\nP273','input'],['product-type','Wax Melt','change'],['frag-load','8%','input']]){
 confirm();box(id).value=value;box(id).dispatchEvent(new window.Event(event,{bubbles:true}));
 assert(!box('sds-source-confirm').checked,id+' reset');
 const old=state();window.extractSDS();assert.strictEqual(state(),old);
}
ok('paste, product type and fragrance percentage changes reset confirmation');
confirm();box('frag-load').value='7%';window.extractSDS();assert(!box('sds-source-confirm').checked);
confirm();box('frag-load').value='6%';window.updateLabel();assert(!box('sds-source-confirm').checked);
ok('programmatic changes are caught at extraction and label update');
box('smart-paste-input').value=paste+'\n'+paste;confirm();window.extractSDS();
assert(box('smart-paste-scope-error').textContent.includes('one Section 2.2'));
assert.strictEqual(window.eval('S.hStatements'),'');assert(!box('sds-source-confirm').checked);
ok('confirmation does not bypass multiple-document detection; stopped extraction clears acknowledgement');
box('smart-paste-input').value=paste;confirm();window.extractSDS();
confirm();window.clearHazardData();assert(!box('sds-source-confirm').checked);
box('smart-paste-input').value=paste;confirm();
try{window.loadLabelRecord({id:'different',scentName:'Other',productType:'Wax Melt',shape:'circle',size:63,hStatements:'',pStatements:'',sensitisers:[],pictograms:[]});}catch(e){}
assert(!box('sds-source-confirm').checked);
ok('clear and loading another saved label reset confirmation');
assert(box('sds-source-confirm-help').querySelector('a').getAttribute('href')==='compliance.html#sds-guidance');
assert(fs.readFileSync('compliance.html','utf8').includes('id="sds-guidance"'), 'general SDS guidance target exists');
assert(!window.localStorage.getItem('sds-source-confirm'));
assert(!jsErrors.some(e=>/sdsSource|confirmSdsSource|ReferenceError/.test(e)),jsErrors.join('\n'));
ok('educational link present; confirmation is transient');
// Let the Builder's (mocked, signed-in) session check finish before teardown.
setTimeout(() => dom.window.close(), 200);
