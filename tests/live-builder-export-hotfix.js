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
  for(const scenario of ['name','EUH208']){
    const oldName=d.getElementById('scent-name').value;
    const oldCodes=d.getElementById('h-statements').value;
    if(scenario==='name')d.getElementById('scent-name').value='   ';
    else {d.getElementById('h-statements').value='EUH208';w.eval('S.hStatements="EUH208";S.sensitisers=[]');}
    w.toggleDownload();
    assert.strictEqual(w._downloadAllowed(),false,scenario+' incomplete content must block');
    assert.notStrictEqual(d.getElementById('business-details-export-note').style.display,'none');
    let calls=0;w.consumeBuilderDownload=async()=>{calls++;return {ok:true};};
    await w.downloadPNG();await w.downloadSVG();await w.printToPDF();
    assert.strictEqual(calls,0,'every incomplete export must refuse before credits');
    d.getElementById('scent-name').value=oldName;d.getElementById('h-statements').value=oldCodes;
    w.eval('S.hStatements="H317";S.sensitisers=[]');
  }
  const specimen={shape:'circle',size:100,scentName:'Test',productType:'Wax Melt',bizName:'QA',bizAddress:'1 Test Street',bizPhone:'00000000000',hStatements:'H317',pStatements:'P102',pictograms:['exclamation']};
  const normal=w.LabelRenderer.renderLabel(specimen,{instanceId:"guard-test"});
  assert(normal.fits);
  for(const key of ['unknown','GHS06','Exclamation','toString','',null,42]){
    const raw={...specimen,pictograms:[key]},saved=JSON.stringify(raw);
    const result=w.LabelRenderer.renderLabel(raw,{instanceId:"guard-test"});
    assert.strictEqual(result.fits,false);assert.strictEqual(result.blockReason,'unrecognised-pictogram');
    assert(!result.svg.includes('data:image/jpeg'),'unknown pictogram must never substitute a valid hazard image');
    assert.strictEqual(JSON.stringify(raw),saved,'draft data must stay intact');
  }
  assert.strictEqual(w.LabelRenderer.renderLabel(specimen,{instanceId:"guard-test"}).svg,normal.svg,'valid rendering must stay stable');
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
  for(const data of [{...good,scentName:'  '},{...good,hStatements:'EUH208',sensitisers:[]}]){
    c.getSheetPlacementsMM=()=>[{labelData:data}];
    assert(c.getSheetFitBlockMessage(),'incomplete saved label must block Composer');
    c.updateExportButtonState();assert(cd.getElementById('btn-pdf').disabled);assert(cd.getElementById('btn-png-all').disabled);
    let calls=0;c.consumeComposerDownload=async()=>{calls++;return {ok:true};};
    await c.downloadPDF();assert.strictEqual(calls,0);
  }
  c.getSheetPlacementsMM=()=>[];
  assert.strictEqual(c.getSheetBusinessDetailsBlockMessage(),null,'blank slots must not block');
  composer.window.close();
  console.log('PASS live-builder-export-hotfix: fresh/return navigation, required Business fields, pre-charge Builder guard and saved-sheet export guard');
})().catch(error=>{console.error(error);process.exit(1);});
