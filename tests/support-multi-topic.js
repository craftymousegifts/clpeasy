// Support form: several help topics can be chosen (Oct 2026, approved by
// Michaela). Frontend only -- the send-support-email function is unchanged,
// so the chosen topics travel joined in its existing required "step" field.
//   1. 11 approved topics as accessible checkboxes under one legend.
//   2. At least one topic is required; nothing is sent without one.
//   3. One topic sends exactly as before; several are all included.
//   4. ?topic=<fixed key> preselects only that topic; anything else is ignored.
// No request leaves the test: fetch is replaced with a local stub.
// Run from the repo root: node tests/support-multi-topic.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('support.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const TOPICS = ['Smart Paste / SDS extraction', 'CLP classification information', 'Missing or excluded H/P statements',
  'Product or fragrance details', 'Label layout, size or fitting', 'Printing, cutting or downloads',
  'Saved labels / label library', 'Account, login, trial or subscription', 'Payments or billing',
  'Technical problem / bug', 'Other enquiry'];

let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

function load(query = '') {
  const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { url: 'https://clpeasy.com/support.html' + query, runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(w) { w.__sent = []; w.fetch = (url, opts) => { w.__sent.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, status: 200 }); }; } });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const fill = () => { d.getElementById('name').value = 'Test Maker'; d.getElementById('email').value = 'maker@example.com'; d.getElementById('description').value = 'Synthetic.'; };
  const tick = (...labels) => labels.forEach(l => { [...d.querySelectorAll('input[name="help-topic"]')].find(c => c.value === l).checked = true; });
  const checkedKeys = () => [...d.querySelectorAll('input[name="help-topic"]:checked')].map(c => c.dataset.topic);
  return { w, d, fill, tick, checkedKeys, errors };
}
const tick = () => new Promise(r => setTimeout(r, 0));

(async () => {
  let t = load();
  const boxes = [...t.d.querySelectorAll('#help-topics input[type="checkbox"][name="help-topic"]')];
  assert.deepStrictEqual(boxes.map(b => b.value), TOPICS, 'the 11 approved topics, in order');
  assert(boxes.every(b => b.closest('label.topic-item')), 'each checkbox has its own label');
  assert.strictEqual(t.d.querySelector('#help-topics').tagName, 'FIELDSET');
  assert(t.d.querySelector('#help-topics legend').textContent.startsWith('What do you need help with?'));
  assert.strictEqual(t.d.getElementById('help-topics-hint').textContent, 'Select all that apply.');
  assert(!t.d.getElementById('step'), 'old single dropdown removed');
  ok('11 approved topics as labelled checkboxes under one legend');

  t.fill(); await t.w.submitForm(); await tick();
  assert.match(t.d.getElementById('msg').textContent, /select at least one topic/);
  assert.strictEqual(t.w.__sent.length, 0);
  ok('at least one topic is required; nothing sent without one');

  t = load(); t.fill(); t.tick('Payments or billing'); await t.w.submitForm(); await tick();
  assert.strictEqual(t.w.__sent.length, 1);
  assert(/send-support-email$/.test(t.w.__sent[0].url));
  assert.strictEqual(t.w.__sent[0].body.step, 'Payments or billing');
  assert.deepStrictEqual(t.w.__sent[0].body.categories, ['Payments or billing']);
  for (const k of ['name', 'email', 'description', 'errors', 'refresh', 'incognito', 'browser', 'other']) assert(k in t.w.__sent[0].body, k + ' still sent');
  ok('one topic is sent in the existing step field, other fields unchanged');

  t = load(); t.fill(); t.tick('Smart Paste / SDS extraction', 'Missing or excluded H/P statements', 'Printing, cutting or downloads'); await t.w.submitForm(); await tick();
  assert.strictEqual(t.w.__sent[0].body.step, 'Smart Paste / SDS extraction; Missing or excluded H/P statements; Printing, cutting or downloads');
  assert.strictEqual(t.w.__sent[0].body.categories.length, 3);
  ok('several topics are all included');

  assert.deepStrictEqual(load('?topic=excluded-statements').checkedKeys(), ['excluded-statements']);
  for (const q of ['?topic=unknown', '?topic=%22%5D%2C*%5B', '?topic=excluded-statements%3Cscript%3E', '?name=x&description=y', '']) {
    const l = load(q);
    assert.deepStrictEqual(l.checkedKeys(), [], q);
    assert.strictEqual(l.d.getElementById('name').value + l.d.getElementById('description').value, '', q);
    assert.deepStrictEqual(l.errors, [], q);
  }
  ok('?topic= preselects only a known topic key; everything else is ignored');

  console.log(`\nAll ${n} support multi-topic checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
