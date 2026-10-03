#!/usr/bin/env node
'use strict';
// M10: the supplier address is required label content (GB CLP Article
// 17(1)(a), approved decision). Exercises the REAL code paths:
//   Part 1 -- label-render.js checkRequiredContent() in jsdom (the renderer
//             needs a DOM, so it can't be require()d directly in Node);
//   Part 2 -- builder.html in Chromium (signed out): Step 4 cannot continue
//             without an address; an address cleared after confirming at
//             Step 5 is caught by every export route;
//   Part 3 -- print.html in Chromium (in-page signed-in stub, no network): an
//             old saved label with no address is blocked on the sheet, every
//             export refuses, and the stored record is not changed.
//   node tests/m10-supplier-address-required.js

const fs = require('fs');
const { withConfirmedDoc } = require('./helpers/sds-doc-verified');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { stubRenderer } = require('./fixtures/required-content-fixtures');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// ── Part 1: shared content check (real label-render.js) ────────────────
const R = stubRenderer(fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8'));
const complete = {
  scentName: 'Lavender', bizName: 'Crafty Mouse Gifts',
  bizAddress: 'Duns, Scottish Borders', bizPhone: '01234 567890',
  hStatements: 'H317', pStatements: '', pChoices: {}, sensitisers: [],
};
assert.strictEqual(R.checkRequiredContent(complete).complete, true, 'complete label should pass');
for (const value of ['', '   ', '\n\t']) {
  const r = R.checkRequiredContent({ ...complete, bizAddress: value });
  assert.strictEqual(r.complete, false, 'blank/whitespace address must fail: ' + JSON.stringify(value));
  assert.deepStrictEqual([...r.missing], ['business-address'], 'missing reason must be business-address only');
}
const oldSaved = { ...complete }; delete oldSaved.bizAddress;
const oldResult = R.checkRequiredContent(oldSaved);
assert.strictEqual(oldResult.complete, false, 'legacy record with no address must fail closed');
assert.deepStrictEqual([...oldResult.missing], ['business-address']);
assert.ok(!('bizAddress' in oldSaved), 'the check never adds an address to the record');
ok('Part 1: checkRequiredContent() -- valid address passes; blank, whitespace-only and missing (legacy) fail with business-address; record untouched');

const builderSrc = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
assert.ok(builderSrc.includes('Address <span>(required)</span>'), 'Step 4 marks the address required');
const printSrc = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
assert.ok(printSrc.includes("'business-address':'No supplier address."), 'Composer names the missing address');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP m10 browser checks: puppeteer not installed'); console.log(`M10 supplier-address checks passed (${passed} groups)`); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP m10 browser checks: no Chromium'); console.log(`M10 supplier-address checks passed (${passed} groups)`); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};';
// Simulated active Easy Start account; no real account or network writes.
const SIGNED_IN = `window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'easy_start',status:'active',subscription_status:'active',downloads_used:0,downloads_limit:999,topup_credits:0,created_at:new Date(Date.now()-40*864e5).toISOString()};
var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
from:function(){return Object.create(q)},rpc:async function(){return {data:{ok:true},error:null};},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const RECORDER = `window.__written='';window.__opened=0;window.__downloads=[];
window.open=function(){window.__opened++;var w={closed:false,close:function(){this.closed=true;},focus:function(){},location:{replace:function(){}},document:{open:function(){window.__written='';},write:function(h){window.__written+=h;},close:function(){}}};return w;};
(function(){var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push(this.download);return oc.apply(this,arguments);};})();`;
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP261 Avoid breathing vapours.\nP501 Dispose of contents/container to an approved waste disposal plant.';

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let failed = false;
  async function open(page, supa) {
    const t = await browser.newPage();
    await t.setViewport({ width: 1366, height: 900 });
    t.errs = []; t.dialogs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    await t.evaluateOnNewDocument(RECORDER);
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: supa });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await sleep(1500);
    if(page==='builder.html') await t.evaluate(require('./helpers/sds-doc-answer').SCRIPT);
    return t;
  }
  try {
    // ── Part 2: Builder ──────────────────────────────────────────────────
    const b = await open('builder.html', SIGNED_OUT);
    const B = await b.evaluate(async (SDS) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      currentUser = null;
      document.getElementById('scent-name').value = 'M10 Address';
      document.getElementById('product-type').value = 'Scented Candle';
      if (typeof onProductTypeChange === 'function') onProductTypeChange();
      document.getElementById('smart-paste-input').value = SDS; extractSDS();
      document.getElementById('biz-name').value = 'Crafty Mouse Gifts';
      document.getElementById('biz-phone').value = '01234 567890';
      selectShape('circle'); document.getElementById('custom-w').value = 63; onDimInput(); readForm(); updateLabel();
      for (let n = 2; n <= 4; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
        setApprovedBuilderStep(n); await wait(150);
      }
      const out = { atStep4: approvedBuilderStep };
      const stepAfter = async (addr) => { document.getElementById('biz-address').value = addr; readForm(); updateLabel(); checkStep4AndNext(); await wait(300); return approvedBuilderStep; };
      out.blank = await stepAfter('');
      out.spaces = await stepAfter('    ');
      out.valid = await stepAfter('12 Mill Lane, Duns');
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload(); await wait(300);
      out.allowedWithAddress = _downloadAllowed();
      // address cleared after confirming at Step 5: every export route refuses
      document.getElementById('biz-address').value = ''; readForm(); updateLabel(); toggleDownload(); await wait(300);
      out.allowedAfterClear = _downloadAllowed();
      out.blockedMsg = _downloadBlockedMessage();
      window.__downloads.length = 0; window.__opened = 0;
      for (const fn of ['downloadPNG', 'downloadSVG', 'printToPDF']) { try { await window[fn](); } catch (e) { /* refused */ } }
      await wait(1500);
      out.downloads = window.__downloads.length; out.opened = window.__opened;
      out.step5Note = (document.getElementById('label-warn-step5') || {}).textContent || '';
      return out;
    }, SDS);
    assert.strictEqual(B.atStep4, 4, 'reached Step 4');
    assert.strictEqual(B.blank, 4, 'Step 4 cannot continue with a blank address');
    assert.strictEqual(B.spaces, 4, 'Step 4 cannot continue with a whitespace-only address');
    assert.ok(b.dialogs.filter(d => /Add your supplier address/.test(d)).length >= 2, 'the maker is told to add the address: ' + b.dialogs.join(' | '));
    assert.strictEqual(B.valid, 5, 'a valid address continues to Step 5');
    assert.strictEqual(B.allowedWithAddress, true, 'complete label is exportable');
    assert.strictEqual(B.allowedAfterClear, false, 'clearing the address after confirming blocks export');
    assert.ok(/supplier address/i.test(B.blockedMsg) || /supplier address/i.test(B.step5Note), 'the block names the missing address: ' + B.blockedMsg + ' / ' + B.step5Note);
    assert.strictEqual(B.downloads, 0, 'no PNG/SVG downloaded'); assert.strictEqual(B.opened, 0, 'no PDF window opened');
    assert.deepStrictEqual(b.errs, [], 'no Builder page errors: ' + b.errs.join(' | '));
    ok('Part 2: Builder -- Step 4 refuses blank and whitespace-only addresses; a valid address continues; clearing it after confirming blocks PNG, SVG and PDF');
    await b.close();

    // ── Part 3: Composer ─────────────────────────────────────────────────
    const c = await open('print.html', SIGNED_IN);
    const ids = { old: '11111111-2222-4333-8444-5555555510a1', ok: '11111111-2222-4333-8444-5555555510b1' };
    const legacy = { id: ids.old, schemaVersion: 1, scentName: 'Old No Address', productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 60, customH: 60, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'Crafty Mouse Gifts', bizPhone: '01234 567890', pStatements: '', p280Items: [], savedAt: '01/08/2026' };
    const good = Object.assign({}, legacy, { id: ids.ok, scentName: 'With Address', bizAddress: '12 Mill Lane, Duns' });
    await c.evaluate(async (recs) => { await LabelLibrary.mutate(() => ({ collection: recs, usedId: recs[0].id })); }, [withConfirmedDoc(legacy,'10%'), withConfirmedDoc(good,'10%')]);
    await c.goto(`${base}/print.html`, { waitUntil: 'load' });
    await sleep(2500);
    const C = await c.evaluate(async (ids) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const stored = () => JSON.stringify(LabelLibrary.findById(LabelLibrary.getSaved ? LabelLibrary.getSaved() : [], ids.old) || resolveSheetLabel(ids.old));
      const before = stored();
      const out = {};
      // control: the label with an address prints
      addToSheet(ids.ok); await wait(900);
      out.okIssues = sheetContentIssues.length; out.okMsg = getSheetFitBlockMessage();
      window.__written = ''; await downloadPDF();
      let end = Date.now() + 10000; while (Date.now() < end && !/print-btn/.test(window.__written)) await wait(200);
      out.okPdf = /print-btn/.test(window.__written);
      removeSheetItem(ids.ok); await wait(600);
      // old saved label with no address
      addToSheet(ids.old); await wait(900);
      out.issues = sheetContentIssues.map(i => i.reason);
      out.panel = (document.getElementById('fit-issues-panel') || {}).textContent || '';
      out.msg = getSheetFitBlockMessage();
      window.__written = ''; window.__downloads.length = 0; window.__opened = 0;
      await downloadPDF(); await wait(1500);
      out.pdfWritten = window.__written.length;
      try { await cricutDownloadZip(); } catch (e) { /* refused */ }
      await wait(800);
      out.downloads = window.__downloads.length;
      out.after = stored(); out.before = before;
      return out;
    }, ids);
    assert.strictEqual(C.okIssues, 0, 'label with an address has no content issue');
    assert.strictEqual(C.okMsg, null, 'label with an address is not blocked');
    assert.ok(C.okPdf, 'label with an address prints');
    assert.ok(C.issues.length === 1 && /No supplier address/.test(C.issues[0]), 'old label listed as missing its supplier address: ' + JSON.stringify(C.issues));
    assert.ok(/No supplier address/.test(C.panel), 'issues panel names the missing address');
    assert.ok(C.msg && /missing required label content/.test(C.msg), 'sheet export is blocked');
    assert.strictEqual(C.pdfWritten, 0, 'A4 PDF refused'); assert.strictEqual(C.downloads, 0, 'cutting-machine ZIP refused');
    assert.ok(c.dialogs.some(d => /No supplier address/.test(d)), 'the refusal names the missing address');
    assert.strictEqual(C.after, C.before, 'the saved record is not changed');
    assert.ok(!/"bizAddress"/.test(C.after), 'no address was silently added to the saved record');
    assert.deepStrictEqual(c.errs, [], 'no Composer page errors: ' + c.errs.join(' | '));
    ok('Part 3: Composer -- an old saved label with no address is listed and blocked (A4 PDF and cutting ZIP refused, reason named); a label with an address prints; the saved record is unchanged');
    await c.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`M10 supplier-address checks passed (${passed} groups)`);
  }
});
