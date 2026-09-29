// M04 regression: Builder/Composer must share one GB CLP signal-word resolver.
// Run from repo root: node tests/m04-composer-signal-word-consistency.js
const fs=require('fs');
const assert=require('assert');
const {JSDOM}=require('jsdom');

// label-render.js creates its measurement canvas at load time, so exercise the
// real browser-facing renderer in a DOM rather than requiring it in bare Node.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{
  runScripts:'dangerously',
  pretendToBeVisual:true,
  beforeParse(window){
    window.HTMLCanvasElement.prototype.getContext=()=>({
      font:'',
      measureText(text){return {width:String(text).length*7};},
      drawImage(){},fillRect(){},clearRect(){},getImageData(){return {data:[]};}
    });
  }
});
dom.window.eval(fs.readFileSync('label-render.js','utf8'));
const LR=dom.window.LabelRenderer;
assert(LR&&typeof LR.resolveGbClpSignalWord==='function','shared signal resolver must be exported');

const cases=[
  {name:'current H317',codes:['H317'],supplied:'Warning',want:'Warning'},
  {name:'current H304+H317',codes:['H304','H317'],supplied:'Danger',want:'Danger'},
  {name:'H412 only',codes:['H412'],supplied:'Warning',want:''},
  {name:'no hazards',codes:[],supplied:'Danger',want:''},
  {name:'legacy H290',codes:['H290'],supplied:'Danger',want:'Warning'},
  {name:'legacy H317+H334',codes:['H317','H334'],supplied:'Warning',want:'Danger'},
  {name:'legacy H304+H317',codes:['H304','H317'],supplied:'Warning',want:'Danger'},
  {name:'legacy missing H317',codes:['H317'],supplied:'',want:'Warning'},
  {name:'tampered xyz H317',codes:['H317'],supplied:'xyz',want:'Warning'},
  {name:'numeric signal H317',codes:['H317'],supplied:123,want:'Warning'},
  {name:'lowercase danger H304',codes:['H304'],supplied:'danger',want:'Danger'},
  {name:'ambiguous H228 Danger',codes:['H228'],supplied:'Danger',want:'Danger'},
  {name:'ambiguous H228 Warning',codes:['H228'],supplied:'Warning',want:'Warning'},
  {name:'ambiguous H228 fallback',codes:['H228'],supplied:'',want:'Warning'},
];
for(const c of cases){
  assert.strictEqual(LR.resolveGbClpSignalWord(c.codes,c.supplied),c.want,c.name);
}

const builder=fs.readFileSync('builder.html','utf8');
const print=fs.readFileSync('print.html','utf8');
const renderer=fs.readFileSync('label-render.js','utf8');

assert.strictEqual((renderer.match(/const GB_CLP_SIGNAL_WORD_BY_CODE=/g)||[]).length,1,'shared renderer must contain exactly one signal table');
assert.strictEqual((builder.match(/const GB_CLP_SIGNAL_WORD_BY_CODE=/g)||[]).length,0,'Builder must not keep a second signal table');
assert(builder.includes('const resolveGbClpSignalWord=LabelRenderer.resolveGbClpSignalWord;'),'Builder must point at shared resolver');
assert(print.includes('renderData.signal=LabelRenderer.resolveGbClpSignalWord(signalCodes,suppliedSignal);'),'Composer must derive signal through shared resolver');
assert(print.includes('const renderData=Object.assign({},e||{});'),'Composer must render a copy, not mutate saved data');

const record={hStatements:'H304, H317',signal:'Warning',sdsSignal:'',marker:{keep:true}};
const before=JSON.stringify(record);
const copy=Object.assign({},record);
copy.signal=LR.resolveGbClpSignalWord(copy.hStatements,copy.sdsSignal!==undefined?copy.sdsSignal:(copy.signal||''));
assert.strictEqual(copy.signal,'Danger');
assert.strictEqual(JSON.stringify(record),before,'render-only correction must not mutate saved record');

dom.window.close();
console.log('M04 Composer signal-word consistency checks passed:',cases.length,'resolver cases');
