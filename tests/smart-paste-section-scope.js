// Smart Paste Section 2.2 extraction scope (Oct 2026 safety fix).
//
// Defect (present since the first Builder, 25 May 2026): extractSDS() read
// H codes, P codes and the signal word from ALL pasted text. Pasting a complete
// SDS put Section 3 ingredient hazards and later-section codes on the
// finished-product label (e.g. Warning -> Danger, extra pictograms), and the
// resulting label could be downloaded. Earlier QA pasted pre-trimmed Section
// 2.2 text only, so it never exercised this. These tests run the real
// Builder extractSDS() and prove:
//   1. Text outside Section 2.2 cannot change the extracted label.
//   2. Page-break continuations of Section 2.2 are kept; page headers,
//      contents lists and Section 16 notes are ignored.
//   3. Two Section 2.2 blocks, two signal words (two SDSs, or GB + US
//      blocks), or SDS headings without a Section 2.2 stop extraction with
//      the approved message, leaving no stale hazard data, and Step 3 cannot
//      continue.
//   4. Bare Section 2.2 extracts and code lists without headings behave as
//      before (documented limitation: unstructured extra text can't be told
//      apart from Section 2.2).
// Optional real-document check: set SDS_SCOPE_CORPUS_22 (folders NNN/
// section-2-2-pasted.txt) and SDS_SCOPE_CORPUS_FULL (files NNN.txt holding the
// whole document text); every whole document must extract exactly like its
// Section 2.2 paste.
// Run from the repo root: node tests/smart-paste-section-scope.js
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
    for (const f of ['label-render.js', 'sds-doc-check.js', 'hazard-provenance.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: {user:{id:'00000000-0000-4000-8000-00000000a11d',email:'qa-trial@example.invalid',user_metadata:{}}} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

function extract(text) {
  window.selectShape('rectangle'); window.selectSize('custom');
  box('custom-w').value = '120'; box('custom-h').value = '90'; window.onDimInput();
  box('scent-name').value = 'Synthetic'; box('product-type').value = 'Scented Candle'; box('frag-load').value = '10%';
  window.setApprovedBuilderStep(3);
  box('smart-paste-input').value = text; window.__lastAlert = undefined;
  document.getElementById('sds-source-confirm').checked=true; window.confirmSdsSource(); window.extractSDS();
  const S = window.eval('S');
  return { h: S.hStatements, p: S.pStatements, signal: S.signal, pictos: [...S.pictograms].sort().join(','), sens: [...S.sensitisers].join('|'),
    fromExtraction: !!S.hazardFromExtraction, error: (e => e && e.style.display !== 'none' ? e.textContent : null)(box('smart-paste-scope-error')) };
}
const same = (a, b, msg) => assert.deepStrictEqual({ h: a.h, p: a.p, signal: a.signal, pictos: a.pictos, sens: a.sens }, { h: b.h, p: b.p, signal: b.signal, pictos: b.pictos, sens: b.sens }, msg);

// Synthetic SDS (structure modelled on real UK supplier SDSs; wording is ours).
const S2 = `SECTION 2: Hazards identification
2.1 Classification of the substance or mixture
Skin Sens. 1: H317; Aquatic Chronic 3: H412
2.2 Label elements
Hazard pictograms: GHS07
Signal word: Warning
Hazard statements:
H317 May cause an allergic skin reaction.
H412 Harmful to aquatic life with long lasting effects.
Precautionary statements:
P261 Avoid breathing vapours.
P273 Avoid release to the environment.
P302+P352 IF ON SKIN: Wash with plenty of water.
P501 Dispose of contents/container in accordance with local regulations.
Supplemental information: EUH208 Contains Linalool. May produce an allergic reaction.
2.3 Other hazards
Not applicable.
`;
const S1 = `SAFETY DATA SHEET
SECTION 1: Identification of the substance/mixture and of the company/undertaking
1.1 Product identifier
Product name: Synthetic Rose 10% in candle wax
1.3 Details of the supplier of the safety data sheet
Example Fragrances Ltd, 1 Test Lane, Exeter
`;
const S3PLUS = `SECTION 3: Composition/information on ingredients
3.2 Mixtures
Linalool 1-5% Skin Sens. 1B H317
d-Limonene 1-5% Flam. Liq. 3 H226, Asp. Tox. 1 H304, Skin Irrit. 2 H315, Aquatic Acute 1 H400, Aquatic Chronic 1 H410
Citral <1% Eye Irrit. 2 H319, Acute Tox. 3 H301
SECTION 4: First aid measures
IF SWALLOWED: P301+P310 Immediately call a POISON CENTER. P331 Do NOT induce vomiting.
SECTION 16: Other information
Full text of H statements: H226 Flammable liquid and vapour. H301 Toxic if swallowed. H304 May be fatal if swallowed and enters airways.
Signal word of ingredients may differ: Danger
`;

// ── 1. Text outside Section 2.2 cannot change the label ─────────────────
const only22 = S2.slice(S2.indexOf('2.2 Label elements'), S2.indexOf('2.3 Other hazards'));
const base = extract(only22);
assert.strictEqual(base.error, null);
assert(base.h.includes('H317') && base.h.includes('H412') && base.signal === 'Warning' && base.fromExtraction, JSON.stringify(base));
const whole = extract(S1 + S2 + S3PLUS);
same(whole, base, 'whole document must extract exactly like Section 2.2');
assert(!/H226|H304|H315|H319|H301|H400|H410/.test(whole.h) && !/P301|P331/.test(whole.p), 'no Section 3/4/16 codes');
same(extract(S1 + S2), base, 'Sections 1-2 extract like Section 2.2');
same(extract(S2 + S3PLUS), base, 'Section 2 + later sections extract like Section 2.2');
ok('whole document, Sections 1-2 and Section 2 onwards all give the Section 2.2 label (no Section 3+ codes, signal word unchanged)');

// ── 2. Continuations kept; headers, contents lists and Section 16 notes ignored ──
const split = only22.replace('P302+P352', 'Example Fragrances Ltd   Page 2 of 9\n2.2 Label elements (continued)\nP302+P352');
same(extract(S1 + split.replace(/^/, 'SECTION 2: Hazards identification\n') + '2.3 Other hazards\n' + S3PLUS), base, 'continued 2.2 after a page break is kept');
same(extract('Contents: 1. Identification 2. Hazards identification 2.2 Label elements 3. Composition\n' + S2 + S3PLUS), base, 'contents line ignored');
same(extract(S2 + S3PLUS + 'Changes since last version:\n2.2 Label elements updated.\n'), base, 'Section 16 change note ignored');
ok('page-break continuation kept; contents list and change notes ignored');

// ── 3. Fail closed: message, no stale data, Step 3 blocked ──────────────
const MSG = 'We couldn’t reliably identify one Section 2.2 (Label elements) section. Please copy Section 2.2 from the safety data sheet covering your finished product and try again.';
assert.strictEqual(scopeApi.MESSAGE, MSG);
const OTHER22 = S2.replace('Signal word: Warning', 'Signal word: Danger').replace('H412', 'H304').replace('Linalool', 'Citral');
const stops = {
  'two SDSs pasted together': S1 + S2 + S3PLUS + '\n' + S1 + OTHER22,
  'two Section 2.2 blocks, same signal word': only22 + '\n' + only22.replace('H412', 'H411'),
  'GB and US blocks inside one Section 2.2': S2.replace('2.3 Other hazards', 'US OSHA HazCom 2012 (GHS)\nSignal word: Danger\nH304 May be fatal if swallowed and enters airways.\n2.3 Other hazards'),
  'US signal word mid-line inside Section 2.2': S2.replace('2.3 Other hazards', 'GHS (US) labelling: Signal word: Danger\n2.3 Other hazards'),
  'two bare extracts with different signal words (no headings)': 'Signal word: Warning\nH317\nP261 P501\n\nSignal word: Danger\nH304 H315\nP301+P310 P331',
  'SDS headings but no numbered Section 2.2': 'SECTION 2: Hazards identification\nLabel elements\nSignal word: Warning\nH317\n' + S3PLUS,
};
for (const [name, text] of Object.entries(stops)) {
  const before = extract(only22);                        // a good extraction first...
  assert(before.h.includes('H317'));
  const r = extract(text);                               // ...then the unsafe paste
  assert.strictEqual(r.error, MSG, name + ': approved message shown');
  assert.deepStrictEqual([r.h, r.p, r.signal, r.pictos, r.sens, r.fromExtraction], ['', '', '', '', '', false], name + ': no stale or partial hazard data');
  window.__lastAlert = undefined; box('hazard-confirm').checked = true;
  assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, name + ': Step 3 cannot continue');
  assert(/extract and review the hazard data/i.test(window.__lastAlert || ''), name + ': Step 3 asks for hazard data');
}
ok('two SDSs, two Section 2.2 blocks, GB+US blocks, conflicting signal words and missing Section 2.2 all stop with the message and clear earlier data');

// The message goes away on a good extraction, Clear, or loading a saved label.
extract(stops['two SDSs pasted together']); assert.strictEqual(extract(only22).error, null);
extract(stops['two SDSs pasted together']); window.clearHazardData(); assert.strictEqual(box('smart-paste-scope-error').style.display, 'none');
extract(stops['two SDSs pasted together']);
try { window.loadLabelRecord({ id: 'saved', scentName: 'Other', productType: 'Wax Melt', shape: 'circle', size: 63, hStatements: '', pStatements: '', sensitisers: [], pictograms: [] }); } catch (e) { /* signed-in library refresh not under test */ }
assert.strictEqual(box('smart-paste-scope-error').style.display, 'none');
ok('message clears after a good extraction, Clear hazard data, or loading a saved label');

// ── 3b. Boundary layouts seen in copied PDFs (independent review, Oct 2026) ──
const LAYOUTS = {
  'unnumbered later headings': S1 + S2.replace('2.3 Other hazards', 'Other hazards') + S3PLUS.replace('SECTION 3: Composition/information on ingredients', 'Composition/information on ingredients').replace('3.2 Mixtures', 'Mixtures').replace('SECTION 4: First aid measures', 'First aid measures').replace('SECTION 16: Other information', 'Other information'),
  'colon numbering ("3: Composition")': S1 + S2.replace('2.3 Other hazards\nNot applicable.\n', '') + S3PLUS.replace('SECTION 3: Composition', '3: Composition'),
  'heading numbers on their own line': S1 + S2.replace('2.2 Label elements', '2.2\nLabel elements').replace('2.3 Other hazards', '2.3\nOther hazards') + S3PLUS,
  'ALL-CAPS headings': (S1 + S2 + S3PLUS).replace(/(^|\n)((?:SECTION|\d+\.\d)[^\n]*)/g, (m, a, b) => a + b.toUpperCase()),
};
for (const [name, text] of Object.entries(LAYOUTS)) same(extract(text), base, name);
const inside = only22.replace('P273 Avoid release to the environment.', 'P273 Avoid release to the environment; see other hazards below.');
same(extract(inside + '2.3 Other hazards\n'), extract(inside), 'a sentence mentioning other hazards does not end Section 2.2');
assert.strictEqual(extract('Hazards identification\nLabel elements\nSignal word: Warning\nH317\nComposition/information on ingredients\nH226 H304\n').error, MSG, 'unnumbered whole SDS without a numbered 2.2 stops');
ok('Section 2.2 ends at unnumbered, colon-numbered, split and capitalised 2.3/Section 3 headings; a fully unnumbered SDS stops');

// ── 3c. Repeated 2.2 heading without a "continued" marker (owner-approved narrow rule) ──
// Genuine page continuation: the heading is repeated on the next page and that
// part only holds P statements -> joined, label identical to the unsplit text.
const atP = only22.indexOf('P302+P352');
const pageHeader = 'Example Fragrances Ltd   Page 2 of 9\n2.2 Label elements\n';
const supp = only22.indexOf('Supplemental information');
const pOnlyPage2 = only22.slice(atP, supp);                         // P302+P352 ... P501 only
const page1 = only22.slice(0, atP) + only22.slice(supp);            // heading, signal word, H, first P codes, EUH208
same(extract(S1 + 'SECTION 2: Hazards identification\n' + page1 + pageHeader + pOnlyPage2 + '2.3 Other hazards\n' + S3PLUS), base, 'P-only continuation after an unmarked repeated heading is joined');
// The continuation part adds an H/EUH code or a signal word -> ambiguous -> stops.
assert.strictEqual(extract(only22.slice(0, supp) + pageHeader + only22.slice(supp)).error, MSG, 'repeated heading followed by an EUH code stops');
assert.strictEqual(extract(only22.replace('H412 Harmful', pageHeader + 'H412 Harmful')).error, MSG, 'repeated heading followed by an H code stops');
// Another section or sub-section heading between the two 2.2 headings -> stops.
assert.strictEqual(extract(only22.slice(0, atP) + '2.1 Classification\n' + pageHeader + only22.slice(atP)).error, MSG, 'heading in between stops');
// Two separate SDSs are never combined (each has a signal word / H codes).
assert.strictEqual(extract(only22 + '\n' + only22.replace('Linalool', 'Citral').replace('H412', 'H411')).error, MSG, 'second Section 2.2 with its own label content stops');
assert.strictEqual(extract(S1 + S2 + S3PLUS + '\n' + S1 + OTHER22).error, MSG, 'two complete SDSs stop');
ok('unmarked repeated 2.2 heading: P-only page continuation joined; extra signal word/H/EUH codes or an intervening heading stop; separate SDSs never combined');

// ── 3d. Scoping file failed to load: clear message, nothing extracted ──────
{
  const dom2 = new JSDOM(source, { url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t){ return { width: String(t).length * 6 }; }, drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; } });
      for (const f of ['label-render.js', 'sds-doc-check.js', 'hazard-provenance.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); // no sds-section-scope.js
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {}; w.fetch = async () => ({ ok: true, json: async () => ({}) });
      w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: {user:{id:'00000000-0000-4000-8000-00000000a11d',email:'qa-trial@example.invalid',user_metadata:{}}} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
    } });
  const w2 = dom2.window, d2 = w2.document;
  w2.setApprovedBuilderStep(3); d2.getElementById('smart-paste-input').value = S1 + S2 + S3PLUS;
  d2.getElementById('sds-source-confirm').checked=true; w2.confirmSdsSource();
  assert.doesNotThrow(() => w2.extractSDS(), 'Extract does not throw when the scoping file is missing');
  const e2 = d2.getElementById('smart-paste-scope-error');
  assert(e2.style.display !== 'none' && /couldn’t start because part of this page didn’t load\. Please refresh the page and try again\. Nothing has been extracted\./.test(e2.textContent), 'load-failure message shown');
  assert.strictEqual(w2.eval('S.hStatements'), '', 'nothing extracted');
}
ok('if the scoping file fails to load, Extract shows a refresh message and extracts nothing');

