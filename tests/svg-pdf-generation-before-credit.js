// SVG and PDF print-view preparation / credit ordering (4 Oct 2026), same harness as
// png-generation-before-credit.js: the file is built BEFORE the credit RPC; a
// generation failure costs zero; the RPC decides clean vs watermarked.
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
  for(const [id,value] of Object.entries({'scent-name':'SVG PDF QA','product-type':'Scented Candle','biz-name':'QA','biz-address':'1 Test Street','biz-phone':'00000000000'}))d.getElementById(id).value=value;
  w.updateLabel();d.getElementById('verify-checkbox').checked=true;
  w.eval('currentUser={id:"qa-svg-pdf"};');
  w.__confirmSdsDoc();
  assert.strictEqual(w._downloadAllowed(),true,'fixture is exportable: '+w._downloadBlockedMessage());
  let chargeCalls=0;
  const decode=a=>decodeURIComponent(a.dataUri.slice(a.dataUri.indexOf(',')+1));
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:true};};

  // ── SVG ──
  const svgOut=[];w.handOverBuilderSVG=a=>svgOut.push(a);
  const realBuildSVG=w.buildSVG;
  w.buildSVG=()=>{throw new Error('Simulated SVG generation failure');};
  await w.downloadSVG();
  assert.strictEqual(chargeCalls,0,'SVG generation failure must not call the credit RPC');
  assert.strictEqual(svgOut.length,0);
  assert.match(w.__lastAlert,/No download credit was used/);
  w.buildSVG=realBuildSVG;
  await w.downloadSVG();
  assert.strictEqual(chargeCalls,1,'one charge for one SVG: '+w.__lastAlert);
  assert.strictEqual(svgOut.length,1);
  assert(!/PREVIEW ONLY/.test(decode(svgOut[0])),'server-authorised output is clean');
  assert.match(decode(svgOut[0]),/^<\?xml[\s\S]*<svg[\s>][\s\S]*SVG PDF QA/);
  assert.match(svgOut[0].fname,/\.svg$/);
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:false};};
  await w.downloadSVG();assert(/PREVIEW ONLY/.test(decode(svgOut[1])),'trial output keeps the watermark');
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:false,reason:'accounting_error'};};
  await w.downloadSVG();assert.strictEqual(svgOut.length,2,'refused accounting delivers nothing');

  // ── PDF print view ──
  let popups=[];
  w.open=()=>{const p={closed:false,close(){this.closed=true;},document:{write(){},open(){},close(){}},location:{replace(u){p.url=u;}}};popups.push(p);return p;};
  const views=[];const realOpen=w.openPrintView;w.openPrintView=v=>views.push(v);
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:true};};
  let before=chargeCalls;
  w.buildSVG=()=>{throw new Error('Simulated print-view generation failure');};
  await w.printToPDF();
  assert.strictEqual(chargeCalls,before,'print-view generation failure must not call the credit RPC');
  assert.strictEqual(views.length,0);assert.match(w.__lastAlert,/No download credit was used/);
  assert.strictEqual(popups.length,0,'nothing is opened when the print view cannot be prepared');
  w.buildSVG=realBuildSVG;
  await w.printToPDF();
  assert.strictEqual(chargeCalls,before+1,'one charge for one print view');
  assert.strictEqual(views.length,1);
  assert(!/PREVIEW ONLY/.test(views[0].html)&&/SVG PDF QA/.test(views[0].html)&&/@page\{size:75mm 75mm/.test(views[0].html),'clean, complete, exact-size print view');
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:false};};
  await w.printToPDF();assert(/PREVIEW ONLY/.test(views[1].html),'trial print view keeps the watermark');
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:false,reason:'no_downloads_remaining'};};
  const n=popups.length;await w.printToPDF();
  assert.strictEqual(views.length,2,'refused accounting delivers nothing');
  assert.strictEqual(popups[n].closed,true,'refused accounting closes the holding window');
  // The real hand-over writes the prepared page into the window opened in the click.
  w.openPrintView=realOpen;w.URL.createObjectURL=()=>'blob:print-view';
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:true};};
  const m=popups.length;await w.printToPDF();
  assert.strictEqual(popups[m].url,'blob:print-view','prepared print view handed to the click-time window');
  assert.strictEqual(popups[m].closed,false);

  // ── Signed-out guest: unchanged, watermarked, never charged ──
  w.eval('currentUser=null;');before=chargeCalls;
  w.openPrintView=v=>views.push(v);const svgN=svgOut.length,vN=views.length;
  await w.downloadSVG();await w.printToPDF();
  assert.strictEqual(chargeCalls,before,'guests are never charged');
  assert(/PREVIEW ONLY/.test(decode(svgOut[svgN]))&&/PREVIEW ONLY/.test(views[vN].html),'guest output watermarked');
  assert.deepStrictEqual(errors.filter(e=>!/Not implemented/.test(e)),[],'no script errors');
  dom.window.close();
  console.log('PASS svg-pdf-generation-before-credit: SVG and PDF print view built before the credit RPC; generation failure costs zero and opens nothing; clean/trial choice obeys RPC; refused accounting delivers nothing; guests unchanged');
})().catch(error=>{console.error(error);process.exit(1);});
