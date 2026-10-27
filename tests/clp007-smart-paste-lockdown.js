// CLP-007 Smart Paste lockdown (founder-approved, 26 Oct 2026) — real-browser
// checks on the Builder, My Labels and the Print Sheet Composer.
//   1. New labels and Clear: no manual H/P entry route (chips, P280 picker,
//      typing into the H/P boxes, keyboard) — desktop and mobile.
//   2. Smart Paste: unchanged display (codes + supplier wording), locked.
//   3. Older manual labels: registered once (frozen), read-only, printable,
//      wording frozen; ambiguous/release-day/new manual data is blocked.
//   4. P370+P378 / P321 without supplier wording block with the approved
//      guidance; complete supplier wording still prints.
//   5. Save/reopen, resize, duplicate, version restore, product type / load
//      changes and the Composer cannot bypass the lockdown.
//   node tests/clp007-smart-paste-lockdown.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP clp007-smart-paste-lockdown: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP clp007-smart-paste-lockdown: no Chromium available'); process.exit(0); }
const HELPER = require('./helpers/sds-doc-answer').SCRIPT;
const HP = require('../hazard-provenance.js');
const stub = (session) => `window.supabase={createClient:function(){var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:null,error:null})},maybeSingle:function(){return Promise.resolve({data:null,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:${session}}}},getUser:async function(){return {data:{user:${session}?${session}.user:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const GUEST = stub('null');
const USER = stub(`({user:{id:'u-clp007',email:'maker@example.com',user_metadata:{}},access_token:'t'})`);
const GUIDANCE1 = 'This precautionary statement needs the full wording from your supplier’s SDS Section 2.2. Check the source document before continuing.';
const BLOCK = HP.BLOCK_MESSAGE;
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// ── Seeded library (written before any page script runs) ────────────────
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const BASE = { productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 80, customH: 80, fragLoad: '10%',
  bizName: 'QA Candles', bizAddress: '1 Test Street, Testtown, TE1 1ST', bizPhone: '01234 567890', pictograms: ['exclamation'], signal: 'Warning', sensitisers: [] };
const OLD = { schemaVersion: 1, hazardFromExtraction: false, sdsSignal: '', savedAt: '01/10/2026' };
const S22 = '2.2 Label elements\nHazard pictograms: GHS07\nSignal word: Warning\nHazard statements:\nH317 May cause an allergic skin reaction.\nPrecautionary statements:\nP261 Avoid breathing vapours.\nP280 Wear protective gloves.\nP370+P378 In case of fire: Use dry sand, dry chemical or alcohol-resistant foam to extinguish.\nP501 Dispose of contents/container to an approved waste disposal plant.\n';
// The first run in the test browser is today, so today is the release-day
// cut-off (LOCKDOWN_RELEASE_DATE is not set until the release commit).
const TODAY = HP.localDay(new Date()).split('-').reverse().join('/');
const REC = {
  legacy: Object.assign({}, BASE, OLD, { id: id(1), scentName: 'Legacy Lavender', hStatements: 'H317', pStatements: 'P261, P280, P302+P352, P501', p280Items: ['gloves'] }),
  releaseDay: Object.assign({}, BASE, OLD, { id: id(2), scentName: 'Release Day', hStatements: 'H317', pStatements: 'P102, P501', savedAt: TODAY }),
  releaseDayHist: Object.assign({}, BASE, OLD, { id: id(3), scentName: 'Release Day History', hStatements: 'H317', pStatements: 'P101, P501', savedAt: TODAY }),
  newManual: Object.assign({}, BASE, { id: id(4), scentName: 'New Manual', schemaVersion: 2, hazardFromExtraction: false, sdsSignal: '', hStatements: 'H317', pStatements: 'P102, P333+P313', savedAt: '01/10/2026' }),
  fire: Object.assign({}, BASE, OLD, { id: id(5), scentName: 'Fire Legacy', hStatements: 'H317', pStatements: 'P261, P370+P378, P501' }),
  treat: Object.assign({}, BASE, OLD, { id: id(6), scentName: 'Treatment Legacy', hStatements: 'H317', pStatements: 'P261, P321, P501' }),
  noDate: Object.assign({}, BASE, OLD, { id: id(7), scentName: 'No Date', hStatements: 'H317', pStatements: 'P103, P501', savedAt: '' }),
  extracted: Object.assign({}, BASE, { id: id(8), scentName: 'Extracted Rose', schemaVersion: 1, hazardFromExtraction: true, sdsSignal: 'Warning', hStatements: 'H317', pStatements: 'P261, P280, P370+P378, P501', sourceSection22: S22, savedAt: '01/10/2026' }),
  preC3: Object.assign({}, BASE, { id: id(9), scentName: 'Pre C3 Extracted', hazardFromExtraction: undefined, sdsSignal: 'Warning', hStatements: 'H317', pStatements: 'P261, P501', savedAt: '01/09/2026' }),
};
const HISTORY = {
  'Release Day History|Scented Candle': [Object.assign({}, REC.releaseDayHist, { savedAt: '20/10/2026', version: 1 })],
  'Legacy Lavender|Scented Candle': [
    Object.assign({}, REC.legacy, { savedAt: '15/09/2026', version: 1 }),
    Object.assign({}, REC.legacy, { schemaVersion: 2, pStatements: 'P261, P501, P102', savedAt: '30/10/2026', version: 2 }),
  ],
};
function seedScript(ns, records, history) {
  return `(function(){try{if(localStorage.getItem('__clp007_seeded'))return;localStorage.setItem('__clp007_seeded','1');
    localStorage.setItem('clpeasy_labels__u_${ns}',${JSON.stringify(JSON.stringify(records))});
    localStorage.setItem('clpeasy_history__u_${ns}',${JSON.stringify(JSON.stringify(history || {}))});
    localStorage.setItem('clpeasy-cookie-consent','essential');}catch(e){}})();`;
}

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
  async function open(page, opts) {
    opts = opts || {};
    const ctx = opts.ctx || await browser.createBrowserContext();
    const t = await ctx.newPage();
    t.ctx = ctx; t.errs = []; t.alerts = []; t.promptAnswer = null;
    if (opts.viewport) await t.setViewport(opts.viewport);
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.alerts.push(d.message()); if (d.type() === 'prompt' && t.promptAnswer !== null) d.accept(t.promptAnswer); else d.dismiss(); });
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: opts.session || GUEST });
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    if (opts.seed) await t.evaluateOnNewDocument(opts.seed);
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await t.evaluate(HELPER).catch(() => {});
    await new Promise(r => setTimeout(r, 1800));
    return t;
  }
  try {
    // ── 0. Pure rules (no browser): identity, inheritance, cut-off ─────────
    {
      const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
      const W = () => ({});
      const L = (n, extra) => Object.assign({ id: id(n), scentName: 'U' + n, productType: 'Scented Candle', schemaVersion: 1, hazardFromExtraction: false, sdsSignal: '', hStatements: 'H317', pStatements: 'P261, P501', savedAt: '01/10/2026' }, extra);
      // Identity: an unrelated label with identical codes never inherits.
      const reg = HP.buildRegister([L(1)], {}, W, '2026-10-27');
      assert.strictEqual(HP.classify(L(1), reg), 'legacy-manual', 'registered label');
      assert.strictEqual(HP.classify(L(2, { schemaVersion: 2, savedAt: '05/11/2026' }), reg), 'unverified', 'unrelated new label with identical codes stays unverified');
      assert.strictEqual(HP.classify(L(1, { pStatements: 'P261, P501, P102' }), reg), 'unverified', 'same label with different hazard data stays unverified');
      assert.strictEqual(HP.classify(Object.assign(L(1), { id: undefined }), reg), 'unverified', 'no id: never legacy');
      // History corroborates only the same label.
      const hist = { 'U3|Scented Candle': [L(3, { savedAt: '20/10/2026' })], 'Other|Scented Candle': [L(9, { scentName: 'Other', savedAt: '20/10/2026' })] };
      const reg2 = HP.buildRegister([L(3, { savedAt: '27/10/2026' }), L(4, { savedAt: '27/10/2026' })], hist, W, '2026-10-27');
      assert.strictEqual(HP.classify(L(3, { savedAt: '27/10/2026' }), reg2), 'legacy-manual', 'release-day label with its own earlier version');
      assert.strictEqual(HP.classify(L(4, { savedAt: '27/10/2026' }), reg2), 'unverified', 'release-day label is not rescued by another label\'s history with identical codes');
      // Inheritance: only from a registered source with exactly that data.
      const st = mem(); st.setItem('clpeasy_legacy_hazard__u_g', JSON.stringify(reg));
      let r = HP.inheritLegacy({ ns: 'g', storage: st, sourceId: id(1), newId: id(5), record: L(1) });
      assert.strictEqual(HP.classify(L(5), r), 'legacy-manual', 'duplicate / save-as-new of a registered label inherits');
      r = HP.inheritLegacy({ ns: 'g', storage: st, sourceId: id(1), newId: id(6), record: L(1, { pStatements: 'P102' }) });
      assert.strictEqual(HP.classify(L(6, { pStatements: 'P102' }), r), 'unverified', 'different hazard data never inherits');
      r = HP.inheritLegacy({ ns: 'g', storage: st, sourceId: id(7), newId: id(8), record: L(7) });
      assert.strictEqual(HP.classify(L(8), r), 'unverified', 'copy of an unregistered label never inherits');
      ok('identity: legacy status is tied to the label id + its exact hazard data; unrelated labels with identical codes, other labels\' history and unregistered copies never inherit');

      // Cut-off: the earlier of the configured release day and this browser's first run.
      const at = (d) => new Date(d + 'T12:00:00');
      assert.strictEqual(HP.LOCKDOWN_RELEASE_DATE, null, 'release day is not hard-coded in this draft (set in the release commit)');
      assert.strictEqual(HP.cutoffDay(at('2026-11-03'), null), '2026-11-03', 'not set: first-run day');
      assert.strictEqual(HP.cutoffDay(at('2026-11-05'), '2026-11-03'), '2026-11-03', 'set to the real release day, browser first opened later: release day');
      assert.strictEqual(HP.cutoffDay(at('2026-11-05'), '2026-11-10'), '2026-11-05', 'set later than this browser\'s first run: first-run day (never later)');
      assert.strictEqual(HP.cutoffDay(at('2026-11-05'), 'not-a-date'), '2026-11-05', 'malformed setting ignored');
      // Deployment on a later day than planned (release 3 Nov, not 27 Oct).
      const run = (records, releaseDate, now) => { const s2 = mem(); return HP.runMigration({ ns: 'g', storage: s2, records, wordingFor: W, releaseDate, now: at(now) }); };
      const day = (n, d) => L(n, { savedAt: d });
      let g = run([day(1, '01/11/2026'), day(2, '02/11/2026'), day(3, '03/11/2026')], null, '2026-11-03');
      assert.deepStrictEqual([1, 2, 3].map(n => HP.classify(day(n, ''), g)), ['legacy-manual', 'legacy-manual', 'unverified'], 'later release, setting not used: labels before the first-run day accepted, that day not');
      g = run([day(1, '02/11/2026'), day(2, '03/11/2026'), day(3, '04/11/2026')], '2026-11-03', '2026-11-05');
      assert.deepStrictEqual([1, 2, 3].map(n => HP.classify(day(n, ''), g)), ['legacy-manual', 'unverified', 'unverified'], 'release day set: a stale pre-release tab\'s label saved after release (4 Nov) is not accepted even though this browser first ran on 5 Nov');
      // Frozen: a later run never adds records.
      const s3 = mem();
      HP.runMigration({ ns: 'g', storage: s3, records: [day(1, '01/11/2026')], wordingFor: W, releaseDate: null, now: at('2026-11-03') });
      const later = HP.runMigration({ ns: 'g', storage: s3, records: [day(1, '01/11/2026'), day(2, '02/11/2026')], wordingFor: W, releaseDate: null, now: at('2026-11-20') });
      assert.strictEqual(HP.classify(day(2, ''), later), 'unverified', 'frozen after the first run');
      assert.strictEqual(later.cutoff, '2026-11-03', 'cut-off recorded at the first run');
      ok('release-date handling: cut-off = earlier of the configured release day and first-run day; later-than-planned deployment and stale tabs handled; frozen after first run');
    }
    // ── 1/2. New label, Smart Paste and Clear — desktop and mobile ────────
    for (const vp of [{ name: 'desktop', viewport: { width: 1280, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } }]) {
      const t = await open('builder.html', { viewport: vp.viewport });
      const prep = () => t.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        document.getElementById('scent-name').value = 'Lockdown QA'; document.getElementById('product-type').value = 'Scented Candle'; onProductTypeChange();
        selectShape('circle'); document.getElementById('custom-w').value = 80; onDimInput(); readForm();
        for (let n = 2; n <= 3; n++) { setApprovedBuilderStep(n); await sleep(150); }
      });
      // Every manual route, with real input where a person could use it.
      const attempt = async (label) => {
        await t.evaluate(() => { document.querySelectorAll('#h-library,#p-library').forEach(el => { el.style.display = 'block'; }); });
        const before = await t.evaluate(() => JSON.stringify([S.hStatements, S.pStatements, S.p280Items, S.p280Other]));
        for (const sel of ['#h-chips .h-chip[data-code="H317"]', '#p-chips .h-chip[data-code="P370+P378"]', '#p-chips .h-chip[data-code="P280"]']) {
          await t.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
          const box = await (await t.$(sel)).boundingBox();
          if (vp.name === 'mobile') await t.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); else await t.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        for (const sel of ['#h-statements', '#p-statements']) {
          await t.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
          await t.click(sel, { clickCount: 3 }).catch(() => {});
          await t.focus(sel); await t.keyboard.type(sel === '#h-statements' ? 'H317, H226' : 'P370+P378, P321');
          await t.keyboard.press('Backspace'); await t.keyboard.down('Control'); await t.keyboard.press('KeyV'); await t.keyboard.up('Control');
        }
        await t.focus('#scent-name'); const tabbed = [];
        for (let i = 0; i < 60; i++) { await t.keyboard.press('Tab'); tabbed.push(await t.evaluate(() => (document.activeElement && (document.activeElement.className || '') + '').includes('h-chip'))); }
        const r = await t.evaluate(async () => {
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          toggleHChip(document.querySelector('#h-chips .h-chip[data-code="H226"]'), 'H226');
          togglePChip(document.querySelector('#p-chips .h-chip[data-code="P321"]'), 'P321');
          openP280Modal(); const modal = document.getElementById('p280Modal').classList.contains('show');
          document.querySelectorAll('#p280-item-opts input').forEach(cb => { cb.checked = true; }); confirmP280Modal();
          readForm(); updateLabel(); await sleep(250);
          return { after: JSON.stringify([S.hStatements, S.pStatements, S.p280Items, S.p280Other]), modal,
            ro: ['h-statements', 'p-statements'].map(i => document.getElementById(i).readOnly),
            chipPE: [...document.querySelectorAll('#h-chips .h-chip,#p-chips .h-chip')].every(c => getComputedStyle(c).pointerEvents === 'none') };
        });
        assert.strictEqual(r.after, before, `${vp.name} ${label}: hazard data unchanged by chips, typing, paste, P280 picker and handler calls`);
        assert(!r.modal, `${vp.name} ${label}: P280 picker does not open`);
        assert.deepStrictEqual(r.ro, [true, true], `${vp.name} ${label}: H/P boxes read-only`);
        assert(r.chipPE, `${vp.name} ${label}: chips not clickable`);
        assert(!tabbed.some(Boolean), `${vp.name} ${label}: keyboard never reaches a chip`);
      };
      await prep();
      await attempt('new label');
      const fresh = await t.evaluate(() => { const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true; return { leave: canLeaveApprovedBuilderStep(3), h: S.hStatements, spRO: document.getElementById('smart-paste-input').readOnly }; });
      assert(fresh.leave === false && fresh.h === '' && fresh.spRO === false, `${vp.name}: new label cannot pass Step 3 without Smart Paste; Smart Paste open`);
      assert(t.alerts.some(a => /Please extract and review the hazard data/.test(a)), `${vp.name}: Step 3 asks for Smart Paste`);
      ok(`${vp.name}: new label — chips, P280 picker, typing, paste and keyboard cannot add H/P; Step 3 needs Smart Paste`);

      const sp = await t.evaluate(async (S22) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        document.getElementById('smart-paste-input').value = S22; extractSDS(); await sleep(400);
        const svg = buildSVG(true).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        return { from: S.hazardFromExtraction, h: document.getElementById('h-statements').value, p: document.getElementById('p-statements').value, ro: ['h-statements', 'p-statements'].map(i => document.getElementById(i).readOnly), spRO: document.getElementById('smart-paste-input').readOnly, fire: /Use dry sand, dry chemical or alcohol-resistant foam to extinguish/.test(svg), blocked: !!window._labelBlockDownload };
      }, S22);
      assert(sp.from && sp.h === 'H317' && /P261, P280, P370\+P378, P501/.test(sp.p) && sp.ro.every(Boolean) && sp.spRO && sp.fire && !sp.blocked, `${vp.name}: Smart Paste shows the codes and complete supplier wording, locked, not blocked: ` + JSON.stringify(sp));
      await attempt('after Smart Paste');
      ok(`${vp.name}: Smart Paste — codes and supplier wording shown (incl. P370+P378), locked against every manual route`);

      await t.evaluate(async () => { clearHazardData(); await new Promise(r => setTimeout(r, 250)); });
      await attempt('after Clear');
      const cl = await t.evaluate(() => ({ h: S.hStatements, p: S.pStatements, spRO: document.getElementById('smart-paste-input').readOnly, leave: canLeaveApprovedBuilderStep(3) }));
      assert(cl.h === '' && cl.p === '' && cl.spRO === false && cl.leave === false, `${vp.name}: Clear returns to empty, Smart Paste open, manual entry still disabled`);
      ok(`${vp.name}: Clear — empty, Smart Paste open, manual entry still disabled`);
      assert.deepStrictEqual(t.errs, [], `${vp.name}: no page errors: ` + t.errs.join(' | '));
      await t.ctx.close();
    }

    // ── 3. Older labels: one-time registration and classification ─────────
    const records = Object.values(REC);
    let t = await open('builder.html', { seed: seedScript('guest', records, HISTORY) });
    const reg = await t.evaluate(() => ({ reg: window._clpLegacyRegister, frozen: localStorage.getItem('clpeasy_hazard_lockdown__u_guest'), saved: getSaved() }));
    const cls = Object.fromEntries(Object.entries(REC).map(([k, r]) => [k, HP.classify(r, reg.reg)]));
    assert.deepStrictEqual(cls, { legacy: 'legacy-manual', releaseDay: 'unverified', releaseDayHist: 'legacy-manual', newManual: 'unverified', fire: 'legacy-manual', treat: 'legacy-manual', noDate: 'unverified', extracted: 'extracted', preC3: 'extracted' }, 'classification');
    assert(reg.frozen, 'register frozen after the first run');
    assert.strictEqual(HP.classify(HISTORY['Legacy Lavender|Scented Candle'][1], reg.reg), 'unverified', 'a post-release history version is not registered');
    const legacySaved = reg.saved.find(r => r.id === id(1));
    assert(legacySaved.legacyWording && legacySaved.legacyWording.P261 && legacySaved.legacyWording.H317 && !('P280' in legacySaved.legacyWording), 'older label carries its frozen wording (P280 built from its own items)');
    assert(!reg.saved.find(r => r.id === id(4)).legacyWording, 'unverified label gets no wording');
    assert(!('P370+P378' in reg.reg.wording[HP.fingerprint(REC.fire)]), 'P370+P378 never frozen');
    ok('one-time registration: pre-release manual labels accepted; release-day (no earlier history), undated and post-lockdown manual data not accepted; release-day label with earlier history accepted; extracted labels unchanged');

    // Frozen: a manual label written later by a stale pre-release tab is never registered.
    await t.evaluate(() => { const k = 'clpeasy_labels__u_guest'; const a = JSON.parse(localStorage.getItem(k)); a.push(Object.assign({}, a[0], { id: '00000000-0000-4000-8000-000000000099', scentName: 'Stale Tab Manual', schemaVersion: 1, savedAt: '01/10/2026', pStatements: 'P262, P501' })); localStorage.setItem(k, JSON.stringify(a)); });
    await t.reload({ waitUntil: 'load' }); await t.evaluate(HELPER).catch(() => {}); await new Promise(r => setTimeout(r, 1800));
    const stale = await t.evaluate(() => HazardProvenance.classify(getSaved().find(r => r.scentName === 'Stale Tab Manual'), window._clpLegacyRegister));
    assert.strictEqual(stale, 'unverified', 'manual label added after the freeze stays unverified');
    // A stale tab resaving a genuine older label (drops the wording field) keeps its status and wording.
    await t.evaluate(() => { const k = 'clpeasy_labels__u_guest'; const a = JSON.parse(localStorage.getItem(k)); const i = a.findIndex(r => r.scentName === 'Legacy Lavender'); delete a[i].legacyWording; a[i].bizPhone = '09999 999999'; localStorage.setItem(k, JSON.stringify(a)); });
    await t.reload({ waitUntil: 'load' }); await t.evaluate(HELPER).catch(() => {}); await new Promise(r => setTimeout(r, 1800));
    const resaved = await t.evaluate(() => { const r = getSaved().find(x => x.scentName === 'Legacy Lavender'); return { c: HazardProvenance.classify(r, window._clpLegacyRegister), w: !!(r.legacyWording && r.legacyWording.P261) }; });
    assert(resaved.c === 'legacy-manual' && resaved.w, 'older label resaved by a stale tab keeps legacy status; wording restored');
    ok('freeze: manual data saved after the first run (stale pre-release tab) is never registered; a stale-tab resave of a genuine older label keeps its status');

    // #314 review: identity, not just codes.
    await t.evaluate(() => { const k = 'clpeasy_labels__u_guest'; const a = JSON.parse(localStorage.getItem(k)); const src = a.find(r => r.scentName === 'Legacy Lavender');
      a.push(Object.assign({}, src, { id: '00000000-0000-4000-8000-000000000098', scentName: 'Unrelated Twin', schemaVersion: 2, legacyWording: undefined }));
      localStorage.setItem(k, JSON.stringify(a)); });
    await t.reload({ waitUntil: 'load' }); await t.evaluate(HELPER).catch(() => {}); await new Promise(r => setTimeout(r, 1800));
    t.alerts.length = 0;
    const twin = await t.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const r = getSaved().find(x => x.scentName === 'Unrelated Twin');
      const cls = HazardProvenance.classify(r, window._clpLegacyRegister);
      loadLabelRecord(r); await sleep(300); const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true;
      return { cls, leave: canLeaveApprovedBuilderStep(3), allowed: _downloadAllowed(), wording: !!r.legacyWording };
    });
    assert(twin.cls === 'unverified' && twin.leave === false && twin.allowed === false && !twin.wording, 'an unrelated label with identical codes (even with a copied wording field) is unverified and blocked: ' + JSON.stringify(twin));
    // Save as new from a genuine older label (rename, same fragrance/SDS) inherits.
    const san = await t.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const src = getSaved().find(x => x.scentName === 'Legacy Lavender');
      loadLabelRecord(src); await sleep(300);
      editingLabelId = null; // "Save as new"
      document.getElementById('scent-name').value = 'Legacy Lavender Travel Tin'; readForm(); updateLabel(); await sleep(200);
      confirmSameHazardSource(); await saveLabel(); await sleep(500);
      const n = getSaved().find(x => x.scentName === 'Legacy Lavender Travel Tin');
      return { newId: !!n && n.id !== src.id, cls: n && HazardProvenance.classify(n, window._clpLegacyRegister),
        stored: n && HazardProvenance.classify(n, HazardProvenance.readRegister('guest')) };
    });
    assert(san.newId && san.cls === 'legacy-manual' && san.stored === 'legacy-manual', '"save as new" of a genuine older label keeps read-only legacy status (stored): ' + JSON.stringify(san));
    ok('#314 review: an unrelated label with identical codes is blocked; "save as new" and duplicate of a genuine older label keep its status');

    // Builder: older label read-only, printable, wording frozen, resize/save/reopen.
    const L = await t.evaluate(async (ids) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const text = () => buildSVG(true).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const load = async (i) => { loadLabelRecord(getSaved().find(r => r.id === i)); await sleep(350); const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true; };
      const out = {};
      await load(ids.legacy);
      out.lock = { ro: ['h-statements', 'p-statements'].map(i => document.getElementById(i).readOnly), sp: document.getElementById('smart-paste-input').readOnly, h: document.getElementById('h-statements').value, p: document.getElementById('p-statements').value };
      out.leave = canLeaveApprovedBuilderStep(3); out.blocked = !!window._labelBlockDownload; out.msg = _downloadBlockedMessage();
      out.svgWith = buildSVG(true); const w = S.legacyWording; S.legacyWording = null; out.svgWithout = buildSVG(true); S.legacyWording = w;
      const p261 = LabelRenderer.P_LIB.find(x => x.code === 'P261'); const orig = p261.desc; p261.desc = 'CHANGED LIBRARY TEXT';
      updateLabel(); await sleep(200); out.frozen = !/CHANGED LIBRARY TEXT/.test(text()) && text().includes(orig);
      p261.desc = orig; updateLabel(); await sleep(200);
      out.attemptBefore = S.pStatements; togglePChip(document.querySelector('#p-chips .h-chip[data-code="P102"]'), 'P102'); out.attemptAfter = S.pStatements;
      // Resize and save, then reopen.
      document.getElementById('custom-w').value = 95; onDimInput(); readForm(); updateLabel(); await sleep(200);
      await saveLabel(); await sleep(500);
      const rec = getSaved().find(r => r.id === ids.legacy);
      out.savedRec = { v: rec.schemaVersion, w: rec.customW, cls: HazardProvenance.classify(rec, window._clpLegacyRegister), wording: !!(rec.legacyWording && rec.legacyWording.P261) };
      clearHazardData(); await sleep(100); await load(ids.legacy);
      out.reopenLeave = canLeaveApprovedBuilderStep(3);
      return out;
    }, { legacy: id(1) });
    assert(L.lock.ro.every(Boolean) && L.lock.sp && L.lock.h === 'H317' && /P261/.test(L.lock.p), 'older label opens read-only with its codes shown');
    assert(L.leave === true && !L.blocked && L.msg !== BLOCK, 'older label passes Step 3 and is printable');
    assert.strictEqual(L.svgWith, L.svgWithout, 'frozen wording prints exactly what the label printed before (byte-identical SVG)');
    assert(L.frozen, 'older label keeps its wording when the library text changes');
    assert.strictEqual(L.attemptAfter, L.attemptBefore, 'older label hazard data cannot be changed');
    assert.deepStrictEqual(L.savedRec, { v: 2, w: 95, cls: 'legacy-manual', wording: true }, 'resized and resaved older label keeps legacy status and wording');
    assert(L.reopenLeave, 'reopened after save: still printable');
    ok('older manual label: read-only, printable, wording frozen (byte-identical today, unchanged by library edits), resize + save + reopen keep it');

    // Unverified, P370+P378 / P321 and extracted labels in the Builder.
    t.alerts.length = 0;
    const U = await t.evaluate(async (ids) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const text = () => buildSVG(true).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const out = {};
      for (const [k, i] of Object.entries(ids)) {
        loadLabelRecord(getSaved().find(r => r.id === i)); await sleep(350);
        const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true;
        const vb = document.getElementById('verify-checkbox'); if (vb) vb.checked = true;
        out[k] = { leave: canLeaveApprovedBuilderStep(3), allowed: _downloadAllowed(), msg: _downloadBlockedMessage(), blocked: !!window._labelBlockDownload, text: text(), panel: (document.getElementById('label-warn-step5') || {}).textContent || '' };
      }
      return out;
    }, { newManual: id(4), releaseDay: id(2), noDate: id(7), fire: id(5), treat: id(6), extracted: id(8), preC3: id(9), releaseDayHist: id(3) });
    for (const k of ['newManual', 'releaseDay', 'noDate']) {
      assert(U[k].leave === false && U[k].allowed === false && U[k].msg === BLOCK, k + ': unverified label blocked at Step 3 and download with the approved message');
    }
    assert(t.alerts.filter(a => a === BLOCK).length >= 3, 'Step 3 shows the approved message');
    ok('unverified labels (post-lockdown manual data, release-day without earlier evidence, undated): blocked at Step 3 and download');
    for (const [k, code, generic] of [['fire', 'P370+P378', /appropriate media/], ['treat', 'P321', /see label/]]) {
      assert(U[k].leave === false && U[k].blocked && !U[k].allowed, k + ': blocked');
      assert(!generic.test(U[k].text), k + ': CLPeasy generic wording never printed');
      assert(t.alerts.some(a => a.includes(code + ': ' + GUIDANCE1)), k + ': Step 3 shows the approved supplier-wording guidance for ' + code);
      assert(U[k].panel.includes(code + ': ' + GUIDANCE1), k + ': Step 5 panel shows the approved guidance');
      assert(!/entered in error|unrecognised code|did not recognise/.test(U[k].panel), k + ': guidance only -- never described as unrecognised or entered in error: ' + U[k].panel);
    }
    ok('older labels with P370+P378 or P321 and no supplier wording: blocked with the approved guidance; generic wording never printed');
    assert(U.extracted.leave && !U.extracted.blocked && /Use dry sand, dry chemical or alcohol-resistant foam to extinguish/.test(U.extracted.text), 'extracted label with complete P370+P378 supplier wording unchanged');
    assert(U.preC3.leave && !U.preC3.blocked, 'pre-C3 extracted label unchanged');
    assert(U.releaseDayHist.leave && !U.releaseDayHist.blocked, 'release-day label with earlier history evidence printable');
    ok('supplier-extracted labels (incl. complete P370+P378 wording and pre-C3 labels) unchanged');

    // Product type / fragrance load / name changes (C4).
    const C = await t.evaluate(async (i) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const box = () => { const b = document.querySelector('.hazard-review-notice'); return { shown: !!b && b.style.display !== 'none', buttons: b ? [...b.querySelectorAll('button')].map(x => x.textContent) : [] }; };
      loadLabelRecord(getSaved().find(r => r.id === i)); await sleep(300);
      const out = {};
      const ptSel = document.getElementById('product-type'); const other = [...ptSel.options].map(o => o.value).find(v => v && v !== 'Scented Candle');
      ptSel.value = other; onProductTypeChange(); updateLabel(); await sleep(200);
      out.type = box(); confirmSameHazardSource(); out.typeAfterKeep = _hazardReviewRequired(); out.typeMsg = _hazardReviewMessage();
      ptSel.value = 'Scented Candle'; onProductTypeChange(); updateLabel(); await sleep(200); out.typeReverted = _hazardReviewRequired();
      document.getElementById('frag-load').value = '12%'; readForm(); updateLabel(); await sleep(200);
      out.load = box(); confirmSameHazardSource(); out.loadAfterKeep = _hazardReviewRequired();
      document.getElementById('frag-load').value = '10%'; readForm(); updateLabel(); await sleep(200); out.loadReverted = _hazardReviewRequired();
      document.getElementById('scent-name').value = 'Legacy Lavender 200g'; readForm(); updateLabel(); await sleep(200);
      out.name = box(); confirmSameHazardSource(); out.nameAfterKeep = _hazardReviewRequired();
      return out;
    }, id(1));
    assert(C.type.shown && C.type.buttons.length === 1 && /Clear hazard data and extract again/.test(C.type.buttons[0]), 'product type change: only "Clear hazard data and extract again" ' + JSON.stringify(C.type));
    assert(C.typeAfterKeep && /needs a fresh Smart Paste/.test(C.typeMsg) && !C.typeReverted, 'product type change cannot be kept; changing it back clears the notice');
    assert(C.load.shown && C.load.buttons.length === 1 && C.loadAfterKeep && !C.loadReverted, 'fragrance load change: fresh Smart Paste only; changing it back clears the notice');
    assert(C.name.shown && C.name.buttons.length === 2 && !C.nameAfterKeep, 'name-only change: existing keep/clear prompt unchanged');
    ok('product type and fragrance load changes need fresh Smart Paste (no keep option); a name-only change keeps the existing prompt');

    // Version history restore.
    t.alerts.length = 0;
    const H = await t.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const k = 'clpeasy_history__u_guest'; const all = JSON.parse(localStorage.getItem(k) || '{}');
      const before = JSON.stringify(getSaved().find(r => r.scentName === 'Legacy Lavender').pStatements);
      window.__answer = '2'; return { before, versions: (all['Legacy Lavender|Scented Candle'] || []).map(v => v.version) };
    });
    t.promptAnswer = '2';
    await t.evaluate(async () => { await showLabelHistory(encodeURIComponent('Legacy Lavender'), encodeURIComponent('Scented Candle')); });
    const afterBad = await t.evaluate(() => getSaved().find(r => r.scentName === 'Legacy Lavender').pStatements);
    assert(t.alerts.includes(HP.RESTORE_REFUSED), 'restoring an unverified version is refused with the approved message');
    assert.strictEqual(JSON.stringify(afterBad), H.before, 'refused restore leaves the label unchanged');
    t.promptAnswer = '1';
    await t.evaluate(async () => { await showLabelHistory(encodeURIComponent('Legacy Lavender'), encodeURIComponent('Scented Candle')); });
    const afterGood = await t.evaluate(() => { const r = getSaved().find(x => x.scentName === 'Legacy Lavender'); return HazardProvenance.classify(r, window._clpLegacyRegister); });
    assert.strictEqual(afterGood, 'legacy-manual', 'restoring a registered pre-release version works');
    ok('version history: an unverified version is refused; a registered older version restores');
    assert.deepStrictEqual(t.errs, [], 'Builder: no page errors: ' + t.errs.join(' | '));
    await t.ctx.close();

    // ── My Labels: tag and duplicate (signed-in namespace) ────────────────
    const userRecords = [REC.legacy, REC.newManual, REC.fire];
    t = await open('my-labels.html', { session: USER, seed: seedScript('u-clp007', userRecords, {}) });
    const M = await t.evaluate(async (ids) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const tags = id => { const card = document.querySelector(`[data-label-id="${id}"]`); const c = card && (card.closest('.label-card') || card.parentElement.closest('[class*="card"]') || card.parentElement); return c ? c.textContent : ''; };
      const out = { tagNew: /Needs Smart Paste/.test(document.body.innerHTML.split(ids.newManual)[1] || ''), html: document.body.innerHTML.includes('Needs Smart Paste') };
      await duplicateLabelById(ids.legacy); await sleep(300);
      const copy = LabelLibrary.getSaved().find(r => r.scentName === 'Legacy Lavender (Copy)');
      out.copy = copy ? { cls: HazardProvenance.classify(copy, window._clpLegacyRegister), w: !!(copy.legacyWording && copy.legacyWording.P261), id: copy.id !== ids.legacy } : null;
      await duplicateLabelById(ids.newManual); await sleep(300);
      const copy2 = LabelLibrary.getSaved().find(r => r.scentName === 'New Manual (Copy)');
      out.copy2 = copy2 ? HazardProvenance.classify(copy2, window._clpLegacyRegister) : null;
      out.count = (document.body.innerHTML.match(/>Needs Smart Paste</g) || []).length;
      return out;
    }, { legacy: id(1), newManual: id(4) });
    assert(M.html, 'My Labels shows the "Needs Smart Paste" tag');
    assert(M.copy && M.copy.cls === 'legacy-manual' && M.copy.w && M.copy.id, 'duplicate of an older label stays an older label with its wording');
    assert.strictEqual(M.copy2, 'unverified', 'duplicate of unverified data stays unverified');
    assert.strictEqual(M.count, 2, 'tag shown on the unverified label and its copy only');
    ok('My Labels: "Needs Smart Paste" tag on unverified labels only; duplicates keep the source\'s status');
    assert.deepStrictEqual(t.errs, [], 'My Labels: no page errors: ' + t.errs.join(' | '));
    const ctxUser = t.ctx;

    // Builder in the same account: resize the duplicate.
    const t2 = await open('builder.html', { session: USER, ctx: ctxUser });
    const D = await t2.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const copy = getSaved().find(r => r.scentName === 'Legacy Lavender (Copy)');
      loadLabelRecord(copy); await sleep(300);
      document.getElementById('custom-w').value = 63; onDimInput(); readForm(); updateLabel(); await sleep(200);
      const hc = document.getElementById('hazard-confirm'); if (hc) hc.checked = true;
      const leave = canLeaveApprovedBuilderStep(3); await saveLabel(); await sleep(400);
      const r = getSaved().find(x => x.id === copy.id);
      return { leave, w: r.customW, cls: HazardProvenance.classify(r, window._clpLegacyRegister), p: r.pStatements };
    });
    assert(D.leave && D.w === 63 && D.cls === 'legacy-manual' && D.p === REC.legacy.pStatements, 'duplicate resized in the Builder keeps its hazard information and status');
    ok('duplicate of an older label can be resized without changing its hazard information');
    assert.deepStrictEqual(t2.errs, [], 'Builder (account): no page errors: ' + t2.errs.join(' | '));
    await ctxUser.close();

    // ── Print Sheet Composer ──────────────────────────────────────────────
    t = await open('print.html', { seed: seedScript('guest', [REC.legacy, REC.newManual, REC.fire, REC.extracted], {}) });
    const P = await t.evaluate(async (ids) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]')); await sleep(200);
      const state = () => ({ msg: getSheetSdsDocBlockMessage(), pdf: (document.getElementById('btn-pdf') || {}).disabled, fit: (typeof sheetFitIssues !== 'undefined' ? sheetFitIssues : []).map(i => i.scentName + ': ' + i.reason) });
      const out = {};
      addToSheet(ids.legacy); addToSheet(ids.extracted); await sleep(500); out.good = state();
      addToSheet(ids.newManual); await sleep(500); out.withUnverified = state();
      sheetItems.length = 0; if (typeof renderSheet === 'function') renderSheet(); addToSheet(ids.fire); await sleep(500); out.fire = state();
      // The canvas is a flattened raster for guests: read the same label's overlay from the shared renderer.
      out.fire.canvas = LabelRenderer.renderLabel(getSaved().find(r => r.id === ids.fire), { instanceId: 'clp007-fire' }).svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      out.list = document.body.innerHTML.includes('Needs Smart Paste');
      return out;
    }, { legacy: id(1), newManual: id(4), fire: id(5), extracted: id(8) });
    assert(!P.good.msg && !P.good.fit.length, 'Composer: older label and extracted label print: ' + JSON.stringify(P.good));
    assert(P.withUnverified.msg && P.withUnverified.msg.includes(BLOCK) && P.withUnverified.msg.includes('New Manual'), 'Composer: unverified label blocks the sheet with the approved message');
    assert(P.fire.fit.some(f => /Fire Legacy/.test(f) && f.includes('P370+P378: This precautionary statement needs the full wording from your supplier’s SDS Section 2.2.')), 'Composer: older P370+P378 label blocked with the approved supplier-wording guidance: ' + JSON.stringify(P.fire));
    assert(!P.fire.fit.some(f => /recognise/.test(f)), 'Composer: never says CLPeasy doesn\'t recognise P370+P378');
    assert(/P370\+P378 need complete, unambiguous supplier wording/.test(P.fire.canvas) && !/not recognised/.test(P.fire.canvas), 'Composer canvas overlay: supplier wording needed, not "not recognised"');
    assert(P.list, 'Composer: library list marks the unverified label');
    ok('Print Sheet Composer: older and extracted labels print; unverified labels and older P370+P378 labels are blocked');
    assert.deepStrictEqual(t.errs, [], 'Composer: no page errors: ' + t.errs.join(' | '));
    await t.ctx.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e.message);
  } finally {
    await browser.close(); server.close();
    console.log(`\nclp007-smart-paste-lockdown: ${passed} checks passed${failed ? ' (FAILED)' : ''}`);
    process.exit(failed ? 1 : 0);
  }
});
