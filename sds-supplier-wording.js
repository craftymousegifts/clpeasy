// Conservative source-line preservation for Smart Paste.
// Only a complete, single-line statement beginning with its code is eligible.
// Multi-line/ambiguous statements are not rewritten; the caller can retain
// its existing library behaviour pending a dedicated multiline parser.
(function(root){
'use strict';
function extract(source){
  const result=Object.create(null);
  if(typeof source!=='string')return result;
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  for(const line of lines){
    const match=line.match(/^\s*((?:EUH|H|P)\d{3}[A-Za-z]?(?:\s*\+\s*P\d{3}[A-Za-z]?)*)\s*[:\-–]?\s+(.+?)\s*$/i);
    if(!match)continue;
    const code=match[1].replace(/\s+/g,'').toUpperCase();
    const wording=match[2].trim();
    if(!wording || /^(?:SECTION|2\.\d)/i.test(wording))continue;
    if(Object.hasOwn(result,code)){delete result[code];continue;}
    result[code]=wording;
  }
  return result;
}
root.ClpeasySupplierWording={extract};
if(typeof module!=='undefined'&&module.exports)module.exports={extract};
})(typeof window!=='undefined'?window:globalThis);
