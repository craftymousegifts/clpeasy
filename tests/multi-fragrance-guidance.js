// "Using more than one fragrance oil?" guidance (Oct 2026, approved by
// Michaela). A collapsed drop-down beside "About supplier information and
// GB CLP" in Step 3. Information only: no detection, blocking, extraction or
// classification change.
//   1. Exact approved wording, collapsed by default, same styling classes.
//   2. Sits directly after the GB CLP drop-down, inside Step 3.
//   3. The Knowledge Base link points at an anchor that exists, and opening
//      knowledge.html#blended shows that topic (topics are hidden by default).
// Run from the repo root: node tests/multi-fragrance-guidance.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const builder = new JSDOM(fs.readFileSync('builder.html', 'utf8')).window.document;
const knowledge = new JSDOM(fs.readFileSync('knowledge.html', 'utf8')).window.document;
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

const d = builder.getElementById('multi-fragrance-help');
assert(d && d.tagName === 'DETAILS', 'drop-down present');
assert(!d.hasAttribute('open'), 'collapsed by default');
assert(d.classList.contains('sds-help') && d.querySelector('aside.sds-gb-note'), 'reuses the existing drop-down styling');
assert.strictEqual(d.querySelector('summary').textContent, 'Using more than one fragrance oil?');
assert.deepStrictEqual([...d.querySelectorAll('aside p')].map(p => p.textContent), [
  'Combining safety statements from different SDS documents does not necessarily produce the correct CLP classification for your finished product.',
  'A custom fragrance blend may require its own classification.',
  'Check with your fragrance supplier for suitable classification information before creating your label.',
  'Your label should reflect your finished product as a whole, not each fragrance oil separately.',
  'Read more about blended fragrances']);
ok('approved wording, collapsed, existing styling');

const prev = d.previousElementSibling;
assert(prev && prev.tagName === 'DETAILS' && prev.querySelector('summary').textContent === 'About supplier information and GB CLP', 'directly after the GB CLP drop-down');
assert(d.closest('#step-3'), 'inside Step 3');
ok('placed directly after "About supplier information and GB CLP" in Step 3');

const a = d.querySelector('a');
assert.strictEqual(a.getAttribute('href'), 'knowledge.html#blended');
assert.strictEqual(a.getAttribute('target'), '_blank');
assert(/noopener/.test(a.getAttribute('rel')), 'new tab without opener access');
assert(knowledge.getElementById('blended'), 'knowledge.html#blended exists');
ok('Knowledge Base link opens the existing blended-fragrances section');

// Opening the link's target shows the section (it is display:none until its
// topic card is chosen).
const html = fs.readFileSync('knowledge.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
for (const [hash, shown] of [['#blended', true], ['', false], ['#nonexistent', false]]) {
  const w = new JSDOM(html, { url: 'https://clpeasy.com/knowledge.html' + hash, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), beforeParse(win) { win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; } }).window;
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  w.dispatchEvent(new w.Event('load'));
  assert.strictEqual(w.document.getElementById('blended').style.display === 'block', shown, 'blended shown for ' + (hash || 'no hash'));
}
ok('knowledge.html#blended opens the blended topic; other addresses leave topics closed');

console.log(`\nAll ${n} multi-fragrance guidance checks passed.`);
