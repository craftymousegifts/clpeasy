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
assert.equal(el.querySelectorAll('input[type="checkbox"]').length,O.keys.length,'one checkbox per item, no duplicate confirmations');
assert(select('netWeight').closest('label').textContent.includes('180g'));
assert(select('burnTime').closest('label').textContent.includes('40 hrs'));
assert(select('batchNum').closest('label').textContent.includes('B2310'));
assert(select('netWeight').closest('label').textContent.includes('I confirm this quantity is shown elsewhere on the packaging.'));
assert(select('batchNum').closest('label').textContent.includes('I confirm this batch is shown elsewhere on the product or packaging.'));
w.applyOptionalOmission(0,btn);assert.notEqual(w.S.showOnLabel.netWeight,false,'no selected confirmation cannot hide quantity');
select('netWeight').checked=true;select('batchNum').checked=true;
w.refreshOptionalReview(el.querySelector('details'));assert(!btn.disabled,'same checkbox selects and confirms protected items');
assert.equal(el.querySelector('[data-omission-status]').textContent,'✓ Fits at 90 mm');
w.applyOptionalOmission(0,btn);
assert.equal(w.S.omissionConfirmations.netWeight.value,'180g');assert.equal(w.S.omissionConfirmations.batchNum.value,'B2310');
assert.equal(w.S.netWeight,'180g');assert.equal(w.S.batchNum,'B2310');assert.equal(w.S.showOnLabel.netWeight,false);
w.S.batchNum='BN-NEW';w.reconcileOptionalItems();assert.equal(w.S.showOnLabel.batchNum,true);assert(!w.S.omissionConfirmations.batchNum);
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
// Exact chosen subset must pass, even when directly invoked.
const small={...base,customW:52,customH:52};
w.S=JSON.parse(JSON.stringify(small));w._lastLabelData=small;
el.innerHTML=w.optionalItemAdviceHTML();select('burnTime').checked=true;
w.refreshOptionalReview(el.querySelector('details'));
assert(el.querySelector('button').disabled,'failing partial selection stays blocked');
w.applyOptionalOmission(0,el.querySelector('button'));assert.notEqual(w.S.showOnLabel?.burnTime,false,'direct invocation cannot apply failing selection');
console.log(`PASS optional-label-items: ${blocked} blocked and ${rescued} rescued in 42 fixtures; confirmations, exact-value invalidation, legacy rendering, exports and restore checked`);

// A stale checkbox cannot confirm a newly edited quantity before applying.
w.S=JSON.parse(JSON.stringify(base));w._lastLabelData=base;el.innerHTML=w.optionalItemAdviceHTML();select('netWeight').checked=true;
w.S.netWeight='212.5g';w.applyOptionalOmission(0,el.querySelector('button'));assert.notEqual(w.S.showOnLabel?.netWeight,false,'old displayed value cannot authorize new quantity');

// Candle care is a protected placement choice, not ordinary optional content.
const care=O.candidate(base,['candleCare']);
assert.equal(R.normalizeLabel(care).hideEN15494,true);
assert.equal(R.normalizeLabel({...care,omissionConfirmations:{}}).hideEN15494,false,'missing acknowledgement restores icons');
assert.equal(R.normalizeLabel({...care,productType:'Soy Candle'}).hideEN15494,false,'changed candle type needs fresh acknowledgement');
assert.equal(R.normalizeLabel({...base,hideEN15494:true}).hideEN15494,true,'legacy explicit choice preserved');
assert.equal(O.present({...base,productType:'Wax Melt'},'candleCare'),false);
assert.equal(O.present({...base,hideEN15494:true},'candleCare'),false);
w.S=JSON.parse(JSON.stringify(base));w._lastLabelData=base;el.innerHTML=w.optionalItemAdviceHTML();
assert(select('candleCare').closest('label').textContent.includes('visible and legible elsewhere on the product or packaging'));
select('candleCare').checked=true;w.refreshOptionalReview(el.querySelector('details'));
assert(!el.querySelector('button').disabled);w.applyOptionalOmission(0,el.querySelector('button'));
assert.equal(w.S.omissionConfirmations.candleCare.value,base.productType);
const savedCare=JSON.parse(JSON.stringify(w.S));
for(const exportOpts of [{},{forExport:true},{pw:900,ph:900}]){
 const result=R.renderLabel(savedCare,{...opts,...exportOpts});assert(result.fits);
 assert.equal(result.metrics.bcfTooSmall,false);assert(result.svg.includes('May cause an allergic skin reaction.'));
 const row=result.svg.split('<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->')[1].split('<!-- WATERMARK -->')[0];
 assert(!/<(?:image|use)\b/.test(row),'care pictograms are not exported after confirmed relocation');
 assert.equal(result.svg,R.renderLabel({...base,hideEN15494:true},{...opts,...exportOpts}).svg,'relocation uses the established hide-care rendering in every export mode');
}
w.showOptionalItems(['candleCare']);assert.equal(R.normalizeLabel(w.S).hideEN15494,false);
w.S=JSON.parse(JSON.stringify(savedCare));w.S.productType='Soy Candle';w.reconcileOptionalItems();assert.equal(w.S.showOnLabel.candleCare,true);
const blank={...base,netWeight:'',burnTime:'',batchNum:'',bizWebsite:'',productType:'Wax Melt'};
w._lastLabelData=blank;el.innerHTML=w.optionalItemAdviceHTML();assert.equal(el.querySelectorAll('[data-omit-select]').length,0,'unentered fields and non-candle icons are not offered');
(async()=>{const sync=O.findOptions({...base,customW:58,customH:58},opts);assert.deepEqual(await O.findOptionsAsync({...base,customW:58,customH:58},opts),sync);assert.deepEqual(await O.findOptionsAsync(base,opts,null,()=>false),[]);console.log('PASS care relocation: explicit confirmation, type invalidation, restore, legacy choice, export parity, absent fields and cancellable search');w.close();})().catch(e=>{console.error(e);process.exitCode=1});
