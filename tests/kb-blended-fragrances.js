// Knowledge Base "Blended Fragrances" section wording (Oct 2026, approved in
// principle by Michaela). Only this section changes.
//   1. Retired claims are gone: every blend legally requires a new SDS, and
//      CLPeasy supports single-fragrance products only.
//   2. The section explains: finished-product GB CLP classification; combining
//      individual SDS statements does not establish a blend's classification;
//      CLPeasy cannot calculate a blend but can label from suitable information;
//      suppliers or qualified specialists may provide that information.
// Run from the repo root: node tests/kb-blended-fragrances.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync('knowledge.html', 'utf8');
const doc = new JSDOM(src).window.document;
const section = doc.getElementById('blended');
const text = section.textContent.replace(/\s+/g, ' ');
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

for (const retired of [/requires its own SDS/i, /single-fragrance products only/i, /legally a new chemical mixture/i,
  /industry best practice requires a new SDS/i, /Important Legal Warning/i]) {
  assert(!retired.test(text), 'retired claim still present: ' + retired);
}
assert(!/Important legal warning/i.test(doc.querySelector('.cat-card[onclick*="showTopic(\'blended\'"]').textContent));
ok('retired claims removed from the section and its topic card');

assert(/finished product needs appropriate GB CLP classification information that covers the product as a whole/.test(text));
assert(/cannot be established simply by combining the hazard and precautionary statements from each fragrance oil’s safety data sheet/.test(text));
assert(/CLPeasy cannot calculate the classification of a custom fragrance blend\. It can build your label from suitable classification information that covers your blend/.test(text));
assert(/fragrance supplier may be able to provide classification information, or an SDS, for a custom blend on request\. A qualified CLP specialist can also help\./.test(text));
ok('section explains finished-product classification, combining SDSs, what CLPeasy can do, and where to get information');

assert.strictEqual(doc.querySelectorAll('#blended .info-block').length, 2, 'same two-block structure');
assert(doc.querySelector('#blended .accordion-trigger'), 'existing accordion kept');
ok('existing section structure kept');

console.log(`\nAll ${n} Knowledge Base blended-fragrance checks passed.`);
