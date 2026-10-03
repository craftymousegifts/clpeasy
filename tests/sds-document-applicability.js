// Supplier-document applicability for the fragrance % (builder.html), run in JSDOM.
// Run from the repo root: node tests/sds-document-applicability.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  maybeSingle(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

let objectUrls = 0, downloads = 0;
const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((w,c)=>w+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(fs.readFileSync('label-render.js', 'utf8'));
    window.eval(fs.readFileSync('label-library.js', 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'entitlement.js'), 'utf8'));
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => null;
    window.URL.createObjectURL = () => { objectUrls++; return 'blob:test'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function(){ if (this.hasAttribute('download')) downloads++; };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:null, error:null })
    }) };
  }
});

const { window } = dom;
const document = window.document;
const S = expr => window.eval(expr);
// ── Supplier-document applicability for the fragrance % (3 Oct 2026) ──
// GB CLP classifies the FINISHED mixture; CLPeasy must not scale or assume a
// classification. Only a finished-product document for the same kind of
// product at the SAME fragrance % may be used; everything else is blocked.
const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles:true })); el.dispatchEvent(new window.Event('change', { bubbles:true })); };
const kind = v => { document.querySelectorAll('input[name="sds-doc-kind"]').forEach(r => { r.checked = r.value === v; }); window.updateSdsDocCheck(); };
const doc = (k, pct, base) => { kind(k); if (pct !== undefined) set('sds-doc-pct', pct); if (base !== undefined) set('sds-doc-base', base); return window.evaluateSdsDoc(); };
let n = 0; const ok = l => { n++; console.log('PASS:', l); };

// Static: inputs, wording and no unsupported assurances.
const html = fs.readFileSync('builder.html', 'utf8');
assert(html.includes('Fragrance in the finished product (% by weight)'), 'Step 2 input states what the % means');
assert(!/Fragrance load % <span>\(optional\)<\/span>/.test(html), 'fragrance % no longer optional');
assert(!/overestimate/i.test(html) && !/Use 25% CLP if your load/.test(html) && !/may not need CLP/.test(html) && !/may not require CLP/.test(html), 'no unsupported over-estimate / no-CLP assurances');
assert(document.getElementById('sds-doc-check') && document.getElementById('sds-doc-pct') && document.getElementById('sds-doc-base'), 'document check inputs present');
assert(!/<input[^>]*id="sds-doc-pct"[^>]*\bvalue=/.test(html), 'document % is never pre-filled');
ok('static: clear input wording, document check present, misleading tips removed');

set('scent-name', 'Musk Test'); set('product-type', 'Scented Candle');

// Required cases against a candle document covering 10%.
const cases = [
  ['8',  'finished', '10', 'wax', 'lower'],
  ['12', 'finished', '10', 'wax', 'higher'],
  ['10', 'finished', '10', 'wax', 'match'],
  ['10%', 'finished', '10%', 'wax', 'match'],
  ['10.04', 'finished', '10', 'wax', 'higher'],
  ['10', 'concentrate', undefined, undefined, 'concentrate'],
  ['10', 'unsure', undefined, undefined, 'unsure'],
  ['', 'finished', '10', 'wax', 'actual-missing'],
  ['about 10', 'finished', '10', 'wax', 'actual-missing'],
  ['10', 'finished', '', 'wax', 'doc-pct-missing'],
  ['10', 'finished', 'see section 3', 'wax', 'doc-pct-missing'],
  ['10', 'finished', '10', '', 'base-missing'],
  ['10', 'finished', '10', 'spray', 'base-mismatch'],
  ['10', 'finished', '10', 'other', 'base-unverified'],
];
for (const [actual, k, pct, base, want] of cases) {
  set('frag-load', actual);
  const r = doc(k, pct, base);
  assert.strictEqual(r.code, want, `actual ${actual} / ${k} ${pct} ${base}: got ${r.code}`);
  assert.strictEqual(r.ok, want === 'match', `only an exact same-product match is usable (${want})`);
}
set('frag-load', '8'); assert(/not automatically covered/.test(doc('finished','10','wax').message) && /H317/.test(window.evaluateSdsDoc().message), 'lower % explains threshold effects');
set('frag-load', '12'); assert(/more severe or additional/.test(doc('finished','10','wax').message), 'higher % explains');
set('frag-load', '8'); assert(/Ask your supplier for GB CLP information for your scented candle at 8%/.test(doc('finished','10','wax').message), 'supplier guidance names the product and actual %');
set('frag-load', '8'); assert(/concentrated oil, not your finished product/.test(doc('concentrate').message), 'concentrate explained');
ok('8% and 12% against a 10% document are blocked with supplier guidance; exact match only; concentrate, unsure, missing/uncertain % and product-base mismatch blocked');

