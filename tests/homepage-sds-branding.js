'use strict';
// Homepage-only regression: the released Smart Paste accepts a full SDS or Section 2.2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const { JSDOM } = require('jsdom');
const doc = new JSDOM(html).window.document;
const faq = [...doc.querySelectorAll('.faq-item')];
const answer = question => {
  const item = faq.find(e => e.querySelector('.faq-q')?.textContent.trim() === question);
  assert.ok(item, 'Missing homepage FAQ: ' + question);
  return item.querySelector('.faq-a')?.textContent || '';
};
for (const question of ['What is an SDS sheet and where do I find mine?', 'How does Smart Paste work?', "My supplier isn't in the library — can I still use CLPeasy?"]) {
  const text = answer(question);
  assert.match(text, /full SDS|supplier SDS or its complete Section 2\.2/);
  assert.match(text, /review|check/i);
}
assert.ok(!html.includes('Do not paste the entire SDS'));
assert.ok(!html.includes('Paste only that section'));
assert.ok(!html.includes('— Michaela, Crafty Mouse Gifts'));
assert.match(html, /— Michaela, Founder of CLPeasy®/);
assert.ok(!html.includes('alt="Crafty Mouse Gifts"'));
assert.match(html, /GB CLP Label Generator for Candle &amp; Wax Melt Makers \| CLPeasy®/);
assert.match(html, /<link rel="canonical" href="https:\/\/clpeasy.com\/">/);
console.log('Homepage SDS and founder-branding checks passed.');
