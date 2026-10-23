// Stage A precautionary-statement recognition (draft PR #233, reconciled
// with main after Correction A / #256, Oct 2026).
//   1. Both P_LIB copies (builder.html, label-render.js) stay identical and
//      add exactly P202, P240, P241, P242, P243, P403+P235. P308+P313 and P310
//      are NOT added: their GB Annex IV wording needs a supplier choice
//      ("advice/attention"; "POISON CENTER/doctor/..."), so they stay
//      unrecognised and keep blocking, as in production.
//      Every existing entry -- including #256's complete P210, P304+P340 and
//      P305+P351+P338 wording and the P280 placeholder -- is unchanged.
//   2. The nine Smart Paste exclusions are unchanged and still applied.
//   3. Smart Paste recognises the new codes (also as separate or slash-joined
//      parts) instead of blocking them as unrecognised; P308+P313 and P310
//      still block; P280 handling is unchanged.
//   4. A saved label carrying the new codes reopens and renders them.
//   5. Preview and export SVGs print the wording; a label too small for it is
//      blocked (hazard-text-overflow), never shortened.
// Run from the repo root: node tests/d3-r4-precautionary-statements.js
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
    for (const f of ['label-render.js', 'sds-doc-check.js', 'sds-section-scope.js', 'label-library.js', 'entitlement.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    w.alert = m => { w.__lastAlert = String(m); }; w.confirm = () => true; w.scrollTo = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
  } });
const { window } = dom; const document = window.document;
const box = id => document.getElementById(id);
let n = 0;
const ok = msg => { n++; console.log('  ok ' + n + ' - ' + msg); };
const builderSrc = fs.readFileSync('builder.html', 'utf8');
const rendererSrc = fs.readFileSync('label-render.js', 'utf8');
const lib = src => { const a = src.indexOf('const P_LIB=['), b = src.indexOf("{code:'P280'", a);
  assert(a >= 0 && b > a, 'P_LIB not found'); return new Map([...src.slice(a, b).matchAll(/\{code:'([^']+)',desc:'([^']*)'\}/g)].map(m => [m[1], m[2]])); };
