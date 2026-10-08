'use strict';
// CLPeasy Smart Paste M63 regression coverage.
// Run with: node tests/sds-pdf-text-joins.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('label-render.js','utf8');
const context = vm.createContext({console,document:{createElement:()=>({getContext:()=>({measureText:()=>({width:0})})})}});
vm.runInContext(source + '\nthis.qaExtract=LabelRenderer.extractHazardCodesFromText;',context);
const cases = [
 ['H317May cause an allergic skin reaction.', ['H317']],
 ['H412Harmful to aquatic life with long lasting effects.', ['H412']],
 ['H350iMay cause cancer by inhalation.', ['H350i']],
 ['H360FD May damage fertility.', ['H360FD']],
 ['H317xyz nonsense', []],
 ['H317 May cause an allergic skin reaction.', ['H317']],
 ['H361fd Suspected of damaging fertility.', ['H361fd']],
 ['EUH208 Contains Linalool.', ['EUH208']],
 ['H315Causes skin irritation.', ['H315']],
 ['H410Very toxic to aquatic life with long lasting effects.', ['H410']],
 ['H361fSuspected of damaging fertility.', ['H361f']],
 ['H317unknown invalid suffix', []],
];
let passed=0;
for(const [input,expected] of cases){
 const actual=Array.from(context.qaExtract(input));
 try{assert.deepEqual(actual,expected);passed++;console.log('PASS',JSON.stringify(input),actual)}
 catch(e){console.log('FAIL',JSON.stringify(input),actual,'expected',expected);process.exitCode=1}
}
console.log(`${passed}/${cases.length} passed`);
