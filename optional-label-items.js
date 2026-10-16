/* Optional display choices: entered values stay in saved data. No fit override. */
(function(root){
'use strict';
const keys=['bizWebsite','netWeight','burnTime','batchNum'];
const labels={bizWebsite:'Website',netWeight:'Net quantity',burnTime:'Burn time',batchNum:'Batch'};
const protectedKeys=['netWeight','batchNum'];
function candidate(data,omit){
  const d=Object.assign({},data,{showOnLabel:Object.assign({},data.showOnLabel),omissionConfirmations:Object.assign({},data.omissionConfirmations)});
  for(const key of omit){
    d.showOnLabel[key]=false;
    if(protectedKeys.includes(key))d.omissionConfirmations[key]={confirmed:true,value:data[key]};
  }
  return d;
}
function findOptions(data,opts,larger){
  const R=root.LabelRenderer;
  if(!data||!R)return [];
  const dims=R.getLabelDims(data,opts);
  if(R.isCustomSizeBelowSupportedMinimum(data.shape,dims.mmW,dims.mmH))return [];
  const baseline=R.renderLabel(data,opts);
  if(baseline.fits||baseline.unsupportedCodes.length||baseline.unrecognizedCodesGeneric.length)return [];
  const normalized=R.normalizeLabel(data);
  const present=keys.filter(k=>normalized[k]);
  const passes=[];
  for(let mask=1;mask<(1<<present.length);mask++){
    const omit=present.filter((k,i)=>mask&(1<<i));
    const result=R.renderLabel(candidate(data,omit),opts);
    if(result.fits)passes.push({omit,hazardMm:result.metrics.fontSizes.hazard*dims.mmW/260});
  }
  const minimal=passes.filter(p=>!passes.some(q=>q.omit.length<p.omit.length&&q.omit.every(k=>p.omit.includes(k))));
  minimal.sort((a,b)=>Number(a.omit.includes('batchNum'))-Number(b.omit.includes('batchNum'))||a.omit.length-b.omit.length);
  let largerHazardMm=null;
  if(larger){
    const d=Object.assign({},data,{size:larger.source==='preset'?larger.presetMm:'custom',customW:larger.mmW,customH:larger.mmH});
    // Size recommendation uses automatic fitting, matching the existing larger-size action.
    const r=R.renderLabel(d,{instanceId:'omission-larger'});
    if(r.fits)largerHazardMm=r.metrics.fontSizes.hazard*larger.mmW/260;
  }
  return minimal.slice(0,2).map(p=>Object.assign(p,{largerHazardMm,values:Object.fromEntries(p.omit.map(k=>[k,data[k]]))}));
}
root.LabelOptionalItems={keys,labels,protectedKeys,candidate,findOptions};
})(typeof window!=='undefined'?window:globalThis);

