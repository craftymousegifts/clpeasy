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
  'Section 2.2 may not confirm whether this SDS applies to your finished scented candle at 10% fragrance. CLPeasy does not recalculate hazards for different fragrance percentages. Check that your supplier’s classification information applies to your finished product.');
assert.strictEqual(inspect('SECTION 2.2\nH317').target, 'your finished scented candle at 10% fragrance');
ok('suitability checker: levels, approved wording, concise');

// Apparent match / detected mismatch (owner-approved, Oct 2026). Only one
// explicit diluted-form statement in the SDS product name counts; anything
// ambiguous or incomplete falls back to the neutral "unverified" notice.
const lvl = (name, type, pct) => checker.inspect('Product: ' + name + '\nH317', type, pct).level;
const NAG10 = 'Nikura | Nag Champa Fragrance Oil (10% in Candle Wax)';
assert.strictEqual(lvl(NAG10, 'Scented Candle', '10%'), 'match');
assert.strictEqual(lvl('Positivity Essential Oil Blend (10% in Candle Wax)', 'Pillar Candle', 10), 'match');
assert.strictEqual(lvl('Rose Fragrance Oil 10% in wax melts', 'Wax Melt', '10%'), 'match');
assert.strictEqual(lvl('Rose Fragrance Oil (25% in reed diffuser base)', 'Reed Diffuser', '25%'), 'match');
assert.strictEqual(lvl('Rose Fragrance Oil (10.5% in Candle Wax)', 'Scented Candle', '10.5'), 'match');
const m = checker.inspect('Product: ' + NAG10 + '\nH317', 'Scented Candle', '10%');
assert.deepStrictEqual([m.describes, m.productPhrase], ['10% in candle wax', 'your scented candle at 10% fragrance']);
// Known mismatch: different percentage, or a different known product type.
for (const [name, type, pct] of [[NAG10, 'Scented Candle', '6%'], [NAG10, 'Room Spray', '10%'], [NAG10, 'Wax Melt', '10%'], [NAG10, 'Car Diffuser', '10%'],
  ['Rose Fragrance Oil (10% in soy wax)', 'Scented Candle', '8%'], ['FRAG0541 Elderflower Fragrance Oil (@10% Dilution)', 'Scented Candle', '6%'],
  ['Rose Fragrance Oil (25% in reed diffuser base)', 'Car Diffuser', '25%']])
  assert.strictEqual(lvl(name, type, pct), 'mismatch', name + ' / ' + type + ' / ' + pct);
// Ambiguous or incomplete: neutral notice, never a match.
for (const [name, type, pct] of [[NAG10, 'Scented Candle', ''], [NAG10, '', '10%'],
  ['Rose Fragrance Oil (10% in soy wax)', 'Scented Candle', '10%'],              // "soy wax": candle or wax melt?
  ['FRAG0541 Elderflower Fragrance Oil (@10% Dilution)', 'Scented Candle', '10%'], // no product base stated
  ['Rose Fragrance Oil (10% in Candle Wax) / (6% in Candle Wax)', 'Scented Candle', '10%'], // two statements
  ['Rose Fragrance Oil (10% in Candle Wax and other bases)', 'Scented Candle', '10%'],
  ['Scented candle 10% in candle wax', 'Scented Candle', '10%']])              // no oil named
  assert.strictEqual(lvl(name, type, pct), 'unverified', name + ' / ' + type + ' / ' + pct);
assert.strictEqual(checker.inspect('Fragrance oil at 10% concentration in candle wax\nH317', 'Scented Candle', '10%').level, 'unverified', 'free text, not the product name: neutral');
assert.strictEqual(checker.inspect('SECTION 2.2\nH317', 'Scented Candle', '10%').level, 'unverified', 'Section 2.2 only: neutral');
// Neat-oil names, and neat-oil cues, keep the concentrated-oil warning.
for (const name of ['Nikura | Nag Champa Fragrance Oil', 'Nikura | Snow Angel Inspired Fragrance Oil | Snow Pixie', 'Heather Fragrance Oil 100ml'])
  assert.strictEqual(inspect('Product: ' + name + '\nH317').level, 'possible', name);
assert.strictEqual(inspect('Product: Rose Fragrance Oil (10% in Candle Wax)\nConcentration: 100% fragrance oil').level, 'concentrate', 'a neat-oil statement still wins');
assert(checker.inspect('SECTION 2.2\nH317', 'Scented Candle', '').message.includes('at your fragrance percentage'));
ok('suitability checker: apparent match, known mismatch, neutral when ambiguous; neat oils keep the amber warning');

