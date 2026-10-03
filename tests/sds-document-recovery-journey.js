// Recovery journey for labels saved before the supplier-document check
// (owner request, 3 Oct 2026). Real Chromium, signed-out guest, no network.
//   1. A fine-tuned label is made and saved in the Builder; its document
//      confirmation is then removed, exactly like a label saved before this
//      release.
//   2. Reopened from My Labels: Step 5 shows "not ready to download", exports
//      are blocked, Save (as a draft) still works.
//   3. The maker follows "Go to Step 3", answers the document check through
//      the real form, continues to Step 5 and saves.
//   4. Reopened again: ready to download, with design and fine-tune settings
//      unchanged.
//   5. Print Sheet Composer: the label shows no draft marker, adds to a sheet,
//      and the sheet's export gate is clear, with the fine-tune settings intact.
// No product type is substituted; the label is a real "Scented Candle".
//   node tests/sds-document-recovery-journey.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP sds-document-recovery-journey: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP sds-document-recovery-journey: no Chromium'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){var q={select:function(){return q},eq:function(){return q},update:function(){return q},upsert:function(){return q},single:async function(){return {data:null,error:null}},maybeSingle:async function(){return {data:null,error:null}},then:function(r){return Promise.resolve({data:null,error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};';
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 Avoid breathing vapours.\nP501 Dispose of contents in accordance with local regulations.\nContains Linalool. May produce an allergic reaction.';
const SIGNED_IN = "window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'easy_start',status:'active',subscription_status:'active',trial_end:null,downloads_used:0,downloads_limit:0,topup_credits:0,created_at:'2026-09-01T00:00:00Z'};var q={select:function(){return q},eq:function(){return q},neq:function(){return q},order:function(){return q},limit:function(){return q},update:function(){return q},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},single:async function(){return {data:row,error:null}},maybeSingle:async function(){return {data:row,error:null}},then:function(r){return Promise.resolve({data:[row],error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};";
const DESIGN_KEYS = ['scentName', 'productType', 'shape', 'size', 'customW', 'customH', 'bizName', 'bizAddress', 'bizPhone', 'fragLoad',
  'hStatements', 'pStatements', 'pictograms', 'sensitisers', 'signal', 'sdsSignal', 'bgColour', 'textColour', 'showBorder',
  'hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride', 'hazardYOffset'];
