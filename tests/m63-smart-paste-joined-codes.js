// M63 regression: Smart Paste must not silently drop a CLP code that a PDF
// text layer has joined directly to its following statement text.
const fs=require('fs');
const assert=require('assert');
const {JSDOM,VirtualConsole}=require('jsdom');

function buildDom(){
  const source=fs.readFileSync('builder.html','utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi,'');
  const renderer=fs.readFileSync('label-render.js','utf8');
  const library=fs.readFileSync('label-library.js','utf8');
  const vc=new VirtualConsole();
  const emptyQuery={select(){return this},eq(){return this},update(){return this},upsert(){return this},single(){return Promise.resolve({data:null,error:null})},then(resolve){return Promise.resolve({data:null,error:null}).then(resolve)}};
  const dom=new JSDOM(source,{url:'https://local.clpeasy.test/builder.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(window){
    window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(text){return{width:String(text).length*7}},drawImage(){},fillRect(){},clearRect(){},getImageData(){return{data:[]}}});
    window.eval(renderer); window.eval(library);
    window.alert=m=>{window.__lastAlert=String(m)}; window.confirm=()=>true; window.scrollTo=()=>{};
    window.fetch=async()=>({ok:true,json:async()=>({})}); window.open=()=>({location:{href:''},close(){},opener:null});
    window.URL.createObjectURL=()=> 'blob:test'; window.URL.revokeObjectURL=()=>{};
    window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},from:()=>Object.create(emptyQuery),rpc:async()=>({data:false,error:null})})};
  }});
  return dom;
}

async function run(){
  const dom=buildDom(),w=dom.window,d=w.document;
  await new Promise(r=>setTimeout(r,250));
  const input=d.getElementById('smart-paste-input');

  const probes=['H317May cause an allergic skin reaction.','EUH208Contains Linalool. May produce an allergic reaction.','P102Keep out of reach of children.'];
  for(const text of probes){
    w.__lastAlert='';
    w.eval("S.hStatements='';S.pStatements='';S.sensitisers=[];");
    input.value=text;
    w.extractSDS();
    assert(w.__lastAlert.includes('joined directly to statement text'),text+' must be explicitly blocked');
    assert(w.__lastAlert.includes('has not guessed or removed the code'),text+' must explain fail-closed behaviour');
    assert.strictEqual(w.eval('S.hStatements'),'','joined-code block must not mutate H statements');
    assert.strictEqual(w.eval('S.pStatements'),'','joined-code block must not mutate P statements');
  }

  // Normal separated text remains extractable.
  w.__lastAlert='';
  input.value='Hazard statements: H317 May cause an allergic skin reaction. Precautionary statements: P102 Keep out of reach of children.';
  w.extractSDS();
  assert(w.eval('S.hStatements').split(', ').includes('H317'),'normal H317 extraction changed');
  assert(w.eval('S.pStatements').split(', ').includes('P102'),'normal P102 extraction changed');
  assert(!w.__lastAlert.includes('joined directly'),'normal spaced codes must not be blocked');

  // A genuine verified suffixed H-code remains valid and is not mistaken for
  // joined prose.
  w.__lastAlert='';
  input.value='Hazard statements: H350i May cause cancer by inhalation.';
  w.extractSDS();
  assert(w.eval('S.hStatements').split(', ').includes('H350i'),'verified suffixed H code changed');
  assert(!w.__lastAlert.includes('joined directly'),'verified suffixed H code must not be blocked');

  dom.window.close();
  console.log('M63 joined-code fail-closed checks passed:',probes.length,'joined probes + spaced/suffixed controls');
}
run().catch(e=>{console.error(e);process.exit(1);});
