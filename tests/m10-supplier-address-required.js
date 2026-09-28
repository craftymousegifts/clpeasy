#!/usr/bin/env node
'use strict';

const fs=require('fs');
const assert=require('assert');
const R=require('../label-render.js');

const complete={
  scentName:'Lavender',bizName:'Crafty Mouse Gifts',
  bizAddress:'Duns, Scottish Borders',bizPhone:'01234 567890',
  hStatements:'H317',pStatements:'',pChoices:{},sensitisers:[]
};

assert.strictEqual(R.checkRequiredContent(complete).complete,true,'complete label should pass');

for(const value of ['', '   ', '\n\t']){
  const r=R.checkRequiredContent({...complete,bizAddress:value});
  assert.strictEqual(r.complete,false,'blank/whitespace address must fail');
  assert(r.missing.includes('business-address'),'missing reason must name business-address');
}

const oldSaved={...complete};
delete oldSaved.bizAddress;
const oldResult=R.checkRequiredContent(oldSaved);
assert.strictEqual(oldResult.complete,false,'legacy record with no address must fail closed');
assert(oldResult.missing.includes('business-address'));

const builder=fs.readFileSync(require.resolve('../builder.html'),'utf8');
assert(builder.includes('Address <span>(required)</span>'),'Step 4 must mark address required');
assert(builder.includes("alert('Add your supplier address before continuing.')"),'Step 4 must block blank address');
assert(builder.includes("'business-address':'Add your supplier address (Step 4).'"),'Builder export message missing');
assert(builder.includes("bizAddress:val('biz-address')"),'Builder export gate must pass address to shared checker');

const print=fs.readFileSync(require.resolve('../print.html'),'utf8');
assert(print.includes("'business-address':'No supplier address."),'Composer missing-address reason missing');

console.log('M10 supplier-address validation: passed');
