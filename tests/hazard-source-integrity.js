// Owner decisions C3 + C4 (26 Sep 2026), Builder hazard-state integrity.
//
// C3 (SDS-06): a saved label reopened into the Builder restores the same
// Step 3 lock state as straight after a successful Smart Paste extraction.
// The evidence of a processed extraction is the saved hazardFromExtraction
// flag (v12 onwards) or, for older labels, a non-empty saved sdsSignal (only
// extractSDS() ever writes it; Clear empties it). Manual hazard data stays
// editable, and a lock never carries over to the next label opened.
//
// C4 (SDS-15): the Builder has no separate fragrance/SDS identity field, so a
// change of product name after hazard data was entered must be answered:
// same fragrance oil + SDS (keep) or different (old hazard data cleared and
// extracted again). Until answered nothing can be saved, downloaded or taken
// past Steps 2/3. Case/spacing/punctuation-only edits are not a change.
//
// Run from the repo root: node tests/hazard-source-integrity.js
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

const SDS_A = `2.2 Label elements
Signal word: Warning
Hazard statements: H317 May cause an allergic skin reaction. H412 Harmful to aquatic life with long lasting effects.
EUH208 Contains Linalool, Limonene. May produce an allergic reaction.
Precautionary statements: P261 P302+P352 P501`;
const SDS_B = `2.2 Label elements
Signal word: Danger
Hazard statements: H318 Causes serious eye damage.
Precautionary statements: P280 P305+P351+P338 P501`;

function setName(name){
  document.getElementById('scent-name').value = name;
  window.updateLabel();
}
function fillBasics(name){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '80';
  document.getElementById('custom-h').value = '100';
  window.onDimInput();
  document.getElementById('product-type').value = 'Scented Candle';
  document.getElementById('biz-name').value = 'Crafty Mouse Gifts';
  document.getElementById('biz-phone').value = '01234 567890';
  setName(name);
}
function extract(text){
  window.setApprovedBuilderStep(3);
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
}
function lockState(){
  return {
    box: document.getElementById('smart-paste-input').readOnly,
    h: document.getElementById('h-statements').readOnly,
    extractDisabled: !!document.querySelector('.btn-extract')?.disabled,
  };
}
function hazardSnapshot(){
  return {
    h: S('S.hStatements'), p: S('S.pStatements'), signal: S('S.signal'), sdsSignal: S('S.sdsSignal'),
    pictos: [...S('S.pictograms')], sens: [...S('S.sensitisers')],
    p280: [...S('S.p280Items')], p280Other: S('S.p280Other'),
  };
}
function notices(){ return [...document.querySelectorAll('.hazard-review-notice')]; }
function noticeShown(){ return notices().every(n => n.style.display === 'block'); }
function tickVerify(){ const v = document.getElementById('verify-checkbox'); v.checked = true; window.toggleDownload(); }
function ok(msg){ console.log('PASS: ' + msg); }