const pick = r => Object.fromEntries(DESIGN_KEYS.map(k => [k, r[k] === undefined ? null : r[k]]));
let passed = 0;
const ok = l => { passed++; console.log('PASS:', l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false;
  async function open(page, vp, supa) {
    const t = await browser.newPage();
    await t.setViewport(vp || { width: 1366, height: 900 });
    t.errs = []; t.on('pageerror', e => t.errs.push(e.message)); t.on('dialog', d => d.dismiss());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: supa || SIGNED_OUT });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await sleep(1500);
    return t;
  }
  try {
    // Mobile usability: paste first, no covered fields, inline guidance, exports remain blocked.
    for (const width of [360, 390]) {
      const mobile = await open('builder.html', { width, height: 844 });
      const result = await mobile.evaluate((SDS) => {
        document.getElementById('scent-name').value='Paste First';
        document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
        document.getElementById('frag-load').value='8';
        readForm();setApprovedBuilderStep(2);setApprovedBuilderStep(3);
        document.getElementById('smart-paste-input').value=SDS;extractSDS();
        const coverage=_requireSdsDoc();
        return {
          step:approvedBuilderStep, extracted:S.hStatements, coverage,
          message:document.getElementById('sds-doc-result').textContent,
          focus:document.activeElement.name,
          exportAllowed:_downloadAllowed(),
          buttonPosition:getComputedStyle(document.querySelector('.mobile-preview-btn')).position,
          overflow:document.documentElement.scrollWidth>innerWidth,
          helpCollapsed:[...document.querySelectorAll('.sds-help')].every(e=>!e.open),
          pasteFirst:!!(document.querySelector('.smart-paste-box').compareDocumentPosition(document.getElementById('sds-doc-check')) & 4)
        };
      }, SDS);
      assert.strictEqual(result.step,3);assert(/H317/.test(result.extracted));
      assert.strictEqual(result.coverage,false);assert.strictEqual(result.exportAllowed,false);
      assert(/Choose what your supplier document describes/.test(result.message));
      assert.strictEqual(result.focus,'sds-doc-kind');assert.strictEqual(result.buttonPosition,'static');
      assert.strictEqual(result.overflow,false);assert(result.helpCollapsed&&result.pasteFirst);
      if(process.env.SDS_USABILITY_SCREENSHOTS) {
        await mobile.evaluate(()=>document.querySelector('.smart-paste-box').scrollIntoView({block:'start'}));
        await sleep(800);
        await mobile.screenshot({path:path.join(process.env.SDS_USABILITY_SCREENSHOTS,`step3-${width}.png`)});
      }
      await mobile.close();
    }
    ok('360/390px: paste before coverage, focused inline guidance, exports blocked, no floating overlap or sideways overflow');

    // 1. A real fine-tuned label, then made "older" (no document confirmation).
    const b0 = await open('builder.html');
    const made = await b0.evaluate(async (SDS) => {
      document.getElementById('scent-name').value = 'Recovery Candle';
      document.getElementById('product-type').value = 'Scented Candle'; onProductTypeChange();
      document.getElementById('frag-load').value = '10%';
      document.getElementById('biz-name').value = 'QA Candles Ltd';
      document.getElementById('biz-address').value = '1 Test Street, Testtown, TE1 1ST';
      document.getElementById('biz-phone').value = '01234 567890';
      selectShape('circle'); document.getElementById('custom-w').value = 60; onDimInput(); readForm(); updateLabel();
      document.querySelector('input[name="sds-doc-kind"][value="finished"]').click();
      document.getElementById('sds-doc-pct').value = '10'; document.getElementById('sds-doc-base').value = 'candle'; updateSdsDocCheck();
      document.getElementById('smart-paste-input').value = SDS; extractSDS();
      for (let n = 2; n <= 5; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); hc.checked = true; toggleHazardNext(); }
        setApprovedBuilderStep(n); await new Promise(r => setTimeout(r, 120));
      }
      if (approvedBuilderStep !== 5) throw new Error('did not reach Step 5');
      [[nudgeHazardFS, 2], [nudgeScentFS, -2], [nudgeBizNameFS, -2], [nudgeTypeFS, -1], [nudgeSigFS, -1]].forEach(([fn, n]) => { for (let i = 0; i < Math.abs(n); i++) fn(Math.sign(n)); });
      readForm(); updateLabel();
      await saveLabel();
      const id = editingLabelId;
      const rec = JSON.parse(JSON.stringify(LabelLibrary.findById(getSaved(), id)));
      const older = Object.assign({}, rec); delete older.sdsDoc;
      await LabelLibrary.mutate(cur => ({ collection: cur.map(x => x.id === id ? older : x), usedId: id }));
      return { id, rec, older: JSON.parse(JSON.stringify(LabelLibrary.findById(getSaved(), id))) };
    }, SDS);
    await b0.close();
    assert(made.rec.sdsDoc && made.rec.sdsDoc.confirmed, 'setup: the Builder saved a confirmation');
    assert(!made.older.sdsDoc, 'setup: older label has no document answers');
    for (const k of ['hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride']) assert.strictEqual(typeof made.older[k], 'number', 'setup: fine-tune ' + k);
    const original = pick(made.older);
    ok('setup: fine-tuned Scented Candle label saved, then made an "older" label (no document confirmation)');

    // My Labels shows it as a draft.
    // (My Labels needs an account: a signed-in stub, the same record placed in that account's library.)
    const ml = await open('my-labels.html', null, SIGNED_IN);
    const tag = await ml.evaluate(async (rec, conf) => {
      const verified = Object.assign({}, rec, { id: '11111111-2222-4333-8444-5555555555b2', scentName: 'Checked Candle', sdsDoc: conf });
      await LabelLibrary.mutate(() => ({ collection: [rec, verified], usedId: rec.id }));
      if (typeof renderGrid === 'function') renderGrid(); else location.reload();
      await new Promise(r => setTimeout(r, 300));
      return [...document.querySelectorAll('.label-card')].map(c => c.textContent.replace(/\s+/g, ' ')).join(' | ');
    }, made.older, made.rec.sdsDoc);
    const cards = tag.split(' | ');
    assert(cards.some(c => /Recovery Candle/.test(c) && /Draft: document check needed/.test(c)), 'My Labels marks the older label as a draft: ' + tag);
    assert(cards.some(c => /Checked Candle/.test(c) && !/Draft/.test(c)), 'a checked label has no draft marker: ' + tag);
    assert.deepStrictEqual(ml.errs, [], 'My Labels: no page errors');
    await ml.close();
    ok('My Labels: older label marked "Draft: document check needed"');

    // 2. Reopen: blocked, draft save allowed.
    const b1 = await open('builder.html?label=' + made.id);
    const s1 = await b1.evaluate(() => {
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      const n = document.getElementById('sds-doc-export-note');
      return { step: approvedBuilderStep, allowed: _downloadAllowed(), note: getComputedStyle(n).display !== 'none' ? n.textContent : '',
        save: document.getElementById('btn-save').style.pointerEvents, png: document.getElementById('btn-png').style.pointerEvents,
        ft: { h: S.hazardFSOverride, s: S.scentFSOverride, b: S.bizNameFSOverride, t: S.typeFSOverride, g: S.sigFSOverride, y: S.hazardYOffset } };
    });
    assert.strictEqual(s1.step, 5, 'reopened at Step 5');
    assert.strictEqual(s1.allowed, false, 'downloads blocked');
    assert(/Not ready to download yet/.test(s1.note) && /save it as a draft/.test(s1.note), 'notice: ' + s1.note);
    assert.strictEqual(s1.png, 'none', 'PNG disabled'); assert.strictEqual(s1.save, 'auto', 'Save available as a draft');
    assert.deepStrictEqual(s1.ft, { h: made.older.hazardFSOverride, s: made.older.scentFSOverride, b: made.older.bizNameFSOverride, t: made.older.typeFSOverride, g: made.older.sigFSOverride, y: made.older.hazardYOffset === undefined ? null : made.older.hazardYOffset }, 'fine-tune loaded');
    const dsave = await b1.evaluate(async () => { await saveLabel(); return { btn: document.getElementById('btn-save').textContent, note: document.getElementById('save-status').textContent }; });
    assert.strictEqual(dsave.btn, '✎ Draft saved', 'button confirms a draft'); assert(/Saved as a draft/.test(dsave.note), 'notice agrees');
    ok('reopened older label: Step 5 says not ready to download, exports blocked, saved as a draft ("Draft saved"), fine-tune loaded');

    // 3. Recovery through the real form.
    await b1.click('#sds-doc-export-note button'); await sleep(400);
    assert.strictEqual(await b1.evaluate(() => approvedBuilderStep), 3, '"Go to Step 3" opens Step 3');
    await b1.evaluate(() => document.getElementById('sds-doc-check').scrollIntoView({ block: 'center' }));
    await b1.click('input[name="sds-doc-kind"][value="finished"]');
    await b1.type('#sds-doc-pct', '10');
    await b1.select('#sds-doc-base', 'candle');
    await b1.evaluate(() => { const c = document.getElementById('hazard-confirm'); if (!c.checked) c.click(); toggleHazardNext(); });
    const s3 = await b1.evaluate(async () => {
      const r = document.getElementById('sds-doc-result').textContent;
      setApprovedBuilderStep(4); await new Promise(r => setTimeout(r, 150));
      setApprovedBuilderStep(5); await new Promise(r => setTimeout(r, 150));
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      const allowed = _downloadAllowed();
      await saveLabel();
      const st = document.getElementById('save-status').textContent;
      return { r, step: approvedBuilderStep, allowed, st, btn: document.getElementById('btn-save').textContent, id: editingLabelId, alerts: window.__lastAlert || '' };
    });
    assert(/answers are consistent/.test(s3.r), 'Step 3 result: ' + s3.r);
    assert.strictEqual(s3.step, 5, 'back at Step 5');
    assert.strictEqual(s3.allowed, true, 'ready to download after Step 3');
    assert(/Label saved/.test(s3.st) && !/draft/i.test(s3.st), 'saved as ready: ' + s3.st);
    assert.strictEqual(s3.btn, '✅ Label saved', 'button confirms a ready label');
    assert.strictEqual(s3.id, made.id, 'same label updated, not a copy');
    assert.deepStrictEqual(b1.errs, [], 'Builder: no page errors');
    await b1.close();
    ok('recovery: Step 3 completed through the real form, back to Step 5, ready to download, saved over the same label');

    // 4. Reopen: verified, design unchanged.
    const b2 = await open('builder.html?label=' + made.id);
    const s4 = await b2.evaluate(() => {
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      return { allowed: _downloadAllowed(), status: SdsDocCheck.status(_sdsDocRecord()), rec: JSON.parse(JSON.stringify(LabelLibrary.findById(getSaved(), new URLSearchParams(location.search).get('label')))) };
    });
    assert.strictEqual(s4.status, 'verified'); assert.strictEqual(s4.allowed, true, 'reopened: ready to download');
    assert.deepStrictEqual(pick(s4.rec), original, 'design and fine-tune settings unchanged by the recovery');
    assert.deepStrictEqual(b2.errs, [], 'Builder reopen: no page errors');
    await b2.close();
    ok('reopened after recovery: ready to download; design and all fine-tune settings identical to before');

    // 4b. Written supplier confirmation route, recorded and kept across save/reopen.
    const b3 = await open('builder.html?label=' + made.id);
    const w = await b3.evaluate(async () => {
      setApprovedBuilderStep(3); await new Promise(r => setTimeout(r, 200));
      document.getElementById('frag-load').value = '9.0909%'; updateLabel();
      document.querySelector('input[name="sds-doc-kind"][value="supplier-confirmed"]').click();
      const setv = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      setv('sds-doc-pct', '9.0909'); setv('sds-doc-base', 'candle'); setv('sds-doc-supplier', 'Acme Oils Ltd'); setv('sds-doc-cdate', '2026-10-01'); setv('sds-doc-cref', 'Lavender CLP candle 9.1%');
      const reasons = typeof _hazardReviewReasons === 'function' ? [..._hazardReviewReasons()] : [];
      document.querySelectorAll('.hazard-review-keep').forEach(b => { if (b.offsetParent !== null) b.click(); });
      const hc = document.getElementById('hazard-confirm'); if (!hc.checked) hc.click(); toggleHazardNext();
      setApprovedBuilderStep(4); await new Promise(r => setTimeout(r, 150));
      const hc2 = document.getElementById('hazard-confirm'); if (approvedBuilderStep === 3 && !hc2.checked) { hc2.click(); toggleHazardNext(); setApprovedBuilderStep(4); await new Promise(r => setTimeout(r, 150)); }
      setApprovedBuilderStep(5); await new Promise(r => setTimeout(r, 150));
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      const res = document.getElementById('sds-doc-result').textContent;
      await saveLabel();
      return { reasons, res, step: approvedBuilderStep, allowed: _downloadAllowed(), btn: document.getElementById('btn-save').textContent, alert: window.__lastAlert || '' };
    });
    assert.strictEqual(w.step, 5, 'reached Step 5 with a written confirmation ' + JSON.stringify(w));
    assert(/written confirmation from Acme Oils Ltd/.test(w.res), 'result: ' + w.res);
    assert.strictEqual(w.allowed, true, 'ready to download'); assert.strictEqual(w.btn, '✅ Label saved');
    await b3.close();
    const b4 = await open('builder.html?label=' + made.id);
    const w2 = await b4.evaluate(() => ({ kind: (document.querySelector('input[name="sds-doc-kind"]:checked') || {}).value, sup: document.getElementById('sds-doc-supplier').value, d: document.getElementById('sds-doc-cdate').value, ref: document.getElementById('sds-doc-cref').value, status: SdsDocCheck.status(_sdsDocRecord()), ft: S.hazardFSOverride }));
    assert.deepStrictEqual([w2.kind, w2.sup, w2.d, w2.ref, w2.status], ['supplier-confirmed', 'Acme Oils Ltd', '2026-10-01', 'Lavender CLP candle 9.1%', 'verified'], 'confirmation record restored');
    assert.strictEqual(w2.ft, made.older.hazardFSOverride, 'fine-tune still kept');
    assert.deepStrictEqual([...b3.errs, ...b4.errs], [], 'no page errors');
    await b4.close();
    ok('written supplier confirmation (9.0909%): recorded, ready to download, saved, and restored on reopening with fine-tune kept');

    // 4c. D1 explicit coverage range (6-10%) with D4 version, recorded and kept across save/reopen.
    const b5 = await open('builder.html?label=' + made.id);
    const rr = await b5.evaluate(async () => {
      setApprovedBuilderStep(3); await new Promise(r => setTimeout(r, 200));
      document.getElementById('frag-load').value = '8%'; updateLabel();
      document.querySelector('input[name="sds-doc-kind"][value="finished"]').click();
      const setv = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      setv('sds-doc-base', 'candle'); setv('sds-doc-coverage', 'range'); setv('sds-doc-from', '6'); setv('sds-doc-to', '10');
      setv('sds-doc-where', 'Page 1, "Valid for fragrance loads"'); document.getElementById('sds-doc-range-stated').click(); setv('sds-doc-version', 'v3');
      document.querySelectorAll('.hazard-review-keep').forEach(b => { if (b.offsetParent !== null) b.click(); });
      const hc = document.getElementById('hazard-confirm'); if (!hc.checked) hc.click(); toggleHazardNext();
      setApprovedBuilderStep(4); await new Promise(r => setTimeout(r, 150));
      if (approvedBuilderStep === 3) { const h2 = document.getElementById('hazard-confirm'); if (!h2.checked) h2.click(); toggleHazardNext(); setApprovedBuilderStep(4); await new Promise(r => setTimeout(r, 150)); }
      setApprovedBuilderStep(5); await new Promise(r => setTimeout(r, 150));
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      const res = document.getElementById('sds-doc-result').textContent;
      await saveLabel();
      return { res, step: approvedBuilderStep, allowed: _downloadAllowed(), btn: document.getElementById('btn-save').textContent };
    });
    assert.strictEqual(rr.step, 5, 'reached Step 5 with a coverage range ' + JSON.stringify(rr));
    assert(/applies to 6–10%, and you use 8%/.test(rr.res), 'result: ' + rr.res);
    assert.strictEqual(rr.allowed, true); assert.strictEqual(rr.btn, '✅ Label saved');
    await b5.close();
    const b6 = await open('builder.html?label=' + made.id);
    const rr2 = await b6.evaluate(() => ({ cov: document.getElementById('sds-doc-coverage').value, from: document.getElementById('sds-doc-from').value, to: document.getElementById('sds-doc-to').value, where: document.getElementById('sds-doc-where').value, stated: document.getElementById('sds-doc-range-stated').checked, ver: document.getElementById('sds-doc-version').value, status: SdsDocCheck.status(_sdsDocRecord()), ft: S.hazardFSOverride }));
    assert.deepStrictEqual([rr2.cov, rr2.from, rr2.to, rr2.where, rr2.stated, rr2.ver, rr2.status], ['range', '6', '10', 'Page 1, "Valid for fragrance loads"', true, 'v3', 'verified'], 'range record restored');
    assert.strictEqual(rr2.ft, made.older.hazardFSOverride, 'fine-tune still kept');
    assert.deepStrictEqual([...b5.errs, ...b6.errs], [], 'no page errors');
    await b6.close();
    ok('explicit coverage range (8% within 6–10%) with document version: recorded, ready to download, saved, restored on reopening with fine-tune kept');

    // 5. Composer.
    const c = await open('print.html');
    const s5 = await c.evaluate((id) => {
      const card = document.getElementById('sli-' + id);
      const draftMarker = card ? /Draft: document check needed/.test(card.textContent) : null;
      addToSheet(id); updateExportButtonState();
      const n = document.getElementById('sds-doc-sheet-note');
      const r = resolveSheetLabel(id);
      return { draftMarker, qty: getTotalQty(), gate: getSheetFitBlockMessage(), note: getComputedStyle(n).display,
        ft: [r.hazardFSOverride, r.scentFSOverride, r.bizNameFSOverride, r.typeFSOverride, r.sigFSOverride] };
    }, made.id);
    assert.strictEqual(s5.draftMarker, false, 'no draft marker once checked');
    assert.strictEqual(s5.qty, 1, 'added to the sheet'); assert.strictEqual(s5.gate, null, 'sheet export gate clear'); assert.strictEqual(s5.note, 'none', 'no notice');
    assert.deepStrictEqual(s5.ft, [made.older.hazardFSOverride, made.older.scentFSOverride, made.older.bizNameFSOverride, made.older.typeFSOverride, made.older.sigFSOverride], 'Composer uses the same fine-tune settings');
    assert.deepStrictEqual(c.errs, [], 'Composer: no page errors');
    await c.close();
    ok('Composer: label added, no draft marker, export gate clear, fine-tune settings intact');
  } catch (e) {
    failed = true; console.error('FAIL:', e && e.stack || e);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`sds-document recovery journey checks passed (${passed} groups)`);
  }
});
