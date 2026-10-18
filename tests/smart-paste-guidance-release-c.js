// Release C (Oct 2026): Smart Paste guidance only.
//   1. SDS suitability note (ported from draft #234): amber for a neat /
//      named fragrance-oil SDS, a low-key neutral note after every other
//      successful extraction.
//   2. "Not added automatically" note naming exactly the codes the existing
//      Smart Paste exclusion left out (the exclusion itself is unchanged).
//   3. Blocked-code guidance wording (the block itself is unchanged).
//   4. Fragrance calculator no longer claims a supplier-document comparison.
// Guidance is display-only: extracted codes, blocking and the exported label
// are asserted unchanged for the same input.
// Run from the repo root: node tests/smart-paste-guidance-release-c.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const __sdsAns = require('./helpers/sds-doc-answer').installed;

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };

// ── 1. Suitability checker (rules from #234; neutral wording per owner) ──
const checker = require('../sds-source-suitability.js');
const inspect = (s, pct = 10) => checker.inspect(s, 'Scented Candle', pct);
assert.strictEqual(inspect('Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil').level, 'concentrate');
assert.strictEqual(inspect('Neat fragrance oil\nH317 P305+P351+P338').level, 'concentrate');
assert.strictEqual(inspect('Fragrance oil supplied at 100% concentration\nH317').level, 'concentrate');
assert.strictEqual(inspect('This fragrance oil is supplied undiluted.\nH317').level, 'concentrate');
assert.strictEqual(inspect('Product name: Heather Fragrance Oil\nSection 2.2 Label elements').level, 'possible');
assert.strictEqual(inspect('SECTION 2.2 Label elements\nH317\nP305+P351+P338').level, 'unverified');
assert.strictEqual(inspect('Product: Scented candle, 10% fragrance\nH317').level, 'unverified', 'a matching number must not certify suitability');
for (const raw of ['SECTION 2.2\nLinalool at 100% concentration\nH317', 'Fragrance oil at 10% concentration in candle wax\nH317'])
  assert.notStrictEqual(inspect(raw).level, 'concentrate', 'incidental percentages are not proof of a neat oil: ' + raw);
assert.strictEqual(inspect('Fragrance oil supplied at 100% concentration\nH317').message,
  'This appears to be a 100% fragrance-oil SDS, not information for your finished scented candle at 10% fragrance. CLPeasy does not adjust hazards for fragrance percentages. Check with your supplier before using this label.');
assert.strictEqual(inspect('Product name: Heather Fragrance Oil\nH317').message,
  'This SDS names fragrance oil, but may not cover your finished scented candle at 10% fragrance. CLPeasy does not adjust hazards for fragrance percentages. Check the original supplier document.');
assert.strictEqual(inspect('SECTION 2.2\nH317').message,
  'Section 2.2 does not confirm whether this SDS covers your finished scented candle at 10% fragrance. CLPeasy does not adjust hazards for fragrance percentages. Check the applicable finished-product classification information with your supplier or a competent CLP specialist.');
assert(checker.inspect('SECTION 2.2\nH317', 'Scented Candle', '').message.includes('at your fragrance percentage'));
for (const raw of ['Product: Heather Fragrance Oil\nConcentration: 100% fragrance oil', 'Product name: Heather Fragrance Oil\nH317', 'SECTION 2.2\nH317'])
  assert(inspect(raw).message.length < 320, 'note stays concise on mobile');
ok('suitability checker: levels, approved wording, concise');

// ── 2. Builder wiring, calculator wording, unchanged exclusion list ───────
const builderSrc = read('builder.html');
assert(builderSrc.includes('<script src="sds-source-suitability.js"></script>'));
assert(builderSrc.includes('id="sds-source-suitability-warning"') && builderSrc.includes('id="smart-paste-excluded-note"'));
assert(!builderSrc.includes('compares this figure exactly with your supplier document'), 'calculator must not claim a supplier-document comparison');
assert(builderSrc.includes('Check that your supplier’s CLP information applies to this finished-product percentage. CLPeasy does not verify this or recalculate hazards.'));
for (const code of ['P272', 'P264', 'P270', 'P280', 'P303+P361+P353', 'P362', 'P362+P364', 'P363', 'P405'])
  assert(new RegExp(`const _pExclude=\\[[^\\]]*'${code.replace(/\+/g,'\\+')}'`).test(builderSrc), `Smart Paste exclusion list must still contain ${code}`);
