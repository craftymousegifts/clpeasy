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
    window.eval(fs.readFileSync('label-render.js', 'utf8')); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
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
set('biz-name', 'Crafty Mouse Gifts'); // required label content (M09/M31)

// Required cases against a candle document covering 10%.
const cases = [
  ['8',  'finished', '10', 'candle', 'lower'],
  ['12', 'finished', '10', 'candle', 'higher'],
  ['10', 'finished', '10', 'candle', 'match'],
  ['10%', 'finished', '10.0%', 'candle', 'match'],
  ['10.04', 'finished', '10', 'candle', 'higher'],
  ['9.0909', 'finished', '9.1', 'candle', 'lower'],
  ['10', 'concentrate', undefined, undefined, 'concentrate'],
  ['10', 'unsure', undefined, undefined, 'unsure'],
  ['', 'finished', '10', 'candle', 'actual-missing'],
  ['about 10', 'finished', '10', 'candle', 'actual-missing'],
  ['8-10', 'finished', '10', 'candle', 'actual-missing'],
  ['10', 'finished', '', 'candle', 'doc-pct-missing'],
  ['10', 'finished', '8-10%', 'candle', 'doc-pct-range'],
  ['10', 'finished', 'up to 10%', 'candle', 'doc-pct-upto'],
  ['8', 'finished', 'max 10%', 'candle', 'doc-pct-upto'],
  ['10', 'finished', 'see section 3', 'candle', 'doc-pct-missing'],
  ['10', 'finished', '10', '', 'base-missing'],
  ['10', 'finished', '10', 'spray', 'base-mismatch'],
  ['10', 'finished', '10', 'waxmelt', 'base-mismatch'],
  ['10', 'finished', '10', 'candle+waxmelt', 'match'],
  ['10', 'finished', '10', 'other', 'base-unverified'],
];
for (const [actual, k, pct, base, want] of cases) {
  set('frag-load', actual);
  const r = doc(k, pct, base);
  assert.strictEqual(r.code, want, `actual ${actual} / ${k} ${pct} ${base}: got ${r.code}`);
  assert.strictEqual(r.ok, want === 'match', `only an exact same-product match is usable (${want})`);
}
set('frag-load', '8'); const low = doc('finished','10','candle').message;
assert(/does not establish coverage/.test(low) && /H317/.test(low) && !/exact percentage you use/.test(low), 'lower %: a document for another % alone does not establish coverage; threshold example; no exact-digits claim');
assert(!/0\.1\s*%/.test(low) && !/not automatically covered/.test(low), 'no blanket threshold figure or legal-rule claim');
set('frag-load', '10'); const m = doc('finished','10','candle').message;
assert(/answers are consistent/.test(m) && /can't read the document itself/.test(m) && !/covers your product/.test(m), 'a match is described as consistent answers, never as proof the document applies');
set('frag-load', '10'); const ut = doc('finished','up to 12%','candle').message;
assert(/doesn't take coverage from an "up to" percentage/.test(ut) && /clarify which finished-product hazard information applies/.test(ut) && /My supplier has confirmed in writing/.test(ut), 'D2: "up to" is never coverage; clarification for the product and % is needed');
const rgm = doc('finished','6-12%','candle').message;
assert(/choose "A range"/.test(rgm) && /ingredient range or a recommended usage range doesn't count/.test(rgm), 'a range typed as one % points to the range answer, excluding ingredient/usage ranges');
set('frag-load', '9.0909'); const rd = doc('finished','9.1','candle');
assert(rd.code === 'lower' && /may only be rounding/.test(rd.message) && /My supplier has confirmed in writing/.test(rd.message), '9.0909 vs 9.1: blocked, rounding explained, written-confirmation route offered');
for (const t of ['finished','supplier-confirmed']) assert(!/weigh|reformulat|adjust your (formulation|recipe)|change your (formulation|recipe)/i.test(doc(t,'9.1','candle').message), 'no formulation-change advice');
set('frag-load', '8'); assert(!/rounding/.test(doc('finished','10','candle').message) && /On its own, a document for a higher percentage does not establish coverage for a lower one/.test(window.evaluateSdsDoc().message), 'a real lower % is not called rounding; higher-% assumption named');
set('frag-load', '12'); assert(/more severe or additional/.test(doc('finished','10','candle').message), 'higher % explains');
set('frag-load', '8'); assert(/ask your supplier for GB CLP information covering your scented candle at 8%/i.test(doc('finished','10','candle').message), 'supplier guidance names the product and actual %');
set('frag-load', '8'); assert(/concentrated oil, not your finished product/.test(doc('concentrate').message), 'concentrate explained');
ok('8% and 12% against 10%, and 9.0909% against 9.1%, are blocked with supplier guidance; ranges and unstated % blocked; concentrate, unsure and product mismatch blocked');

// Product groups: candle and wax-melt documents are NOT interchangeable.
set('frag-load', '10');
set('product-type', 'Wax Melt');
assert.strictEqual(doc('finished','10','waxmelt').code, 'match', 'wax melt + wax-melt document');
assert.strictEqual(doc('finished','10','candle').code, 'base-mismatch', 'wax melt + candle-only document');
assert.strictEqual(doc('finished','10','candle+waxmelt').code, 'match', 'wax melt + document naming both');
set('product-type', 'Pillar Candle'); assert.strictEqual(doc('finished','10','waxmelt').code, 'base-mismatch', 'candle + wax-melt-only document');
set('product-type', 'Reed Diffuser'); assert.strictEqual(doc('finished','10','candle').code, 'base-mismatch', 'reed + candle document');
assert.strictEqual(doc('finished','10','reed').code, 'match', 'reed + reed document');
assert.strictEqual(doc('finished','10','plugin').code, 'base-mismatch', 'reed + plug-in document');
set('product-type', 'Room Spray'); assert.strictEqual(doc('finished','10','reed').code, 'base-mismatch', 'spray + diffuser document');
assert.strictEqual(doc('finished','10','spray').code, 'match', 'room spray + room/linen spray document');
assert.strictEqual(doc('finished','10','carspray').code, 'base-mismatch', 'room spray + car spray document');
// Every product type offered in Step 2 has a group (no type falls through).
const types = [...document.querySelectorAll('#product-type option')].map(o => o.value).filter(Boolean);
assert(types.length >= 18 && types.every(t => window.SdsDocCheck.GROUP_BY_TYPE[t]), 'every listed product type is mapped: ' + types.filter(t => !window.SdsDocCheck.GROUP_BY_TYPE[t]).join('|'));
// Answers saved before the split ('wax') must be chosen again.
assert.strictEqual(window.SdsDocCheck.evaluate({ fragLoad:'10', productType:'Scented Candle', sdsDoc:{ kind:'finished', pct:'10', base:'wax' } }).code, 'base-missing', 'old combined "wax" answer is not accepted');
set('product-type', 'Scented Candle');
ok('candle and wax-melt documents are separate; shared only when the document names both; other groups separate; old answers re-asked');

// Enforcement points: Smart Paste, the Step 3 confirm/Next and leaving Step 3 (manual entry).
set('frag-load', '8'); doc('finished','10','candle');
set('smart-paste-input', 'Warning\nH317 May cause an allergic skin reaction.\nP280 Wear protective gloves.');
window.__lastAlert = '';
const before = S('S.hStatements');
window.extractSDS();
assert(/less than the 10% this document states/.test(window.__lastAlert), 'Smart Paste refuses a non-matching document');
assert.strictEqual(S('S.hStatements'), before, 'nothing extracted');
const h = document.getElementById('h-statements'); if (h) { h.value = 'H317'; }
window.eval("readForm(); S.hStatements='H317';");
const cb = document.getElementById('hazard-confirm'); cb.checked = true; window.toggleHazardNext();
const btn = document.getElementById('btn-next-step3');
assert.strictEqual(btn.style.pointerEvents, 'none', 'Next stays disabled while the document does not match');
window.__lastAlert = '';
assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'cannot leave Step 3 with a non-matching document');
assert(/less than the 10%/.test(window.__lastAlert), 'reason given');
doc('finished','8','candle'); window.toggleHazardNext();
assert.strictEqual(btn.style.pointerEvents, 'auto', 'Next enabled for a matching document');
ok('enforced at Smart Paste, the confirmation/Next button and when leaving Step 3 (manual entry included)');

// Step 2 requires a usable fragrance %.
set('frag-load', ''); window.__lastAlert = '';
assert.strictEqual(window.canLeaveApprovedBuilderStep(2), false, 'Step 2 blocks a missing %');
set('frag-load', 'approx 8'); assert.strictEqual(window.canLeaveApprovedBuilderStep(2), false, 'Step 2 blocks an uncertain %');
set('frag-load', '8.5'); window.__lastAlert=''; window.canLeaveApprovedBuilderStep(2); assert(!/fragrance percentage in your finished product/.test(window.__lastAlert), 'a number is accepted by the % check (other existing Step 2 checks may still apply: '+window.__lastAlert+')');
ok('Step 2 requires the finished-product fragrance % as a number');

// Calculator precision: 20 g in 220 g is 9.0909…%, never "9.1%".
set('calc-wax', '200'); set('calc-frag', '20'); window.calcFragLoad();
const calcText = document.getElementById('calc-result').textContent;
assert(/^9\.0909% \(rounded to 4 decimal places\) of the finished product/.test(calcText), 'shows 9.0909% and says it is rounded: ' + calcText);
assert(/never rounds it to make a match/.test(calcText), 'explains no rounding to match');
window.applyFragLoad();
assert.strictEqual(document.getElementById('frag-load').value, '9.0909%', 'applies 9.0909%, not 9.1% and not 10% of wax');
assert.strictEqual(doc('finished','9.1','candle').code, 'lower', '9.0909% does not match a 9.1% document');
set('calc-wax', '180'); set('calc-frag', '20'); window.calcFragLoad();
assert(/^10% of the finished product/.test(document.getElementById('calc-result').textContent), 'exact values are shown without a rounding note');
ok('calculator applies the finished-product % without 1 dp rounding; 9.0909% vs 9.1% blocked');

// ── Export confirmation (owner decision 2) ──
const exportOk = () => { window.toggleDownload(); return window._downloadAllowed(); };
const vcb = document.getElementById('verify-checkbox'); vcb.checked = true;
// A clean, fitting candle label with matching document but never confirmed (e.g. reopened older label).
window.eval("S.sdsDoc=null;");
set('frag-load', '10'); set('product-type', 'Scented Candle'); doc('finished','10','candle');
// Hazards come from Smart Paste for the matching document (real production path).
set('smart-paste-input', 'Warning\nH317 May cause an allergic skin reaction.\nP280 Wear protective gloves.');
window.extractSDS();
assert.strictEqual(S('S.hStatements'), 'H317', 'extracted from the matching document');
window.updateLabel(); window._labelBlockDownload = false;
const reviewBlocks = window.eval('_hazardReviewRequired()');
assert.strictEqual(reviewBlocks, false, 'fixture is otherwise exportable, so the document check is what blocks');
assert.strictEqual(window.SdsDocCheck.status(window.eval('_sdsDocRecord()')), 'not-checked', 'answers alone are not a confirmation');
assert.strictEqual(exportOk(), false, 'unconfirmed label cannot be exported');
if (!reviewBlocks) {
  assert(/complete "Check your supplier document first"/.test(window._downloadBlockedMessage()), 'guidance names Step 3 check');
  const note = document.getElementById('sds-doc-export-note');
  assert(note.style.display !== 'none' && /Step 3/.test(note.textContent), 'visible Step 5 notice with a way back to Step 3');
}
// Each export entry point refuses without counting a download.
const dl0 = downloads, ou0 = objectUrls;
for (const fn of ['downloadPNG','downloadSVG','downloadPDFSheet','downloadPrintReadyPDF','downloadCricutPNGs','printToPDF']) {
  window.__lastAlert = '';
  try { const r = window[fn](); if (r && r.catch) r.catch(()=>{}); } catch (e) {}
}
assert.strictEqual(downloads, dl0, 'no file downloaded'); assert.strictEqual(objectUrls, ou0, 'no file produced');
// Walking Step 3 -> 4 confirms (production path).
window.eval('approvedBuilderStep=3; S.step=3;');
document.getElementById('hazard-confirm').checked = true;
window.setApprovedBuilderStep(4);
assert.strictEqual(window.eval('approvedBuilderStep'), 4, 'left Step 3: ' + window.__lastAlert);
assert(window.eval('S.sdsDoc && S.sdsDoc.confirmed'), 'confirmation stamped when leaving Step 3');
window._labelBlockDownload = false;
assert.strictEqual(window.SdsDocCheck.status(window.eval('_sdsDocRecord()')), 'verified', 'verified after Step 3');
if (!reviewBlocks) assert.strictEqual(exportOk(), true, 'export allowed once confirmed');
// Invalidation: % / product type / hazards / document answers.
const recheck = () => window.SdsDocCheck.status(window.eval('_sdsDocRecord()'));
const conf = JSON.stringify(window.eval('S.sdsDoc.confirmed'));
const restore = () => window.eval('S.sdsDoc.confirmed=' + conf);
set('frag-load', '10.0'); assert.strictEqual(recheck(), 'verified', '10.0 is the same number as 10');
set('frag-load', '9'); assert.notStrictEqual(recheck(), 'verified', '% change invalidates'); assert.strictEqual(exportOk(), false, 'export blocked after % change');
set('frag-load', '10'); doc('finished','10','candle'); restore(); assert.strictEqual(recheck(), 'verified');
set('product-type', 'Soy Candle'); assert.strictEqual(recheck(), 'needs-recheck', 'product type change invalidates (even within candles)');
assert(/changed after you confirmed/.test(window.SdsDocCheck.exportBlockMessage(window.eval('_sdsDocRecord()'))), 'needs-recheck guidance');
set('product-type', 'Scented Candle'); assert.strictEqual(recheck(), 'verified');
window.eval("S.hStatements='H317, H412'"); assert.strictEqual(recheck(), 'needs-recheck', 'added H statement invalidates');
window.eval("S.hStatements='H317'"); assert.strictEqual(recheck(), 'verified');
window.eval("S.pictograms=S.pictograms.concat(['GHS09'])"); assert.strictEqual(recheck(), 'needs-recheck', 'pictogram change invalidates');
window.eval("S.pictograms=S.pictograms.filter(k=>k!=='GHS09')"); assert.strictEqual(recheck(), 'verified');
window.eval("S.sensitisers=['Linalool']"); assert.strictEqual(recheck(), 'needs-recheck', 'named sensitiser change invalidates');
window.eval("S.sensitisers=[]"); window.eval("var _sg=S.signal; S.signal=_sg==='Danger'?'Warning':'Danger'");
assert.strictEqual(recheck(), 'needs-recheck', 'signal word change invalidates'); window.eval('S.signal=_sg');
const p0 = S('S.pStatements');
window.eval("S.pStatements='P501'"); assert.strictEqual(recheck(), 'needs-recheck', 'P statement change invalidates'); window.eval('S.pStatements=' + JSON.stringify(p0));
set('sds-doc-pct', '10.0'); assert.strictEqual(recheck(), 'verified', 'same document % written differently ');
set('sds-doc-base', 'candle+waxmelt'); assert.strictEqual(recheck(), 'needs-recheck', 'document answers changed invalidates');
set('sds-doc-base', 'candle'); assert.strictEqual(recheck(), 'verified');
ok('exports need a Step 3 confirmation; % / product type / H / P / pictogram / signal / sensitiser / document changes invalidate it');

// D1 explicit coverage ranges + D4 optional document date/version.
{
  set('product-type', 'Scented Candle'); kind('finished');
  assert.strictEqual(document.getElementById('sds-doc-coverage').value, 'single', 'one percentage is the default');
  set('sds-doc-base', 'candle'); set('sds-doc-coverage', 'range');
  assert.strictEqual(document.getElementById('sds-doc-range-fields').style.display, 'grid', 'range fields shown');
  assert.strictEqual(document.getElementById('sds-doc-pct-wrap').style.display, 'none', 'single % field hidden for a range');
  const stated = document.getElementById('sds-doc-range-stated');
  const RG = (actual, from, to, where, tick) => { set('frag-load', actual); set('sds-doc-from', from); set('sds-doc-to', to); set('sds-doc-where', where); stated.checked = tick; window.updateSdsDocCheck(); return window.evaluateSdsDoc(); };
  assert.strictEqual(RG('8', '6', '10', 'Page 1', true).code, 'range-match', '8% inside 6-10%');
  assert(/can't read the document itself/.test(window.evaluateSdsDoc().message), 'never described as proof');
  assert.strictEqual(RG('6', '6', '10', 'Page 1', true).code, 'range-match', 'lower bound inclusive');
  assert.strictEqual(RG('10', '6', '10', 'Page 1', true).code, 'range-match', 'upper bound inclusive');
  assert.strictEqual(RG('10.01', '6', '10', 'Page 1', true).code, 'range-outside', 'no tolerance above');
  assert.strictEqual(RG('5.9', '6', '10', 'Page 1', true).code, 'range-outside', 'no tolerance below');
  assert.strictEqual(RG('8', '6', '10', 'Page 1', false).code, 'range-not-stated', 'must confirm it is coverage, not an ingredient or usage range');
  assert(/ingredient range/.test(window.evaluateSdsDoc().message) && /recommended usage range/.test(window.evaluateSdsDoc().message), 'explains the exclusions');
  assert.strictEqual(RG('8', '6', '10', '', true).code, 'range-where-missing', 'where it is stated is required');
  assert.strictEqual(RG('8', '10', '6', 'Page 1', true).code, 'range-invalid');
  assert.strictEqual(RG('8', '', '10', 'Page 1', true).code, 'range-missing', 'an "up to" (no lower end) is not a range');
  RG('8', '6', '10', 'Page 1', true); set('sds-doc-base', 'waxmelt');
  assert.strictEqual(window.evaluateSdsDoc().code, 'base-mismatch', 'the range must be for the maker\'s product');
  set('sds-doc-base', 'candle'); set('sds-doc-version', 'v3, 12/08/2026');
  const st = JSON.parse(JSON.stringify(S('S.sdsDoc'))); delete st.confirmed;
  assert.deepStrictEqual(st, { kind:'finished', pct:'', base:'candle', coverage:'range', rangeFrom:'6', rangeTo:'10', where:'Page 1', rangeStated:true, docVersion:'v3, 12/08/2026' }, 'range and version recorded');
  const M = window.SdsDocCheck;
  const r = { fragLoad:'8', productType:'Scented Candle', hStatements:'H317', sdsDoc:Object.assign({}, st) };
  r.sdsDoc.confirmed = M.confirmationFor(r); assert.strictEqual(M.status(r), 'verified');
  for (const [k, v] of [['rangeTo','9'], ['where','Page 2'], ['rangeStated', false], ['docVersion','v4']]) {
    const r2 = Object.assign({}, r, { sdsDoc:Object.assign({}, r.sdsDoc, { [k]:v }) });
    assert.notStrictEqual(M.status(r2), 'verified', 'changing ' + k + ' needs Step 3 again');
  }
  const legacy = { fragLoad:'10', productType:'Scented Candle', hStatements:'H317', sdsDoc:{ kind:'finished', pct:'10', base:'candle' } };
  assert.strictEqual(M.evaluate(legacy).code, 'match', 'a finished-product answer saved before D1 is read as one percentage');
  set('sds-doc-version', ''); set('sds-doc-coverage', 'single'); stated.checked = false;
  assert.strictEqual(document.getElementById('sds-doc-range-fields').style.display, 'none');
  ok('D1 explicit coverage ranges (inclusive, no tolerance, where stated, not ingredient/usage ranges, product must match); D2 "up to" never coverage; D4 optional version recorded; all part of the confirmation');
}

// Written supplier confirmation (3 Oct 2026): supplier evidence for the
// maker's exact % and product, recorded with who / when / which document.
{
  set('product-type', 'Scented Candle'); set('frag-load', '9.0909');
  kind('supplier-confirmed');
  assert.strictEqual(document.getElementById('sds-doc-confirm-fields').style.display, 'grid', 'confirmation fields shown');
  assert.strictEqual(document.getElementById('sds-doc-pct-label').textContent, 'Percentage your supplier confirmed in writing', 'field relabelled');
  const C = (pct, base, supplier, cdate, cref) => { set('sds-doc-pct', pct); set('sds-doc-base', base); set('sds-doc-supplier', supplier); set('sds-doc-cdate', cdate); set('sds-doc-cref', cref); return window.evaluateSdsDoc(); };
  const good = ['9.0909', 'candle', 'Acme Oils Ltd', '2026-10-01', 'Lavender CLP candle 9.1%'];
  assert.strictEqual(C(...good).code, 'confirmed-match', 'exact %, product, supplier, date and document recorded');
  assert(/can't see or check that confirmation/.test(window.evaluateSdsDoc().message), 'never described as proof');
  assert.strictEqual(C('9.1', ...good.slice(1)).code, 'conf-pct-mismatch', 'a confirmation naming 9.1% is not one for 9.0909% (no tolerance)');
  assert.strictEqual(C('up to 10%', ...good.slice(1)).code, 'conf-pct-missing', 'a range is not a confirmation for the exact %');
  assert.strictEqual(C(good[0], 'waxmelt', ...good.slice(2)).code, 'base-mismatch', 'must name the product group');
  assert.strictEqual(C(good[0], good[1], '', good[3], good[4]).code, 'conf-supplier-missing');
  assert.strictEqual(C(good[0], good[1], good[2], '', good[4]).code, 'conf-date-missing');
  assert.strictEqual(C(good[0], good[1], good[2], '2999-01-01', good[4]).code, 'conf-date-missing', 'future date refused');
  assert.strictEqual(C(good[0], good[1], good[2], good[3], '').code, 'conf-ref-missing');
  C(...good);
  const st = JSON.parse(JSON.stringify(S('S.sdsDoc'))); delete st.confirmed;
  assert.deepStrictEqual(st, { kind:'supplier-confirmed', pct:'9.0909', base:'candle', supplier:'Acme Oils Ltd', cdate:'2026-10-01', cref:'Lavender CLP candle 9.1%' }, 'recorded in label state');
  assert.strictEqual(window.SdsDocCheck.status(window.eval('_sdsDocRecord()')), 'needs-recheck', 'an earlier confirmation does not carry over to new answers');
  const M = window.SdsDocCheck;
  const r = { fragLoad:'9.0909', productType:'Scented Candle', hStatements:'H317', sdsDoc:{ kind:'supplier-confirmed', pct:'9.0909', base:'candle', supplier:'Acme Oils Ltd', cdate:'2026-10-01', cref:'X1' } };
  r.sdsDoc.confirmed = M.confirmationFor(r); assert.strictEqual(M.status(r), 'verified');
  r.sdsDoc = Object.assign({}, r.sdsDoc, { cref:'X2' }); assert.strictEqual(M.status(r), 'needs-recheck', 'changing the recorded confirmation invalidates');
  // Owner switch: with SUPPLIER_CONFIRMATION_ACCEPTED=false the route is refused and never suggested.
  const src0 = fs.readFileSync('sds-doc-check.js', 'utf8');
  assert(/const SUPPLIER_CONFIRMATION_ACCEPTED = true;/.test(src0), 'switch present');
  const off = new Function('module', 'globalThis', src0.replace('const SUPPLIER_CONFIRMATION_ACCEPTED = true;', 'const SUPPLIER_CONFIRMATION_ACCEPTED = false;') + '; return module.exports;')({ exports:{} }, {});
  const offR = off.evaluate({ fragLoad:'9.0909', productType:'Scented Candle', sdsDoc:{ kind:'supplier-confirmed', pct:'9.0909', base:'candle', supplier:'A', cdate:'2026-10-01', cref:'X' } });
  assert(!offR.ok, 'switch off: confirmation not accepted');
  const offMsg = off.evaluate({ fragLoad:'9.0909', productType:'Scented Candle', sdsDoc:{ kind:'finished', pct:'9.1', base:'candle' } }).message;
  assert(!/confirmed in writing/.test(offMsg) && /Ask your supplier for GB CLP information/.test(offMsg), 'switch off: no unusable instruction, only "ask your supplier"');
  set('frag-load', '10'); kind('finished'); set('sds-doc-pct', '10'); set('sds-doc-base', 'candle');
  assert.strictEqual(document.getElementById('sds-doc-confirm-fields').style.display, 'none', 'confirmation fields hidden for a finished-product document');
  ok('written supplier confirmation: exact % and product only, who/when/which document recorded, no tolerance, invalidated on change; owner switch off hides the route and its instructions');
}
// restore the export-section fixture state
set('frag-load', '10'); doc('finished','10','candle'); window.eval('S.sdsDoc.confirmed=' + conf);

// Draft saving (3 Oct 2026): an unverified label can be saved, clearly as a draft.
window.eval('S.sdsDoc.confirmed=null');
document.getElementById('verify-checkbox').checked = true; window._labelBlockDownload = false; window.toggleDownload();
assert.strictEqual(window._downloadAllowed(), false, 'unverified: downloads blocked');
assert.strictEqual(document.getElementById('btn-save').style.pointerEvents, 'auto', 'unverified: Save is still available (draft)');
assert.strictEqual(document.getElementById('btn-png').style.pointerEvents, 'none', 'unverified: PNG stays disabled');
window.showSaveStatus();
const ss = document.getElementById('save-status');
assert(/Saved as a draft: not ready to download yet/.test(ss.textContent) && ss.classList.contains('field-alert-warn'), 'draft save status is distinct from a ready label');
window.eval('S.sdsDoc.confirmed=' + conf); window.toggleDownload(); window.showSaveStatus();
assert(/Label saved/.test(ss.textContent) && !/draft/i.test(ss.textContent) && ss.classList.contains('field-alert-success'), 'verified label: normal saved status');
const srcB = fs.readFileSync('builder.html', 'utf8');
assert(/_draft\?'✎ Draft saved':'✅ Label saved'/.test(srcB) && !/'✅ Saved!'/.test(srcB), 'Save button confirms "Draft saved" or "Label saved", matching the notice');
assert(/@media\(max-width:600px\)\{#frag-row\{grid-template-columns:1fr;\}\}/.test(srcB), 'fragrance row stacks on phones');
ok('unverified labels can be saved as drafts; downloads stay blocked; saved vs ready is clear');

// Saved with the label and restored (reopened label is verified only if unchanged).
const src = fs.readFileSync('builder.html', 'utf8');
assert(src.includes("['coverage','rangeFrom','rangeTo','where','rangeStated','docVersion','supplier','cdate','cref'].filter(k=>S.sdsDoc[k]!==undefined)") && src.includes('{confirmed:S.sdsDoc.confirmed||null}):null,') && /S\.sdsDoc=e\.sdsDoc\|\|null/.test(src) && /set\('sds-doc-supplier',_d\.supplier\|\|''\)/.test(src) && /set\('sds-doc-from',_d\.rangeFrom\|\|''\)/.test(src) && /set\('sds-doc-version',_d\.docVersion\|\|''\)/.test(src), 'saved and restored with the label (range, version and written confirmation records included)');
assert(/forceGoToStep\(5\)/.test(src) && /SdsDocCheck\.isVerified\(_sdsDocRecord\(\)\)/.test(src), 'reopened labels go straight to Step 5, where the same gate applies');
const pr = fs.readFileSync('print.html', 'utf8');
assert(/<script src="sds-doc-check\.js"><\/script>/.test(pr) && /const sdsMsg=getSheetSdsDocBlockMessage\(\);\s*if\(sdsMsg\)return contentMsg\?sdsMsg\+'\\n\\n'\+contentMsg:sdsMsg;/.test(pr), 'Composer single export gate includes the document check');
ok('confirmation saved with the label; Composer uses the same module');

// Pure module: a legacy saved record (no sdsDoc / no confirmation) is blocked; a confirmed one passes.
const M = window.SdsDocCheck;
const rec = { scentName:'Musk', productType:'Wax Melt', fragLoad:'8.5%', hStatements:'H317, H412', pStatements:'P280', pictograms:['GHS07'], signal:'Warning', sensitisers:['Coumarin'] };
assert.strictEqual(M.status(rec), 'not-checked');
rec.sdsDoc = { kind:'finished', pct:'8.5', base:'waxmelt' };
assert.strictEqual(M.status(rec), 'not-checked', 'answers without confirmation');
rec.sdsDoc.confirmed = M.confirmationFor(rec); assert.strictEqual(M.status(rec), 'verified');
rec.pictograms = ['GHS07','GHS09']; assert.strictEqual(M.status(rec), 'needs-recheck');
ok('shared module statuses for saved records');

assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no script errors');
console.log(`sds-document-applicability checks passed (${n} groups)`);
