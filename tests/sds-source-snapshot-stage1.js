'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const s = fs.readFileSync('builder.html','utf8');
const required = [
  'S.sourceSection22=text;',
  "sourceSection22:S.hazardFromExtraction?(S.sourceSection22||''):''",
  "S.sourceSection22=typeof e.sourceSection22==='string'?e.sourceSection22:'';",
  "S.hazardFromExtraction=false;S.hazardSource=null;S.sourceSection22='';"
];
for (const item of required) assert(s.includes(item), 'Missing source preservation: '+item);
console.log('Source snapshot checks PASS');
