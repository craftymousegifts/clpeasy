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

setTimeout(async()=>{try{
 const set=(id,v)=>document.getElementById(id).value=v;
 window.setApprovedBuilderStep(2);set('scent-name','P-code preservation QA');set('product-type','Scented Candle');set('frag-load','10%');window.updateLabel();window.setApprovedBuilderStep(3);
 const expected=['P210','P233','P260','P261','P264','P270','P271','P273','P280','P302+P352','P305+P351+P338','P312','P321','P332+P313','P337+P313','P391','P501'];
 set('smart-paste-input','2.2 Label elements\nSignal word: Danger\nH226 H317 H319 H315 H411 H372\nEUH208 Contains Linalool, Limonene, Geraniol, Citronellol, Benzyl Alcohol. May produce an allergic reaction.\n'+expected.join('\n'));
 window.extractSDS();
 assert.equal(JSON.stringify([...window.eval('S.pSelected')]),JSON.stringify(expected),'all 17 supplied P codes retained in source order');
 assert.equal(window.eval('S.sensitisers.length'),5,'all five supplied sensitiser names kept');
 document.getElementById('hazard-confirm').checked=true;window.setApprovedBuilderStep(4);
 assert.equal(window.eval('approvedBuilderStep'),3,'retained unsupported wording stops advancement');assert(/P264/.test(window.__lastAlert)&&/P270/.test(window.__lastAlert));assert(!window._downloadAllowed(),'unsupported supplied codes cannot download');
 // Isolate P280 to prove its completion gate independently of unsupported codes.
 set('smart-paste-input','2.2 Label elements\nWarning H317\nP102 P280 P501');window.extractSDS();document.getElementById('hazard-confirm').checked=true;window.setApprovedBuilderStep(4);assert.equal(window.eval('approvedBuilderStep'),3);assert(/P280/.test(window.__lastAlert));
 const chip=document.querySelector('#p-chips [data-code="P280"]');window.togglePChip(chip,'P280');
 assert(document.getElementById('p280Modal').classList.contains('show'),'extracted P280 opens completion picker');
 window.confirmP280Modal();assert.equal(window.eval('S.pSelected.includes("P280")'),true,'invalid completion cannot delete supplied code');
 document.querySelector('#p280-item-opts input[value="gloves"]').checked=true;document.querySelector('#p280-item-opts input[value="eye"]').checked=true;window.confirmP280Modal();
 window.setApprovedBuilderStep(4);assert.equal(window.eval('approvedBuilderStep'),4,'reviewed valid P280 can advance');
 const d=window._lastLabelData;const r=LR.renderLabel({...d,size:'custom',customW:150,customH:150},{instanceId:'preserved-export',forExport:true});
 assert(r.svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes('Wear protective gloves/eye protection'),'exact maker-selected P280 wording renders: '+r.svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(-1500));
 // Every previously excluded code is retained, including slash notation.
 window.setApprovedBuilderStep(3);set('smart-paste-input','2.2 Label elements\nWarning H317\nP272 P264 P270 P280 P303/361/353 P362 P362+P364 P363 P405 P999');window.extractSDS();
 const kept=[...window.eval('S.pSelected')];for(const c of ['P272','P264','P270','P280','P303+P361+P353','P362','P362+P364','P363','P405','P999'])assert(kept.includes(c),c+' must not disappear');
 assert(window._labelBlockDownload,'unrecognized supplied code remains fail-closed');
 console.log('PASS supplied P-code preservation: all17 codes/five sensitisers; former exclusions; slash normalization; P280 incomplete gate/picker/export; unknown code blocking');
 }catch(e){console.error(e);process.exitCode=1}finally{window.close()}},60);