(async () => {
  await new Promise(r => setTimeout(r, 80));

  // ── C3: fresh extraction locks Step 3 and the flag is saved ──────────
  fillBasics('Lavender Candle');
  extract(SDS_A);
  const fresh = lockState();
  assert.deepStrictEqual(fresh, { box:true, h:true, extractDisabled:true }, 'setup: a successful extraction locks Step 3');
  assert.strictEqual(S('S.hazardFromExtraction'), true, 'successful extraction sets hazardFromExtraction');
  const extracted = hazardSnapshot();
  assert(extracted.h.includes('H317') && extracted.h.includes('EUH208'), 'setup: H + EUH extracted');
  assert.strictEqual(extracted.signal, 'Warning', 'setup: signal word extracted');
  assert(extracted.pictos.includes('exclamation'), 'setup: pictogram extracted');
  assert(extracted.sens.length >= 2, 'setup: EUH208 sensitisers extracted');
  await window.saveLabel();
  const saved = S('getSaved()').find(e => e.scentName === 'Lavender Candle');
  assert(saved && saved.hazardFromExtraction === true, 'the saved label records hazardFromExtraction:true');
  ok('C3: successful extraction locks Step 3 and the saved label records the processed-extraction flag');

  // Reopen in a fresh state (Clear first, so nothing is carried in memory).
  window.clearHazardData();
  assert.deepStrictEqual(lockState(), { box:false, h:false, extractDisabled:false }, 'Clear unlocks Step 3');
  assert.strictEqual(S('S.hazardFromExtraction'), false, 'Clear resets the extraction flag');
  window.loadLabelRecord(saved);
  assert.deepStrictEqual(lockState(), fresh, 'C3/SDS-06: a reopened extracted label has exactly the post-extraction lock state');
  assert.strictEqual(document.getElementById('smart-paste-input').value, '', 'raw SDS text is still not stored (unchanged design)');
  assert.deepStrictEqual(hazardSnapshot(), extracted, 'reopened label restores the same processed hazard state');
  ok('C3/SDS-06: reopened extracted label is locked exactly like straight after extraction');

  // Legacy label (saved before v12, no flag) with a saved sdsSignal: locked.
  const legacyExtracted = Object.assign({}, saved, { id:'legacy-extracted' });
  delete legacyExtracted.hazardFromExtraction;
  window.loadLabelRecord(legacyExtracted);
  assert.deepStrictEqual(lockState(), fresh, 'C3: a legacy label whose saved sdsSignal proves an extraction is locked');
  // Manual label (no extraction evidence) opened AFTER a locked one: unlocked.
  const manual = Object.assign({}, saved, { id:'manual', scentName:'Manual Label', sdsSignal:'', hazardFromExtraction:false });
  window.loadLabelRecord(manual);
  assert.deepStrictEqual(lockState(), { box:false, h:false, extractDisabled:false }, 'C3: manually entered hazard data stays editable, and the previous label\'s lock does not carry over');
  const legacyManual = Object.assign({}, manual, { id:'legacy-manual' });
  delete legacyManual.hazardFromExtraction; delete legacyManual.sdsSignal;
  window.loadLabelRecord(legacyManual);
  assert.deepStrictEqual(lockState(), { box:false, h:false, extractDisabled:false }, 'C3: a legacy label without extraction evidence is not locked on arbitrary saved text');
  ok('C3: legacy extracted labels lock, manual/legacy-manual labels stay editable, no lock carry-over');

  // ── C4: same SDS + cosmetic rename ───────────────────────────────────
  window.loadLabelRecord(saved);
  tickVerify();
  assert.strictEqual(window._downloadAllowed(), true, 'setup: reopened label is downloadable once verified');
  setName('  lavender   CANDLE! ');
  assert.strictEqual(window._hazardReviewRequired(), false, 'C4: case/spacing/punctuation-only edits are not an SDS change');
  assert(!noticeShown(), 'C4: no review notice for a cosmetic edit');
  assert.strictEqual(window._downloadAllowed(), true, 'C4: cosmetic edit does not block download');
  ok('C4: cosmetic rename (case/spacing/punctuation) causes no friction');

  // ── C4: reopened saved label then changed (SDS-15) ───────────────────
  setName('Different Fragrance');
  assert.strictEqual(window._hazardReviewRequired(), true, 'C4/SDS-15: renaming a reopened label with hazard data requires a review');
  assert.strictEqual(notices().length, 3, 'review notice exists in Steps 2, 3 and 5');
  assert(noticeShown(), 'C4: review notice is shown in Steps 2, 3 and 5');
  assert(/Lavender Candle/.test(notices()[0].textContent) && /Different Fragrance/.test(notices()[0].textContent), 'notice names the old and new product');
  assert.strictEqual(window._downloadAllowed(), false, 'C4: export is blocked while the review is unanswered');
  const dlBefore = downloads;
  window.__lastAlert = undefined;
  await window.downloadSVG();
  assert.strictEqual(downloads, dlBefore, 'C4: no file is produced while the review is unanswered');
  assert(/same fragrance oil and SDS/.test(window.__lastAlert || ''), 'C4: the download explains the review, not the generic checkbox message');
  window.__lastAlert = undefined;
  assert.strictEqual(window.canLeaveApprovedBuilderStep(2), false, 'C4: cannot leave Step 2 unanswered');
  document.getElementById('hazard-confirm').checked = true;
  assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'C4: cannot leave Step 3 unanswered');
  const nSaved = S('getSaved().length');
  await window.saveLabel();
  assert.strictEqual(S('getSaved().length'), nSaved, 'C4: nothing is saved while unanswered');
  assert.strictEqual(S('getSaved()').find(e => e.id === saved.id).scentName, 'Lavender Candle', 'C4: the saved copy keeps its old name and hazards');
  ok('C4/SDS-15: renamed reopened label is blocked from save, download and Steps 2/3 until answered');

  // Answer: same fragrance oil and SDS -> keep (one click).
  notices()[0].querySelector('.hazard-review-keep').click();
  assert.strictEqual(window._hazardReviewRequired(), false, 'keep clears the review');
  assert(!noticeShown(), 'keep hides the notices');
  assert.deepStrictEqual(hazardSnapshot(), extracted, 'keep leaves the hazard data untouched');
  assert.strictEqual(window._downloadAllowed(), true, 'keep re-allows download (verification still ticked)');
  const dlKeep = downloads;
  await window.downloadSVG();
  assert.strictEqual(downloads, dlKeep + 1, 'positive control: once answered, the same download call does produce a file');
  ok('C4: "same fragrance oil and SDS" keeps the hazard data with one click');

  // ── C4: different fragrance/SDS -> old regulatory state invalidated ───
  setName('Rose Candle');
  assert.strictEqual(window._hazardReviewRequired(), true, 'setup: second rename needs review');
  window.forceGoToStep(5);
  notices()[2].querySelector('.hazard-review-clear').click();
  const cleared = hazardSnapshot();
  assert.deepStrictEqual(cleared, { h:'', p:'', signal:'', sdsSignal:'', pictos:[], sens:[], p280:[], p280Other:'' },
    'C4: old H/EUH/EUH208, P, P280, pictograms, signal word and sensitisers are all cleared');
  assert.strictEqual(S('approvedBuilderStep'), 3, 'C4: the maker is taken back to Step 3 to extract the new SDS');
  assert.deepStrictEqual(lockState(), { box:false, h:false, extractDisabled:false }, 'C4: Step 3 is unlocked for the new SDS');
  assert.strictEqual(S('S.hazardFromExtraction'), false, 'C4: extraction flag cleared');
  assert.strictEqual(document.getElementById('verify-checkbox').checked, false, 'C4: final verification must be ticked again');
  assert.strictEqual(window._downloadAllowed(), false, 'C4: export stays blocked');
  document.getElementById('hazard-confirm').checked = true;
  assert.strictEqual(window.canLeaveApprovedBuilderStep(3), false, 'C4: Step 3 cannot be left until the new SDS is extracted');
  const svg = window.buildSVG(true);
  assert(!/H317|allergic skin|Linalool|WARNING/i.test(svg.replace(/<[^>]+>/g, ' ')), 'C4: preview has no stale hazard text, sensitisers or signal word');
  ok('C4: "different fragrance or SDS" invalidates all old regulatory data and blocks export');

  extract(SDS_B);
  const fresh2 = hazardSnapshot();
  assert(fresh2.h.includes('H318') && !fresh2.h.includes('H317') && !fresh2.h.includes('EUH208'), 'new SDS only: no stale H317/EUH208');
  assert.strictEqual(fresh2.signal, 'Danger', 'new signal word');
  assert.deepStrictEqual(fresh2.sens, [], 'no stale sensitisers');
  assert(!fresh2.pictos.includes('exclamation') && fresh2.pictos.includes('corrosive'), 'no stale pictogram; new one present');
  assert.strictEqual(window._hazardReviewRequired(), false, 'the new extraction belongs to the current name');
  document.getElementById('hazard-confirm').checked = true;
  assert.strictEqual(window.canLeaveApprovedBuilderStep(3), true, 'Step 3 can be left once the new SDS is extracted and confirmed');
  tickVerify();
  assert.strictEqual(window._downloadAllowed(), true, 'export allowed again once the new regulatory state is valid and verified');
  ok('C4: after re-extraction only the new SDS data is used and export is allowed again');

  // ── C4: naming a product for the first time is not a change ──────────
  window.clearHazardData();
  setName('');
  extract(SDS_A);
  setName('Brand New Product');
  assert.strictEqual(window._hazardReviewRequired(), false, 'C4: hazard data entered before the first name is not an SDS change');
  setName('Another Product');
  assert.strictEqual(window._hazardReviewRequired(), true, 'C4: but a later rename is');
  window.confirmSameHazardSource();
  ok('C4: first naming adopts the name; later renames need an answer');

  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('hazard source integrity checks passed (C3 + C4)');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
