// SDS source-suitability cues for Smart Paste. This is NOT a CLP classifier.
// Section 2.2 alone often lacks product type and concentration: never infer
// suitability from an absent number or an incidental ingredient percentage.
(function(root){
  'use strict';
  // Builder product types by kind. Only candle, wax melt, reed diffuser and
  // room spray can be named by an SDS base and so "match"; the other kinds
  // can only be a known mismatch against such a base.
  const PRODUCT_KIND={
    'Scented Candle':'candle','Soy Candle':'candle','Votive Candle':'candle','Tea Light Candle':'candle','Pillar Candle':'candle','Advent Calendar Candle':'candle',
    'Wax Melt':'wax melt','Wax Tart':'wax melt','Snap Bar':'wax melt','Wax Melt Clamshell':'wax melt','Advent Calendar Wax Melt':'wax melt',
    'Reed Diffuser':'reed diffuser','Electric Diffuser':'other diffuser','Car Diffuser':'other diffuser','Plugin Diffuser':'other diffuser',
    'Room Spray':'room spray','Car Air Freshener Spray':'other spray','Linen Spray':'other spray',
    'Wax Melt Bouquet':'other','Scented Sachet':'other','Potpourri':'other'};
  function inspect(raw, productType, fragrancePercent) {
    const text=String(raw||'').slice(0,100000);
    const type=String(productType||'').trim();
    // The Builder field supplies text such as "10%"; bare numbers also work.
    const pct=parseFloat(String(fragrancePercent==null?'':fragrancePercent).replace(',','.'));
    const hasPct=Number.isFinite(pct)&&pct>0&&pct<=100;
    const product=(type||'product').toLowerCase();
    const target='your finished '+product+(hasPct?' at '+pct+'% fragrance':' at your fragrance percentage');
    const limitation='CLPeasy does not adjust hazards for fragrance percentages.';
    // Explicit product-level evidence only. Do not flag a 100% ingredient
    // concentration inside a Section 2.2 component list.
    const neat=/\b(?:concentration|strength|dilution)\s*[:=-]?\s*100\s*%\s*(?:fragrance|perfume|essential)\s*oil\b|\b(?:neat|undiluted|pure|100\s*%)\s+(?:fragrance|perfume|essential)\s*oil\b|\b(?:fragrance|perfume|essential)\s*oil\s*\(\s*100\s*%\s*\)/i.test(text)
      // The oil itself stated as supplied at 100% / undiluted, in one sentence
      // (e.g. "Fragrance oil supplied at 100% concentration").
      ||/\b(?:fragrance|perfume|essential)\s*oil\b[^\n.;]{0,40}?\b(?:at|as|in)\s+100\s*%\s*(?:concentration|strength)\b/i.test(text)
      ||/\b(?:fragrance|perfume|essential)\s*oil\b[^\n.;]{0,40}?\b(?:supplied|provided|sold)\s+(?:neat|undiluted)\b/i.test(text);
    const oilName=/\b(?:fragrance|perfume|essential)\s*oil\b/i;
    const names=[...text.matchAll(/(?:^|\n)\s*(?:product\s*(?:name|identifier)?|trade\s*name)\s*[:=-]\s*([^\n]{0,100})/gi)].map(m=>m[1]).filter(l=>oilName.test(l));
    // A product name that states a diluted form, e.g. "Fragrance Oil (10% in
    // Candle Wax)" or "(@10% Dilution)", is not a neat-oil SDS.
    const DIL=/\b(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:in\s+([a-z][a-z ]{0,30}?)(?=\s*[)\],;|]|\s*$)|dilution\b)/gi;
    const stated=[];
    names.forEach(l=>{for(const m of l.matchAll(DIL))stated.push({pct:parseFloat(m[1].replace(',','.')),base:(m[2]||'').trim().toLowerCase().replace(/\s+/g,' '),raw:m[0].trim()});});
    const statedDilution=stated.length>0;
    const namedOil=names.length>0 && !statedDilution;
    if(neat && (!hasPct || pct<100)) return {
      level:'concentrate',target,message:'This appears to be a 100% fragrance-oil SDS, not information for '+target+'. '+limitation+' Check with your supplier before using this label.'
    };
    if(namedOil && (!hasPct || pct<100)) return {
      level:'possible',target,message:'This SDS names fragrance oil, but may not cover '+target+'. '+limitation+' Check the original supplier document.'
    };
    // Apparent match / detected mismatch (owner-approved, Oct 2026). Only one
    // explicit statement in the product name counts; anything ambiguous or
    // incomplete falls back to the neutral "unverified" notice. A match never
    // means the SDS is verified or suitable.
    const distinct=[...new Map(stated.map(s=>[s.pct+'|'+s.base,s])).values()];
    if(distinct.length===1&&hasPct&&pct<100){
      const s=distinct[0];
      const sdsKind=/^(?:candle wax|candles?)$/.test(s.base)?'candle':/^wax melts?$/.test(s.base)?'wax melt':/^reed diffusers?(?: base)?$/.test(s.base)?'reed diffuser':/^room sprays?(?: base)?$/.test(s.base)?'room spray':null;
      const userKind=PRODUCT_KIND[type]||null;
      const describes=s.base?s.pct+'% in '+s.base:s.pct+'% dilution';
      const same=Math.abs(s.pct-pct)<0.005;
      const productPhrase='your '+product+' at '+pct+'% fragrance';
      if(sdsKind&&userKind&&sdsKind===userKind&&same)
        return {level:'match',target,describes,productPhrase,sdsPct:s.pct,userPct:pct};
      if(!same||(sdsKind&&userKind&&sdsKind!==userKind))
        return {level:'mismatch',target,describes,productPhrase,sdsPct:s.pct,userPct:pct,pctDiffers:!same};
    }
    return {level:'unverified',target,message:'Section 2.2 may not confirm whether this SDS applies to '+target+'. CLPeasy does not recalculate hazards for different fragrance percentages. Check that your supplier’s classification information applies to your finished product.'};
  }
  const api=Object.freeze({inspect});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SdsSourceSuitability=api;
})(typeof window!=='undefined'?window:globalThis);
