// 4 Oct 2026 owner decision: supplier questionnaire removed; ordinary hazard review and export checks remain.
// Supplier-document applicability for the fragrance % (builder.html), run in JSDOM.
// Run from the repo root: node tests/sds-document-applicability.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  maybeSingle(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

let objectUrls = 0, downloads = 0;
const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((w,c)=>w+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(fs.readFileSync('label-render.js', 'utf8')); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
    window.eval(fs.readFileSync('label-library.js', 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'entitlement.js'), 'utf8'));
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => null;
    window.URL.createObjectURL = () => { objectUrls++; return 'blob:test'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function(){ if (this.hasAttribute('download')) downloads++; };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:null, error:null })
    }) };
  }
});

const { window } = dom;
const document = window.document;
const S = expr => window.eval(expr);
// Owner removed the custom evidence questionnaire on 4 Oct 2026.
const assertPolicy = window.SdsDocCheck;
assert.strictEqual(assertPolicy.DOCUMENT_CHECK_REQUIRED,false);
assert.strictEqual(document.getElementById('sds-doc-check'),null);
assert.strictEqual(document.querySelectorAll('input[name="sds-doc-kind"]').length,0);
assert(document.querySelector('.smart-paste-box'));
const set=(id,v)=>{document.getElementById(id).value=v;};
set('scent-name','Simple SDS label');set('product-type','Scented Candle');set('frag-load','');
assert.strictEqual(window.canLeaveApprovedBuilderStep(2),true,'blank fragrance percentage does not block Hazards');
let movedNext=false;const originalNext=window.nextStep;window.nextStep=()=>{movedNext=true;};window.checkStep2Next();window.nextStep=originalNext;
assert.strictEqual(movedNext,true,'Step 2 Next accepts a blank fragrance percentage');
set('biz-name','QA Candles');set('biz-address','1 Test Street, Testtown, TE1 1ST');set('biz-phone','01234 567890');
window.selectShape('circle');set('custom-w','100');window.onDimInput();
set('smart-paste-input','Warning\nH317 May cause an allergic skin reaction.\nP261 Avoid breathing vapours.\nP501 Dispose of contents in accordance with local regulations.\nContains Linalool. May produce an allergic reaction.');
window.extractSDS();window.readForm();window.updateLabel();
assert(/H317/.test(S('S.hStatements')),'extract hazards without questionnaire');
assert.strictEqual(window.canLeaveApprovedBuilderStep(3),false,'hazard review checkbox still required');
document.getElementById('hazard-confirm').checked=true;window.toggleHazardNext();
assert.strictEqual(window.canLeaveApprovedBuilderStep(3),true,'reviewed hazards continue without document answers');
assert.strictEqual(window._downloadAllowed(),false,'final verification checkbox still required');
document.getElementById('verify-checkbox').checked=true;window.toggleDownload();
assert.strictEqual(window._downloadAllowed(),true,'fitting reviewed label exports without document answers');
for(const rec of [{},{fragLoad:'9.0909',productType:'Scented Candle',sdsDoc:{kind:'finished',pct:'10',base:'candle'}},{sdsDoc:{kind:'concentrate'}}]){
 assert.strictEqual(assertPolicy.isExportAllowed(rec),true,'legacy/missing answers do not block');
 assert.strictEqual(assertPolicy.exportBlockMessage(rec),null);
}
assert.strictEqual(assertPolicy.isVerified({}),false,'absence of questionnaire is not represented as verified supplier evidence');
window.eval("S.sdsDoc={kind:'finished',pct:'10',base:'candle',docVersion:'kept'}");
const prior=S('JSON.stringify(S.sdsDoc)');window.updateSdsDocCheck();window._stampSdsDocConfirmation();window.readForm();
assert.strictEqual(S('JSON.stringify(S.sdsDoc)'),prior,'previous metadata preserved, no invented confirmation');
window.eval('window._labelBlockDownload=true');assert.strictEqual(window._downloadAllowed(),false,'fit block remains enforced');
console.log('PASS: questionnaire absent, extraction/review/verification/fit gates correct, old labels unblocked, evidence not fabricated');
window.close();