assert(!builderSrc.includes('remove it if it was entered in error') && (builderSrc.match(/correct it if it was entered in error/g)||[]).length === 2, 'download banner says correct, not remove');
ok('builder wiring present; calculator and banner wording corrected; exclusion list unchanged');

// ── 3. Behaviour in the Builder (jsdom) ──────────────────────────────────
const source = builderSrc.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const emptyQuery = { select(){ return this; }, eq(){ return this; }, update(){ return this; }, upsert(){ return this; },
  single(){ return Promise.resolve({ data:null, error:null }); }, then(r){ return Promise.resolve({ data:null, error:null }).then(r); } };
const vc = new VirtualConsole(); const jsErrors = []; vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({ font:'',
      measureText(t){ const s=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12; return { width:[...String(t)].reduce((w,c)=>w+s*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0) }; },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; } });
    window.eval(read('label-render.js')); window.eval(read('sds-doc-check.js')); window.eval(read('sds-source-suitability.js'));
    window.eval(read('label-library.js')); window.eval(read('entitlement.js'));
    window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data:{ session:null } }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }), signOut: async () => ({}) },
      from: () => Object.create(emptyQuery), rpc: async () => ({ data:false, error:null }) }) };
  }
});
__sdsAns(dom);
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
const shown = id => box(id).style.display !== 'none';
function paste(text){
  window.selectShape('rectangle'); window.selectSize('custom');
  box('custom-w').value = '99'; box('custom-h').value = '67'; window.onDimInput();
  box('scent-name').value = 'Synthetic'; box('product-type').value = 'Scented Candle'; box('frag-load').value = '10%';
  window.setApprovedBuilderStep(3);
  box('smart-paste-input').value = text; window.extractSDS();
  for (const [id, v] of [['biz-name','Crafty Mouse Gifts'],['biz-address','1 Test Lane, Exeter, EX1 2AB'],['biz-phone','01632 960000']]) box(id).value = v;
  window.readForm(); window.updateLabel();
  return { p: [...window.eval('S.pSelected')], blocked: !!window._labelBlockDownload };
}

// Workplace codes: removed exactly as before, and now named.
let r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P264 P280 P302+P352 P362+P364 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501'], 'extracted codes unchanged by Release C');
assert.strictEqual(r.blocked, false);
assert(shown('smart-paste-excluded-note'));
const note = box('smart-paste-excluded-note').textContent;
const noteParts = () => [...box('smart-paste-excluded-note').querySelectorAll('strong,p')].map(e => e.textContent);
assert.deepStrictEqual(noteParts(), [
  'Precautionary statements not added: P264, P280, P362+P364',
  'These statements were found in your SDS but were not added to your label. Some may relate to concentrated fragrance oil rather than your finished product.',
  'Please check with your supplier that you have the appropriate CLP classification information for your finished product before using this label.',
  'If you need further assistance, contact support@clpeasy.com.'], 'approved plural wording with the actual codes');
const mail = box('smart-paste-excluded-note').querySelector('a');
assert(mail && mail.getAttribute('href') === 'mailto:support@clpeasy.com' && mail.textContent === 'support@clpeasy.com', 'support address is an email link');
assert(!box('smart-paste-excluded-note').querySelector('button'), 'no action buttons');
assert(!/workplace|unnecessary|not required|don't apply|do not apply/i.test(note), 'must not describe excluded codes categorically');
assert(shown('sds-source-suitability-warning') && box('sds-source-suitability-warning').dataset.suitability === 'unverified');
assert(!box('sds-source-suitability-warning').classList.contains('field-alert-warn'), 'neutral note stays low-key');
ok('excluded codes listed exactly; selection, blocking and neutral note correct');

// One code left out: singular wording.
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P270 P302+P352 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501']);
assert.deepStrictEqual(noteParts().slice(0, 2), [
  'Precautionary statement not added: P270',
  'This statement was found in your SDS but was not added to your label. It may relate to concentrated fragrance oil rather than your finished product.']);
ok('singular wording when one code was left out');

// No excluded codes: no excluded note.
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
assert(!shown('smart-paste-excluded-note'), 'no note when nothing was left out');
ok('no excluded note when nothing was left out');

// Neat oil: amber warning; codes unchanged.
r = paste('Fragrance oil supplied at 100% concentration\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501']);
assert(box('sds-source-suitability-warning').classList.contains('field-alert-warn'));
assert(box('sds-source-suitability-warning').textContent.includes('Check this is information for your finished product'));
const AMBER_WORDING = ['This appears to be information for concentrated fragrance oil, rather than your finished product.',
  'CLPeasy does not recalculate hazards for different fragrance percentages.',
  'Check with your supplier for the appropriate CLP classification information for your finished product before using this label.'];
