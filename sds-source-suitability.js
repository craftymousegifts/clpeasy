// SDS source-suitability cues for Smart Paste. This is NOT a CLP classifier.
// Section 2.2 alone often lacks product type and concentration: never infer
// suitability from an absent number or an incidental ingredient percentage.
(function(root){
  'use strict';
  function inspect(raw, productType, fragrancePercent) {
    const text=String(raw||'').slice(0,100000);
    const type=String(productType||'').trim();
    const pct=Number(String(fragrancePercent||'').replace(',','.'));
    const hasPct=Number.isFinite(pct)&&pct>0&&pct<=100;
    const product=(type||'product').toLowerCase();
    const target='your finished '+product+(hasPct?' at '+pct+'% fragrance':' at your fragrance percentage');
    const limitation='CLPeasy does not adjust hazards for fragrance percentages.';
    // Explicit product-level evidence only. Do not flag a 100% ingredient
    // concentration inside a Section 2.2 component list.
    const neat=/\b(?:concentration|strength|dilution)\s*[:=-]?\s*100\s*%\s*(?:fragrance|perfume|essential)\s*oil\b|\b(?:neat|undiluted|pure|100\s*%)\s+(?:fragrance|perfume|essential)\s*oil\b|\b(?:fragrance|perfume|essential)\s*oil\s*\(\s*100\s*%\s*\)/i.test(text);
    const namedOil=/(?:^|\n)\s*(?:product\s*(?:name|identifier)?|trade\s*name)\s*[:=-]\s*[^\n]{0,100}\b(?:fragrance|perfume|essential)\s*oil\b/i.test(text);
    if(neat && (!hasPct || pct<100)) return {
      level:'concentrate',message:'This appears to be a 100% fragrance-oil SDS, not information for '+target+'. '+limitation+' Check with your supplier before using this label.'
    };
    if(namedOil && (!hasPct || pct<100)) return {
      level:'possible',message:'This SDS names fragrance oil, but may not cover '+target+'. '+limitation+' Check the original supplier document.'
    };
    return {level:'unverified',message:'Section 2.2 does not confirm whether this SDS covers '+target+'. '+limitation+' Check the original supplier document.'};
  }
  const api=Object.freeze({inspect});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SdsSourceSuitability=api;
})(typeof window!=='undefined'?window:globalThis);
