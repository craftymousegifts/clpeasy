// Regression coverage for the production QA blockers found 4 October 2026.
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

function buildDom(pageSource=source,page='builder'){ 
  return __sdsAns(new JSDOM(pageSource, {
    url: 'https://local.clpeasy.test/'+page+'.html',
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
      window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
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


(async()=>{
  const dom=buildDom(),w=dom.window,d=w.document;
  await new Promise(resolve=>setTimeout(resolve,150));
  w.selectShape('circle');w.selectSize(75);
  d.getElementById('scent-name').value='QA Test';
  d.getElementById('product-type').value='Scented Candle';
  w.setApprovedBuilderStep(2);w.setApprovedBuilderStep(3);
  d.getElementById('smart-paste-input').value='SECTION 2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 Keep out of reach of children.';
  w.extractSDS();d.getElementById('hazard-confirm').checked=true;
  w.setApprovedBuilderStep(4);
  assert.strictEqual(w.eval('approvedBuilderStep'),4);
  d.getElementById('biz-phone').value='00000000000';
  w.setApprovedBuilderStep(5);
  assert.strictEqual(w.eval('approvedBuilderStep'),4,'phone alone must not pass Business');
  assert.match(w.__lastAlert,/business \/ brand name.*business address/);
  d.getElementById('biz-name').value='QA Business';
  d.getElementById('biz-address').value='1 Test Street';
  w.setApprovedBuilderStep(5);
  assert.strictEqual(w.eval('approvedBuilderStep'),5);
  assert.strictEqual(d.getElementById('preview-dl-row').style.display,'flex','fresh journey must reveal exports');
  d.getElementById('verify-checkbox').checked=true;w.toggleDownload();
  assert.strictEqual(w._downloadAllowed(),true,'complete fitting specimen must be exportable');
  for(const id of ['biz-name','biz-address','biz-phone']){
    const el=d.getElementById(id),previous=el.value;el.value='   ';w.updateLabel();
    assert.strictEqual(w._downloadAllowed(),false,id+' must block direct export');
    assert.strictEqual(d.getElementById('btn-svg-preview').style.pointerEvents,'none');
    assert.notStrictEqual(d.getElementById('business-details-export-note').style.display,'none');
    let chargeCalls=0;w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true};};
    await w.downloadSVG();assert.strictEqual(chargeCalls,0,'incomplete export must not consume a credit');
    el.value=previous;w.updateLabel();
  }
  w.setApprovedBuilderStep(4);
  assert.strictEqual(d.getElementById('preview-dl-row').style.display,'none');
  w.setApprovedBuilderStep(5);
  assert.strictEqual(d.getElementById('preview-dl-row').style.display,'flex');
  dom.window.close();

  const printSource=fs.readFileSync('print.html','utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi,'');
  const composer=buildDom(printSource,'print'),c=composer.window,cd=c.document;
  await new Promise(resolve=>setTimeout(resolve,150));
  const good={scentName:'QA Saved',bizName:'QA',bizAddress:'1 Test Street',bizPhone:'00000000000'};
  c.eval('currentTpl=0;isPro=true;sheetFitIssues=[]');
  c.getSheetPlacementsMM=()=>[{labelData:good}];
  assert.strictEqual(c.getSheetBusinessDetailsBlockMessage(),null);
  for(const key of ['bizName','bizAddress','bizPhone']){
    c.getSheetPlacementsMM=()=>[{labelData:{...good,[key]:'   '}}];
    assert(c.getSheetBusinessDetailsBlockMessage(),key+' must block saved-sheet export');
    assert.match(c.getSheetFitBlockMessage(),/complete business details/);
    c.updateExportButtonState();
    assert.strictEqual(cd.getElementById('btn-pdf').disabled,true);
    assert.strictEqual(cd.getElementById('btn-png-all').disabled,true);
    assert.notStrictEqual(cd.getElementById('business-details-sheet-note').style.display,'none');
  }
  c.getSheetPlacementsMM=()=>[];
  assert.strictEqual(c.getSheetBusinessDetailsBlockMessage(),null,'blank slots must not block');
  composer.window.close();
  console.log('PASS live-builder-export-hotfix: fresh/return navigation, required Business fields, pre-charge Builder guard and saved-sheet export guard');
})().catch(error=>{console.error(error);process.exit(1);});