const amber = () => box('sds-source-suitability-warning');
assert.deepStrictEqual([...amber().querySelectorAll('p')].map(e => e.textContent), AMBER_WORDING, 'exact approved amber wording');
assert.strictEqual(amber().querySelectorAll('.sds-bottle-compare svg').length, 2, 'two bottles');
assert.deepStrictEqual([...amber().querySelectorAll('.sds-bottle-compare strong')].map(e => e.textContent), ['Supplier SDS', '100%', 'Your product', '10%'], 'percentages bold');
assert(!/90%|100%[^]*100%/.test(amber().querySelector('.sds-bottle-compare').textContent.replace('100% concentrated', '')), 'no second 100% or remainder');
// Blank percentage: neutral placeholder, nothing invented.
r = paste('Fragrance oil supplied at 100% concentration\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
box('frag-load').value = ''; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('Fragrance % not entered'));
assert.deepStrictEqual([...amber().querySelectorAll('.sds-bottle-compare strong')].map(e => e.textContent), ['Supplier SDS', '100%', 'Your product']);
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501'], 'extraction unchanged');
// "Names fragrance oil" amber level uses the same approved design.
r = paste('Product name: Rose Fragrance Oil\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
assert.strictEqual(amber().dataset.suitability, 'possible');
assert.deepStrictEqual([...amber().querySelectorAll('p')].map(e => e.textContent), AMBER_WORDING);
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501']);
ok('neat-oil SDS shows the amber suitability warning and approved two-bottle design without changing extraction');

// Unrecognised codes still kept and still block; new guidance shown.
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction. H319 Causes serious eye irritation.\nP102 P240 P310 P305+P351+P338 P501');
assert.deepStrictEqual(r.p, ['P102', 'P240', 'P310', 'P305+P351+P338', 'P501'], 'unrecognised codes are kept, not discarded');
assert.strictEqual(r.blocked, true, 'unrecognised codes still block downloads');
box('hazard-confirm').checked = true; window.__lastAlert = undefined;
assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'Step 3 still blocked');
const msg = window.__lastAlert || '';
assert(msg.startsWith("Some codes can't be added to this label") && /P240, P310/.test(msg), msg);
assert(/Required codes must be resolved, not removed or changed just to enable downloads/.test(msg));
assert(/Combining the Section 2\.2 statements from several ingredient SDSs does not establish the classification of the finished mixture/.test(msg));
assert(/competent CLP specialist/.test(msg));
ok('unrecognised codes kept and blocked; guidance explains resolve-not-remove and mixtures');

// Loading a different saved label hides both notes (display only).
paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P264 P280 P302+P352 P501');
assert(shown('smart-paste-excluded-note') && shown('sds-source-suitability-warning'));
try { window.loadLabelRecord({ id:'saved-other', scentName:'Other', productType:'Wax Melt', shape:'circle', size:63, hStatements:'', pStatements:'', sensitisers:[], pictograms:[] }); } catch (e) { /* saved-label list refresh needs a signed-in library; not under test */ }
assert(!shown('sds-source-suitability-warning') && !shown('smart-paste-excluded-note'), 'notes from an earlier paste must not stay on a loaded label');
assert.deepStrictEqual([...(window._smartPasteExcludedCodes || [])], []);
ok('loading a different saved label hides the earlier guidance');

// Clearing hazard data hides both notes.
window.clearHazardData();
assert(!shown('sds-source-suitability-warning') && !shown('smart-paste-excluded-note'));
ok('clearing hazard data hides the guidance');

assert.deepStrictEqual(jsErrors.filter(e => !/Not implemented/.test(e)), [], 'no page errors');
console.log(`\nAll ${n} Release C checks passed.`);
