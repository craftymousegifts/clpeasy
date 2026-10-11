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
console.log('PASS: SDS suitability warnings are conservative and wired into Smart Paste');
