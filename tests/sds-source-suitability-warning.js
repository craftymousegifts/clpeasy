// Run from repository root: node tests/sds-source-suitability-warning.js
const assert=require('assert');
const fs=require('fs');
const checker=require('../sds-source-suitability.js');
const inspect=(s,pct=10)=>checker.inspect(s,'Scented Candle',pct);
assert.strictEqual(inspect('Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil').level,'concentrate');
assert.strictEqual(inspect('Neat fragrance oil\nH317 P305+P351+P338').level,'concentrate');
assert.strictEqual(inspect('Product name: Heather Fragrance Oil\nSection 2.2 Label elements').level,'possible');
assert.strictEqual(inspect('SECTION 2.2 Label elements\nH317\nP305+P351+P338').level,'unverified');
assert.strictEqual(inspect('SECTION 2.2\nContains ingredient A (100%)\nH317').level,'unverified');
assert.strictEqual(inspect('SECTION 2.2\n10% mixture H317').level,'unverified', '10% text alone does not prove finished-product suitability');
assert.strictEqual(inspect('Product: Scented candle, 10% fragrance\nH317').level,'unverified', 'matching number alone must not certify suitability');
assert.strictEqual(inspect('Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil',100).level,'unverified', '100% oil versus 100% product is not a mismatch by number alone');
assert(inspect('H317',10).message.includes('does not adjust hazards for fragrance percentages'));
// Explicit product-level "supplied at 100%" wording gets the stronger warning.
for (const raw of [
  'Fragrance oil supplied at 100% concentration\nH317',
  'Essential oil, supplied at 100% strength.\nH317',
  'This perfume oil is provided as 100% concentration\nH317',
  'This fragrance oil is supplied undiluted.\nH317'
]) assert.strictEqual(inspect(raw).level,'concentrate',raw);
// Fragrance percentage: bare numbers and the Builder field's text format ("10%").
for (const [value, shown] of [[10,'10%'],['10','10%'],['10%','10%'],[' 10 % ','10%'],['7.5%','7.5%'],['7,5%','7.5%']]) {
  const m=checker.inspect('SECTION 2.2\nH317','Scented Candle',value).message;
  assert(m.includes('at '+shown+' fragrance'),'percentage '+JSON.stringify(value)+' shown as '+shown+': '+m);
  assert(m.includes('does not adjust hazards for fragrance percentages'));
}
for (const value of ['', null, undefined, 'abc', '0%', '150%']) {
  assert(checker.inspect('SECTION 2.2\nH317','Scented Candle',value).message.includes('at your fragrance percentage'),'no valid percentage: '+JSON.stringify(value));
}
assert.strictEqual(checker.inspect('Fragrance oil supplied at 100% concentration\nH317','Scented Candle','10%').level,'concentrate','Builder "10%" format keeps the stronger warning');
assert.strictEqual(checker.inspect('Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil','Scented Candle','100%').level,'unverified','Builder "100%" format: not a mismatch by number alone');
assert.strictEqual(checker.inspect('Product: Scented candle, 10% fragrance\nH317','Scented Candle','10%').level,'unverified','a matching percentage must not verify suitability');
// Incidental or ingredient percentages are not proof of a neat oil.
for (const raw of [
  'SECTION 2.2\nLinalool at 100% concentration\nH317',
  'Fragrance oil components: Linalool 100%\nH317',
  'Fragrance oil at 10% concentration in candle wax\nH317',
  'Fragrance oil blend.\nIngredient B at 100% concentration\nH317'
]) assert.notStrictEqual(inspect(raw).level,'concentrate',raw);
for (const raw of [
  'Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil',
  'Product name: Heather Fragrance Oil\nH317',
  'SECTION 2.2\nH317'
]) {
  const message=inspect(raw,10).message;
  assert(message.length<320,'Mobile warning should be concise: '+message.length);
  assert(message.includes('10% fragrance'),'Show the maker the relevant fragrance percentage');
  assert(message.includes('does not adjust hazards'),'Always explain no hazard recalculation');
}
const html=fs.readFileSync('builder.html','utf8');
assert(html.includes('<script src="sds-source-suitability.js"></script>'));
assert(html.includes('id="sds-source-suitability-warning"'));
assert(html.includes('updateSdsSourceSuitabilityWarning();'));
assert(html.includes('S.hazardFromExtraction=true;\n  _snapshotHazardSource();\n  updateSdsSourceSuitabilityWarning();'));
assert(html.includes('S.hazardFromExtraction=false;S.hazardSource=null;\n  updateSdsSourceSuitabilityWarning();'));
// Calculator wording must not claim a supplier-document comparison.
assert(!html.includes('compares this figure exactly with your supplier document'));
assert(html.includes('Check that your supplier’s CLP information applies to this finished-product percentage. CLPeasy does not verify this or recalculate hazards.'));
console.log('PASS: SDS suitability warnings are conservative and wired into Smart Paste');
