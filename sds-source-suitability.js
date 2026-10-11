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
    const base='CLPeasy copies hazard information from your supplier SDS. It does not calculate or adjust hazard statements when you enter a fragrance percentage. Check that your supplier\'s GB CLP information applies to your finished '+(type||'product')+(hasPct?' at '+pct+'% fragrance':' at the fragrance percentage you use')+'.';
    // Explicit product-level evidence only. Do not flag a 100% ingredient
    // concentration inside a Section 2.2 component list.
    const neat=/\b(?:concentration|strength|dilution)\s*[:=-]?\s*100\s*%\s*(?:fragrance|perfume|essential)\s*oil\b|\b(?:neat|undiluted|pure|100\s*%)\s+(?:fragrance|perfume|essential)\s*oil\b|\b(?:fragrance|perfume|essential)\s*oil\s*\(\s*100\s*%\s*\)/i.test(text);
    const namedOil=/(?:^|\n)\s*(?:product\s*(?:name|identifier)?|trade\s*name)\s*[:=-]\s*[^\n]{0,100}\b(?:fragrance|perfume|essential)\s*oil\b/i.test(text);
    if(neat && (!hasPct || pct<100)) return {
      level:'concentrate',message:'Possible source mismatch: the pasted text explicitly describes 100% fragrance oil. That is not evidence for the finished product at '+(hasPct?pct+'%':'your chosen fragrance load')+'. '+base+' Ask the supplier for applicable finished-product GB CLP information before using this label.'
    };
    if(namedOil && (!hasPct || pct<100)) return {
      level:'possible',message:'The pasted document identifies a fragrance oil. It may describe the neat oil rather than your finished product. '+base+' Check the document title and supplier coverage; CLPeasy cannot establish this from Section 2.2 alone.'
    };
    return {level:'unverified',message:'SDS suitability not automatically verified. '+base+' Section 2.2 may not state the document\'s concentration or finished-product coverage; check the original supplier document.'};
  }
  const api=Object.freeze({inspect});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SdsSourceSuitability=api;
})(typeof window!=='undefined'?window:globalThis);
