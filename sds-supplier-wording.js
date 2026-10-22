// Conservative source-line preservation for Smart Paste.
// Capture code-led supplier statements and their wrapped continuation lines.
// Repeated/ambiguous codes are excluded rather than choosing one arbitrarily.
(function(root){
'use strict';
function extract(source){
  const result=Object.create(null);
  const ambiguous=new Set();
  if(typeof source!=='string')return result;
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  const CODE_LINE=/^\s*((?:EUH|H|P)\d{3}[A-Za-z]?(?:\s*\+\s*P\d{3}[A-Za-z]?)*)\s*[:\-–]?\s+(.+?)\s*$/i;
  const SECTION_LINE=/^\s*(?:(?:section\s*)?\d+(?:\.\d+)*[.:]?\s+|(?:hazard|precautionary|supplemental)\s+(?:statements?|information)|signal\s+word|pictograms?|label\s+elements?|contains\s*:)\b/i;
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(CODE_LINE);
    if(!match)continue;
    const code=match[1].replace(/\\s+/g,'').toUpperCase();
    let wording=match[2].trim();
    if(!wording || /^(?:SECTION|2\\.\\d)/i.test(wording))continue;
    // Continue wrapped supplier statements until a blank, new code or
    // recognisable label-field heading. Never silently drop continuation text.
    while(i+1<lines.length){
      const next=lines[i+1].trim();
      if(!next || CODE_LINE.test(next) || SECTION_LINE.test(next))break;
      wording+=' '+next;
      i++;
    }
    // Repeated code lines may represent different statement variants.
    // Never silently choose the first or last occurrence.
    if(ambiguous.has(code))continue;
    if(Object.hasOwn(result,code)){
      delete result[code];ambiguous.add(code);continue;
    }
    result[code]=wording;
  }
  return result;
}
root.ClpeasySupplierWording={extract};
if(typeof module!=='undefined'&&module.exports)module.exports={extract};
})(typeof window!=='undefined'?window:globalThis);
