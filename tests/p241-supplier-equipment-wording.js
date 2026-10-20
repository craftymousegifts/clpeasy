// P241 supplier equipment wording (Stage A, draft PR #233, 20 Oct 2026).
// GB CLP Annex IV: "Use explosion-proof [electrical/ventilating/lighting/…]
// equipment." The bracketed text is the supplier's choice, so CLPeasy must
// neither drop equipment words the supplier's Section 2.2 gives nor choose
// any itself. Checks:
//   1. Verification: only electrical / ventilating / lighting, joined by
//      commas, "/", "and" or "or", are accepted; "…", other equipment or
//      conflicting sentences can't be printed and block.
//   2. Genuine Nikura Section 2.2 texts (tests/fixtures/
//      p241-nikura-section-2-2.json): Positivity keeps "electrical,
//      ventilating and lighting"; the three whose Section 2.2 has no P241
//      get no P241.
//   3. Builder: Step 3 gate, save/reopen, re-extraction and Clear never keep
//      stale wording; an extracted label saved before the field existed
//      blocks; a manually entered P241 prints the base text.
//   4. The same saved record prints the same wording through the shared
//      renderer (preview and export SVG, as used by the Composer).
//   5. Remediation after independent review: Unicode hyphens, invisible
//      characters and wrapped lines (B1); empty parts and spacing (N1);
//      legacy records in the shared renderer (S1); P241-specific block
//      messages in Builder, overlay, help panel and Composer (S2).
// Run from the repo root: node tests/p241-supplier-equipment-wording.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const fixture = require('./fixtures/p241-nikura-section-2-2.json');
const source = fs.readFileSync('builder.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const emptyQuery = { select(){ return this; }, eq(){ return this; }, update(){ return this; }, upsert(){ return this; },
  single(){ return Promise.resolve({ data:null, error:null }); }, then(r){ return Promise.resolve({ data:null, error:null }).then(r); } };
