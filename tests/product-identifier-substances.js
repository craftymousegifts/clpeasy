// GB CLP Article 18(3)(b) product-identifier substances (issue #349 follow-up,
// 31 Oct 2026). For hazard classes such as skin sensitisation the label names
// the substances the supplier identifies as responsible, which suppliers give
// in the SDS Section 1.1 product name, e.g. "Ice Pixie 10% Non Hazardous Base
// (Contains:alpha-iso-Methylionone)", separately from the EUH208 names.
// CLPeasy finds that supplier evidence, but a name is only used after the
// maker confirms it (supplier names, or names typed from supplier documents);
// incomplete information keeps Step 3, Builder exports and the Composer blocked.
// Proves, with the real Ice Pixie SDS and other real/synthetic layouts:
//   1. Section 1.1 parsing: Ice Pixie (4 copy orders), NI Candle "Banded"
//      wrapped list, a Word-generated SDS, plain "Contains:" line, hyphen
//      wraps; none / no section / unterminated -> nothing guessed; Section 3
//      "Contains:" table header never used.
//   2. Builder: evidence shown; Step 3 and downloads blocked until the maker
//      confirms; "Use these names" prints "Contains: alpha-iso-Methylionone."
//      alongside the three EUH208 names; save -> reopen -> Composer render keep it.
//   3. Confirmation is tied to the H statements: changed H codes need a new one.
//   4. No Section 1.1 in the paste: maker must type names (empty refused).
//   5. Labels without an Art 18(3)(b) hazard (e.g. H412 only) are unaffected.
//   6. Supplier "Contains:" in Section 2.2 is offered, and not printed twice.
//   7. Composer (print.html): unconfirmed or stale saved labels block the sheet.
//   node tests/product-identifier-substances.js
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
const PIC = require('../sds-doc-check.js').ProductIdentifierCheck;
const FIX = path.join(__dirname, 'fixtures', 'issue349');
const read = f => fs.readFileSync(path.join(FIX, f), 'utf8');
const state = () => window.eval('S');
const labelText = () => {
  const d = new window.DOMParser().parseFromString(window.buildSVG(true), 'image/svg+xml');
  return [...d.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => [...t.childNodes].map(c => c.textContent).join(' ')).join(' ');
};
function extract(text, name = 'Ice Pixie') {
  for (const [id, val] of Object.entries({ 'scent-name': name, 'product-type': 'Wax Melt', 'frag-load': '10%', 'biz-name': 'Test', 'biz-address': '1 Test Road', 'biz-phone': '00000000000' })) box(id).value = val;
  window.selectShape('rectangle'); window.selectSize('custom'); box('custom-w').value = '150'; box('custom-h').value = '150'; window.onDimInput();
  window.setApprovedBuilderStep(3); box('smart-paste-input').value = text; box('sds-source-confirm').checked = true; window.confirmSdsSource(); window.extractSDS();
}
const panel = () => { const el = box('pid-panel'); return { shown: el.style.display !== 'none', text: el.textContent.replace(/\s+/g, ' ') }; };
// Real supplier layouts (Section 1.1 text exactly as extracted from the public PDFs).
const HAWAIIAN = '1.1 Product Identifier\nHawaiian Honey Blossom Fragrance Oil (R) (Contains:4-tert-Butylcyclohexyl acetate,\nCitronellol, Geraniol, Tetrahydrolinalool)\nProduct identifier:\nOther identifiers:\nNone\n1.2 Relevant identified uses of the substance of mixture and uses advised against\n';
const PIXIE_DUST = '1.1 Product Identifier\nProduct identifier:\nOther identifiers:\n\nPIXIE DUST SPARKLE FRAGRANCE (Contains:BENZYL SALICYLATE, LINALYL\nACETATE, PHENETHYL ALCOHOL, PHENYLETHYL ACETATE)\nNone\n\n1.2 Relevant identified uses of the substance or mixture and uses advised against\n';
const LIBRARY = '1.1 Product Identifier\nLibrary 10% (non-hazardous base)\nProduct identifier:\nOther identifiers:\nNone\n1.2 Relevant identified uses of the substance of mixture and uses advised against\n3.2 Mixtures\nContains:\nName CAS EC\n';
(async () => { try {
  await new Promise(r => setImmediate(r));
  // 1. Parsing.
  for (const f of ['ice-pixie-stream-order.txt', 'ice-pixie-pdfium-order.txt']) assert.deepStrictEqual(PIC.fromSds(read(f)).names, ['alpha-iso-Methylionone'], f);
  assert.deepStrictEqual(PIC.fromSds(HAWAIIAN).names, ['4-tert-Butylcyclohexyl acetate', 'Citronellol', 'Geraniol', 'Tetrahydrolinalool']);
  assert.deepStrictEqual(PIC.fromSds(PIXIE_DUST).names, ['BENZYL SALICYLATE', 'LINALYL ACETATE', 'PHENETHYL ALCOHOL', 'PHENYLETHYL ACETATE']);
  assert.deepStrictEqual(PIC.fromSds('SECTION 1: Identification\n1.1. Product identifier\nProduct name: Rose Melt\nContains: Geraniol, 2,6-dimethyl-7-octen-2-ol\n1.2. Uses\n').names, ['Geraniol', '2,6-dimethyl-7-octen-2-ol'], 'plain Contains line keeps chemical commas');
  assert.deepStrictEqual(PIC.fromSds('1.1 Product identifier\nX (Contains:(E)-1-(2,6,6-Trimethyl-2-cyclohexen-1-yl)-2-\nbuten-1-one)\n1.2 Uses\n').names, ['(E)-1-(2,6,6-Trimethyl-2-cyclohexen-1-yl)-2-buten-1-one'], 'hyphen wrap and nested brackets');
  assert.strictEqual(PIC.fromSds(LIBRARY).status, 'none', 'no Contains in 1.1; Section 3 "Contains:" header not used');
  assert.strictEqual(PIC.fromSds('2.2 Label elements\nSignal word: Warning\nH317, May cause an allergic skin reaction.').status, 'no-section');
  assert.strictEqual(PIC.fromSds('1.1 Product identifier\nX (Contains: Linalool,\n1.2 Uses\n').status, 'unclear', 'unterminated list is not guessed');
  ok('Section 1.1 parsing: Ice Pixie, NI Candle Banded, Word SDS, plain line, hyphen wrap; none/no-section/unclear never guessed');

  // 2. Builder with the real Ice Pixie SDS.
  extract(read('ice-pixie-stream-order.txt'));
  assert.deepStrictEqual(PIC.triggeringCodes({ hStatements: state().hStatements }), ['H317']);
  let p = panel(); assert(p.shown, 'panel shown for H317');
  assert(p.text.includes('(Contains:alpha-iso-Methylionone)') && p.text.includes('Use these names: alpha-iso-Methylionone'), p.text);
  assert(!labelText().includes('alpha-iso-Methylionone'), 'nothing printed before the maker confirms');
  window.__confirmSdsDoc = undefined;
  box('hazard-confirm').checked = true;
  assert(!window.canLeaveApprovedBuilderStep(3), 'Step 3 blocked until confirmed');
  assert(/product identifier/.test(window.__lastAlert), window.__lastAlert);
  window.eval('readForm()'); box('verify-checkbox').checked = true;
  assert(!window._downloadAllowed(), 'downloads blocked until confirmed');
  assert.strictEqual(window._downloadBlockedMessage(), PIC.MESSAGE);
  document.querySelector('#pid-panel .pid-use').click();
  assert.strictEqual(state().productIdentifier.source, 'sds-1.1'); assert.strictEqual(JSON.stringify(state().productIdentifier.names), JSON.stringify(['alpha-iso-Methylionone']));
  assert(panel().text.includes('Confirmed (from your SDS Section 1.1): alpha-iso-Methylionone'), panel().text);
  const txt = labelText();
  assert(txt.includes('Contains: alpha-iso-Methylionone.'), 'product-identifier substance printed');
  for (const n of ['(E)-1-(2,6,6-Trimethyl-2-cyclohexen-1-yl)-2-buten-1-one', 'omega-Pentadecalactone', 'May produce an allergic reaction.']) assert(txt.includes(n), 'EUH208 text kept: ' + n);
  // 3. Confirmation tied to H statements.
  const stale = { hStatements: 'H317, H315, EUH208', productIdentifier: state().productIdentifier };
  assert(!PIC.isComplete(stale) && PIC.namesToPrint(stale).length === 0, 'changed H statements need a new confirmation; nothing printed meanwhile');
  extract(read('ice-pixie-stream-order.txt'));
  assert.strictEqual(state().productIdentifier, null, 'a new extraction needs a fresh confirmation');
  ok('confirmation is tied to the exact H statements; re-extraction resets it');

  // 4. Section 2.2-only paste: no supplier evidence -> maker types names.
  extract(read('ice-pixie-section-2-2-column-order.txt'), 'Ice Pixie 22');
  p = panel(); assert(p.shown && p.text.includes('We couldn’t find these names in the text you pasted'), p.text);
  assert(!document.querySelector('#pid-panel .pid-use'), 'no supplier names offered');
  window.__lastAlert = ''; box('pid-names').value = '   '; document.querySelector('#pid-panel .pid-typed').click();
  assert.strictEqual(state().productIdentifier, null); assert(/Type the substance names/.test(window.__lastAlert));
  box('pid-names').value = 'alpha-iso-Methylionone'; document.querySelector('#pid-panel .pid-typed').click();
  assert.strictEqual(state().productIdentifier.source, 'maker'); assert(labelText().includes('Contains: alpha-iso-Methylionone.'));
  ok('Section 2.2-only paste: maker must type names from supplier documents (empty refused), then printed');

  // 5. Not required: H412-only label.
  extract('2.2 Label elements\nSignal word: None\nHazard statements:\nH412, Harmful to aquatic life with long lasting effects.\nP273, Avoid release to the environment.', 'Library');
  assert(!panel().shown, 'no panel'); assert(PIC.isComplete({ hStatements: state().hStatements, productIdentifier: null }));
  ok('H412-only label: no product-identifier requirement');

  // 6. Supplier "Contains:" line in Section 2.2.
  extract('2.2 Label elements\nSignal word: Warning\nHazard statements:\nH317, May cause an allergic skin reaction.\nContains: Linalool, Citral.\nP261, Avoid breathing vapour.', 'Section22 Contains');
  assert(panel().text.includes('Your SDS Section 2.2 says: Contains: Linalool, Citral'), panel().text);
  document.querySelector('#pid-panel .pid-use').click();
  assert.strictEqual(state().productIdentifier.source, 'sds-2.2');
  assert.strictEqual((labelText().match(/Contains: Linalool, Citral/g) || []).length, 1, 'printed once (supplier Section 2.2 text), not repeated');
  ok('supplier "Contains:" in Section 2.2 offered as evidence and not printed twice');
  // Back to the confirmed Ice Pixie label for the save/reopen/Composer path.
  extract(read('ice-pixie-stream-order.txt'));
  document.querySelector('#pid-panel .pid-use').click();
  const txt2 = labelText(); assert.strictEqual(txt2, txt);
  window.eval(require('./helpers/sds-doc-answer').SCRIPT); window.__confirmSdsDoc();
  assert(window.canLeaveApprovedBuilderStep(3), 'Step 3 continues once confirmed: ' + (window.__lastAlert || ''));
  await window.saveLabel();
  const saved = window.getSaved().find(e => e.scentName === 'Ice Pixie');
  assert.strictEqual(saved.productIdentifier.source, 'sds-1.1'); assert(PIC.isComplete(saved));
  window.clearHazardData(); assert.strictEqual(state().productIdentifier, null, 'Clear removes the confirmation');
  window.loadLabelRecord(saved); assert(PIC.confirmed({ hStatements: state().hStatements, productIdentifier: state().productIdentifier }), 'reopened: still confirmed');
  assert.strictEqual(labelText(), txt, 'reopened label identical');
  const composer = window.LabelRenderer.renderLabel(saved, { instanceId: 'composer', forExport: true, watermark: true });
  const cd = new window.DOMParser().parseFromString(composer.svg, 'image/svg+xml');
  assert.strictEqual([...cd.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => [...t.childNodes].map(c => c.textContent).join(' ')).join(' '), txt, 'Composer render identical');
  ok('Ice Pixie: SDS evidence shown, Step 3 + downloads blocked until confirmed, "Contains: alpha-iso-Methylionone." printed with the 3 EUH208 names, save/reopen/Composer identical');

  assert.deepStrictEqual(jsErrors, []);

  // 7. Composer gate (real print.html, jsdom).
  const printSrc = fs.readFileSync('print.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
  const pvc = new VirtualConsole(); const perr = []; pvc.on('jsdomError', e => perr.push(e.message));
  const base = { ...saved, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scentName: 'Confirmed Pixie' };
  const unconfirmed = { ...saved, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', scentName: 'Unconfirmed Pixie', productIdentifier: null };
  const pd = new JSDOM(printSrc, { url: 'https://local.clpeasy.test/print.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: pvc,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t) { return { width: String(t).length * 6 }; }, fillRect() {}, drawImage() {} });
      for (const f of ['sds-supplier-wording.js', 'label-render.js', 'sds-doc-check.js', 'hazard-provenance.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
      w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }), rpc: async () => ({ data: null, error: null }) }) };
    } });
  await new Promise(r => setTimeout(r, 300));
  const pw = pd.window;
  pw.PIC_TEST = { base, unconfirmed };
  const msgFor = recs => { pw.getSheetPlacementsMM = () => recs.map(r => ({ labelData: r })); pw.eval('currentTpl=currentTpl||{}'); return pw.getSheetProductIdentifierBlockMessage(); };
  assert.strictEqual(msgFor([base]), null, 'confirmed label prints');
  const m = msgFor([base, unconfirmed]);
  assert(m && m.includes('Unconfirmed Pixie') && !m.includes('Confirmed Pixie') && m.includes('product identifier'), m);
  assert(msgFor([{ ...base, hStatements: 'H317, H315, EUH208' }]), 'stale confirmation blocks');
  assert.strictEqual(msgFor([{ ...base, hStatements: 'H412', productIdentifier: null }]), null, 'H412-only label unaffected');
  assert(/const pidMsg=getSheetProductIdentifierBlockMessage\(\);\s*\n\s*if\(pidMsg\)return pidMsg;/.test(fs.readFileSync('print.html', 'utf8')), 'sheet export gate uses the product-identifier check');
  ok('Composer: unconfirmed or stale saved labels named and block the sheet; confirmed and non-required labels pass');
  console.log(`PASS product-identifier substances (${n} checks)`);
} catch (e) { console.error('FAIL:', e && e.stack || e); process.exit(1); } })();