const ADDED = {
  'P202': 'Do not handle until all safety precautions have been read and understood',
  'P240': 'Ground and bond container and receiving equipment',
  'P241': 'Use explosion-proof equipment',
  'P242': 'Use non-sparking tools',
  'P243': 'Take action to prevent static discharges',
  'P403+P235': 'Store in a well-ventilated place. Keep cool',
};
const KEPT = { // must not change (Correction A / #256 and neighbours)
  'P210': 'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking',
  'P304+P340': 'IF INHALED: Remove person to fresh air and keep comfortable for breathing',
  'P305+P351+P338': 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing',
  'P301+P310': 'IF SWALLOWED: immediately call a POISON CENTRE or doctor',
  'P313': 'Get medical advice/attention', 'P403+P233': 'Store in a well-ventilated place. Keep container tightly closed',
};
const NOT_ADDED = ['P308+P313', 'P310']; // wording needs a supplier choice -> stays unrecognised
const bLib = lib(builderSrc), rLib = lib(rendererSrc);
assert.deepStrictEqual([...bLib], [...rLib], 'builder.html and label-render.js P_LIB must be identical');
for (const [c, d] of Object.entries(ADDED)) assert.strictEqual(rLib.get(c), d, c);
for (const [c, d] of Object.entries(KEPT)) assert.strictEqual(rLib.get(c), d, c + ' must be unchanged');
for (const c of NOT_ADDED) assert(!bLib.has(c) && !rLib.has(c), c + ' must not be in either library');
assert.strictEqual(rLib.size, 34, 'exactly 6 codes added to the 28 existing (P280 is separate)');
const P280 = "{code:'P280',desc:'Wear the applicable protective equipment (select which items apply when adding this code)'}";
assert(builderSrc.includes(P280) && rendererSrc.includes(P280), 'P280 placeholder unchanged');
const EXCL = ['P272', 'P264', 'P270', 'P280', 'P303+P361+P353', 'P362', 'P362+P364', 'P363', 'P405'];
const exclSrc = builderSrc.match(/const _pExclude=\[([^\]]*)\]/)[1];
assert.deepStrictEqual([...exclSrc.matchAll(/'([^']+)'/g)].map(m => m[1]).sort(), EXCL.slice().sort(), 'the nine Smart Paste exclusions are unchanged');
ok('libraries identical; exactly the 6 codes added (not P308+P313/P310); existing wording, P280 and the 9 exclusions unchanged');

// ── Smart Paste in the Builder ─────────────────────────────────────────
function paste(text) {
  window.selectShape('rectangle'); window.selectSize('custom');
  box('custom-w').value = '150'; box('custom-h').value = '110'; window.onDimInput();
  box('scent-name').value = 'Synthetic'; box('product-type').value = 'Room Spray'; box('frag-load').value = '10%';
  window.setApprovedBuilderStep(3); window.clearHazardData();
  box('smart-paste-input').value = text;
  // #264: extraction needs the SDS source confirmation (absent before #264).
  if (box('sds-source-confirm')) { box('sds-source-confirm').checked = true; window.confirmSdsSource(); }
  window.extractSDS();
  for (const [id, v] of [['biz-name', 'Test Maker'], ['biz-address', '1 Test Lane, Exeter, EX1 2AB'], ['biz-phone', '01632 960000']]) box(id).value = v;
  window.readForm(); window.updateLabel();
  const S = window.eval('S');
  box('hazard-confirm').checked = true; window.__lastAlert = undefined;
  const leave = window.canLeaveApprovedBuilderStep(3);
  return { p: [...S.pSelected], leave, alert: window.__lastAlert || '', blocked: !!window._labelBlockDownload };
}
const head = '2.2 Label elements\nSignal word: Danger\nH225 Highly flammable liquid and vapour.\nH304 May be fatal if swallowed and enters airways.\n';
let r = paste(head + 'P202 P210 P233 P240 P241 P242 P243 P264 P280 P301+P310 P308+P313 P331 P403+P235 P405 P501');
assert.deepStrictEqual(r.p, ['P202', 'P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P301+P310', 'P308+P313', 'P331', 'P403+P235', 'P501'], 'new codes kept; P264, P280, P405 still excluded');
assert(!r.leave && /P308\+P313/.test(r.alert), 'P308+P313 is kept and still blocks Step 3: ' + r.alert);
assert(!/P202|P24[0-3]|P403\+P235/.test(r.alert), 'none of the 6 added codes is reported as unrecognised: ' + r.alert);
ok('Smart Paste keeps the new codes, still blocks P308+P313 and still applies the nine exclusions');
r = paste(head + 'P210\nP310 Immediately call a POISON CENTER/doctor.\nP308 + P313\nP403/235 Store in a well-ventilated place. Keep cool.\nP501');
assert.deepStrictEqual(r.p, ['P210', 'P310', 'P308+P313', 'P403+P235', 'P501'], 'separate and slash-joined parts recognised: ' + r.p);
assert(!r.leave && /P310/.test(r.alert) && /P308\+P313/.test(r.alert) && !/P403/.test(r.alert), r.alert);
ok('"P403/235" is recognised; P310 and "P308 + P313" are normalised, kept and still block Step 3');
r = paste(head + 'P210 P243 P999 P501');
assert(r.p.includes('P999') && !r.leave && /P999/.test(r.alert) && !/P243/.test(r.alert), 'an unknown code still blocks; P243 does not: ' + r.alert);
ok('unknown codes still block (fail closed); the new codes do not');

// ── Saved label reopens with the new codes ───────────────────────────
try { window.loadLabelRecord({ id: 'saved-stage-a', scentName: 'Saved', productType: 'Room Spray', shape: 'rectangle', size: 'custom', customW: 150, customH: 110,
  signal: 'Danger', hStatements: 'H225, H304', pStatements: 'P202, P240, P241, P242, P243, P403+P235', sensitisers: [], pictograms: ['flame', 'health'] }); } catch (e) { /* saved-label list refresh needs a signed-in library */ }
window.readForm(); window.updateLabel();
assert.deepStrictEqual([...window.eval('S.pSelected')], Object.keys(ADDED));
const saved = window.LabelRenderer.renderLabel(Object.assign({}, window.eval('S'), { bizName: 'Test Maker', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000' }), { instanceId: 'stage-a-saved', forExport: true });
assert(!saved.warnings.some(w => /^unrecognized-code:/.test(w)), JSON.stringify(saved.warnings));
const savedBlocked = window.LabelRenderer.renderLabel(Object.assign({}, window.eval('S'), { pStatements: 'P202, P310, P308+P313', bizName: 'Test Maker', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000' }), { instanceId: 'stage-a-saved-blocked', forExport: true });
assert(savedBlocked.blocked && ['P310', 'P308+P313'].every(c => savedBlocked.warnings.includes('unrecognized-code:' + c)), JSON.stringify(savedBlocked.warnings));
assert(!/Immediately call|IF exposed or concerned/.test(savedBlocked.svg), 'no wording is printed for P310/P308+P313');
ok('a saved label with the 6 codes reopens recognised; P310/P308+P313 still block rendering');

// ── Rendered SVG output and fit blocking ─────────────────────────────
const LR = window.LabelRenderer;
const drawn = svg => (svg.match(/>([^<>]+)</g) || []).map(s => s.slice(1, -1)).join(' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const base = { shape: 'rectangle', size: 'custom', customW: 150, customH: 120, scentName: 'Fresh Linen', productType: 'Room Spray',
  bizName: 'Test Maker', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000', signal: 'Danger',
  hStatements: 'H225, H304', pictograms: ['flame', 'health'], sensitisers: [], pStatements: Object.keys(ADDED).join(', ') };
for (const forExport of [false, true]) {
  const out = LR.renderLabel(base, { instanceId: 'stage-a-' + forExport, forExport });
  assert.strictEqual(out.fits, true, JSON.stringify(out.warnings));
  const t = drawn(out.svg);
  for (const d of Object.values(ADDED)) assert(t.includes(d + '.'), (forExport ? 'export' : 'preview') + ' SVG must print "' + d + '."');
}
ok('preview and export SVGs print all 6 statements in full');
const crowded = Object.assign({}, base, { shape: 'circle', customW: 52, customH: 52, size: 'custom' });
const blocked = LR.renderLabel(crowded, { instanceId: 'stage-a-crowded', forExport: true });
assert(!blocked.fits && blocked.warnings.includes('hazard-text-overflow'), JSON.stringify(blocked.warnings));
const rec = LR.findSmallestFittingSize(crowded, { instanceId: 'stage-a-rec' });
const atRec = rec && LR.renderLabel(Object.assign({}, crowded, { customW: rec.mmW, customH: rec.mmH }), { instanceId: 'stage-a-at-rec', forExport: true });
assert(atRec && atRec.fits && Object.values(ADDED).every(d => drawn(atRec.svg).includes(d + '.')), 'recommended size prints every statement in full');
ok('a 52 mm circle is blocked, never shortened; the recommended ' + rec.mmW + ' mm size prints every statement');

assert.deepStrictEqual(jsErrors.filter(e => !/Not implemented/.test(e)), [], 'no page errors');
console.log(`\nAll ${n} Stage A precautionary-statement checks passed.`);
