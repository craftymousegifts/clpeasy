// CLP-007 customer-message corrections (founder-approved 26 Oct 2026) —
// real-browser checks on the Builder and Print Sheet Composer.
//   1. Each affected code is named once in blocked-label messages (Builder,
//      label preview, Composer); every distinct code is kept and blocking
//      is unchanged.
//   2. An older label with P241 and no saved supplier wording shows the
//      approved P241 guidance in the Builder, never "not recognised".
// Scenarios: legacy P241 without supplier wording; Smart Paste code-only
// P241; open-choice P241; complete supplier P241 incl. save/reopen; several
// codes at once; other unrecognised P codes unchanged; legacy P280 unchanged.
//   node tests/clp007-p241-message-corrections.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP clp007-p241-message-corrections: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP clp007-p241-message-corrections: no Chromium available'); process.exit(0); }
const HELPER = require('./helpers/sds-doc-answer').SCRIPT;
const STUB = `window.supabase={createClient:function(){var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:null,error:null})},maybeSingle:function(){return Promise.resolve({data:null,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:null}}},getUser:async function(){return {data:{user:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const GUIDANCE1 = 'This precautionary statement needs the full wording from your supplier’s SDS Section 2.2. Check the source document before continuing.';
const GUIDANCE2 = 'CLPeasy cannot complete this label until the required wording has been confirmed. The label remains blocked from download.';
const S22 = (p241) => '2.2 Label elements\nSignal word: Warning\nH226 Flammable liquid and vapour.\nP210 Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.\n' + p241 + '\nP501 Dispose of contents/container in accordance with local regulations.';
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false;
  async function open(page) {
    const t = await browser.newPage();
    t.errs = []; t.alerts = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.alerts.push(d.message()); d.dismiss(); });
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: STUB });
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await t.evaluate(HELPER).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    return t;
  }
  try {
    const t = await open('builder.html');
    const SRC = { code: S22('P241'), open: S22('P241 Use explosion-proof [electrical/ventilating/lighting/…] equipment.'), complete: S22('P241 Use explosion-proof electrical/ventilating/lighting equipment.') };
    const R = await t.evaluate(async (SRC) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const base = { scentName: 'CLP007 QA', productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 80, customH: 80, bizName: 'QA Candles', bizAddress: '1 Test Street, Testtown, TE1 1ST', bizPhone: '01234 567890', fragLoad: '10%', showOnLabel: {}, omissionConfirmations: {}, sensitisers: [] };
      async function snap() {
        readForm(); updateLabel(); await sleep(300);
        const sv = buildSVG(true);
        const text = sv.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        return {
          blocked: !!window._labelBlockDownload,
          generic: [...(window._unrecognizedCodesGeneric || [])],
          unsupported: [...(window._unsupportedCodes || [])],
          panel: (document.getElementById('label-warn-step5') || {}).innerHTML || '',
          text,
          builderMsg: (window._unrecognizedCodesGeneric || []).length ? clpUnrecognisedCodesMessage(window._unrecognizedCodesGeneric) : null,
          builderMsgHtml: (window._unrecognizedCodesGeneric || []).length ? clpUnrecognisedCodesMessage(window._unrecognizedCodesGeneric, escapeBuilderText) : null
        };
      }
      // CLP-007 lockdown: an older label without Smart Paste data is one
      // registered before the lockdown (hazard-provenance.js).
      async function reopen(rec) {
        const r = Object.assign({}, base, rec);
        if (!HazardProvenance.isExtracted(r)) window._clpLegacyRegister = Object.assign({}, window._clpLegacyRegister, { [HazardProvenance.fingerprint(r)]: { wording: {}, acceptedAt: 'test' } });
        loadLabelRecord(r); await sleep(300); return snap();
      }
      async function paste(sds) {
        clearHazardData(); document.getElementById('scent-name').value = 'CLP007 QA'; document.getElementById('product-type').value = 'Scented Candle'; onProductTypeChange();
        document.getElementById('smart-paste-input').value = sds; extractSDS(); await sleep(200); return snap();
      }
      const legacy = { hazardFromExtraction: undefined, sdsSignal: '', signal: 'Warning', hStatements: 'H226', pictograms: ['flame'] };
      const out = {};
      out.legacyP241 = await reopen(Object.assign({}, legacy, { pStatements: 'P210, P241, P501' }));
      // Step 3 check (plain-text pop-up) for the same older label.
      { const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true; }
      out.step3 = canLeaveApprovedBuilderStep(3);
      out.legacyMixed = await reopen(Object.assign({}, legacy, { pStatements: 'P210, P241, P202, P999, P501' }));
      out.legacyGbP241 = await reopen(Object.assign({}, legacy, { hStatements: 'H226, H401', pStatements: 'P210, P241, P501' }));
      out.legacyP999 = await reopen(Object.assign({}, legacy, { pStatements: 'P210, P999, P501' }));
      out.legacyP280 = await reopen(Object.assign({}, legacy, { pStatements: 'P210, P280, P501', p280Items: [] }));
      out.codeOnly = await paste(SRC.code);
      out.openChoice = await paste(SRC.open);
      out.openChoiceReopened = await reopen({ hazardFromExtraction: true, sdsSignal: 'Warning', signal: 'Warning', hStatements: 'H226', pStatements: 'P210, P241, P501', pictograms: ['flame'], sourceSection22: SRC.open });
      out.multiSupplier = await paste('2.2 Label elements\nSignal word: Warning\nH226 Flammable liquid and vapour.\nP241 Use explosion-proof [electrical/…] equipment.\nP280 Wear protective gloves/…\nP501 Dispose of contents/container in accordance with local regulations.');
      out.complete = await paste(SRC.complete);
      const before = getSaved().map(x => x.id);
      const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); }
      await saveLabel(); await sleep(500);
      const saved = getSaved().find(x => !before.includes(x.id) && x.scentName === 'CLP007 QA');
      out.saved = saved ? { P241: saved.supplierWording && saved.supplierWording.P241, issues: saved.supplierWordingIssues } : null;
      clearHazardData(); await sleep(100);
      out.completeReopened = saved ? await reopen(saved) : null;
      out.records = {
        legacyP241: Object.assign({}, base, legacy, { pStatements: 'P210, P241, P501' }),
        openChoice: Object.assign({}, base, { hazardFromExtraction: true, sdsSignal: 'Warning', signal: 'Warning', hStatements: 'H226', pStatements: 'P210, P241, P501', pictograms: ['flame'], sourceSection22: SRC.open })
      };
      return out;
    }, SRC);
    const alerts = t.alerts.slice();

    // 1. Older label, P241, no saved supplier wording.
    const L = R.legacyP241;
    assert(L.blocked, 'legacy P241 stays blocked');
    assert.deepStrictEqual(L.generic, ['P241']);
    assert.strictEqual(L.builderMsg.body, 'P241: ' + GUIDANCE1 + '\n\n' + GUIDANCE2, 'plain-text Builder message');
    assert.strictEqual(L.builderMsgHtml.body, 'P241: ' + GUIDANCE1 + '<br><br>' + GUIDANCE2, 'HTML Builder message');
    assert(!/recognis|entered in error|invalid/i.test(L.builderMsg.heading + L.builderMsg.body), 'P241 not described as unrecognised/invalid');
    assert(!/was copied|you pasted|previously|extracted|saved/i.test(L.builderMsg.body), 'does not imply an SDS was pasted or saved');
    assert(R.step3 === false && alerts.some(a => a.includes('P241: ' + GUIDANCE1 + '\n\n' + GUIDANCE2) && !/did not recognise/.test(a)), 'Step 3 check shows the approved guidance and still stops: ' + alerts.join(' || '));
    assert(/P241 was not recognised by CLPeasy\./.test(L.text) && (L.text.match(/P241/g) || []).length === 1, 'label preview wording unchanged, P241 named once');
    assert.strictEqual(L.panel, '<strong>⚠️ A code can\'t be added to this label</strong><br><br>P241: ' + GUIDANCE1 + '<br><br>' + GUIDANCE2, 'Step 5 panel shows only the approved guidance: ' + L.panel);
    ok('older label with P241 and no supplier wording: approved P241 guidance in Builder (Step 5 panel, message, Step 3), still blocked; preview wording unchanged');

    // 2. Smart Paste code-only P241 / 3. open-choice P241 (fresh and reopened).
    for (const [name, s] of [['code-only P241', R.codeOnly], ['open-choice P241', R.openChoice], ['reopened open-choice P241', R.openChoiceReopened]]) {
      assert(s.blocked, name + ' stays blocked');
      assert.deepStrictEqual(s.generic, ['P241'], name + ' named once (was P241, P241)');
      assert(s.builderMsg.body.startsWith(GUIDANCE1 + ' CLPeasy could not reliably preserve the complete supplier wording for: P241. '), name + ' message: ' + s.builderMsg.body.slice(0, 220));
      assert((s.text.match(/P241/g) || []).length === 1 && /P241 need complete, unambiguous supplier wording\./.test(s.text), name + ' preview names P241 once');
    }
    ok('Smart Paste code-only and open-choice P241 (fresh and reopened): blocked, existing approved message, P241 named once everywhere');

    // 4. Complete supplier wording, incl. save/reopen.
    for (const [name, s] of [['pasted', R.complete], ['reopened', R.completeReopened]]) {
      assert(s && !s.blocked && !s.generic.length, name + ' complete P241 not blocked');
      assert(s.text.includes('Use explosion-proof electrical/ventilating/lighting equipment.'), name + ' prints supplier wording exactly');
    }
    assert.deepStrictEqual(R.saved, { P241: 'Use explosion-proof electrical/ventilating/lighting equipment.', issues: [] });
    ok('complete supplier P241: printed exactly, saved and reopened unchanged, not blocked');

    // 5. Several codes at once, no duplicates; every distinct code kept.
    const M = R.legacyMixed;
    assert(M.blocked);
    assert.deepStrictEqual(M.generic, ['P241', 'P202', 'P999']);
    assert(M.builderMsg.heading === 'Some codes can\'t be added to this label');
    assert(M.builderMsg.body.startsWith('P241: ' + GUIDANCE1 + '\n\n' + GUIDANCE2 + '\n\nCLPeasy did not recognise the following codes: P202, P999.'), 'mixed message: ' + M.builderMsg.body.slice(0, 260));
    assert(!/did not recognise[^.]*P241/.test(M.builderMsg.body), 'P241 not listed as unrecognised');
    assert(M.panel.includes('P241: ' + GUIDANCE1) && M.panel.includes('did not recognise the following codes: P202, P999.') && M.panel.includes('Double-check this code against your SDS Section 2.2'), 'mixed panel keeps advice for the other codes');
    const MS = R.multiSupplier;
    assert(MS.blocked && MS.generic.length === new Set(MS.generic).size && MS.generic.includes('P241') && MS.generic.includes('P280'), 'supplier P241 + P280 each once: ' + MS.generic);
    assert(MS.builderMsg.body.includes('for: ' + MS.generic.join(', ') + '.'), 'supplier message lists each code once');
    ok('several codes: older label shows P241 guidance plus the generic message for P202, P999; Smart Paste P241 + P280 each named once; all blocked');

    // 6. Other unrecognised P codes and older P280 unchanged.
    const G = R.legacyGbP241;
    assert(G.blocked && G.unsupported.includes('H401') && G.generic.join() === 'P241', 'H401 + P241: ' + JSON.stringify([G.unsupported, G.generic]));
    assert(G.panel.includes('supplier confirmation for a Great Britain CLP label') && G.panel.includes('P241: ' + GUIDANCE1) && !G.panel.includes('entered in error'), 'GB-unsupported + older P241 panel: both explained, no "entered in error" for P241');
    ok('older label with a GB-unsupported code (H401) and P241: both explained, P241 guidance without "entered in error", still blocked');
    const O = R.legacyP999;
    assert(O.blocked && O.builderMsg.heading === 'A code can\'t be added to this label' && O.builderMsg.body.startsWith('CLPeasy did not recognise the following code: P999. Check that the SDS text was copied correctly'), 'P999 generic message unchanged');
    assert(O.panel.includes('Double-check this code against your SDS Section 2.2') && O.panel.includes('rather than show an unrecognised code'), 'P999 panel advice unchanged');
    const P = R.legacyP280;
    assert(P.blocked && !P.generic.includes('P241') && !/P241|This precautionary statement needs/.test(JSON.stringify(P.builderMsg || '')), 'older P280 unchanged: ' + JSON.stringify(P.generic));
    ok('other unrecognised P codes keep the existing generic message; older P280 label behaviour unchanged');
    assert(!t.errs.length, 'Builder page errors: ' + t.errs.join(' | '));
    await t.close();

    // Print Sheet Composer: same saved labels, codes named once, wording unchanged.
    const c = await open('print.html');
    const C = await c.evaluate((recs) => {
      const r = {};
      for (const [k, rec] of Object.entries(recs)) {
        const res = LabelRenderer.renderLabel(rec, { instanceId: 'clp007-' + k });
        r[k] = { fits: res.fits, warnings: res.warnings.filter(w => w.startsWith('unrecognized-code:')), msg: describeFitWarnings(res.warnings, null) };
      }
      return r;
    }, R.records);
    assert.deepStrictEqual(C.legacyP241.warnings, ['unrecognized-code:P241']);
    assert.strictEqual(C.legacyP241.msg, 'Contains a hazard/precautionary code CLPeasy doesn\'t recognise: P241.');
    assert.deepStrictEqual(C.openChoice.warnings, ['unrecognized-code:P241']);
    assert.strictEqual(C.openChoice.msg, 'Contains a hazard/precautionary code CLPeasy doesn\'t recognise: P241.');
    assert(C.legacyP241.fits === false && C.openChoice.fits === false, 'Composer still refuses both labels');
    assert(!c.errs.length, 'Composer page errors: ' + c.errs.join(' | '));
    ok('Print Sheet Composer: P241 named once (was "P241, P241"), wording unchanged, labels still refused');
    await c.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e.message);
  }
  await browser.close();
  server.close();
  console.log(failed ? '\nclp007-p241-message-corrections: FAILED' : `\nclp007-p241-message-corrections: ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
});
