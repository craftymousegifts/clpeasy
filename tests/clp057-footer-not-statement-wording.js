// CLP-057 (30 Oct 2026): a supplier-address footer must never become part of a
// statement's wording. Text that runs into a page-number/date/version block is
// flagged for review instead of joined. Genuine continuations are preserved
// when no page block follows them, and flagged (never guessed) when one does.
// Fixture: Freshskin No5 Reed Diffuser (25% + Augeo) Section 2.2 (pages 1-2),
// text extracted from the PDF and supplied by ChatGPT via Michaela; NOT verified
// browser-copied text. Other texts are labelled synthetic variants.
//   node tests/clp057-footer-not-statement-wording.js
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

const W = require('../sds-supplier-wording.js');
const REAL = fs.readFileSync(path.join(__dirname, 'fixtures/clp057/freshskin-no5-reed-diffuser-section-2-2.txt'), 'utf8');
const NO_LTD = REAL.replace('Freshskin Beauty Ltd,', 'Freshskin Beauty,');           // synthetic variant
const FOOTER = /Freshskin|Grant House|Nottingham|Example Supplies|Exampletown|Page \d|Issue date|Version|SAFETY DATA SHEET|REACH|Product:|www\.|Tel/i;
const H412 = 'Harmful to aquatic life with long lasting effects.';
const noFooterInWording = (a, tag) => Object.entries(a.wording).forEach(([c, t]) => assert(!FOOTER.test(t), `${tag}: ${c} wording contains page furniture: ${t}`));
const head = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.';
const tail = 'Precautionary statements:\nP273 Avoid release to the environment.\nP501 Dispose of contents/container to approved disposal site.';
const SYN = {   // synthetic layouts
  'address directly after statement, then Page x of y': `${head}\nExample Supplies, 1 Example Street, Exampletown EX1 1XX\nPage 1 of 4\nIssue date: 11/02/2021\n\n${tail}`,
  'address with Limited, blank, page number': `${head}\n\nExample Supplies Limited, 1 Example Street\n\nPage 1 (4)\n\n${tail}`,
  'website and phone footer, then page number': `${head}\nwww.example.co.uk  Tel 0100 000000\nPage 1/4\n\n${tail}`,
  'address, blank, page number, repeated product heading': `${head}\n\nExample Supplies, 1 Example Street\n\nPage 1 of 4\n\nExample Reed Diffuser\n${tail}`,
  'address then a repeated page header, no page number': `${head}\nExample Supplies, 1 Example Street\n\nSAFETY DATA SHEET\nProduct: Example Reed Diffuser\n\n${tail}`,
  'statement wording genuinely split by the page break': head.replace(' long lasting effects.', ' long') + `\nExample Supplies, 1 Example Street\nPage 1 of 4\n\nlasting effects.\n${tail}`,
};

