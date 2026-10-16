const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
// builder.html loads the shared renderer via <script src="label-render.js">
// -- a same-origin/local file, not a CDN fetch this offline test harness
// should skip. The generic src-stripping above (aimed at CDN scripts like
// Supabase/JSZip that would otherwise try a real network fetch) can't tell
// the two apart, so load label-render.js explicitly before the page's own
// inline script runs, giving the exact same window.LabelRenderer the real
// browser would have by the time buildSVG() calls it.
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
// Checkpoint B: builder.html now also loads label-library.js via
// <script src="...">, stripped by the same generic regex above for the
// same reason label-render.js already was -- injected explicitly here,
// before the page's own inline script runs, so LabelLibrary exists
// synchronously by the time init()/initAuth() reference it.
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    // Stub the canvas 2D context BEFORE evaluating label-render.js -- its
    // module-level `_cvs.getContext('2d')` call runs immediately on load,
    // and jsdom has no real canvas backend (returns null without this stub),
    // which would otherwise leave `_ctx` null and crash the first
    // measureText() call.
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
    window.eval(fs.readFileSync('optional-label-items.js','utf8')); window.eval(labelLibrarySource); window.eval(require("fs").readFileSync(require("path").join(__dirname,"..","entitlement.js"),"utf8"));
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:false, error:null })
    }) };
  }
});
__sdsAns(dom);

const { window } = dom;
const document = window.document;
const LR = window.LabelRenderer;

