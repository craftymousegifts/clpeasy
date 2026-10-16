const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('builder.html','utf8');
const w=new JSDOM(html,{runScripts:'outside-only'}).window;
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(text){const size=Number((this.font.match(/([\d.]+)px/)||[])[1])||12;return {width:[...String(text)].reduce((n,c)=>n+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0)};}});
w.eval(fs.readFileSync('label-render.js','utf8'));w.eval(fs.readFileSync('optional-label-items.js','utf8'));
const R=w.LabelRenderer,O=w.LabelOptionalItems,opts={instanceId:'test-optional'};
const base={shape:'circle',size:'custom',customW:90,customH:90,scentName:'Mint',productType:'Scented Candle',bizName:'Crafty Mouse Gifts',bizAddress:'1 Test Lane, EX1 2AB',bizPhone:'01632 960000',bizWebsite:'www.example.test',netWeight:'180g',burnTime:'40 hrs',batchNum:'B2310',signal:'Warning',hStatements:'H317',pStatements:'P102,P501',pictograms:['exclamation'],sensitisers:[]};
const hidden=O.candidate(base,O.keys);
assert.equal(R.normalizeLabel(hidden).netWeight,'');
assert.equal(R.normalizeLabel(hidden).bizAddress,base.bizAddress);
for(const key of ['netWeight','batchNum']){
 for(const c of [undefined,{confirmed:false,value:base[key]},{confirmed:true,value:'wrong'}]){
  const d=JSON.parse(JSON.stringify(hidden));d.omissionConfirmations[key]=c;assert.equal(R.normalizeLabel(d)[key],base[key],'no valid confirmation: item returns');
 }
 const d=JSON.parse(JSON.stringify(hidden));d[key]='changed';assert.equal(R.normalizeLabel(d)[key],'changed','editing invalidates confirmation');
}
assert.equal(R.renderLabel(base,opts).svg,R.renderLabel({...base,showOnLabel:{},omissionConfirmations:{}},opts).svg,'old saves render identically');
for(const exportOpts of [{},{forExport:true},{pw:900,ph:900}]){
 const svg=R.renderLabel(hidden,{...opts,...exportOpts}).svg;
 assert(!svg.includes('B2310'));assert(!svg.includes('180g'));assert(!svg.includes('www.example.test'));assert(svg.includes('01632 960000'));
}
let blocked=0,rescued=0;
for(const shape of ['circle','square','rectangle'])for(const mm of [52,58,60,63,70,80,90])for(const productType of ['Scented Candle','Wax Melt']){
 const data={...base,shape,customW:mm,customH:shape==='rectangle'?Math.round(mm*.7):mm,productType};
 const before=JSON.stringify(data),result=R.renderLabel(data,opts),options=O.findOptions(data,opts);
 assert.equal(JSON.stringify(data),before,'finding never mutates entered data');
 assert(options.length<=2);
 if(!result.fits)blocked++;
 if(options.length)rescued++;
 for(const o of options){
  assert(R.renderLabel(O.candidate(data,o.omit),opts).fits,'each offered option really fits');
  for(const key of o.omit){const smaller=o.omit.filter(k=>k!==key);assert(!R.renderLabel(O.candidate(data,smaller),opts).fits,'only minimal combinations');}
 }
}
assert(blocked>0&&rescued>0,'matrix exercises actual blocking and rescue');
assert.equal(O.findOptions({...base,hStatements:'H401'},opts).length,0,'unsupported codes cannot be rescued');
assert.equal(O.findOptions({...base,customW:40,customH:40},opts).length,0,'below-minimum size gets no omission offer');
// UI confirmation cannot be bypassed; unchanged entered values are retained.
w.eval('var S='+JSON.stringify(base)+';');w.readForm=()=>{};let updated=0;w.updateLabel=()=>updated++;
w.escapeBuilderText=t=>String(t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
w._lastLabelData=base;w._ftLastOpts=opts;
const option={omit:['netWeight','batchNum'],values:{netWeight:'180g',batchNum:'B2310'},hazardMm:1.3,largerHazardMm:1.8};w._omissionOptions=[option];
const el=w.document.createElement('div');el.innerHTML=w.optionalItemAdviceHTML();w.document.body.append(el);
const btn=el.querySelector('button');assert(btn.disabled);
assert(el.querySelector('details').open,'passing alternative must be visible without discovering a disclosure');
const select=key=>el.querySelector('[data-omit-select="'+key+'"]');
assert(select('burnTime'),'burn time has an individual selection checkbox');
assert.equal(el.querySelectorAll('[data-omit-select]:checked').length,0,'nothing preselected');
select('netWeight').checked=true;select('batchNum').checked=true;
w.refreshOptionalReview(el.querySelector('details'));
const confirmations=el.querySelectorAll('[data-omission-key]');
confirmations[0].checked=true;w.refreshOptionalReview(el.querySelector('details'));
assert(btn.disabled,'one protected confirmation cannot enable the whole combination');
assert(el.querySelector('[data-omission-status]').textContent.includes('batch'),'disabled action names the missing confirmation');
confirmations[0].checked=false;
w.applyOptionalOmission(0,btn);assert.notEqual(w.S.showOnLabel.netWeight,false,'missing confirmations cannot apply');
el.querySelectorAll('input').forEach(c=>c.checked=true);w.refreshOptionalReview(el.querySelector('details'));assert(!btn.disabled);w.applyOptionalOmission(0,btn);
assert.equal(w.S.netWeight,'180g');assert.equal(w.S.batchNum,'B2310');assert.equal(w.S.showOnLabel.netWeight,false);
w.S.netWeight='200g';w.reconcileOptionalItems();assert.equal(w.S.showOnLabel.netWeight,true);assert(!w.S.omissionConfirmations.netWeight);
w.showOptionalItems(O.keys);assert(Object.values(w.S.showOnLabel).every(v=>v===true));
assert(html.includes('showOnLabel:JSON.parse(JSON.stringify(S.showOnLabel||{}))'),'saving preserves choices');
assert(html.includes('S.showOnLabel=Object.assign({},e.showOnLabel||{})'),'loading restores choices');
// Burn time alone needs no location confirmation and only hides the chosen item.
w.S=JSON.parse(JSON.stringify(base));w._lastLabelData=base;
el.innerHTML=w.optionalItemAdviceHTML();select('burnTime').checked=true;
w.refreshOptionalReview(el.querySelector('details'));
assert(!el.querySelector('button').disabled);
w.applyOptionalOmission(0,el.querySelector('button'));
assert.equal(w.S.showOnLabel.burnTime,false);assert.notEqual(w.S.showOnLabel.netWeight,false);assert.notEqual(w.S.showOnLabel.batchNum,false);
// Exact chosen subset must pass, even if confirmation checkboxes are forged/checked.
const small={...base,customW:52,customH:52};
w.S=JSON.parse(JSON.stringify(small));w._lastLabelData=small;
el.innerHTML=w.optionalItemAdviceHTML();select('burnTime').checked=true;
w.refreshOptionalReview(el.querySelector('details'));
assert(el.querySelector('button').disabled,'failing partial selection stays blocked');
w.applyOptionalOmission(0,el.querySelector('button'));assert.notEqual(w.S.showOnLabel?.burnTime,false,'direct invocation cannot apply failing selection');
console.log(`PASS optional-label-items: ${blocked} blocked and ${rescued} rescued in 42 fixtures; confirmations, exact-value invalidation, legacy rendering, exports and restore checked`);
