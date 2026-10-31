// Issue #349 (31 Oct 2026): FizzyWhiz Ice Pixie 10% Non Hazardous Base wax
// melt SDS (JasperReports "Banded", v2 16/03/2026). Some PDF viewers copy its
// two-column Section 2.2 column by column (labels, then values), so "Warning"
// is several lines away from an empty "Signal word:" label. Smart Paste then
// read H/P/EUH208 but stopped with "The signal word ... could not be read".
// Real Builder (jsdom, mock services, no network, no downloads used):
//   1. the real SDS in stream, PDFium and Section 2.2 column order: Warning,
//      H317, EUH208 + 3 named sensitisers, GHS07, P261 P272 P280 P302+P352
//      P333+P313 P363 P501 with supplier wording, no review issues;
//   2. Section 3/16 ingredient hazards (H315, H411, H302) never reach the label;
//   3. Step 3 continues, save -> reopen -> Composer render keep the same text;
//   4. fail closed: two standalone values, Warning + Danger, no value line,
//      a value line without a Signal word label -> still blocked for review;
//   5. the whole-document column-order copy reads Warning but its garbled
//      H317 wording still stops for review (not guessed).
//   node tests/issue-349-ice-pixie-signal-word.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const scopeApi = require('../sds-section-scope.js');

const source = fs.readFileSync('builder.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const emptyQuery = { select(){ return this; }, eq(){ return this; }, update(){ return this; }, upsert(){ return this; },
  single(){ return Promise.resolve({ data:null, error:null }); }, then(r){ return Promise.resolve({ data:null, error:null }).then(r); } };