// ── 2. Builder wiring and calculator wording; retired exclusion (D5) ─────
const builderSrc = read('builder.html');
assert(builderSrc.includes('<script src="sds-source-suitability.js"></script>'));
assert(builderSrc.includes('id="sds-source-suitability-warning"'));
// D5 (Michaela, 25 Oct 2026): supplier statements are no longer excluded, so the
// "Precautionary statements not added" notice is removed with its code.
assert(!builderSrc.includes('smart-paste-excluded-note') && !builderSrc.includes('_smartPasteExcluded') && !/Precautionary statements? not added/.test(builderSrc), 'obsolete "not added" notice removed');
assert(!builderSrc.includes('compares this figure exactly with your supplier document'), 'calculator must not claim a supplier-document comparison');
assert(builderSrc.includes('Check that your supplier’s CLP information applies to this finished-product percentage. CLPeasy does not verify this or recalculate hazards.'));
assert(!/const _pExclude=/.test(builderSrc), 'no Smart Paste exclusion list (#270, founder direction 22/25 Oct 2026)');
assert(!builderSrc.includes('remove it if it was entered in error') && (builderSrc.match(/correct it if it was entered in error/g)||[]).length === 2, 'download banner says correct, not remove');
ok('builder wiring present; calculator and banner wording corrected; exclusion list and its notice removed');

// ── 3. Behaviour in the Builder (jsdom) ──────────────────────────────────
// #270 keeps the supplier's own Section 2.2 wording, so fixtures paste full
// statements rather than bare codes (bare codes are blocked, never completed).
const PW = { P102:'Keep out of reach of children.', P261:'Avoid breathing vapours.', P264:'Wash hands thoroughly after handling.',
  P270:'Do not eat, drink or smoke when using this product.', P273:'Avoid release to the environment.', P280:'Wear protective gloves.',
  'P302+P352':'IF ON SKIN: Wash with plenty of water.', 'P333+P313':'If skin irritation or rash occurs: Get medical advice/attention.',
  'P362+P364':'Take off contaminated clothing and wash it before reuse.', P501:'Dispose of contents/container in accordance with local regulations.' };
const W = codes => codes.split(' ').map(c => c + ' ' + PW[c]).join('\n');
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
    window.eval(read('sds-supplier-wording.js')); window.eval(read('label-render.js')); window.eval(read('sds-doc-check.js')); window.eval(read('hazard-provenance.js')); window.eval(read('sds-section-scope.js')); window.eval(read('sds-source-suitability.js'));
    window.eval(read('label-library.js')); window.eval(read('entitlement.js'));
    window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data:{ session:{user:{id:'00000000-0000-4000-8000-00000000a11d',email:'qa-trial@example.invalid',user_metadata:{}}} } }),
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

// Formerly excluded supplier statements are now kept with their wording.
let r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P102 P261 P264 P280 P302+P352 P362+P364 P501'));
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P264', 'P280', 'P302+P352', 'P362+P364', 'P501'], 'every supplied P statement is kept');
assert.strictEqual(r.blocked, false);
// --- No fragrance-oil cue: teal 1B notice only (no codes notice any more). ---
const SUPPORT = 'Need help? Contact support@clpeasy.com.';
const amber = () => box('sds-source-suitability-warning');
const EMPH = e => e.tagName === 'STRONG' && !e.style.display; // inline emphasis, not a heading
const parts = el => [...el.querySelectorAll('strong,p')].filter(e => !EMPH(e)).map(e => e.textContent);
const emph = el => [...el.querySelectorAll('strong')].filter(EMPH).map(e => e.textContent);
const linkOk = el => { const a = el.querySelector('a'); return a && a.getAttribute('href') === 'mailto:support@clpeasy.com' && a.textContent === 'support@clpeasy.com' && a.style.textDecoration === 'underline' && a.style.color !== ''; };
const links = () => document.querySelectorAll('#sds-source-suitability-warning a').length;
assert(!document.getElementById('smart-paste-excluded-note'), 'no "not added" notice element');
assert(shown('sds-source-suitability-warning') && amber().dataset.suitability === 'unverified');
assert(amber().classList.contains('field-alert-info') && !amber().classList.contains('field-alert-warn') && amber().getAttribute('role') === 'status');
assert(amber().querySelector('svg[aria-hidden="true"]'), 'information icon');
assert.deepStrictEqual(parts(amber()), ['Check your SDS suitability',
  'Section 2.2 may not confirm whether this SDS applies to your finished scented candle at 10% fragrance.',
  'CLPeasy does not recalculate hazards for different fragrance percentages. Check that your supplier’s classification information applies to your finished product.', SUPPORT]);
assert.deepStrictEqual(emph(amber()), ['not']);
assert(linkOk(amber()) && links() === 1, 'support link shown once, on the teal notice');
ok('1B neutral notice with the support link; supplied statements kept');

r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P102 P261 P270 P302+P352 P501'));
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P270', 'P302+P352', 'P501']);
ok('formerly excluded P270 kept with its supplier wording');