function reconcileOptionalItems(){
  S.showOnLabel=S.showOnLabel||{};S.omissionConfirmations=S.omissionConfirmations||{};
  S._omissionNeedsConfirm=S._omissionNeedsConfirm||{};
  for(const key of LabelOptionalItems.protectedKeys){
    const c=S.omissionConfirmations[key];
    if(S.showOnLabel[key]===false&&(!c||c.confirmed!==true||c.value!==S[key])){
      S.showOnLabel[key]=true;delete S.omissionConfirmations[key];S._omissionNeedsConfirm[key]=true;
    }
  }
}
function showOptionalItems(keys){
  reconcileOptionalItems();
  for(const key of keys){S.showOnLabel[key]=true;delete S.omissionConfirmations[key];delete S._omissionNeedsConfirm[key];}
  updateLabel();
}
function refreshOptionalItemBadges(){
  const ids={bizWebsite:'biz-website',netWeight:document.getElementById('net-weight-choice')?'net-weight-choice':'net-weight',burnTime:'burn-time',batchNum:'batch-num'};
  const normalized=LabelRenderer.normalizeLabel(S),hidden=[];
  for(const key of LabelOptionalItems.keys){
    const field=document.getElementById(ids[key]);if(!field)continue;
    let badge=document.getElementById('omission-badge-'+key);
    if(!badge){badge=document.createElement('div');badge.id='omission-badge-'+key;badge.style.cssText='font-size:12px;margin-top:6px;line-height:1.5;';field.after(badge);}
    const off=!!S[key]&&!normalized[key];if(off)hidden.push(key);
    badge.innerHTML=off?'Not shown on this label · <button type="button" onclick="showOptionalItems([\''+key+'\'])" style="font:inherit;color:var(--teal-dark);background:none;border:0;text-decoration:underline;cursor:pointer;">Show on label</button>':S._omissionNeedsConfirm[key]?'Value changed: shown on label again. Confirm the current value elsewhere if you choose to leave it off.':'';
  }
  const box=document.getElementById('omission-download-summary');
  if(box){
    box.style.display=hidden.length?'block':'none';
    box.innerHTML=hidden.length?'Not shown on this label: '+hidden.map(k=>escapeBuilderText(LabelOptionalItems.labels[k]+' ('+S[k]+')')).join(', ')+'. <button type="button" onclick="showOptionalItems(LabelOptionalItems.keys)" style="font:inherit;color:var(--teal-dark);background:none;border:0;text-decoration:underline;cursor:pointer;">Show all on label</button>':'';
    if(hidden.length&&LabelRenderer.renderLabel(Object.assign({},window._lastLabelData,{showOnLabel:{},omissionConfirmations:{}}),window._ftLastOpts).fits)box.innerHTML+='<p>All entered items now fit. You can show them again.</p>';
  }
}
function optionalItemAdviceHTML(){
  const options=window._omissionOptions||[];
  if(!options.length)return '';
  const data=window._lastLabelData,normalized=LabelRenderer.normalizeLabel(data);
  const present=LabelOptionalItems.keys.filter(k=>normalized[k]);
  const dims=LabelRenderer.getLabelDims(data),size=dims.mmW===dims.mmH?dims.mmW+' mm':dims.mmW+' × '+dims.mmH+' mm';
  const suggested=options[0].omit;
  let html='<details open class="optional-item-review"><summary>Or keep '+size+' by leaving off:</summary><div class="omission-chips">';
  for(const key of present){
    html+='<label class="omission-chip"><input type="checkbox" data-omit-select="'+key+'" data-entered-value="'+escapeBuilderText(data[key])+'" onchange="refreshOptionalReview(this.closest(\'.optional-item-review\'))"><span>'+escapeBuilderText(LabelOptionalItems.labels[key]+' ('+data[key]+')')+'</span>'+(suggested.includes(key)?'<small>suggested</small>':'')+'</label>';
  }
  html+='</div><p class="fit-helper">Hidden details are saved, so you can add them back later.</p>';
  for(const key of present.filter(k=>LabelOptionalItems.protectedKeys.includes(k))){
    const text=key==='netWeight'?'Net quantity ('+data[key]+'): shown elsewhere on the packaging.':'Batch ('+data[key]+'): shown elsewhere on the product or its packaging.';
    html+='<div data-omission-confirm="'+key+'" hidden><label class="omission-confirm"><input type="checkbox" data-omission-key="'+key+'" onchange="refreshOptionalReview(this.closest(\'.optional-item-review\'))"><span>'+escapeBuilderText(text)+'</span></label></div>';
  }
  return html+'<p data-omission-status role="status" aria-live="polite" class="fit-status fit-status-blocked">Still too full: tick another or choose a larger size.</p><p data-omission-comparison class="fit-helper" hidden></p><button type="button" disabled onclick="applyOptionalOmission(0,this)">Apply choices</button><p class="fit-footnote">Fit check only. It doesn’t confirm legal compliance.</p></details>';
}
function selectedOptionalItems(panel){
  return Array.from(panel.querySelectorAll('[data-omit-select]:checked')).map(c=>c.dataset.omitSelect);
}
function refreshOptionalReview(panel){
  const omit=selectedOptionalItems(panel);
  for(const key of LabelOptionalItems.protectedKeys){
    const box=panel.querySelector('[data-omission-confirm="'+key+'"]');
    if(box){box.hidden=!omit.includes(key);if(box.hidden)box.querySelector('input').checked=false;}
  }
  const button=panel.querySelector('button'),status=panel.querySelector('[data-omission-status]'),comparison=panel.querySelector('[data-omission-comparison]');
  button.disabled=true;comparison.textContent='';
  button.textContent='Apply choices';status.className='fit-status fit-status-blocked';
  if(!omit.length){status.textContent='Still too full: tick another or choose a larger size.';return;}
  const data=window._lastLabelData;
  if(Array.from(panel.querySelectorAll('[data-omit-select]')).some(c=>c.dataset.enteredValue!==String(data[c.dataset.omitSelect]))){status.textContent='Details changed. Review the updated options before applying.';return;}
  const result=LabelRenderer.renderLabel(LabelOptionalItems.candidate(data,omit),window._ftLastOpts);
  if(!result.fits){status.textContent='Still too full: tick another or choose a larger size.';return;}
  const dims=LabelRenderer.getLabelDims(data),hazardMm=result.metrics.fontSizes.hazard*dims.mmW/260;
  const larger=(window._omissionOptions||[])[0]?.largerHazardMm;
  comparison.textContent='Hazard text: about '+hazardMm.toFixed(1)+' mm here'+(Number.isFinite(larger)?', versus '+larger.toFixed(1)+' mm on the larger label':'')+' (font size).';
  status.className='fit-status fit-status-ok';
  const fitSize=dims.mmW===dims.mmH?dims.mmW+' mm':dims.mmW+' × '+dims.mmH+' mm';
  const missing=omit.filter(k=>LabelOptionalItems.protectedKeys.includes(k)&&!panel.querySelector('[data-omission-key="'+k+'"]')?.checked);
  if(missing.length){status.textContent='✓ Fits at '+fitSize+'. Confirm where you show '+missing.map(k=>LabelOptionalItems.labels[k].toLowerCase()).join(' and ')+'.';return;}
  button.disabled=false;status.textContent='✓ Fits at '+fitSize;
}
function applyOptionalOmission(index,button){
  const panel=button.closest('.optional-item-review');if(!panel)return;
  readForm();reconcileOptionalItems();
  const fields=Array.from(panel.querySelectorAll('[data-omit-select]'));
  if(fields.some(c=>c.dataset.enteredValue!==String(S[c.dataset.omitSelect]))){updateLabel();return;}
  const omit=selectedOptionalItems(panel);if(!omit.length)return;
  for(const key of omit.filter(k=>LabelOptionalItems.protectedKeys.includes(k))){
    if(!panel.querySelector('[data-omission-key="'+key+'"]')?.checked)return;
  }
  const data=Object.assign({},window._lastLabelData);
  for(const key of LabelOptionalItems.keys)data[key]=S[key];
  const candidate=LabelOptionalItems.candidate(data,omit);
  if(!LabelRenderer.renderLabel(candidate,window._ftLastOpts).fits){refreshOptionalReview(panel);return;}
  S.showOnLabel=candidate.showOnLabel;S.omissionConfirmations=candidate.omissionConfirmations;
  for(const key of omit)delete S._omissionNeedsConfirm[key];
  updateLabel();
}