const vc = new VirtualConsole(); const jsErrors = []; vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(source, { url: 'https://local.clpeasy.test/builder.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t){ const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((a, c) => a + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; } });
    for (const f of ['label-render.js', 'sds-doc-check.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
const LR = window.LabelRenderer;
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };
const drawn = svg => (svg.match(/>([^<>]+)</g) || []).map(s => s.slice(1, -1)).join(' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const FULL = 'Use explosion-proof electrical, ventilating and lighting equipment';
const BASE = 'Use explosion-proof equipment';

// ── 1. Verification rules ───────────────────────────────────────────────
const ex = LR.extractP241Equipment;
assert.strictEqual(ex('P241, Use explosion-proof electrical, ventilating and lighting equipment.'), 'electrical, ventilating and lighting');
assert.strictEqual(ex('P241 Use explosion-proof electrical/ventilating/lighting equipment.'), 'electrical/ventilating/lighting');
assert.strictEqual(ex('P241 Use explosion proof electrical equipment.'), 'electrical');
assert.strictEqual(ex('P241 Use explosion-proof equipment.'), '');
assert.strictEqual(ex('P240 P241 P242'), '', 'code only: the SDS gives no equipment words');
assert.strictEqual(ex('P241 Use explosion-proof electrical/ventilating/lighting/… equipment.'), null, 'unresolved "…" blocks');
assert.strictEqual(ex('P241 Use explosion-proof electrical and pumping equipment.'), null, 'equipment outside the GB list blocks');
assert.strictEqual(ex('P241 Use explosion-proof lighting equipment.\nP241 Use explosion-proof electrical equipment.'), null, 'conflicting sentences block');
assert.strictEqual(ex('Use explosion-proof lighting equipment. Use explosion-proof lighting equipment.'), 'lighting', 'repeated identical sentence is fine');
assert.strictEqual(ex('P241 Use explosion-proof electrical, ventilating and'), null, 'a sentence cut off before "equipment" blocks');
assert.strictEqual(LR.buildP241Wording({ p241Equipment: 'electrical, ventilating and lighting' }), FULL);
assert.strictEqual(LR.buildP241Wording({ p241Equipment: '' , hazardFromExtraction: true }), BASE);
assert.strictEqual(LR.buildP241Wording({ hazardFromExtraction: false }), BASE, 'manual entry: base text');
assert.strictEqual(LR.buildP241Wording({ hazardFromExtraction: true }), null, 'extracted label without the field blocks');
assert.strictEqual(LR.buildP241Wording({ p241Equipment: 'electrical and pumping', hazardFromExtraction: true }), null, 'stored words are re-verified');
ok('only Annex IV equipment terms are accepted; unverifiable or conflicting wording blocks');

// ── 2 & 3. Genuine Nikura Section 2.2 in the Builder ───────────────────
function paste(text, opts = {}) {
  window.selectShape('rectangle'); window.selectSize('custom');
  box('custom-w').value = String(opts.w || 150); box('custom-h').value = String(opts.h || 150); window.onDimInput();
  box('scent-name').value = 'P241 check'; box('product-type').value = 'Room Spray'; box('frag-load').value = '10%';
  window.setApprovedBuilderStep(3); window.clearHazardData();
  box('smart-paste-input').value = text;
  if (box('sds-source-confirm')) { box('sds-source-confirm').checked = true; window.confirmSdsSource(); }
  window.extractSDS();
  for (const [id, v] of [['biz-name', 'Test Maker'], ['biz-address', '1 Test Lane, Exeter, EX1 2AB'], ['biz-phone', '01632 960000']]) box(id).value = v;
  window.readForm(); window.updateLabel();
  box('hazard-confirm').checked = true; window.__lastAlert = undefined;
  const leave = window.canLeaveApprovedBuilderStep(3);
  const S = window.eval('S');
  return { S, leave, alert: window.__lastAlert || '', p: [...S.pSelected], eq: S.p241Equipment, unrec: window._unrecognizedCodesGeneric || [] };
}
const byName = name => fixture.cases.find(c => c.name.includes(name));
const pos = byName('Positivity');
let r = paste(pos.section22);
assert(r.p.includes('P241'), 'Positivity Section 2.2 lists P241');
assert.strictEqual(r.eq, 'electrical, ventilating and lighting', 'supplier equipment words kept exactly');
assert(!r.unrec.includes('P241'), 'P241 is not blocked: ' + r.unrec);
assert(/H401/.test(r.alert) && !/P241/.test(r.alert), 'the genuine label is still blocked by H401 only: ' + r.alert);
// The wording itself, rendered for this extracted state with H401 taken out
// of the H list only so the label renders (the genuine label stays blocked).
const posData = Object.assign({}, window.eval('S'), { hStatements: window.eval('S').hStatements.split(', ').filter(c => c !== 'H401').join(', '), customW: 200, customH: 200 });
for (const forExport of [false, true]) {
  const out = LR.renderLabel(posData, { instanceId: 'p241-pos-' + forExport, forExport });
  assert(!out.warnings.includes('unrecognized-code:P241'), JSON.stringify(out.warnings));
  assert(drawn(out.svg).includes(FULL + '.'), (forExport ? 'export' : 'preview') + ' prints the full P241 wording');
  assert(!drawn(out.svg).includes(BASE + '.'), 'the shortened base text is not printed');
}
ok('genuine Positivity Section 2.2: "' + FULL + '" kept in Builder state, preview and export');
for (const name of ['Bergamot', 'Snow Angel', 'Nag Champa']) {
  const c = byName(name);
  r = paste(c.section22);
  assert(!r.p.includes('P241') && r.eq === undefined, name + ': no P241 in Section 2.2, none extracted');
}
ok('genuine Bergamot, Snow Angel and Nag Champa Section 2.2: P241 is not extracted (it appears only outside Section 2.2)');

// Step 3 gate for unverifiable wording.
const head = '2.2 Label elements\nSignal word: Danger\nH226 Flammable liquid and vapour.\n';
r = paste(head + 'P210 Keep away from heat.\nP241 Use explosion-proof electrical/ventilating/lighting/… equipment.\nP501 Dispose of contents.');
assert(r.eq === null && !r.leave && /^P241 needs the equipment wording from your SDS/.test(r.alert) && /won't shorten or guess/.test(r.alert), r.alert);
let out = LR.renderLabel(Object.assign({}, window.eval('S')), { instanceId: 'p241-blocked', forExport: true });
assert(out.blocked && out.warnings.includes('unrecognized-code:P241') && !/Use explosion-proof/.test(drawn(out.svg)), 'unverifiable P241 blocks rendering and prints nothing');
ok('unverifiable equipment wording blocks Step 3 and export; nothing is printed or chosen');

// Re-extraction and Clear never keep stale wording.
paste(pos.section22);
r = paste(head + 'P210 P241 P501');
assert.strictEqual(r.eq, '', 're-extraction replaces the earlier wording');
assert(r.leave, 'code-only P241 passes with the base text: ' + r.alert);
window.clearHazardData();
assert.strictEqual(window.eval('S.p241Equipment'), undefined, 'Clear resets the wording');
ok('re-extraction and Clear reset the P241 wording');

// ── Save / reopen and the shared renderer (Composer path) ───────────────
const base = { scentName: 'Saved', productType: 'Room Spray', shape: 'rectangle', size: 'custom', customW: 150, customH: 150, signal: 'Danger',
  hStatements: 'H226', pStatements: 'P210, P241, P501', sensitisers: [], pictograms: ['flame'], bizName: 'Test Maker', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000' };
const reopen = rec => { try { window.loadLabelRecord(Object.assign({ id: 'p241-' + Math.random() }, rec)); } catch (e) { /* library refresh needs sign-in */ } window.readForm(); window.updateLabel(); return window.eval('S'); };
let S = reopen(Object.assign({}, base, { hazardFromExtraction: true, sdsSignal: 'Danger', p241Equipment: 'electrical, ventilating and lighting' }));
assert.strictEqual(S.p241Equipment, 'electrical, ventilating and lighting');
for (const forExport of [false, true]) assert(drawn(LR.renderLabel(Object.assign({}, base, { hazardFromExtraction: true, p241Equipment: 'electrical, ventilating and lighting' }), { instanceId: 'p241-saved-' + forExport, forExport }).svg).includes(FULL + '.'));
S = reopen(Object.assign({}, base, { hazardFromExtraction: true, sdsSignal: 'Danger' }));
assert.strictEqual(S.p241Equipment, undefined);
out = LR.renderLabel(Object.assign({}, base, { hazardFromExtraction: true }), { instanceId: 'p241-legacy', forExport: true });
assert(out.blocked && out.warnings.includes('unrecognized-code:P241'), 'extracted label saved before the field blocks: ' + JSON.stringify(out.warnings));
out = LR.renderLabel(Object.assign({}, base, { hazardFromExtraction: false }), { instanceId: 'p241-manual', forExport: true });
assert(!out.blocked && drawn(out.svg).includes(BASE + '.'), 'manually entered P241 prints the base text');
ok('saved records reopen with the same wording; renderer (Builder and Composer) prints it; legacy extracted P241 blocks');

// ── Remediation (independent review B1, S1, S2, N1) ─────────────────────
// B1: Unicode hyphens, invisible characters and line-wrapped words from PDF
// copy-paste must never turn supplier equipment wording into base text.
const SUPPLIER = 'electrical/ventilating/lighting';
for (const [label, dash] of [['U+2010 hyphen', '‐'], ['U+2011 non-breaking hyphen', '‑'], ['U+2012 figure dash', '‒'], ['U+2013 en dash', '–'], ['U+2014 em dash', '—'], ['U+2212 minus', '−'], ['U+FE63 small hyphen', '﹣'], ['U+FF0D fullwidth hyphen', '－']]) {
  assert.strictEqual(ex('P241 Use explosion' + dash + 'proof ' + SUPPLIER + ' equipment.'), SUPPLIER, label);
}
assert.strictEqual(ex('P241 Use explo­sion-proof electrical equipment.'), 'electrical', 'soft hyphen');
assert.strictEqual(ex('P241 Use explosion​-proof lighting equipment.'), 'lighting', 'zero-width space');
assert.strictEqual(ex('P241 Use explosion-proof electrical equipment.'), 'electrical', 'non-breaking spaces');
assert.strictEqual(ex('P241 Use explo-\nsion-proof electrical equipment.'), 'electrical', 'word hyphenated across lines');
assert.strictEqual(ex('P241 USE EXPLO-\nSION-PROOF ELECTRICAL EQUIPMENT.'), 'electrical', 'capitals hyphenated across lines');
assert.strictEqual(ex('P241 Use explosion-\r\nproof electrical equipment.'), 'electrical', 'hyphen at line end (CRLF)');
assert.strictEqual(ex('P241 Use explosion-proof electrical, venti-\n    lating and lighting equipment.'), 'electrical, ventilating and lighting', 'equipment word wrapped across lines');
assert.strictEqual(ex('P241 Use explosion-proof electrical,\n    ventilating and lighting\n    equipment.'), 'electrical, ventilating and lighting', 'sentence wrapped across lines');
// Evidence of equipment wording that can't be read exactly blocks (never '').
assert.strictEqual(ex('P241 Use explo sion-proof electrical equipment.'), null, 'broken word with an unmatched "proof"');
assert.strictEqual(ex('P241 Use explo sion pr oof ventilating equipment.'), null, '"ventilating" without a readable sentence');
assert.strictEqual(ex('P241 Use explosion-protected lighting equipment.'), null, 'non-standard sentence');
assert.strictEqual(ex('P241 Use explosion-proof electrical equipment. P282 Wear flameproof gloves.'), null, 'an extra "proof" mention can\'t be accounted for');
// Re-review F1: equipment words placed after "equipment", or a second
// unmatched explosion-protection phrase, must block (never base text or a
// shortened list).
for (const t of ['P241 Use explosion-proof equipment (electrical, ventilating, lighting).',
  'P241 Use explosion-proof equipment: electrical/ventilating/lighting.',
  'P241 Use explosion-proof equipment, e.g. electrical, ventilating and lighting equipment.',
  'P241 Use explosion-proof equipment\n(electrical/ventilating/lighting)',
  'P241 Use explosion-proof electrical equipment. Use explosion-protected lighting equipment.',
  'P241 Use explosion resistant electrical equipment.', 'P241 Use anti-explosion electrical equipment.',
  'P241 Use ATEX electrical equipment.', 'P241 Use electrical equipment rated for explosive atmospheres.',
  // confirmation review notes: capitals split across lines, a hidden
  // direction mark, and supplier synonyms for the Annex IV terms
  'P241 Use explosion-proof equipment (ELEC-\nTRICAL).', 'P241 Use explosion-proof equipment (elec‏trical).',
  'P241 Use explosion-proof equipment (ventilation, lights).', 'P241 Use explosion-proof equipment, i.e. lights and fans.']) {
  assert.strictEqual(ex(t), null, 'blocks: ' + JSON.stringify(t));
}
// ...without blocking genuine code-only text that mentions "well-ventilated".
assert.strictEqual(ex('P241\nP403+P235 Store in a well-ventilated place. Keep cool.'), '', 'P403 "well-ventilated" is not P241 wording');
assert.strictEqual(ex('P241 P271 Use only outdoors or in a well-ventilated area.'), '', 'P271 "well-ventilated" is not P241 wording');
assert.strictEqual(ex('P241 Use explosion-proof electrical, ventilating and lighting equipment.\nP403+P235 Store in a well-ventilated place. Keep cool.'), 'electrical, ventilating and lighting');
// Founder N2 rule: code only, no evidence of equipment wording -> base text.
assert.strictEqual(ex('P210 Keep away from heat.\nP241\nP501 Dispose of contents.'), '', 'code only, no equipment words: base text');
ok('B1: Unicode hyphens, invisible characters and wrapped lines keep the supplier wording; unreadable wording blocks; code only prints base text');

// N1: punctuation.
assert.strictEqual(ex('P241 Use explosion-proof electrical/ equipment.'), null, 'trailing "/" blocks');
assert.strictEqual(ex('P241 Use explosion-proof electrical,,lighting equipment.'), null, 'double comma blocks');
assert.strictEqual(ex('P241 Use explosion-proof /lighting equipment.'), null, 'leading "/" blocks');
assert.strictEqual(ex('P241 Use explosion-proof electrical, ventilating, and lighting equipment.'), 'electrical, ventilating, and lighting', 'serial comma accepted');
assert.strictEqual(ex('P241 Use explosion-proof electrical / ventilating /lighting equipment.'), 'electrical/ventilating/lighting', 'spacing around "/" tidied');
assert.strictEqual(ex('P241 Use explosion-proof electrical ,ventilating and lighting equipment.'), 'electrical, ventilating and lighting', 'spacing around "," tidied');
assert.strictEqual(ex('P241 USE EXPLOSION-PROOF ELECTRICAL/VENTILATING/LIGHTING EQUIPMENT.'), 'electrical/ventilating/lighting', 'capitals set to Annex IV lower case');
assert.strictEqual(LR.buildP241Wording({ p241Equipment: 'electrical/', hazardFromExtraction: true }), null, 'stored empty part blocks');
ok('N1: empty parts block; spacing and capitals tidied without changing any word');

// B1 end to end: genuine Positivity Section 2.2 with Unicode hyphens.
for (const dash of ['‑', '–']) {
  r = paste(pos.section22.replace('explosion-proof', 'explosion' + dash + 'proof'));
  assert.strictEqual(r.eq, 'electrical, ventilating and lighting', 'Positivity with ' + JSON.stringify(dash));
  const o = LR.renderLabel(Object.assign({}, window.eval('S'), { hStatements: window.eval('S').hStatements.split(', ').filter(c => c !== 'H401').join(', '), customW: 200, customH: 200 }), { instanceId: 'p241-uni', forExport: true });
  assert(drawn(o.svg).includes(FULL + '.') && !drawn(o.svg).includes(BASE + '.'), 'export keeps the full wording with ' + JSON.stringify(dash));
}
ok('B1 end to end: genuine Positivity text with Unicode hyphens keeps the full supplier wording in export');

// S1: a legacy saved record (no hazardFromExtraction, but the supplier signal
// word only Smart Paste writes) blocks in the shared renderer (Composer)
// exactly as it does in the Builder; a manual legacy record prints base text.
const legacy = Object.assign({}, base, { sdsSignal: 'Danger' });
assert.strictEqual(LR.normalizeLabel(legacy).hazardFromExtraction, true);
out = LR.renderLabel(legacy, { instanceId: 'p241-legacy-sds', forExport: true });
assert(out.blocked && out.warnings.includes('unrecognized-code:P241') && !/Use explosion-proof/.test(drawn(out.svg)), 'legacy extracted record blocks in the renderer: ' + JSON.stringify(out.warnings));
S = reopen(legacy);
assert(S.hazardFromExtraction === true && LR.buildP241Wording(S) === null, 'and in the Builder');
out = LR.renderLabel(Object.assign({}, base, { sdsSignal: '' }), { instanceId: 'p241-legacy-manual', forExport: true });
assert(!out.blocked && drawn(out.svg).includes(BASE + '.'), 'legacy manual record prints base text');
assert.strictEqual(LR.normalizeLabel(Object.assign({}, base, { hazardFromExtraction: false, sdsSignal: 'Danger' })).hazardFromExtraction, false, 'an explicit false is kept');
ok('S1: legacy saved records are treated the same in the Builder and the Composer renderer');

// S2: messages say what P241 needs, not "not recognised", everywhere.
const overlay = drawn(LR.renderLabel(Object.assign({}, base, { hazardFromExtraction: true }), { instanceId: 'p241-msg', forExport: true }).svg);
assert(/P241 needs the explosion-proof equipment wording from your SDS/.test(overlay) && !/P241 was not recognised/.test(overlay), 'renderer overlay: ' + overlay.slice(0, 300));
const mixed = drawn(LR.renderLabel(Object.assign({}, base, { hazardFromExtraction: true, pStatements: 'P210, P241, P999' }), { instanceId: 'p241-msg2', forExport: true }).svg);
assert(/P999 was not recognised/.test(mixed) && /P241 needs the explosion-proof equipment wording/.test(mixed) && !/P241, P999|P999, P241/.test(mixed), 'mixed overlay keeps both: ' + mixed.slice(0, 300));
const parts = window.clpCombinedCodeBlockMessage([], ['P241', 'P999']);
assert(parts.length === 2 && /P999/.test(parts[0].body) && !/P241/.test(parts[0].body) && /^P241 needs/.test(parts[1].heading), 'Builder block message parts: ' + JSON.stringify(parts));
window.eval("window._unsupportedCodes=[];window._unrecognizedCodesGeneric=['P241'];");
window.openClpCodeHelp();
const help = (box('clp-code-help-copy') || {}).textContent || '';
assert(/P241 \(explosion-proof equipment\)/.test(help) && !/could not identify P241/.test(help), 'help panel: ' + help.slice(0, 300));
// Composer message (print.html describeFitWarnings), evaluated in isolation.
const printSrc = fs.readFileSync('print.html', 'utf8').split('\r\n').join('\n');
const fStart = printSrc.indexOf('function describeFitWarnings(');
const fEnd = printSrc.indexOf('\n}\n', fStart) + 2;
const describe = new Function('LabelRenderer', printSrc.slice(fStart, fEnd) + '\nreturn describeFitWarnings;')(LR);
assert.strictEqual(describe(['unrecognized-code:P241']), "P241 needs the explosion-proof equipment wording from the supplier's SDS: open this label in the Builder and paste Section 2.2 again.");
assert(/doesn't recognise: P999\. P241 needs/.test(describe(['unrecognized-code:P999', 'unrecognized-code:P241'])), 'Composer mixed message');
assert.strictEqual(describe(['unrecognized-code:P999']), "Contains a hazard/precautionary code CLPeasy doesn't recognise: P999.", 'other codes unchanged');
// Re-review F2: the Builder download warning (Step 4/5 panels) explains
// P241 too, never "did not recognise ... so we can add it".
r = paste(head + 'P210 Keep away from heat.\nP241 Use explosion-proof equipment (electrical, lighting).\nP501 Dispose of contents.');
assert(r.eq === null && !r.leave, 'parenthetical equipment wording blocks in the Builder');
for (const id of ['label-warn-stage4', 'label-warn-step5']) {
  const el = box(id);
  if (!el) continue;
  const t = el.textContent;
  assert(/P241 needs the equipment wording from your SDS/.test(t) && /won't shorten or guess/.test(t) && !/did not recognise/.test(t) && !/so we can add it/.test(t), id + ': ' + t.slice(0, 400));
}
assert(box('label-warn-stage4') || box('label-warn-step5'), 'a Builder download warning panel exists');
r = paste(head + 'P210 P241 P999 Mystery code.\nP241 Use explosion-proof equipment (lighting).\nP501');
const w4 = (box('label-warn-stage4') || box('label-warn-step5')).textContent;
assert(/P999/.test(w4) && /so we can add it/.test(w4) && /P241 needs the equipment wording/.test(w4) && !/following code: P241|P241, P999|P999, P241/.test(w4), 'mixed warning keeps both: ' + w4.slice(0, 500));
ok('S2: Step 3 alert, preview overlay, help panel, Builder download warning and Composer explain what P241 needs; other codes unchanged');

assert.deepStrictEqual(jsErrors.filter(e => !/Not implemented/.test(e)), [], 'no page errors');
console.log(`\nAll ${n} P241 supplier-wording checks passed.`);
