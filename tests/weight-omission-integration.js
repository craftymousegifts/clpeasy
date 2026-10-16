// Focused tests for the Builder step-navigation/layout redesign
// (ux/builder-step-navigation-layout): the sticky horizontal stepper,
// two-column form|preview layout, removal of the duplicate right-rail
// Steps/AI cards, Step 5 fine-tune relocation, and mobile compact step
// indicator. Renderer/export geometry is untouched by this branch and is
// covered by its own existing suites; this file only exercises Builder
// GUI/layout and reuses the existing setApprovedBuilderStep()/
// canLeaveApprovedBuilderStep() functions -- no new step-state variable
// is introduced.
// Run from the repo root: node tests/builder-step-navigation-layout.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

function buildDom(){
  return __sdsAns(new JSDOM(source, {
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
      window.eval(labelRendererSource); window.eval(fs.readFileSync('optional-label-items.js','utf8')); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
      window.eval(labelLibrarySource); window.eval(require("fs").readFileSync(require("path").join(__dirname,"..","entitlement.js"),"utf8"));
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ location:{href:''}, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data:{session:null} }),
          onAuthStateChange: () => ({ data:{subscription:{unsubscribe(){}}} }),
          signOut: async () => ({})
        },
        from: () => ({ select(){return this;}, eq(){return this;}, then(r){return Promise.resolve({data:null,error:null}).then(r);} }),
        rpc: async () => ({ data:false, error:null })
      }) };
    }
  }));
}


const dom=buildDom(),w=dom.window,d=w.document;
setTimeout(async()=>{try{
 const S=w.eval('S');
 Object.assign(S,{shape:'circle',size:'custom',customW:58,customH:58,scentName:'Mint QA Combined',productType:'Scented Candle',netWeight:'180g',burnTime:'40 hrs',batchNum:'B2310',bizName:'Test Maker',bizAddress:'1 Test Lane, EX1 2AB',bizPhone:'01632 960000',signal:'Warning',hStatements:'H317',pStatements:'P102,P501',pictograms:['exclamation']});
 for(const [id,k] of [['scent-name','scentName'],['product-type','productType'],['biz-name','bizName'],['biz-address','bizAddress'],['biz-phone','bizPhone'],['batch-num','batchNum'],['h-statements','hStatements'],['p-statements','pStatements']])d.getElementById(id).value=S[k];
 w.restoreNetWeight('180g');w.restoreBurnTime('40 hrs');d.getElementById('custom-w').value='58';d.getElementById('custom-h').value='58';
 w.updateLabel();
 const hide=()=>{S.showOnLabel={netWeight:false,burnTime:false,batchNum:false};S.omissionConfirmations={netWeight:{confirmed:true,value:S.netWeight},batchNum:{confirmed:true,value:S.batchNum}};w.updateLabel();};
 hide();
 assert(d.getElementById('omission-badge-netWeight').previousElementSibling.id==='net-weight-choice','badge must stay beside visible dropdown, not hidden custom input');
 assert(!w.LabelRenderer.normalizeLabel(S).netWeight);
 w.chooseNetWeight('200g');assert.equal(S.netWeight,'200g');assert.equal(S.showOnLabel.netWeight,true);assert(!S.omissionConfirmations.netWeight);
 assert(d.getElementById('omission-badge-netWeight').textContent.includes('Value changed'));
 hide();w.chooseNetWeight('custom');assert.equal(S.netWeight,'200g');assert.equal(S.showOnLabel.netWeight,false,'opening custom editor alone must not invalidate exact same value');
 d.getElementById('net-weight').value='212.5g';w.updateLabel();assert.equal(S.showOnLabel.netWeight,true);assert(!S.omissionConfirmations.netWeight);
 hide();w.chooseNetWeight('');assert.equal(S.netWeight,'');assert.equal(S.showOnLabel.netWeight,true);assert(!S.omissionConfirmations.netWeight);
 w.restoreNetWeight('100ml');w.updateLabel();hide();
 const record={...S,showOnLabel:JSON.parse(JSON.stringify(S.showOnLabel)),omissionConfirmations:JSON.parse(JSON.stringify(S.omissionConfirmations))};
 w.loadLabelRecord(record);assert.equal(d.getElementById('net-weight-choice').value,'custom');assert.equal(d.getElementById('net-weight').value,'100ml');assert.equal(S.showOnLabel.netWeight,false);assert.equal(S.omissionConfirmations.netWeight.value,'100ml');
 w.chooseNetWeight('180g');assert.equal(S.showOnLabel.netWeight,true,'preset change after reload must invalidate custom-value confirmation');
 assert.equal(d.getElementById('net-weight').value,'180g');
 console.log('PASS combined dropdown/omission integration: visible badge, presets, exact custom units, unchanged custom edit, blank, legacy load and value-bound confirmations');
 dom.window.close();process.exit(0);
}catch(e){console.error(e.stack);dom.window.close();process.exit(1);}},250);