const vc = new VirtualConsole(); const jsErrors = []; vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(source, { url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t){ const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((a, c) => a + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; } });
    for (const f of ['sds-supplier-wording.js','label-render.js', 'sds-doc-check.js', 'hazard-provenance.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: {user:{id:'00000000-0000-4000-8000-00000000a11d',email:'qa-trial@example.invalid',user_metadata:{}}} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

const FIX = path.join(__dirname, 'fixtures', 'issue349');
const read = f => fs.readFileSync(path.join(FIX, f), 'utf8');
const state = () => window.eval('S');
const labelText = () => {
  const d = new window.DOMParser().parseFromString(window.buildSVG(true), 'image/svg+xml');
  return [...d.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => [...t.childNodes].map(c => c.textContent).join(' ')).join(' ');
};
function extract(text) {
  for (const [id, val] of Object.entries({ 'scent-name': 'Ice Pixie', 'product-type': 'Wax Melt', 'frag-load': '10%', 'biz-name': 'Test', 'biz-address': '1 Test Road', 'biz-phone': '00000000000' })) box(id).value = val;
  window.selectShape('rectangle'); window.selectSize('custom'); box('custom-w').value = '150'; box('custom-h').value = '150'; window.onDimInput();
  window.setApprovedBuilderStep(3); box('smart-paste-input').value = text; box('sds-source-confirm').checked = true; window.confirmSdsSource(); window.extractSDS();
}
const EXPECT_P = ['P261', 'P272', 'P280', 'P302+P352', 'P333+P313', 'P363', 'P501'];
const EXPECT_SENS = ['(E)-1-(2,6,6-Trimethyl-2-cyclohexen-1-yl)-2-buten-1-one', 'Reaction Mass of (3E)-3-methyl-4-(2,6,6-trimethyl-2-cyclohexen-1-yl)-3-buten-2-one and (1E)-1-(2,6,6-trimethyl-2-cyclohexen-1-yl)-1-penten-3-one', 'omega-Pentadecalactone'];
(async () => { try {
  await new Promise(r => setImmediate(r));
  for (const f of ['ice-pixie-stream-order.txt', 'ice-pixie-pdfium-order.txt', 'ice-pixie-section-2-2-column-order.txt']) {
    extract(read(f)); const s = state();
    assert.strictEqual(s.sdsSignal, 'Warning', f + ': supplier signal word'); assert.strictEqual(s.signal, 'Warning', f);
    assert.deepStrictEqual(s.hStatements.split(', '), ['H317', 'EUH208'], f + ': H/EUH codes only from Section 2.2');
    assert.deepStrictEqual(s.pStatements.split(', '), EXPECT_P, f + ': all supplier P statements');
    assert.deepStrictEqual([...s.sensitisers], EXPECT_SENS, f + ': EUH208 named substances');
    assert.deepStrictEqual([...s.pictograms], ['exclamation'], f + ': GHS07');
    assert.deepStrictEqual([...s.supplierWordingIssues], [], f + ': no review issues');
    const txt = labelText();
    for (const w of ['May cause an allergic skin reaction.', 'Contaminated work clothing should not be allowed out of the workplace.', 'Wash contaminated clothing before reuse.', 'IF ON SKIN: Wash with plenty of soap and water.', 'omega-Pentadecalactone'])
      assert(txt.includes(w), f + ': label keeps supplier wording: ' + w);
    assert(!/Causes skin irritation|Toxic to aquatic life|Harmful if swallowed/.test(txt), f + ': Section 3/16 ingredient hazards must not reach the label');
    ok(f + ': Warning, H317 + EUH208 (3 sensitisers), GHS07, 7 supplier P statements, no review issue, no ingredient hazards');
  }
  // Full pathway on the column-order copy (the failing layout): Step 3 -> save -> reopen -> Composer.
  extract(read('ice-pixie-section-2-2-column-order.txt'));
  window.eval(require('./helpers/sds-doc-answer').SCRIPT); window.__confirmSdsDoc(); box('hazard-confirm').checked = true;
  assert(window.canLeaveApprovedBuilderStep(3), 'Step 3 continues: ' + (window.__lastAlert || ''));
  const before = labelText(); await window.saveLabel();
  const saved = window.getSaved().find(e => e.scentName === 'Ice Pixie'); assert(saved, 'saved');
  assert.strictEqual(saved.sdsSignal || saved.signal, 'Warning');
  window.clearHazardData(); window.loadLabelRecord(saved);
  assert.strictEqual(state().signal, 'Warning', 'reopened signal word'); assert.deepStrictEqual([...state().supplierWordingIssues], [], 'reopened: no review issue');
  assert.strictEqual(labelText(), before, 'reopened label text unchanged');
  const composer = window.LabelRenderer.renderLabel(saved, { instanceId: 'composer', forExport: true, watermark: true });
  const cd = new window.DOMParser().parseFromString(composer.svg, 'image/svg+xml');
  const ctext = [...cd.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => [...t.childNodes].map(c => c.textContent).join(' ')).join(' ');
  assert.strictEqual(ctext, before, 'Composer render equals Builder label text');
  assert(/\bWARNING\b/i.test(ctext), 'signal word printed');
  ok('column-order copy: Step 3 continues, save/reopen keep Warning and wording, Composer render identical');

  // Fail closed.
  const col = read('ice-pixie-section-2-2-column-order.txt');
  const cases = [
    ['two standalone Warning lines', col.replace('Warning\n', 'Warning\nWarning\n')],
    ['Warning and Danger lines', col.replace('Warning\n', 'Warning\nDanger\n')],
    ['no value line', col.replace('Warning\n', '')],
  ];
  for (const [name, text] of cases) {
    extract(text);
    if (name === 'Warning and Danger lines' && state().sdsSignal === '' && !state().supplierWordingIssues.includes('Signal word')) {
      // Scope may already refuse a block with conflicting values; either way nothing is guessed.
    }
    assert.strictEqual(state().sdsSignal, '', name + ': nothing guessed');
    assert(state().supplierWordingIssues.includes('Signal word') || state().hStatements === '', name + ': blocked for review');
    ok('fail closed: ' + name);
  }
  // A bare value line with no Signal word label at all is not read as the signal word.
  extract('2.2 Label elements\nHazard statements:\nWarning\nH317, May cause an allergic skin reaction.');
  assert.strictEqual(state().sdsSignal, ''); assert(state().supplierWordingIssues.includes('Signal word'));
  ok('fail closed: value line without a Signal word label');
  // Whole-document column-order copy: signal word now read, garbled H317 wording still stops for review.
  extract(read('ice-pixie-column-order.txt'));
  assert.strictEqual(state().sdsSignal, 'Warning');
  assert(state().supplierWordingIssues.length > 0, 'garbled whole-document column copy still needs review');
  assert(!window.canLeaveApprovedBuilderStep(3), 'review gate still blocks');
  ok('whole-document column copy: Warning read, garbled wording still blocked for review');
  assert.deepStrictEqual(jsErrors, []);
  console.log(`PASS issue-349 Ice Pixie signal word (${n} checks)`);
} catch (e) { console.error('FAIL:', e && e.stack || e); process.exit(1); } })();
