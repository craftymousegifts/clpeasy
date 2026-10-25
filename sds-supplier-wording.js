// Supplier wording, scoped to Section 2.2 by the caller. No library substitution.
(function(root){
'use strict';
const VERSION=1;
const CODE='(?:EUH|H|P)\\d{3}[A-Za-z]{0,2}(?:[ \\t]*[+/][ \\t]*(?:P)?\\d{3})*';
const START=new RegExp('^[ \\t]*('+CODE+')(?=$|[ \\t,:–—-])(?:[ \\t]*[,:–—-])?[ \\t]*(.*)$','i');
const HEADING=/^(?:__CLPEASY_SUPPLEMENTAL__\b|(?:SDS\s+)?(?:SECTION\s+)?\d+(?:\.\d+)*[.:]?\s+|(?:hazard|precautionary|supplemental)\s+(?:statements?|information|None)|Precautionary$|(?:Unique\s+Formula|Identifier\s*\(UFI\)|UFI\b)|signal\s+words?\b|(?:hazard\s+)?pictograms?\b|label\s+elements?\b|contains\s*:|Nikura\s+Ltd,|Issue date:|Version:|Product:|In accordance with REACH|other\s+hazards\b|composition\b|safety\s+data\s+sheet\s*$|page\s+\d+\b)/i;
const PAGE_FURNITURE=/\bPage[ \t]+\d+[ \t]*(?:of|\/)[ \t]*\d+\b|^[ \t]*(?:Page[ \t]+)?\d{1,3}[ \t]*\/[ \t]*\d{1,3}[ \t]*$|^[ \t]*Page[ \t]+\d+[ \t]*$|^[ \t]*(?:Issue|Revision|Print(?:ed)?)[ \t]+date\b|^[ \t]*Version(?:[ \t]+No\.?)?[ \t]*:/i;
const INCOMPLETE=/…|\.\.\.|\[[^\]]*\/[^\]]*\]/;
function canonical(code){
  if(/^P/i.test(code))return (code.match(/\d{3}/g)||[]).map(n=>'P'+n).join('+');
  return code.replace(/\s+/g,'').replace(/^(EUH|H)/i,p=>p.toUpperCase());
}
function analyse(source){
  const wording=Object.create(null), supplemental=[], issues=[], ambiguous=new Set();
  const lines=String(source||'').replace(/\r\n?/g,'\n')
    // Some PDF text layers expose a printed hyphen as STX between name parts.
    .replace(/([A-Za-z0-9])\x02(?=[A-Za-z0-9])/g,'$1-')
    // UFI may be copied in reading order or as a two-column field.
    .replace(/^[ \t]*Unique[ \t]+Formula[ \t]+([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})[ \t]*\n[ \t]*Identifier[ \t]*\(UFI\)[ \t]*:[ \t]*$/gmi,'__CLPEASY_SUPPLEMENTAL__ UFI: $1')
    .replace(/^[ \t]*(?:Unique[ \t]+Formula[ \t]*(?:\n[ \t]*)?Identifier[ \t]*\(UFI\)|UFI)[ \t]*:[ \t]*(?:\n[ \t]*)?([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})[ \t]*$/gmi,'__CLPEASY_SUPPLEMENTAL__ UFI: $1')
    // Retain unencoded supplemental label wording, excluding its field heading.
    .replace(/^[ \t]*(?:Supplemental|Supplementary|Additional)[ \t]+(?:information|statements?|labelling|labeling)(?::[ \t]*|[ \t]+(?=\S))(.*)$/gmi,(_,body)=>{
      if(START.test(body))return body;
      // "Supplemental Information - Additional Information on Sensitisers (EUH208):"
      // introduces that code's own supplier wording on the following lines.
      const named=body.match(/^[-–—][ \t]*[^:\n]{0,80}\((EUH\d{3})\)[^:\n]{0,20}:[ \t]*$/);
      if(named)return named[1];
      return '__CLPEASY_SUPPLEMENTAL__ '+body.replace(/^[-–—][ \t]*[^:\n]{1,80}:[ \t]*$/,'');
    })
    // Known two-column row labels are PDF layout, not statement wording.
    // A heading alone on its line ("Supplemental information") stays, so it
    // still ends the statement above instead of leaving "information" behind.
    .replace(/^[ \t]*(?:(?:Hazard|Precautionary)\s+statements?:|Precautionary(?=\s+P\d)|Supplemental[ \t]+information:?(?=[ \t]+\S)|Supplemental[ \t]+information:|Supplemental(?![ \t]+information\b)(?=[ \t]+\S|[ \t]*$)|Information:|statements:)[ \t]*/gmi,'')
    .replace(/^[ \t]*(?:SDS[ \t]+)?(?:SECTION[ \t]+)?2\.2[.:]?[ \t]+Label(?:[ \t]+elements?)?[^\n]*$/gmi,'')
    .replace(/\b(H\d{3})[ \t]+(FD|Fd|Df|fd|F|D|f|d|i)(?=[ \t,:])/g,'$1$2')
    // A combined code wrapped after "+" ("P305+P351+" / "P338 IF IN EYES...").
    .replace(/^([ \t]*P\d{3}(?:[ \t]*\+[ \t]*P\d{3})*[ \t]*\+)[ \t]*\n[ \t]*(?=P\d{3})/gm,'$1')
    .split('\n');
  const isBoundary=l=>!PAGE_FURNITURE.test(l)&&(START.test(l)||HEADING.test(l.trim())||/^\s*(?:Contains\b|__CLPEASY_SUPPLEMENTAL__)/i.test(l));
  // Index of the first line after a page header/footer block starting at k.
  function afterPageBlock(k){
    while(k<lines.length&&lines[k].trim()&&!isBoundary(lines[k]))k++;
    while(k<lines.length&&!lines[k].trim())k++;
    return k;
  }
  const endsStatement=k=>k>=lines.length||isBoundary(lines[k]);
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(START);
    const field=lines[i].match(/^\s*__CLPEASY_SUPPLEMENTAL__\s*(.*)$/);
    const standaloneContains=!match && (/^\s*Contains\b/i.test(lines[i])||!!field);
    if(!match&&!standaloneContains){if(/^\s*(?:Unique\s+Formula|Identifier\s*\(UFI\)|UFI\b)/i.test(lines[i]))issues.push('UFI information');continue;}
    const code=match?canonical(match[1]):field?'Supplemental information':'Contains information';let text=match?match[2].trim():field?field[1].trim():lines[i].trim();
    while(i+1<lines.length){
      const next=lines[i+1].trim();
      // A page header/footer block (page number, supplier address, dates) is
      // page layout, not wording. It ends the statement when a code, heading
      // or nothing follows it; if plain text follows, the statement may run
      // across the page break, so fail closed instead of guessing.
      if(PAGE_FURNITURE.test(next)){const k=afterPageBlock(i+1);if(!endsStatement(k)){issues.push(code);ambiguous.add(code);}i=k-1;break;}
      if(START.test(next)||(HEADING.test(next)&&!(code==='EUH208'&&/^Contains\b/i.test(next))))break;
      if(!next){
        // A paragraph break inside a statement does not end its wording.
        // Stop at the next code/field; never discard a contact-lens paragraph.
        let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
        if(j===lines.length||START.test(lines[j])||(HEADING.test(lines[j].trim())&&!(code==='EUH208'&&/^Contains\b/i.test(lines[j].trim()))))break;
        if(PAGE_FURNITURE.test(lines[j])){const k=afterPageBlock(j);if(!endsStatement(k)){issues.push(code);ambiguous.add(code);}i=k-1;break;}
        // Unlabelled page furniture is not reliably part of a statement.
        if(/(?:Ltd|Limited|Issue date:|Version:|Product:)/i.test(lines[j])){issues.push(code);ambiguous.add(code);break;}
        i++;continue;
      }
      // Keep a supplier's chemical-name hyphen across a PDF line break.
      text+=(text.endsWith('-')?'':text?' ':'')+next;i++;
    }
    if(field&&(!text||/^(?:None|Not applicable|N\/A)[.]?$/i.test(text)))continue;
    // EUH208 ends with its own closing sentence. Further supplier text that ran
    // on (e.g. a document note) is kept separately for review, never merged
    // into the EUH208 statement and never dropped.
    if(code==='EUH208'){const end=text.match(/^(.*?May produce an allergic reaction\.)\s+(\S.*)$/i);if(end){text=end[1];if(!supplemental.includes(end[2]))supplemental.push(end[2]);}}
    if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)){issues.push(code);ambiguous.add(code);delete wording[code];continue;}
    if(!text || new RegExp('(?:^|\\s)'+CODE+'\\b','i').test(text)){
      issues.push(code);ambiguous.add(code);delete wording[code];continue;
    }
    // A supplier choice left open ("…", "...", "[electrical/ventilating/…]")
    // is not complete label wording. Never print it or choose for the maker.
    if(/^P/.test(code)&&INCOMPLETE.test(text)){issues.push(code);ambiguous.add(code);delete wording[code];continue;}
    if(ambiguous.has(code)){delete wording[code];continue;}
    if(standaloneContains){if(/^Contains\s*:\s*$/i.test(text)){issues.push(code);continue;}if(!supplemental.includes(text))supplemental.push(text);continue;}
    if(Object.hasOwn(wording,code)&&wording[code]!==text){
      delete wording[code];ambiguous.add(code);issues.push(code);continue;
    }
    wording[code]=text;
  }
  return {version:VERSION,wording,supplemental,issues:[...new Set(issues)]};
}
function extract(source){return analyse(source).wording;}
const api=Object.freeze({VERSION,analyse,extract});
root.ClpeasySupplierWording=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
