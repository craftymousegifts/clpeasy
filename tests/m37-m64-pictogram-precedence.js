'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {stubRenderer}=require('./fixtures/required-content-fixtures');
const rendererSource=fs.readFileSync(path.join(__dirname,'..','label-render.js'),'utf8');
const R=stubRenderer(rendererSource);

function eq(codes, expected){
  assert.deepStrictEqual(Array.from(R.expectedPictogramsForHazardCodes(codes)).sort(), expected.slice().sort(), codes.join(','));
}

// M37 Article 26 mandatory precedence: reason-aware, never blanket suppression.
eq(['H314','H319'], ['corrosive']);
eq(['H314','H302'], ['corrosive','exclamation']);
eq(['H314','H317'], ['corrosive','exclamation']);
eq(['H334','H317'], ['health']);
eq(['H361','H317'], ['health','exclamation']);
eq(['H334','H302'], ['health','exclamation']);
eq(['H301','H302'], ['skull']);
eq(['H301','H315','H400'], ['skull','aquatic']);
eq(['H314','H315','H317','H319'], ['corrosive','exclamation']); // H317 still requires GHS07
eq(['H334','H315','H317','H319'], ['health']);
eq(['H334','H315','H317','H319','H302'], ['health','exclamation']);

// Optional Article 26 choices are deliberately not silently exercised.
eq(['H200','H225','H270'], ['explosion','flame','oxidiser']);
eq(['H225','H280'], ['flame','gas']);
eq(['H301','H280'], ['skull','gas']);

// M64 compares sets, not ordering, and detects valid-but-wrong saved keys.
let r=R.checkPictogramConsistency({hStatements:'H301',pictograms:['skull']});
assert.strictEqual(r.consistent,true);
r=R.checkPictogramConsistency({hStatements:'H301,H400',pictograms:['aquatic','skull']});
assert.strictEqual(r.consistent,true);
r=R.checkPictogramConsistency({hStatements:'H301',pictograms:['exclamation']});
assert.strictEqual(r.consistent,false);
assert.deepStrictEqual(Array.from(r.missing),['skull']);
assert.deepStrictEqual(Array.from(r.extra),['exclamation']);
r=R.checkPictogramConsistency({hStatements:'H314,H319',pictograms:['corrosive','exclamation']});
assert.strictEqual(r.consistent,false);
assert.deepStrictEqual(Array.from(r.extra),['exclamation']);

// Pure/read-only: resolver and consistency check must not mutate saved arrays.
const saved={hStatements:'H334,H317',pictograms:['health','exclamation']};
const before=JSON.stringify(saved);
R.checkPictogramConsistency(saved);
assert.strictEqual(JSON.stringify(saved),before);

console.log('M37/M64 pictogram precedence and consistency: PASS');
