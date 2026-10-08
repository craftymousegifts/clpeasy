'use strict';
// Guard against silently changing supplier P-code exclusion policy.
// This test intentionally does not certify regulatory suitability.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','builder.html'),'utf8');
const extract=source.match(/const _pExclude=\[([\s\S]*?)\];\s*\/\/ codes not applicable/);
assert.ok(extract,'Smart Paste exclusion policy must remain explicitly discoverable');
const codes=[...extract[1].matchAll(/'((?:P\d{3})(?:\+P\d{3})*)'/g)].map(m=>m[1]);
const expected=['P272','P264','P270','P280','P303+P361+P353','P362','P362+P364','P363','P405'];
assert.deepEqual(codes,expected,'Changed exclusions require a fresh documented GB CLP review');
assert.match(source,/const pRaw=_pAllCodes\.filter\(/,'Supplier P-code exclusion remains active');
assert.match(source,/function openP280Modal\(/,'Manual P280 PPE selection must remain available');
assert.match(source,/P280 needs at least one applicable protection item selected/,'P280 wording guard required');
console.log('PASS: 9 P-code exclusion entries inventoried; P280 manual override and selection guard retained');