// ── 4. Bare extracts unchanged (and the documented limitation) ──────────
const bare = extract('Signal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P302+P352 P501\nEUH208 Contains Linalool. May produce an allergic reaction.');
assert.strictEqual(bare.error, null); assert(bare.h.startsWith('H317') && bare.signal === 'Warning');
const codesOnly = extract('H317, H412\nP261, P273, P501');
assert.strictEqual(codesOnly.error, null); assert.strictEqual(codesOnly.h, 'H317, H412');
assert.strictEqual(scopeApi.scope('H317 H412\nLinalool H317 d-Limonene H226 H304').status, 'whole', 'limitation: unstructured text without headings is read as pasted');
ok('bare Section 2.2 extracts and code lists extract as before (unstructured extra text remains a documented limitation)');

// ── Optional: real documents ────────────────────────────────────────────
const C22 = process.env.SDS_SCOPE_CORPUS_22, CFULL = process.env.SDS_SCOPE_CORPUS_FULL;
if (C22 && CFULL && fs.existsSync(C22) && fs.existsSync(CFULL)) {
  let checked = 0; const bad = [];
  for (const id of fs.readdirSync(C22).sort()) {
    const f22 = path.join(C22, id, 'section-2-2-pasted.txt'), ff = path.join(CFULL, id + '.txt');
    if (!fs.existsSync(f22) || !fs.existsSync(ff)) continue;
    const a = extract(fs.readFileSync(f22, 'utf8')), b = extract(fs.readFileSync(ff, 'utf8'));
    checked++;
    try { assert.strictEqual(a.error, null); assert.strictEqual(b.error, null); same(b, a, id); } catch (e) { bad.push(id); }
  }
  assert.deepStrictEqual(bad, [], 'real whole documents must extract like their Section 2.2 paste');
  ok(`real documents: ${checked} whole documents extract exactly like their Section 2.2 paste`);
}

assert.deepStrictEqual(jsErrors.filter(e => !/Not implemented/.test(e)), [], 'no page errors');
console.log(`\nAll ${n} Smart Paste section-scope checks passed.`);

