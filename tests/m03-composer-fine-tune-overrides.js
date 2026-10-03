// M03 (Issue #8): the Print Sheet Composer must render a saved label with the
// Builder's saved "Fine-tune your label" adjustments -- the same six renderer
// options the Builder passes -- in its preview, fit check, A4 PDF and
// cutting-machine PNGs. Only finite numbers are passed; anything else leaves
// the renderer's automatic sizing (label-render.js itself is unchanged, so
// its separate handling of invalid values -- M66 -- is not tested here).
//
// Real Chromium: builder.html (signed out) creates and saves a fine-tuned
// label; print.html (with an in-page signed-in stub -- an active subscription row on this
// pre-PAYG audit branch -- no network) renders it.
//   node tests/m03-composer-fine-tune-overrides.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// Static: the wiring is in print.html's single render function.
const print = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
const KEYS = ['hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride', 'hazardYOffset'];
assert.ok(print.includes("const SAVED_RENDER_OVERRIDES=['hazardFSOverride','scentFSOverride','bizNameFSOverride','typeFSOverride','sigFSOverride','hazardYOffset'];"), 'all six saved overrides listed');
assert.ok(/typeof v==='number'&&Number\.isFinite\(v\)/.test(print), 'only finite numbers are passed');
ok('static: renderSheetPosition() passes the six saved overrides, finite numbers only');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP m03 browser checks: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP m03 browser checks: no Chromium'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};';
const PAYG = `window.__rpc=[];window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'payg',status:'active',subscription_status:'payg',trial_end:new Date(Date.now()-2*864e5).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:5,created_at:new Date(Date.now()-40*864e5).toISOString()};
var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
from:function(){return Object.create(q)},rpc:async function(n){window.__rpc.push(n);return {data:{ok:true,consumed:true,free_redownload:false,source:'purchased',clean_export:true,purchased_downloads:4,downloads_used:0,downloads_limit:0},error:null};},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
// Records print-window HTML and records every renderLabel() call's options.
const RECORDER = `window.__written='';window.open=function(){var w={closed:false,close:function(){this.closed=true;},focus:function(){},location:{replace:function(){}},document:{open:function(){window.__written='';},write:function(h){window.__written+=h;},close:function(){}}};return w;};
window.__calls=[];window.__nf=false;
Object.defineProperty(window,'LabelRenderer',{configurable:true,set:function(L){var orig=L.renderLabel;L.renderLabel=function(d,o){
  if(o&&o._pictoMmOverride==null){var ov={};${JSON.stringify(KEYS)}.forEach(function(k){if(o&&Object.prototype.hasOwnProperty.call(o,k))ov[k]=o[k];});window.__calls.push({name:d&&d.scentName,ov:ov});}
  var r=orig.apply(this,arguments);
  // Test double for requirement 12 only: the renderer reports NOT FIT for
  // the "NF" label whenever its saved hazard override is actually applied.
  if(window.__nf&&d&&d.scentName==='NF Label'&&o&&o.hazardFSOverride!=null&&o._pictoMmOverride==null)r=Object.assign({},r,{fits:false,warnings:(r.warnings||[]).concat(['hazard-text-overflow'])});
  return r;};Object.defineProperty(window,'LabelRenderer',{value:L,writable:true,configurable:true});},get:function(){return undefined;}});`;
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 Avoid breathing vapours.\nP302+P352 IF ON SKIN: Wash with plenty of water.\nP501 Dispose of contents/container to an approved waste disposal plant.';

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
  async function open(page, supa, recorder) {
    const t = await browser.newPage();
    await t.setViewport({ width: 1366, height: 900 });
    t.errs = []; t.dialogs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    if (recorder) await t.evaluateOnNewDocument(RECORDER);
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
    return t;
  }
  try {
    // ── Builder: fine-tune and save a real label ──────────────────────────
    const bt = await open('builder.html', SIGNED_OUT, false);
    const B = await bt.evaluate(async (SDS) => {
      currentUser = null; if (typeof initSavedLabelLibrary === 'function') await initSavedLabelLibrary();
      document.getElementById('scent-name').value = 'M03 Fine Tuned';
      document.getElementById('product-type').value = 'Scented Candle';
      if (typeof onProductTypeChange === 'function') onProductTypeChange();
      document.getElementById('smart-paste-input').value = SDS; extractSDS();
      document.getElementById('biz-name').value = 'QA Candles Ltd';
      document.getElementById('biz-address').value = '1 Test Street, Testtown, TE1 1ST';
      document.getElementById('biz-phone').value = '01234 567890';
      selectShape('circle'); document.getElementById('custom-w').value = 60; onDimInput(); readForm(); updateLabel();
      for (let n = 2; n <= 5; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
        setApprovedBuilderStep(n); await new Promise(r => setTimeout(r, 150));
      }
      if (approvedBuilderStep !== 5) throw new Error('Builder did not reach Step 5');
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      const nudge = { hazard: [nudgeHazardFS, 2], scent: [nudgeScentFS, -2], biz: [nudgeBizNameFS, -2], type: [nudgeTypeFS, -2], sig: [nudgeSigFS, -2] };
      Object.values(nudge).forEach(([fn, n]) => { for (let i = 0; i < Math.abs(n); i++) fn(Math.sign(n)); });
      readForm(); updateLabel();
      buildSVG(true);
      // The same options buildSVG(true) -- the Builder's PNG/SVG/PDF export -- uses.
      const opts = { instanceId: 'm03-builder', forExport: true, bgColour: document.getElementById('label-bg-colour')?.value,
        hazardFSOverride: S.hazardFSOverride, hazardYOffset: S.hazardYOffset, scentFSOverride: S.scentFSOverride,
        bizNameFSOverride: S.bizNameFSOverride, typeFSOverride: S.typeFSOverride, sigFSOverride: S.sigFSOverride, watermark: true };
      const r = LabelRenderer.renderLabel(window._lastLabelData, opts);
      const allowed = _downloadAllowed();
      await saveLabel();
      const rec = LabelLibrary.findById(getSaved(), editingLabelId);
      return { rec: JSON.parse(JSON.stringify(rec)), fs: r.metrics.fontSizes, fits: r.fits, allowed };
    }, SDS);
    await bt.close();
    assert.ok(B.allowed && B.fits, 'Builder label is exportable');
    for (const k of ['hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride']) assert.ok(typeof B.rec[k] === 'number', 'saved record has ' + k);
    ok('Builder: fine-tuned label saved with its five user-set overrides');

    // ── Composer ──────────────────────────────────────────────────────────
    const t = await open('print.html', PAYG, true);
    const ids = { A: '11111111-2222-4333-8444-5555555555a1', C: '11111111-2222-4333-8444-5555555555c1', NF: '11111111-2222-4333-8444-5555555555f1' };
    await t.evaluate(async (rec, ids) => {
      const A = Object.assign({}, rec, { id: ids.A });
      const C = Object.assign({}, rec, { id: ids.C, scentName: 'Control Label' });
      ['hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride', 'hazardYOffset'].forEach(k => { delete C[k]; });
      const NF = Object.assign({}, C, { id: ids.NF, scentName: 'NF Label', hazardFSOverride: rec.hazardFSOverride });
      await LabelLibrary.mutate(() => ({ collection: [A, C, NF], usedId: A.id }));
    }, B.rec, ids);
    await t.goto(`${base}/print.html`, { waitUntil: 'load' });
    await sleep(2000);

    const R = await t.evaluate((ids, K) => {
      const A = resolveSheetLabel(ids.A), C = resolveSheetLabel(ids.C);
      const cw = Math.round(60 * 300 / 25.4);
      const L = window.LabelRenderer;
      const mk = extra => Object.assign({}, C, extra);
      const fsOf = r => r.metrics.fontSizes;
      const out = {};
      // 1-6: each override on its own, against a direct renderer call with only that option.
      const single = {};
      for (const k of K) {
        const val = k === 'hazardYOffset' ? 0 : A[k];
        const rec = mk({ [k]: val });
        const comp = renderSheetPosition(rec, cw, cw, { watermark: true, instanceId: 's-' + k });
        const direct = L.renderLabel(rec, { instanceId: 's-' + k, pw: cw, ph: cw, bgColour: rec.bgColour, watermark: true, [k]: val });
        const auto = L.renderLabel(C, { instanceId: 's-' + k, pw: cw, ph: cw, bgColour: C.bgColour, watermark: true });
        single[k] = { same: comp.svg === direct.svg, differsFromAuto: comp.svg !== auto.svg, passed: window.__calls[window.__calls.length - 3].ov[k] === val,
          hb: [comp.metrics.hazardBounds.y0, auto.metrics.hazardBounds.y0] };
      }
      out.single = single;
      // 7: all overrides vs the Builder export
      const ca = renderSheetPosition(A, cw, cw, { watermark: true });
      out.allFS = fsOf(ca); out.allFits = ca.fits;
      // 8: no-override control is byte-identical to the pre-M03 call
      const base = { pw: cw, ph: cw, bgColour: C.bgColour, watermark: true };
      out.controlSame = renderSheetPosition(C, cw, cw, { watermark: true, instanceId: 'ctl' }).svg === L.renderLabel(C, Object.assign({ instanceId: 'ctl' }, base)).svg;
      // 9 + 10: missing/null/undefined and invalid values are not passed; output == automatic
      const bad = { nul: null, undef: undefined, str: 'abc', numStr: '7', nan: NaN, inf: Infinity, ninf: -Infinity, obj: {}, bool: true };
      out.bad = {};
      for (const [name, v] of Object.entries(bad)) {
        const rec = mk({}); K.forEach(k => { rec[k] = v; });
        window.__calls.length = 0;
        const r = renderSheetPosition(rec, cw, cw, { watermark: true, instanceId: 'bad' });
        out.bad[name] = { passedKeys: Object.keys(window.__calls[0].ov), sameAsAuto: r.svg === L.renderLabel(C, Object.assign({ instanceId: 'bad' }, base)).svg, nan: /NaN/.test(r.svg) };
      }
      return out;
    }, ids, KEYS);

    for (const k of KEYS) {
      const s = R.single[k];
      assert.ok(s.passed, k + ' passed to the renderer');
      assert.ok(s.same, k + ': Composer output equals a direct render with that saved override');
      assert.ok(s.differsFromAuto, k + ': the saved override changes the output (not ignored): ' + JSON.stringify(s.hb));
    }
    ok('1-6: hazardFSOverride, scentFSOverride, bizNameFSOverride, typeFSOverride, sigFSOverride and a saved hazardYOffset are each applied in the Composer');
    for (const k of ['hazard', 'scent', 'biz', 'type', 'signal', 'footer']) assert.strictEqual(R.allFS[k], B.fs[k], `7: ${k} font size Composer ${R.allFS[k]} vs Builder export ${B.fs[k]}`);
    assert.strictEqual(R.allFits, B.fits);
    ok('7: fine-tuned label: Composer text metrics equal the Builder export exactly (hazard, product name, business name, product type, signal word, footer)');
    assert.ok(R.controlSame, '8: no-override output byte-identical');
    ok('8: label with no overrides renders byte-identically to the pre-M03 Composer call');
    for (const [name, b] of Object.entries(R.bad)) {
      assert.deepStrictEqual(b.passedKeys, [], `9/10: ${name} values must not be passed`);
      assert.ok(b.sameAsAuto, `9/10: ${name} renders exactly like automatic sizing`);
      assert.ok(!b.nan, `9/10: ${name} produces no NaN in the Composer output`);
    }
    ok('9/10: null, undefined, text, numeric text, NaN, ±Infinity, objects and booleans are not passed; output equals automatic sizing');

    // 11/12: fit decision uses the same overridden render as the output
    const F = await t.evaluate(async (ids) => {
      window.__nf = true;
      addToSheet(ids.NF); await new Promise(r => setTimeout(r, 900));
      const issues = sheetFitIssues.map(i => i.itemId);
      const msg = getSheetFitBlockMessage();
      window.__written = ''; const rpc0 = window.__rpc.length;
      await downloadPDF(); await new Promise(r => setTimeout(r, 1500));
      const res = { issues, blocked: !!msg, wrote: window.__written.length, rpc: window.__rpc.length - rpc0 };
      removeSheetItem(ids.NF); window.__nf = false; await new Promise(r => setTimeout(r, 600));
      return res;
    }, ids);
    assert.ok(F.issues.includes(ids.NF) && F.blocked, '11/12: NOT FIT with its saved override -> listed and blocked: ' + JSON.stringify(F));
    assert.strictEqual(F.wrote, 0, '12: no sheet written'); assert.strictEqual(F.rpc, 0, '12: no download consumed');
    ok('11/12: the fit check uses the saved overrides; a label that does not fit with them is blocked (no fallback to automatic sizing, no download used)');

    // 13: preview, A4 PDF and cutting-machine PNG all use the overridden render
    const P = await t.evaluate(async (ids, K) => {
      window.__calls.length = 0;
      addToSheet(ids.A); await new Promise(r => setTimeout(r, 1200));
      const preview = window.__calls.filter(c => c.name === 'M03 Fine Tuned').map(c => c.ov);
      window.__calls.length = 0;
      await downloadPDF();
      const end = Date.now() + 15000; while (Date.now() < end && !/print-btn/.test(window.__written)) await new Promise(r => setTimeout(r, 200));
      const pdf = window.__calls.filter(c => c.name === 'M03 Fine Tuned').map(c => c.ov);
      window.__calls.length = 0;
      const A = resolveSheetLabel(ids.A);
      const png = await buildLabelPNGBlob(A);
      const bmp = png.blob ? await createImageBitmap(png.blob) : null;
      const cut = window.__calls.filter(c => c.name === 'M03 Fine Tuned').map(c => c.ov);
      const want = {}; K.forEach(k => { if (typeof A[k] === 'number') want[k] = A[k]; });
      return { preview, pdf, cut, want, pdfWritten: /print-btn/.test(window.__written), png: bmp ? [bmp.width, bmp.height] : null };
    }, ids, KEYS);
    assert.ok(P.preview.length >= 1 && P.pdf.length >= 1 && P.cut.length === 1, 'renders captured: ' + JSON.stringify([P.preview.length, P.pdf.length, P.cut.length]));
    for (const [where, list] of [['preview', P.preview], ['PDF', P.pdf], ['cutting PNG', P.cut]]) list.forEach(ov => assert.deepStrictEqual(ov, P.want, `13: ${where} render uses the saved overrides`));
    assert.ok(P.pdfWritten, 'PDF sheet written');
    const px = Math.round(60 * 300 / 25.4);
    assert.deepStrictEqual(P.png, [px, px], 'cutting-machine PNG outer size unchanged (300 dpi)');
    ok('13: Composer preview, A4 PDF and cutting-machine PNG all use the same overridden render; cutting PNG outer size unchanged');
    assert.deepStrictEqual(t.errs, [], 'no page errors: ' + t.errs.join(' | '));
    await t.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`m03 composer fine-tune override checks passed (${passed} groups)`);
  }
});
