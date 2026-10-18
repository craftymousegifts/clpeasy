// SDS source-suitability cues for Smart Paste. This is NOT a CLP classifier.
// Section 2.2 alone often lacks product type and concentration: never infer
// suitability from an absent number or an incidental ingredient percentage.
(function(root){
  'use strict';
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
    // Candle Wax)" or "(@10% Dilution)", is not a neat-oil SDS. It still does
    // not prove the SDS fits the maker's product: such SDSs get the neutral
    // "check suitability" notice, never a claim of suitability.
    const statedDilution=names.some(l=>/\b\d{1,2}(?:[.,]\d+)?\s*%\s*(?:in\b|dilution\b)/i.test(l));
    const namedOil=names.length>0 && !statedDilution;
    if(neat && (!hasPct || pct<100)) return {
      level:'concentrate',target,message:'This appears to be a 100% fragrance-oil SDS, not information for '+target+'. '+limitation+' Check with your supplier before using this label.'
    };
    if(namedOil && (!hasPct || pct<100)) return {
      level:'possible',target,message:'This SDS names fragrance oil, but may not cover '+target+'. '+limitation+' Check the original supplier document.'
    };
    return {level:'unverified',target,message:'Section 2.2 may not confirm whether this SDS applies to '+target+'. CLPeasy does not recalculate hazards for different fragrance percentages. Check that your supplier’s classification information applies to your finished product.'};
  }
  const api=Object.freeze({inspect});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SdsSourceSuitability=api;
})(typeof window!=='undefined'?window:globalThis);