setTimeout(async () => {
 try {
  const set=(id,value)=>{document.getElementById(id).value=value;};
  const state=()=>window.eval('S');
  const step=()=>window.eval('approvedBuilderStep');
  const settle=async()=>{for(let n=0;n<500&&window.eval('_fitAdviceJob?.pending');n++)await new Promise(r=>setTimeout(r,10));assert(!window.eval('_fitAdviceJob?.pending'),'advice search finishes');};
  const hidden=id=>assert.strictEqual(document.getElementById(id).style.display,'none',id+' must not warn before final review');
  const early=()=>{
   for(const id of ['smart-paste-size-warning','label-warn-stage4','label-warn-step5'])hidden(id);
   assert.strictEqual(window._suggestedLabelSize,null);
   assert.strictEqual(window._omissionOptions.length,0);
   assert(document.getElementById('preview-incomplete-note').textContent.includes('Final fit checked before download.'));
   const svg=window.buildSVG(false);
   assert(!svg.includes('FULL CONTENT DOES NOT FIT'),'early preview cannot declare a final fit failure');
   assert(!window._downloadAllowed(),'unfinished label cannot download');
  };
  const home=new JSDOM(fs.readFileSync('index.html','utf8'));
  assert.strictEqual(home.window.document.querySelectorAll('#features').length,1,'How it works has one real anchor target');
  assert(home.window.document.querySelector('#features').textContent.includes('From SDS to printed label in 5 steps'));home.window.close();
  assert(Number(window.getComputedStyle(document.getElementById('preview-sheet')).zIndex)>Number(window.getComputedStyle(document.querySelector('.sidebar')).zIndex||0),'enlarged preview must sit above sidebar');
  window.openPreviewSheet();assert.strictEqual(document.getElementById('preview-sheet').parentElement,document.body,'preview escapes isolated shell stacking context');window.closeSheet();
  const help=document.getElementById('supplier-information-help');
  assert(!help.open,'supplier guidance starts collapsed');
  help.open=true;window.updateLabel();assert(help.open,'user may expand supplier guidance');help.open=false;
  window.setApprovedBuilderStep(2);
  set('scent-name','Mint');set('product-type','Scented Candle');set('frag-load','10%');
  set('biz-name','Test Maker');set('biz-address','1 Test Lane, EX1 2AB');set('biz-phone','01632 960000');
  window.restoreNetWeight('200g');window.updateLabel();
  assert(!window._labelBlockDownload,'weight-only footer reuses space released by raised care row');
  set('biz-address','A very long synthetic address, Test Industrial Estate, Sampletown, EX1 2AB');window.updateLabel();
  assert(window._labelBlockDownload,'long retained footer really overflows at 52mm');early();
  assert(!window.buildSVG(false).includes('clp-fit-block'),'actual label stays visible during editing');
  assert(window.buildSVG(true).includes('FULL CONTENT DOES NOT FIT'),'exports never receive draft presentation');
  window.restoreNetWeight('');window.restoreBurnTime('40 hrs');window.updateLabel();early();
  window.restoreNetWeight('180g');set('biz-address','1 Test Lane, EX1 2AB');window.updateLabel();
  window.setApprovedBuilderStep(3);assert.strictEqual(step(),3);
  set('smart-paste-input','2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 Keep out of reach of children.\nP501 Dispose of contents/container in accordance with local regulations.');
  window.extractSDS();early();
  assert(!help.open,'step changes do not open supplier guidance');
  document.getElementById('hazard-confirm').checked=true;
  window.setApprovedBuilderStep(4);assert.strictEqual(step(),4,'fit failure must not stop entry of business details');early();
  set('batch-num','B2310');window.updateLabel();early();
  window.setApprovedBuilderStep(5);assert.strictEqual(step(),5);
  window.eval("S.size='custom';S.customW=58;S.customH=58;");set('custom-w','58');set('custom-h','58');window.updateLabel();
  assert(window._labelBlockDownload);assert.notStrictEqual(document.getElementById('label-warn-step5').style.display,'none');
  assert(document.getElementById('label-warn-step5').textContent.includes('Checking sizes'));
  assert(!document.getElementById('label-warn-step5').textContent.includes('No tested size'),'pending search is not a failed search');
  assert(!document.querySelector('#label-warn-step5 .fit-placement-help'),'pending check cannot claim no alternative fits');
  const oldJob=window.eval('_fitAdviceJob');window.updateLabel();assert.strictEqual(window.eval('_fitAdviceJob'),oldJob,'identical update reuses in-flight search');
  window.restoreNetWeight('181g');window.updateLabel();assert.notStrictEqual(window.eval('_fitAdviceJob'),oldJob,'edits supersede pending advice');
  window.restoreNetWeight('180g');window.updateLabel();

  assert(!window.buildSVG(false).includes('clp-fit-block'),'actual label stays visible at final review');
  assert(!document.getElementById('preview-incomplete-note').hidden);
  assert(document.getElementById('preview-incomplete-note').textContent.includes('candle-care icons'));
  assert(!document.getElementById('sheet-incomplete-note').hidden);
  await settle();assert(document.querySelector('#label-warn-step5 [data-omit-select="batchNum"]'),'final panel knows the batch entered in Step 4');
  // Try the suggested larger size, then return to a deliberately smaller label.
  await settle();const rec=window._suggestedLabelSize;assert(rec);
  window.applySuggestedLabelSize();assert(!window._labelBlockDownload,'larger-size action genuinely fits');
  assert(document.getElementById('preview-incomplete-note').hidden,'fitting preview clears incompleteness note');
  window.eval("S.size='custom';S.customW=58;S.customH=58;");set('custom-w','58');set('custom-h','58');window.updateLabel();
  await settle();assert(window._labelBlockDownload);assert(window._omissionOptions.length);
  const card=document.querySelector('#label-warn-step5 details.optional-fit-options')||document.querySelector('#label-warn-step5 [data-omission-status]').closest('details');
  assert(!document.querySelector('#label-warn-step5 .fit-placement-help'),'passing optional choices take precedence over placement fallback');
  // A 52mm jar base cannot always use the suggested larger circle. Keep
  // downloads blocked and provide honest placement advice after full search.
  window.eval("S.customW=52;S.customH=52;S.hStatements='H317,H412';S.pStatements='P102,P261,P273,P302+P352,P501';");set('custom-w','52');set('custom-h','52');set('h-statements','H317,H412,EUH208');set('p-statements','P102,P261,P273,P302+P352,P501');window.eval("S.sensitisers=['Linalool','Citral'];");window.updateLabel();await settle();
  assert(window._labelBlockDownload);assert.strictEqual(window._omissionOptions.length,0);
  const fallback=document.querySelector('#label-warn-step5 .fit-placement-help');assert(fallback);
  assert(!fallback.open,'packaging advice starts collapsed');
  assert(fallback.textContent.includes('fit at 52 mm'));assert(fallback.textContent.includes('another shape or a label position'));
  assert(!window._downloadAllowed(),'placement advice cannot bypass fit');
  window.eval("S.customW=58;S.customH=58;S.hStatements='H317';S.pStatements='P102,P501';");set('custom-w','58');set('custom-h','58');set('h-statements','H317');set('p-statements','P102,P501');window.eval('S.sensitisers=[];');window.updateLabel();await settle();
  let currentCard=document.querySelector('#label-warn-step5 [data-omission-status]').closest('details');
  const select=k=>currentCard.querySelector('[data-omit-select="'+k+'"]');
  assert(select('candleCare'),'enabled candle care appears only at complete final review');
  // Confirmed relocation round-trips through the real Builder library.
  for(const key of ['netWeight','burnTime','batchNum','candleCare'])select(key).checked=true;
  window.refreshOptionalReview(currentCard);assert(!currentCard.querySelector('button').disabled);
  window.applyOptionalOmission(0,currentCard.querySelector('button'));assert(!window._labelBlockDownload);
  assert.strictEqual(state().omissionConfirmations.candleCare.value,'Scented Candle');
  assert(document.getElementById('omission-download-summary').textContent.includes('Candle-care icons'));
  await window.saveLabel();const careSaved=window.getSaved().find(e=>e.scentName==='Mint');
  window.loadLabelAndGotoStep5(careSaved.id);assert.strictEqual(state().showOnLabel.candleCare,false);assert(LR.normalizeLabel(window._lastLabelData).hideEN15494);
  window.showOptionalItems(window.LabelOptionalItems.keys);await settle();assert(window._labelBlockDownload);
  const restoredCard=document.querySelector('#label-warn-step5 [data-omission-status]').closest('details');
  currentCard=restoredCard;
  select('burnTime').checked=true;window.refreshOptionalReview(currentCard);
  assert(currentCard.querySelector('button').disabled,'shortening one footer line must not bypass fit');
  select('netWeight').checked=true;select('batchNum').checked=true;window.refreshOptionalReview(currentCard);
  const apply=currentCard.querySelector('button');assert(!apply.disabled);
  window.applyOptionalOmission(0,apply);assert(!window._labelBlockDownload);
  for(const k of ['netWeight','burnTime','batchNum'])assert.strictEqual(state().showOnLabel[k],false);
  const data=window._lastLabelData;
  for(const opts of [{},{forExport:true},{pw:900,ph:900}]){
   const r=LR.renderLabel(data,{instanceId:'workflow-export',...opts});assert(r.fits);
   for(const text of ['180g','B2310','Burn: 40 hrs'])assert(!r.svg.includes(text));
   assert(r.svg.includes('May cause an allergic skin reaction.'));
  }
  await window.saveLabel();
  const saved=window.getSaved().find(e=>e.scentName==='Mint');assert(saved,'hidden-item label saves');
  window.loadLabelAndGotoStep5(saved.id);
  for(const k of ['netWeight','burnTime','batchNum'])assert.strictEqual(state().showOnLabel[k],false,'saved omission reloads');
  assert.strictEqual(state().omissionConfirmations.netWeight.value,'180g');
  assert.strictEqual(state().omissionConfirmations.batchNum.value,'B2310');
  assert(!window._labelBlockDownload,'reopened omitted label still fits');
  window.restoreNetWeight('190g');window.updateLabel();
  assert.strictEqual(state().showOnLabel.netWeight,true,'edited quantity restores itself');
  assert(!state().omissionConfirmations.netWeight,'old quantity confirmation invalidated');
  assert(window._labelBlockDownload,'edited quantity rechecks fit');
  window.loadLabelAndGotoStep5(saved.id);assert(!window._labelBlockDownload);
  window.showOptionalItems(window.LabelOptionalItems.keys);assert(window._labelBlockDownload,'restoring details reblocks final review');
  window.setApprovedBuilderStep(2);early();
  window.restoreNetWeight('190g');window.updateLabel();early();
  assert.strictEqual(state().netWeight,'190g');
  window.setApprovedBuilderStep(3);
  window.clearHazardData();set('smart-paste-input','2.2 Label elements\nH401 Toxic to aquatic life.');window.extractSDS();
  assert(window._labelBlockDownload,'unsupported SDS remains blocked immediately');
  assert(window.buildSVG(false).includes('LABEL DATA NEEDS REVIEW'),'code review cannot be masked by draft fit presentation');
  assert(!window._downloadAllowed());
  document.getElementById('hazard-confirm').checked=true;window.setApprovedBuilderStep(4);
  assert.strictEqual(step(),3,'unsupported SDS cannot advance to Business');
  console.log('PASS final-fit workflow: Step 2 weight/burn; Step 3 SDS/code checks; Step 4 batch; Step 5 fit, omissions, restore and export content; supplier disclosure');
 } catch(e){console.error(e);process.exitCode=1;}
 finally {window.close();}
},60);
