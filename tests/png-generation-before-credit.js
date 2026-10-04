// PNG preparation / credit ordering regression tests; no real accounts or browser automation.
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
  for(const [id,value] of Object.entries({'scent-name':'PNG QA','product-type':'Scented Candle','biz-name':'QA','biz-address':'1 Test Street','biz-phone':'00000000000'}))d.getElementById(id).value=value;
  w.updateLabel();d.getElementById('verify-checkbox').checked=true;
  w.eval('currentUser={id:"qa-png"};');
  w.__confirmSdsDoc();
  const realBuild=w.buildBuilderPNGArtifact;
  let chargeCalls=0,delivered=[],svgVariants=[];
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:true};};
  w.handOverBuilderPNG=artifact=>delivered.push(artifact);
  w.buildBuilderPNGArtifact=async()=>{throw new Error('Simulated encoder failure');};
  await w.downloadPNG();
  assert.strictEqual(chargeCalls,0,'failed preparation must not call credit RPC');
  assert.strictEqual(delivered.length,0);
  assert.match(w.__lastAlert,/No download credit was used/);
  w.buildBuilderPNGArtifact=async(svg,width,height,fname)=>{
    svgVariants.push(svg);assert.strictEqual(width,1772);assert.strictEqual(height,1772);
    assert.match(fname,/75(?:x75)?mm\.png$/);
    return {blob:new w.Blob(['fixture'],{type:'image/png'}),fname,watermarked:svg.includes('PREVIEW ONLY')};
  };
  await w.downloadPNG();
  assert.strictEqual(chargeCalls,1,w.__lastAlert);assert.strictEqual(delivered.length,1);
  assert.strictEqual(delivered[0].watermarked,false,'server-authorised PAYG output must be clean');
  assert(svgVariants.some(svg=>svg.includes('PREVIEW ONLY'))&&svgVariants.some(svg=>!svg.includes('PREVIEW ONLY')));
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:true,clean:false};};
  await w.downloadPNG();assert.strictEqual(delivered[1].watermarked,true,'trial output must retain watermark');
  w.consumeBuilderDownload=async()=>{chargeCalls++;return {ok:false,reason:'accounting_error'};};
  await w.downloadPNG();assert.strictEqual(delivered.length,2,'refused accounting must not deliver a prebuilt clean artifact');
  const before=chargeCalls;
  w.buildBuilderPNGArtifact=async(svg,width,height,fname)=>{
    d.getElementById('biz-name').value='Changed while preparing';
    return {blob:new w.Blob(['fixture']),fname};
  };
  await w.downloadPNG();assert.strictEqual(chargeCalls,before,'changed input must not consume a credit');
  assert.match(w.__lastAlert,/label changed/);

  // Real image-load / canvas failure handlers: no silently ignored errors.
  const simpleSvg='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  const revoked=[];w.URL.revokeObjectURL=url=>revoked.push(url);
  w.Image=class{set src(v){if(this.onerror)this.onerror();}};
  await assert.rejects(realBuild(simpleSvg,10,10,'qa.png'),/could not be loaded/);
  assert(revoked.length>0,'failed raster source URL must be released');
  w.Image=class{set src(v){if(this.onload)this.onload();}};
  w.HTMLCanvasElement.prototype.toBlob=callback=>callback(null);
  await assert.rejects(realBuild(simpleSvg,10,10,'qa.png'),/encoding failed/);
  w.HTMLCanvasElement.prototype.toBlob=callback=>callback(new w.Blob(['png-fixture'],{type:'image/png'}));
  const artifact=await realBuild(simpleSvg,10,10,'qa.png');
  assert.strictEqual(artifact.fname,'qa.png');assert.strictEqual(artifact.blob.type,'image/png');
  w.showPrintGuidance('png');
  assert.match(d.getElementById('dl-print-guidance').textContent,/Download started.*Downloads list/);
  w.showPrintGuidance('pdf');
  assert.match(d.getElementById('dl-print-guidance').textContent,/Print view ready/);
  dom.window.close();
  console.log('PASS png-generation-before-credit: generation failure costs zero; clean/trial choice obeys RPC; accounting and changed-input refusal; image/encoder failures and cleanup; 600 DPI dimensions');
})().catch(error=>{console.error(error);process.exit(1);});
