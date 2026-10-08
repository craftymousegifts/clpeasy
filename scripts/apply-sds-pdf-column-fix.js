'use strict';
const fs=require('fs'),path=require('path');
const file=path.resolve(__dirname,'../builder.html');
let s=fs.readFileSync(file,'utf8');
const old="const text=document.getElementById('smart-paste-input').value.trim();";
const next="const text=normalisePdfSdsText(document.getElementById('smart-paste-input').value.trim());";
const helper=`// QA: PDF layout text may split long EUH208 ingredient names over a line
// and inject the left-column label "Information:" into the name itself.
// Keep the original textarea untouched; normalise only the extraction input.
function normalisePdfSdsText(raw){
  return String(raw||'')
    .replace(/-\\s*\\r?\\n\\s*(?=[A-Za-z0-9])/g,'-')
    .replace(/\\r?\\n\\s*Information:\\s*/gi,' ')
    .replace(/\\r?\\n[ \\t]{8,}(?=[A-Za-z0-9(])/g,' ');
}
`;
if(s.includes('function normalisePdfSdsText(')){console.log('Already applied');process.exit(0);}
if(s.split(old).length!==2)throw Error('Guard failed: Smart Paste extraction anchor changed');
if(s.split('function extractSDS(){').length!==2)throw Error('Guard failed: extractSDS anchor changed');
s=s.replace('function extractSDS(){',helper+'\nfunction extractSDS(){').replace(old,next);
fs.writeFileSync(file,s);
console.log('Applied guarded PDF column/wrapped sensitiser normalisation to builder.html');
