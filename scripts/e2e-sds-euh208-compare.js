// QA: run the real extractSDS() of <repoDir>/builder.html on every corpus text,
// fresh DOM per case; dump the extracted state.  node compare.js <repoDir> <corpusDir> <out.json>
const fs = require('fs'), path = require('path');
const [REPO, CORPUS, OUT] = process.argv.slice(2);
const { JSDOM, VirtualConsole } = require(path.join(REPO, 'node_modules/jsdom'));
const ans = require(path.join(REPO, 'tests/helpers/sds-doc-answer')).installed;
const rd = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const source = rd('builder.html').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const libs = ['label-render.js', 'sds-doc-check.js', 'label-library.js', 'entitlement.js'].map(rd);
const q = { select(){return this}, eq(){return this}, update(){return this}, upsert(){return this}, single(){return Promise.resolve({data:null,error:null})}, then(r){return Promise.resolve({data:null,error:null}).then(r)} };
function run(text){
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(source, { url:'https://local.clpeasy.test/builder.html', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.HTMLElement.prototype.scrollIntoView=()=>{}; w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(t){return{width:String(t).length*6}},drawImage(){},fillRect(){},clearRect(){},getImageData(){return{data:[]}}});
      libs.forEach(l => w.eval(l)); w.alert=m=>{w.__alerts=(w.__alerts||[]).concat(String(m))}; w.confirm=()=>true; w.scrollTo=()=>{}; w.fetch=async()=>({ok:true,json:async()=>({})});
      w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},from:()=>Object.create(q),rpc:async()=>({data:false,error:null})})}; } });
  ans(dom); const w = dom.window, d = w.document;
  w.selectShape('rectangle'); w.selectSize('custom'); d.getElementById('custom-w').value='76'; d.getElementById('custom-h').value='51'; w.onDimInput();
  w.setApprovedBuilderStep(3); d.getElementById('product-type').value='Scented Candle';
  d.getElementById('smart-paste-input').value = text; w.extractSDS();
  const S = JSON.parse(w.eval('JSON.stringify({signal:S.signal,sdsSignal:S.sdsSignal,pictograms:S.pictograms,hSelected:S.hSelected,pSelected:S.pSelected,sensitisers:S.sensitisers,hazardFromExtraction:S.hazardFromExtraction})'));
  const warn = [...d.querySelectorAll('[id*="warn"],[class*="warn"],[id*="unknown"],[class*="notice"]')].filter(e=>e.offsetParent!==null||e.style.display!=='none').map(e=>e.textContent.replace(/\s+/g,' ').trim()).filter(Boolean).join(' | ');
  const svg = w.buildSVG(true).replace(/<\/?[^>]+>/g,' ').replace(/\s+/g,' ');
  w.close(); return { S, alerts: w.__alerts||[], warn, svgText: svg, errs };
}
const out = {};
for (let i = 1; i <= 100; i++) { const id = String(i).padStart(3,'0'); out[id] = run(fs.readFileSync(path.join(CORPUS, id+'-section-2-2.txt'),'utf8')); }
fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('done', OUT);
