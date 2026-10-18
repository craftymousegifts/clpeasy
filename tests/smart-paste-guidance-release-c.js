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
// --- Codes only (no fragrance-oil cue): standalone neutral note. ---
const SUPPLIER = 'Before using this label, check with your supplier for the appropriate CLP classification information for your finished product.';
const SUPPORT = 'Need assistance? Contact support@clpeasy.com.';
const amber = () => box('sds-source-suitability-warning');
const parts = el => [...el.querySelectorAll('strong,p,li')].map(e => e.childNodes.length && e.tagName === 'LI' ? e.lastChild.textContent : e.textContent);
const linkOk = el => { const a = el.querySelector('a'); return a && a.getAttribute('href') === 'mailto:support@clpeasy.com' && a.textContent === 'support@clpeasy.com' && a.style.textDecoration === 'underline' && a.style.color !== ''; };
assert(shown('smart-paste-excluded-note'));
const note = box('smart-paste-excluded-note').textContent;
assert.deepStrictEqual(parts(box('smart-paste-excluded-note')), [
  'Precautionary statements not added: P264, P280, P362+P364',
  'These statements were found in your SDS but were not added to your label.',
  SUPPLIER, SUPPORT], 'standalone note: actual codes, no fragrance-specific claims');
assert(!/fragrance/i.test(note) && !box('smart-paste-excluded-note').querySelector('svg'), 'no bottles or fragrance claims in the neutral note');
assert(linkOk(box('smart-paste-excluded-note')), 'support address is a tappable underlined link');
assert(!box('smart-paste-excluded-note').querySelector('button'), 'no action buttons');
assert(!/workplace|unnecessary|not required|don't apply|do not apply/i.test(note), 'must not describe excluded codes categorically');
assert(shown('sds-source-suitability-warning') && amber().dataset.suitability === 'unverified');
assert(!amber().classList.contains('field-alert-warn'), 'neutral info line stays low-key');
ok('codes only: standalone neutral note with the actual codes');

r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P270 P302+P352 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501']);
assert.deepStrictEqual(parts(box('smart-paste-excluded-note')).slice(0, 2), [
  'Precautionary statement not added: P270', 'This statement was found in your SDS but was not added to your label.']);
ok('codes only: singular wording');

// --- Neither: no warning boxes. ---
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
assert(!shown('smart-paste-excluded-note') && !amber().classList.contains('field-alert-warn'), 'neither warning');
ok('neither condition: no warning boxes');

// --- Fragrance cue only: amber box, no P-statement bullet. ---
const FRAG = 'This appears to be information for concentrated fragrance oil, rather than your finished product. CLPeasy does not recalculate hazards for different fragrance percentages.';
const bullets = () => [...amber().querySelectorAll('li')].map(li => [li.querySelector('strong').textContent, li.lastChild.textContent]);
r = paste('Fragrance oil supplied at 100% concentration\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P302+P352 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501']);
assert(amber().classList.contains('field-alert-warn') && !shown('smart-paste-excluded-note'));
assert.strictEqual(amber().querySelector('strong').textContent, '⚠️ Check your finished-product CLP information');
assert.deepStrictEqual(bullets(), [['Fragrance concentration', FRAG]]);
assert.deepStrictEqual([...amber().querySelectorAll(':scope > p')].map(e => e.textContent), [SUPPLIER, SUPPORT], 'one supplier-action message');
assert(linkOk(amber()));
assert.strictEqual(amber().querySelectorAll('.sds-bottle-compare svg').length, 2, 'two bottles');
assert.deepStrictEqual([...amber().querySelectorAll('.sds-bottle-compare strong')].map(e => e.textContent), ['Supplier SDS', '100%', 'Finished product', '10%'], 'captions and bold %');
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('10% fragrance load') && !/volume|v\/v/i.test(amber().textContent));
assert([...amber().querySelectorAll('strong')].every(e => e.style.color === 'inherit'), 'bold text keeps the amber-brown colour');
assert(!/90%/.test(amber().textContent), 'no remainder percentage');
// Blank percentage: neutral placeholder, nothing invented.
box('frag-load').value = ''; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('Fragrance % not entered'));
assert.deepStrictEqual([...amber().querySelectorAll('.sds-bottle-compare strong')].map(e => e.textContent), ['Supplier SDS', '100%', 'Finished product']);
// Dynamic: a new fragrance load updates the bottle.
box('frag-load').value = '6.5%'; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('6.5% fragrance load'));
ok('fragrance cue only: amber box with bottles, fragrance bullet, single supplier message');

// --- Both: one combined amber box, plural and singular. ---
r = paste('Fragrance oil supplied at 100% concentration\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P264 P270 P280 P302+P352 P501');
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P302+P352', 'P501'], 'extraction unchanged');
assert(amber().classList.contains('field-alert-warn') && !shown('smart-paste-excluded-note'), 'combined: no separate grey note');
assert.deepStrictEqual(bullets(), [['Fragrance concentration', FRAG],
  ['Precautionary statements not added: P264, P270, P280', 'These statements were found in your SDS but were not added to your label. Some may relate to concentrated fragrance oil rather than your finished product.']]);
assert.strictEqual((amber().textContent.match(/check with your supplier/g) || []).length, 1, 'supplier advice not duplicated');
r = paste('Product name: Rose Fragrance Oil\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 P261 P280 P302+P352 P501');
assert.strictEqual(amber().dataset.suitability, 'possible');
assert.deepStrictEqual(bullets()[1], ['Precautionary statement not added: P280', 'This statement was found in your SDS but was not added to your label. It may relate to concentrated fragrance oil rather than your finished product.']);
assert(!shown('smart-paste-excluded-note'));
ok('both: one combined amber box with the actual codes (plural and singular)');

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
