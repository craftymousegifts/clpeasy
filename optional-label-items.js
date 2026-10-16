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
  const dims=LabelRenderer.getLabelDims(window._lastLabelData),size=dims.mmW===dims.mmH?dims.mmW+' mm':dims.mmW+' × '+dims.mmH+' mm';
  let html='<p>CLPeasy will not shrink text below its supported size limits or cut off required information to force a label to fit.</p>';
  options.forEach((option,i)=>{
    const protectedItems=option.omit.filter(k=>LabelOptionalItems.protectedKeys.includes(k));
    html+='<details open class="optional-item-review"><summary>Keep '+size+' by leaving optional details off'+(options.length>1?' — option '+(i+1):'')+'</summary><p>This tested option leaves <strong>all '+option.omit.length+' listed items</strong> off this label:</p><ul style="padding-left:20px;">'+option.omit.map(k=>'<li>'+escapeBuilderText(LabelOptionalItems.labels[k]+' ('+option.values[k]+')')+'</li>').join('')+'</ul><p>Your entered values are kept and can be restored. The ticks below confirm where protected items are shown; they do not select individual items to remove.</p>';
    if(Number.isFinite(option.hazardMm)&&Number.isFinite(option.largerHazardMm))html+='<p>Hazard text: about '+option.hazardMm.toFixed(1)+' mm here, compared with '+option.largerHazardMm.toFixed(1)+' mm on the suggested larger label (font size).</p>';
    html+='<p>Fitting the layout checks is not confirmation that your label meets GB CLP or any other legal requirement.</p>';
    for(const key of protectedItems){
      const text=key==='netWeight'?'The net quantity ('+option.values[key]+') is shown elsewhere on the packaging.':'The batch ('+option.values[key]+') is shown elsewhere on the product or its packaging.';
      html+='<label style="display:flex;gap:8px;margin:10px 0;"><input type="checkbox" data-omission-key="'+key+'" onchange="refreshOptionalReview(this.closest(\'.optional-item-review\'))"><span>'+escapeBuilderText(text)+'</span></label>';
    }
    html+='<p data-omission-status role="status" aria-live="polite">'+(protectedItems.length?'Confirm where '+protectedItems.map(k=>LabelOptionalItems.labels[k].toLowerCase()).join(' and ')+' are shown to enable this option.':'Ready to apply this tested option.')+'</p><button type="button" '+(protectedItems.length?'disabled ':'')+'onclick="applyOptionalOmission('+i+',this)">Leave these '+option.omit.length+' items off this label</button></details>';
  });
  return html;
}
function refreshOptionalReview(panel){
  const unchecked=Array.from(panel.querySelectorAll('[data-omission-key]')).filter(c=>!c.checked);
  panel.querySelector('button').disabled=unchecked.length>0;
  panel.querySelector('[data-omission-status]').textContent=unchecked.length
    ?'Still needed: confirm where '+unchecked.map(c=>LabelOptionalItems.labels[c.dataset.omissionKey].toLowerCase()).join(' and ')+' are shown.'
    :'Ready. Apply this option to leave all listed items off this label.';
}
function applyOptionalOmission(index,button){
  const option=(window._omissionOptions||[])[index];if(!option)return;
  readForm();reconcileOptionalItems();
  if(option.omit.some(k=>S[k]!==option.values[k])){updateLabel();return;}
  const panel=button.closest('.optional-item-review');if(!panel)return;
  for(const key of option.omit.filter(k=>LabelOptionalItems.protectedKeys.includes(k))){
    if(!panel.querySelector('[data-omission-key="'+key+'"]')?.checked)return;
  }
  const data=Object.assign({},window._lastLabelData);
  for(const key of LabelOptionalItems.keys)data[key]=S[key];
  const candidate=LabelOptionalItems.candidate(data,option.omit);
  if(!LabelRenderer.renderLabel(candidate,window._ftLastOpts).fits){updateLabel();return;}
  S.showOnLabel=candidate.showOnLabel;S.omissionConfirmations=candidate.omissionConfirmations;
  for(const key of option.omit)delete S._omissionNeedsConfirm[key];
  updateLabel();
}