(async () => {
  // 1. Real text: H412 stays flagged; everything else exact; no footer text anywhere.
  let a = W.analyse(REAL);
  assert.deepStrictEqual(a.issues, ['H412']); noFooterInWording(a, 'real');
  assert.strictEqual(a.wording.H319, 'Causes serious eye irritation.');
  assert.strictEqual(a.wording['P305+P351+P338'], 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.');
  assert.strictEqual(a.wording.P501, 'Dispose of contents/container to approved disposal site, in accordance with local regulations.');
  assert(/^Contains Acetyl cedrene, .* alpha-Isomethyl ionone\. May produce an allergic reaction\.$/.test(a.wording.EUH208));
  assert.strictEqual(Object.keys(a.wording).length, 14);   // H317, H319, EUH208 and 11 P statements
  ok('real Freshskin Section 2.2: H412 flagged, 14 other entries exact, no footer text');

  // 2. The fault: an address without "Ltd" is no longer joined to H412.
  a = W.analyse(NO_LTD);
  assert(a.issues.includes('H412') && !('H412' in a.wording), 'address without Ltd flags H412'); noFooterInWording(a, 'no-ltd');
  ok('address without "Ltd" before a page block: H412 flagged, never merged');

  // 3. Synthetic footer layouts: always flagged, never merged.
  for (const [tag, t] of Object.entries(SYN)) {
    a = W.analyse(t);
    assert(a.issues.includes('H412') && !('H412' in a.wording), tag + ': H412 flagged'); noFooterInWording(a, tag);
    assert.strictEqual(a.wording.P273, 'Avoid release to the environment.', tag + ': next statement unaffected');
  }
  ok(`${Object.keys(SYN).length} synthetic footer layouts: flagged, no footer text in any wording`);

  // 4. Genuine continuations without a page block are preserved exactly.
  a = W.analyse('2.2 Label elements\nH412 Harmful to aquatic life\nwith long lasting effects.\nP305+P351+P338 IF IN EYES: Rinse cautiously with water for several minutes.\n\nRemove contact lenses, if present and easy to do. Continue rinsing.\nP501 Dispose of contents.');
  assert.deepStrictEqual(a.issues, []);
  assert.strictEqual(a.wording.H412, H412);
  assert.strictEqual(a.wording['P305+P351+P338'], 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.');
  ok('wrapped lines and paragraph continuations without a page break are preserved');

  // 5. A page block that is clearly separate still ends the statement cleanly.
  a = W.analyse(`${head}\nPage 1 of 4\nIssue date: 11/02/2021\n\n${tail}`);
  assert.deepStrictEqual(a.issues, []); assert.strictEqual(a.wording.H412, H412); noFooterInWording(a, 'page-first');
  ok('page block followed by the next heading: statement complete, not flagged');

  // 6. A continuation line that runs straight into a page block is flagged, not guessed.
  a = W.analyse(head.replace(' long lasting effects.', ' long') + `\nlasting effects.\nPage 1 of 4\n\n${tail}`);
  assert(a.issues.includes('H412') && !('H412' in a.wording)); noFooterInWording(a, 'wrap-then-page');
  ok('continuation that runs into a page block is flagged for review');

  // 7. Builder, save/reopen and Composer: the address-without-Ltd variant is blocked everywhere.
  await new Promise(r => setImmediate(r));
  window.eval(require('./helpers/sds-doc-answer').SCRIPT);
  for (const [id, val] of Object.entries({'scent-name':'CLP057','product-type':'Reed Diffuser','frag-load':'25%','biz-name':'Test','biz-address':'1 Test Road','biz-phone':'00000000000'})) { const e = box(id); if (e) e.value = val; }
  window.selectShape('rectangle'); window.selectSize('custom'); box('custom-w').value = '150'; box('custom-h').value = '150'; window.onDimInput();
  window.setApprovedBuilderStep(3); box('smart-paste-input').value = NO_LTD; box('sds-source-confirm').checked = true; window.confirmSdsSource(); window.extractSDS();
  window.__confirmSdsDoc(); box('hazard-confirm').checked = true; window.updateLabel();
  const S = window.eval('S');
  assert(S.hStatements.includes('H412'), 'H412 stays visible'); assert.strictEqual(JSON.stringify(S.supplierWordingIssues), '["H412"]');
  window.__lastAlert = ''; assert(!window.canLeaveApprovedBuilderStep(3)); assert(/H412/.test(window.__lastAlert));
  assert(window._labelBlockDownload, 'download blocked');
  const svgText = new window.DOMParser().parseFromString(window.buildSVG(true), 'image/svg+xml').documentElement.textContent;
  assert(!/Grant House|Freshskin Beauty/.test(svgText), 'no address on the label');
  await window.saveLabel(); const saved = window.getSaved().find(e => e.scentName === 'CLP057'); assert(saved, 'saved');
  window.clearHazardData(); window.loadLabelRecord(saved); window.updateLabel();
  assert(window._labelBlockDownload, 'reopened label still blocked');
  const r = window.LabelRenderer.renderLabel(saved, { instanceId: 'composer', forExport: true, watermark: true });
  assert(r.blocked && r.blockReasonCodes.includes('H412'), 'Composer blocks with H412');
  assert.deepStrictEqual(jsErrors, []);
  ok('Builder, save/reopen and Composer: H412 visible, review required, export blocked, no address');
  console.log(`\n${n} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
