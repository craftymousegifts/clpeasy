// CLP-005 approved minimum Smart Paste cases (25 Oct 2026), run through the
// real Builder (jsdom, mock services, measured canvas stub). Synthetic text only.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const scopeApi = require('../sds-section-scope.js');
const assert = require('assert');
// jsdom set-up copied from tests/sds-supplier-builder-journey.js
const source = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const emptyQuery = { select(){ return this; }, eq(){ return this; }, update(){ return this; }, upsert(){ return this; },
  single(){ return Promise.resolve({ data:null, error:null }); }, then(r){ return Promise.resolve({ data:null, error:null }).then(r); } };
const vc = new VirtualConsole(); const jsErrors = []; vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(source, { url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t){ const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((a, c) => a + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; } });
    for (const f of ['sds-supplier-wording.js','label-render.js', 'sds-doc-check.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
const state = () => window.eval('S');
const labelText = () => {
  const d = new window.DOMParser().parseFromString(window.buildSVG(true), 'image/svg+xml');
  return [...d.querySelectorAll('text')].filter(n => !n.closest('.clp-fit-block')).map(n => [...n.childNodes].map(t => t.textContent).join(' ')).join(' ').replace(/\s+/g, ' ');
};
function run(text) {
  // Each case starts from a clear hazard state.
  for (const [id, val] of Object.entries({ 'scent-name': 'Synthetic', 'product-type': 'Scented Candle', 'frag-load': '10%', 'biz-name': 'Test', 'biz-address': '1 Test Road', 'biz-phone': '00000000000' })) box(id).value = val;
  window.selectShape('rectangle'); window.selectSize('custom'); box('custom-w').value = '150'; box('custom-h').value = '150'; window.onDimInput();
  window.clearHazardData(); window.__lastAlert = '';
  window.setApprovedBuilderStep(3); box('smart-paste-input').value = text; box('sds-source-confirm').checked = true; window.confirmSdsSource(); window.extractSDS();
  window.updateLabel();
  const s = state();
  return { scopeError: (box('smart-paste-scope-error').style.display !== 'none' ? box('smart-paste-scope-error').textContent : ''), alert: window.__lastAlert,
    signal: s.signal, pictograms: [...(s.pictograms || [])], h: box('h-statements').value, p: box('p-statements').value,
    issues: s.supplierWordingIssues || [], blocked: !!window._labelBlockDownload, text: labelText() };
}
const cases = require('./fixtures/clp005-acceptance-cases.js');
const CONTACT = 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.';
setImmediate(() => { try {
  const r = name => run(cases[name]);
  let o = r('1 exact 2.2');
  assert.equal(o.signal, 'Warning'); assert.equal(o.h, 'H317, H319, EUH208'); assert.equal(o.p, 'P261, P280, P305+P351+P338, P501');
  assert(o.text.includes('Wear protective gloves/eye protection.') && o.text.includes(CONTACT) && !o.blocked, 'exact Section 2.2 wording printed');
  const exact = o.text;
  o = r('2 whole SDS (2.1 + 3 around)');
  assert.equal(o.text, exact, 'whole SDS gives the same label as Section 2.2 alone');
  assert(!/H302|H315|H300|Danger|DANGER/.test(o.h + o.p + o.text), 'nothing imported from Sections 2.1, 3 or 11');
  o = r('3 OCR whitespace + wrapped P305+P351+P338');
  assert.equal(o.p, 'P305+P351+P338, P501'); assert(o.text.includes(CONTACT) && o.text.includes('May cause an allergic skin reaction.') && !o.blocked, 'wrapped combined code and indented continuation kept whole');
  o = r('3b spaced combined code'); assert(o.text.includes(CONTACT) && !o.blocked);
  o = r('4 header/footer noise inside 2.2');
  assert(!/Page 2 of 9|Ltd|Issue date|Version/.test(o.text), 'page furniture not printed'); assert(o.text.includes('Avoid breathing vapours.') && o.text.includes('Dispose of contents/container in accordance with local regulations.'));
  o = r('5 H412 only in 2.1 (must not be added)'); assert(!/H412/.test(o.h) && !o.pictograms.includes('aquatic'), 'H412 listed only in 2.1 is not added');
  o = r('6a complete P280 + P241');
  assert(o.text.includes('Use explosion-proof electrical and ventilating equipment.') && o.text.includes('Wear protective gloves and eye protection.') && !o.blocked, 'complete supplier P241/P280 printed');
  for (const [name, code] of [['7a incomplete P241 (ellipsis/brackets)', 'P241'], ['7b incomplete P280 (ellipsis)', 'P280']]) {
    o = r(name); assert(o.issues.includes(code) && o.blocked, name + ' is flagged and blocked');
    assert(!/…|\[electrical/.test(o.text), 'incomplete choice is never printed');
  }
  o = r('7c code-only P280 and P241'); assert(o.issues.includes('P280') && o.issues.includes('P241') && o.blocked);
  const msg = window.clpUnrecognisedCodesMessage(o.issues).body;
  assert(msg.startsWith('This precautionary statement needs the full wording from your supplier’s SDS Section 2.2. Check the source document before continuing.'), 'approved P280/P241 message shown');
  o = r('8 absent 2.2 in whole SDS'); assert(o.scopeError && !o.h && !o.p, 'absent Section 2.2 flagged, nothing extracted');
  o = r('9 two SDSs pasted'); assert(o.scopeError && !o.h && !o.p, 'two SDSs flagged, nothing extracted');
  o = r('10 P272 supplied, P363 without matching H'); assert.equal(o.p, 'P272, P363', 'supplied P272/P363 retained, not inferred or dropped');
  o = r('11 signal None, pictograms None'); assert.equal(o.signal, ''); assert.equal(o.pictograms.length, 0);
  o = r('12 UFI + Contains'); assert(o.text.includes('UFI: TEST-0000-0000-0000') && o.text.includes('Contains: Linalool, Citral.'));
  o = r('13 bare Supplemental information heading');
  assert(o.text.includes('Dispose of contents/container in accordance with local regulations.') && !/\binformation\b/.test(o.text) && o.text.includes('Contains Citral. May produce an allergic reaction.'), 'a bare heading adds no stray words');
  o = r('14 page number + supplier address block after P501');
  assert(o.text.includes('Dispose of contents/container to an approved waste disposal plant') && !/1\/2|2\/2|Synthetic Supplies Ltd|Testtown|TEL|customerservice|Additional Information on Sensitisers/.test(o.text), 'page number and address block are not printed');
  assert(o.h.includes('EUH208') && !o.issues.length, 'EUH208 named by the heading takes the Contains wording beneath it');
  assert(!o.text.includes('This document is given for information only.'), 'D2: a clearly administrative document note is not printed');
  o = r('16 administrative note vs safety note');
  assert(!/given for information only|manufacturer's responsibility/.test(o.text), 'D2: administrative notes left off the label');
  assert(o.text.includes('For professional use only.') && o.text.includes('Contains Linalool, Citral. May produce an allergic reaction.'), 'D2: safety-related or uncertain notes still print');
  assert(window.eval('S.sourceSection22').includes('This document is given for information only.'), 'D2: original SDS text is preserved');assert(o.text.includes('Contains Linalool, Citral. May produce an allergic reaction.') && !o.blocked, 'supplemental EUH208 text kept');
  o = r('15 statement continues across a page break');
  assert(o.issues.includes('P305+P351+P338') && o.blocked && !o.text.includes('Remove contact lenses,'), 'a statement split by a page break is flagged, never printed half');
  console.log('PASS CLP-005 minimum Smart Paste cases (19 cases; real Builder, mock services, measured canvas stub)');
} catch (e) { console.error(e); process.exitCode = 1; } finally { window.close(); } });
