// Knowledge Base blended-fragrance guidance navigation and retired claims (Oct 2026, approved in
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

const articleLink = section.querySelector('a[href="/knowledge/combining-fragrance-oils"]');
assert(articleLink, 'existing blended topic must lead to the full article');
const redirects = fs.readFileSync('_redirects', 'utf8');
assert(/\/knowledge\/combining-fragrance-oils\s+\/combining-fragrance-oils\.html\s+200/.test(redirects), 'article route must resolve');
const article = new JSDOM(fs.readFileSync('combining-fragrance-oils.html', 'utf8')).window.document;
for (const retired of [/requires its own SDS/i, /single-fragrance products only/i, /legally a new chemical mixture/i]) {
  assert(!retired.test(article.body.textContent), 'retired claim in article: ' + retired);
}
assert(article.querySelector('a[href*="hse.gov.uk/chemical-classification/what-to-do/use-chemicals.htm"]'), 'classification guidance source retained');
ok('existing topic links to the full article and authoritative source, without retired claims');

assert(doc.querySelector('#blended .accordion-trigger'), 'existing accordion kept');
ok('existing section structure kept');

console.log(`\nAll ${n} Knowledge Base blended-fragrance checks passed.`);
