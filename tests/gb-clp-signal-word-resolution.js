// Regression coverage for the shared GB-CLP signal-word resolver.
// Run from repo root: node tests/gb-clp-signal-word-resolution.js
const fs=require('fs');
const assert=require('assert');
const {JSDOM,VirtualConsole}=require('jsdom');

function buildDom(){
  const source=fs.readFileSync('builder.html','utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi,'');
  const renderer=fs.readFileSync('label-render.js','utf8');
  const library=fs.readFileSync('label-library.js','utf8');
  const vc=new VirtualConsole();
  const errors=[]; vc.on('jsdomError',e=>errors.push(e.message));
  const emptyQuery={select(){return this},eq(){return this},update(){return this},upsert(){return this},single(){return Promise.resolve({data:null,error:null})},then(resolve){return Promise.resolve({data:null,error:null}).then(resolve)}};
  const dom=new JSDOM(source,{url:'https://local.clpeasy.test/builder.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(window){
    window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(text){return{width:String(text).length*7}},drawImage(){},fillRect(){},clearRect(){},getImageData(){return{data:[]}}});
    window.eval(renderer); window.eval(library);
    window.alert=m=>{window.__lastAlert=String(m)}; window.confirm=()=>true; window.scrollTo=()=>{};
    window.fetch=async()=>({ok:true,json:async()=>({})}); window.open=()=>({location:{href:''},close(){},opener:null});
    window.URL.createObjectURL=()=> 'blob:test'; window.URL.revokeObjectURL=()=>{};
    window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},from:()=>Object.create(emptyQuery),rpc:async()=>({data:false,error:null})})};
  }});
  return {dom,errors};
}

function extract(window,document,text){
  document.getElementById('smart-paste-input').value=text;
  window.extractSDS();
  return {signal:window.eval('S.signal'),sdsSignal:window.eval('S.sdsSignal'),h:window.eval('S.hStatements'),p:window.eval('S.pStatements'),pictograms:[...window.eval('S.pictograms')]};
}

async function run(){
  const {dom,errors}=buildDom(); const {window}=dom; const {document}=window;
  await new Promise(r=>setTimeout(r,250));

  const resolve=(codes,supplied='')=>window.eval(`resolveGbClpSignalWord(${JSON.stringify(codes)},${JSON.stringify(supplied)})`);
  const cases=[
    [['H317'],'','Warning'],
    [['H317','H402'],'Warning','Warning'],
    [['H412'],'',''],
    [['H412','EUH208'],'None',''],
    [['EUH208'],'',''],
    [['H411'],'',''],
    [['H413'],'',''],
    [['H314'],'','Danger'],
    [['H314','H317'],'','Danger'],
    [[], 'Warning',''],
    [['H290'],'','Warning'],
    [['H228'],'Danger','Danger'],
    [['H228'],'Warning','Warning']
  ];
  for(const [codes,supplied,expected] of cases){
    assert.strictEqual(resolve(codes,supplied),expected,`${codes.join(',')||'(none)'} / ${supplied||'(none)'}`);
  }

  const snow=`2.2 Label elements\nSignal word: None\nHazard statements: H412, Harmful to aquatic life with long lasting effects.\nSupplemental Information: EUH208, Contains Dorysil, Heliotropex, d-Limonene. May produce an allergic reaction.\nPrecautionary statements: P273, Avoid release to the environment. P501, Dispose of contents/container to approved disposal site.`;
  const snowResult=extract(window,document,snow);
  assert.strictEqual(snowResult.signal,'','Snow Pixie must render no CLP signal word');
  assert.strictEqual(snowResult.sdsSignal,'','SDS "None" must normalise to blank');
  assert.deepStrictEqual(snowResult.pictograms,[],'Snow Pixie must have no CLP pictogram');
  assert.deepStrictEqual(snowResult.h.split(', '),['H412','EUH208']);
  assert.deepStrictEqual(snowResult.p.split(', '),['P273','P501']);
  const snowPreviewText=(document.getElementById('label-svg-container')?.textContent||'').toUpperCase();
  assert(!snowPreviewText.includes('WARNING'),'Snow Pixie rendered preview must not print WARNING');
  assert(!snowPreviewText.includes('DANGER'),'Snow Pixie rendered preview must not print DANGER');

  const positivity=`2.2 Label elements\nSignal word: Warning\nHazard statements: H317, May cause an allergic skin reaction. H402, Harmful to aquatic life.\nSupplemental Information: EUH208, Contains Caryophyllene, Citral, beta-Pinene. May produce an allergic reaction.\nPrecautionary statements: P261, Avoid breathing vapour or dust. P302/352, IF ON SKIN: Wash with plenty of soap and water. P333/313, If skin irritation occurs: Get advice. P501, Dispose of contents.`;
  const positivityResult=extract(window,document,positivity);
  assert.strictEqual(positivityResult.signal,'Warning','Positivity must retain Warning because H317 requires it');
  assert(positivityResult.h.split(', ').includes('H402'),'unsupported H402 must remain extracted for the existing fail-closed gate');

  // Manual selection path: directly update the real H field and let the same
  // updateLabel() resolver run. No Smart Paste-only copy is allowed.
  document.getElementById('h-statements').value='H412, EUH208'; window.eval("S.sdsSignal=''"); window.updateLabel();
  assert.strictEqual(window.eval('S.signal'),'','manual H412+EUH208 must match Smart Paste: blank');
  document.getElementById('h-statements').value='H317'; window.updateLabel();
  assert.strictEqual(window.eval('S.signal'),'Warning','manual H317 must resolve to Warning');
  document.getElementById('h-statements').value='H314, H317'; window.updateLabel();
  assert.strictEqual(window.eval('S.signal'),'Danger','manual mixed Danger+Warning must resolve to Danger');

  // Clear must remove the supplier signal source as well as the rendered word.
  window.clearHazardData();
  assert.strictEqual(window.eval('S.signal'),'');
  assert.strictEqual(window.eval('S.sdsSignal'),'');

  assert.strictEqual(errors.length,0,`jsdom errors: ${errors.join(' | ')}`);
  console.log('GB CLP signal-word resolution checks passed');
}

run().catch(error=>{console.error(error.stack||error);process.exitCode=1});
