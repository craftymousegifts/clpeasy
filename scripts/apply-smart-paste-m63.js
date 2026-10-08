'use strict';
const fs=require('node:fs');
const file='label-render.js';
const src=fs.readFileSync(file,'utf8');
const before="  for(const m of src.matchAll(H_TOKEN_RE)){";
const after=[
"  // M63: Some PDF text layers join a recognised H-code to its phrase.",
"  // Split only when followed by a known phrase opening. Unknown suffixes",
"  // remain untouched for the existing unrecognised-code safety gate.",
"  const normalized=src.replace(/\\b(H\\d{3}(?:i|FD|Fd|fD|fd|F|D|f|d)?)(?=(?:May|Harmful|Causes|Suspected|Fatal|Toxic|Very|Flammable|Highly|Extremely|Danger|Inhalation)\\b)/g, '$1 ');",
"  for(const m of normalized.matchAll(H_TOKEN_RE)){"
].join('\n');
if(src.includes("const normalized=src.replace(")){console.log('M63 already applied');process.exit(0);}
if(src.split(before).length!==2)throw new Error('Unexpected label-render.js layout; refusing unsafe patch');
const changed=src.replace(before,after);
fs.writeFileSync(file,changed);
console.log('Applied M63 PDF joined-phrase normalisation');