// --- No excluded codes: teal notice carries the support link. ---
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P102 P261 P302+P352 P501'));
assert(!amber().classList.contains('field-alert-warn'));
assert(linkOk(amber()) && links() === 1);
ok('support link on the teal notice');

// --- 1A apparent match (teal). ---
const S22 = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P102 P261 P280 P302+P352 P501');
r = paste('Product: ' + NAG10 + '\n' + S22);
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P280', 'P302+P352', 'P501'], 'extraction keeps every supplied statement');
assert.strictEqual(amber().dataset.suitability, 'match');
assert(amber().classList.contains('field-alert-info') && !amber().querySelector('.sds-bottle-compare'));
assert.deepStrictEqual(parts(amber()), ['SDS appears to match your product',
  'This SDS describes 10% in candle wax, which appears to match your scented candle at 10% fragrance.',
  'CLPeasy does not independently verify or recalculate this classification. Check that the SDS is current and applies to your finished product.', SUPPORT]);
assert.deepStrictEqual(emph(amber()), ['not']);
assert(!/approved|verified|compliant/i.test(amber().textContent.replace('does not independently verify', '')), 'no approval claim');
assert(links() === 1);
ok('1A apparent match: teal, approved wording, no bottles, no approval claim');

// --- 1C known mismatch (amber, no bottles) + size note. ---
r = paste('Product: ' + NAG10 + '\n' + S22.replace('\nP280 Wear protective gloves.', ''));
box('frag-load').value = '6%'; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert.strictEqual(amber().dataset.suitability, 'mismatch');
assert(amber().classList.contains('field-alert-warn') && amber().getAttribute('role') === 'alert');
assert(!amber().querySelector('.sds-bottle-compare'), 'no bottles for a diluted-SDS mismatch');
assert.deepStrictEqual(parts(amber()), ['⚠️ Check your SDS suitability',
  'This SDS describes 10% in candle wax, but your product is a scented candle at 6% fragrance.',
  'CLPeasy does not recalculate hazards for different fragrance percentages. Ask your supplier for classification information for your finished product at 6%.', SUPPORT]);
assert.deepStrictEqual(emph(amber()), ['10% in candle wax', '6%', 'not']);
assert(linkOk(amber()) && links() === 1, 'support link on the amber warning');
box('product-type').value = 'Room Spray'; box('frag-load').value = '10%'; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert.strictEqual(amber().dataset.suitability, 'mismatch');
assert(amber().textContent.includes('but your product is a room spray at 10% fragrance.'));
ok('1C known mismatch: amber, no bottles, percentage and product-type wording');

// --- 2 concentrated fragrance oil (amber with the unchanged bottles). ---
r = paste('Fragrance oil supplied at 100% concentration\n' + S22);
assert.deepStrictEqual(r.p, ['P102', 'P261', 'P280', 'P302+P352', 'P501']);
assert(amber().classList.contains('field-alert-warn'));
assert.deepStrictEqual(parts(amber()).filter(t => !/^(Supplier SDS|100%|Finished product|10%)$/.test(t)), ['⚠️ This SDS may be for concentrated fragrance oil',
  'Your supplier’s SDS appears to describe concentrated fragrance oil, not your finished product.',
  'You need classification information for your finished scented candle at 10% fragrance. Ask your supplier for it before using this label.',
  'CLPeasy does not recalculate hazards for different fragrance percentages.', SUPPORT]);
assert.deepStrictEqual(emph(amber()).filter(t => !/^(Supplier SDS|100%|Finished product|10%)$/.test(t)), ['concentrated fragrance oil', 'not', 'not']);
assert.strictEqual(amber().querySelectorAll('.sds-bottle-compare svg').length, 2, 'two bottles');
assert.deepStrictEqual([...amber().querySelectorAll('.sds-bottle-compare strong')].map(e => e.textContent), ['Supplier SDS', '100%', 'Finished product', '10%'], 'captions and bold %');
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('10% fragrance load') && !/90%|volume|v\/v/i.test(amber().textContent));
assert(!amber().querySelector('li') && !/not added/.test(amber().textContent), 'codes are not repeated inside the amber warning');
assert(links() === 1, 'support link shown once');
box('frag-load').value = ''; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('Fragrance % not entered'));
box('frag-load').value = '6.5%'; window.readForm(); window.updateSdsSourceSuitabilityWarning();
assert(amber().querySelector('.sds-bottle-compare').textContent.includes('6.5% fragrance load'));
r = paste('Product name: Rose Fragrance Oil\n' + S22);
assert.strictEqual(amber().dataset.suitability, 'possible');
assert.strictEqual(amber().querySelector('strong').textContent, '⚠️ This SDS may be for concentrated fragrance oil');
ok('2 concentrated oil: amber with unchanged bottles');