// Product-base mapping: a wax document covers candles and wax melts only.
set('frag-load', '10');
set('product-type', 'Wax Melt'); assert.strictEqual(doc('finished','10','wax').code, 'match', 'wax melt + wax document');
set('product-type', 'Reed Diffuser'); assert.strictEqual(doc('finished','10','wax').code, 'base-mismatch', 'diffuser + wax document');
assert.strictEqual(doc('finished','10','diffuser').code, 'match', 'diffuser + diffuser document');
set('product-type', 'Room Spray'); assert.strictEqual(doc('finished','10','diffuser').code, 'base-mismatch', 'spray + diffuser document');
set('product-type', 'Scented Candle');
ok('document product base must match the product type');

// Enforcement points: Smart Paste, the Step 3 confirm/Next and leaving Step 3 (manual entry).
set('frag-load', '8'); doc('finished','10','wax');
set('smart-paste-input', 'Warning\nH317 May cause an allergic skin reaction.\nP280 Wear protective gloves.');
window.__lastAlert = '';
const before = S('S.hStatements');
window.extractSDS();
assert(/less than the 10% this document covers/.test(window.__lastAlert), 'Smart Paste refuses a non-matching document');
assert.strictEqual(S('S.hStatements'), before, 'nothing extracted');
// Manually entered hazards cannot pass Step 3 either.
const h = document.getElementById('h-statements'); if (h) { h.value = 'H317'; }
window.eval("readForm(); S.hStatements='H317';");
const cb = document.getElementById('hazard-confirm'); cb.checked = true; window.toggleHazardNext();
const btn = document.getElementById('btn-next-step3');
assert.strictEqual(btn.style.pointerEvents, 'none', 'Next stays disabled while the document does not match');
window.__lastAlert = '';
assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'cannot leave Step 3 with a non-matching document');
assert(/less than the 10%/.test(window.__lastAlert), 'reason given');
// Matching document unblocks.
doc('finished','8','wax'); window.toggleHazardNext();
assert.strictEqual(btn.style.pointerEvents, 'auto', 'Next enabled for a matching document');
ok('enforced at Smart Paste, the confirmation/Next button and when leaving Step 3 (manual entry included)');

// Step 2 requires a usable fragrance %.
set('frag-load', ''); window.__lastAlert = '';
assert.strictEqual(window.canLeaveApprovedBuilderStep(2), false, 'Step 2 blocks a missing %');
set('frag-load', 'approx 8'); assert.strictEqual(window.canLeaveApprovedBuilderStep(2), false, 'Step 2 blocks an uncertain %');
set('frag-load', '8.5'); window.__lastAlert=''; window.canLeaveApprovedBuilderStep(2); assert(!/fragrance percentage in your finished product/.test(window.__lastAlert), 'a number is accepted by the % check (other existing Step 2 checks may still apply: '+window.__lastAlert+')');
ok('Step 2 requires the finished-product fragrance % as a number');

// Calculator applies fragrance / total (finished product), not % of wax.
set('calc-wax', '200'); set('calc-frag', '20'); window.calcFragLoad();
assert(/9\.1% of the finished product/.test(document.getElementById('calc-result').textContent), 'shows finished-product %');
window.applyFragLoad();
assert.strictEqual(document.getElementById('frag-load').value, '9.1%', 'applies 20/(200+20) = 9.1%, not 10% of wax');
ok('calculator applies the finished-product % (20 g in 200 g wax = 9.1%)');

// The document answers are saved with the label and restored.
set('frag-load', '8'); doc('finished','8','wax');
assert.deepStrictEqual(JSON.parse(JSON.stringify(S('S.sdsDoc'))), { kind:'finished', pct:'8', base:'wax' }, 'kept in label state');
const src = fs.readFileSync('builder.html', 'utf8');
assert(/sdsDoc:S\.sdsDoc\?\{kind:S\.sdsDoc\.kind/.test(src) && /S\.sdsDoc=e\.sdsDoc\|\|null/.test(src), 'saved and restored with the label');
ok('document answers saved with the label');

assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no script errors');
console.log(`sds-document-applicability checks passed (${n} groups)`);
