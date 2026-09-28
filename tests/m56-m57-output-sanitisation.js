#!/usr/bin/env node
'use strict';
const fs=require('fs');
const assert=require('assert');

const renderer=fs.readFileSync(require.resolve('../label-render.js'),'utf8');
assert(renderer.includes('function stripXmlControls'), 'M56 strip helper missing');
assert(renderer.includes('\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F'), 'M56 invalid C0 range missing');
assert(renderer.includes('function xe(s){return stripXmlControls(s)'), 'xe must strip before escaping');

const builder=fs.readFileSync(require.resolve('../builder.html'),'utf8');
assert(builder.includes("const escapeHtmlText=v=>"), 'M57 HTML escape helper missing');
assert(builder.includes("const title='CLPeasy Label — '+escapeHtmlText(S.scentName||'');"), 'PDF title must escape product name');
assert(!builder.includes("const title='CLPeasy Label — '+(S.scentName||'');"), 'raw PDF title concatenation remains');

console.log('M56/M57 security regression checks: passed');