// --- Label-size note: Step 3 size panel, amber warnings only. ---
const sizeNote = () => (box('smart-paste-size-warning').querySelector('.fit-sds-note') || {}).textContent || null;
const tooSmall = () => { window.selectShape('circle'); window.selectSize('custom'); box('custom-w').value = '52'; box('custom-h').value = '52'; window.onDimInput(); window.readForm(); window.updateLabel(); };
const BIG = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nEUH208 Contains Amyl cinnamic aldehyde, Citronellol, Coumarin, Linalyl acetate, d-Limonene. May produce an allergic reaction.\n' + W('P261 P273 P302+P352 P333+P313 P501');
paste('Fragrance oil supplied at 100% concentration\n' + BIG); tooSmall();
assert(window._labelBlockDownload && box('smart-paste-size-warning').innerHTML.includes('fit-heading'), 'size panel shown');
assert.strictEqual(sizeNote(), 'A larger label makes room for the text. It does not resolve the SDS warning above.');
assert.strictEqual(box('smart-paste-size-warning').querySelector('.fit-sds-note strong').textContent, 'not');
paste('Product: ' + NAG10 + '\n' + BIG); box('frag-load').value = '6%'; tooSmall();
assert.strictEqual(window.eval('_sdsSuitability()').level, 'mismatch'); assert(sizeNote(), 'mismatch: size note');
paste('Product: ' + NAG10 + '\n' + BIG); tooSmall();
assert.strictEqual(window.eval('_sdsSuitability()').level, 'match'); assert.strictEqual(sizeNote(), null, 'teal match: no size note');
paste(BIG); tooSmall();
assert.strictEqual(sizeNote(), null, 'teal 1B: no size note');
assert(!/fit-sds-note/.test(box('label-warning') ? box('label-warning').innerHTML : ''), 'only the Step 3 size panel carries the note');
ok('size note: shown with amber concentrated-oil and mismatch warnings only; fitting unchanged');

// Codes copied without supplier wording are kept and block; never completed by CLPeasy.
r = paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction. H319 Causes serious eye irritation.\nP102 P240 P310 P305+P351+P338 P501');
assert.deepStrictEqual(r.p, ['P102', 'P240', 'P310', 'P305+P351+P338', 'P501'], 'codes are kept, not discarded');
assert.strictEqual(r.blocked, true, 'codes without supplier wording block downloads');
box('hazard-confirm').checked = true; window.__lastAlert = undefined;
assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'Step 3 still blocked');
const msg = window.__lastAlert || '';
assert(/Supplier statement wording needs review/.test(msg) && /P102/.test(msg), msg);
ok('codes without supplier wording kept and blocked; Step 3 asks for supplier wording');

// Loading a different saved label hides both notes (display only).
paste('2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P102 P261 P264 P280 P302+P352 P501'));
assert(shown('sds-source-suitability-warning'));
try { window.loadLabelRecord({ id:'saved-other', scentName:'Other', productType:'Wax Melt', shape:'circle', size:63, hStatements:'', pStatements:'', sensitisers:[], pictograms:[] }); } catch (e) { /* saved-label list refresh needs a signed-in library; not under test */ }
assert(!shown('sds-source-suitability-warning'), 'notes from an earlier paste must not stay on a loaded label');
ok('loading a different saved label hides the earlier guidance');

// Clearing hazard data hides both notes.
window.clearHazardData();
assert(!shown('sds-source-suitability-warning'));
ok('clearing hazard data hides the guidance');

// With the Section 2.2 scope fix (#261): only Section 2.2 statements are
// extracted, and a stopped paste shows no guidance boxes.
const SDS = 'SECTION 1: Identification\nProduct name: Synthetic\nSECTION 2: Hazards identification\n' +
  '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\n' + W('P261 P280 P501') + '\n2.3 Other hazards\nNone.\n' +
  'SECTION 3: Composition\nH226 H304 P264 P405\nSECTION 4: First aid measures\nP362+P364\n';
r = paste(SDS);
assert.deepStrictEqual(r.p, ['P261', 'P280', 'P501'], 'only Section 2.2 statements extracted');
paste(SDS + '\n' + SDS.replace('Signal word: Warning', 'Signal word: Danger'));
assert(shown('smart-paste-scope-error') && !shown('sds-source-suitability-warning'), 'stop hides guidance');
assert.deepStrictEqual([...window.eval('S.hStatements')], []);
ok('with the Section 2.2 scope: only Section 2.2 statements; a stopped paste shows no guidance');

assert.deepStrictEqual(jsErrors.filter(e => !/Not implemented/.test(e)), [], 'no page errors');
console.log(`\nAll ${n} Release C checks passed.`);
