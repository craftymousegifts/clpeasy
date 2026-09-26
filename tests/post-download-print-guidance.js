// Post-download printing guidance (approved 26 Sep 2026) — real-browser checks.
//
// Serves the working tree on 127.0.0.1, stubs the Supabase client in-page
// (no network), and drives the REAL builder.html / print.html export paths.
// consume_download() is stubbed per scenario so accounting outcomes
// (charged / free re-download / no downloads / error) are controlled, and
// every RPC call is recorded so the test can prove the guidance never adds a
// charge. File hand-over is observed by recording <a download>.click() and
// window.open() without changing what the page does.
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/post-download-print-guidance.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP post-download-print-guidance: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP post-download-print-guidance: no Chromium available'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILES = {
  payg:  { plan: 'payg', subscription_status: 'payg', trial_end: iso(-2 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 5 },
  trial: { plan: 'trial', subscription_status: 'trialing', trial_end: iso(5 * DAY), downloads_used: 2, downloads_limit: 10, topup_credits: 0 },
  start: { plan: 'easy_start', subscription_status: 'active', downloads_used: 3, downloads_limit: 20, topup_credits: 0, billing_cycle: 'monthly' },
  pro:   { plan: 'easy_pro', is_pro: true, subscription_status: 'active', downloads_used: 3, downloads_limit: 30, topup_credits: 0, billing_cycle: 'monthly' },
  zero:  { plan: 'payg', subscription_status: 'payg', trial_end: iso(-9 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 0 },
};
const RPC = {
  charged:   { ok: true, consumed: true, free_redownload: false, source: 'purchased', clean_export: true, purchased_downloads: 4, downloads_used: 0, downloads_limit: 0 },
  plan:      { ok: true, consumed: true, free_redownload: false, source: 'plan', clean_export: true, purchased_downloads: 0, downloads_used: 4, downloads_limit: 20 },
  trial:     { ok: true, consumed: true, free_redownload: false, source: 'plan', clean_export: false, purchased_downloads: 0, downloads_used: 3, downloads_limit: 10 },
  free:      { ok: true, consumed: false, free_redownload: true, source: 'redownload', clean_export: true, purchased_downloads: 5, downloads_used: 0, downloads_limit: 0 },
  none:      { ok: false, reason: 'no_downloads_remaining', purchased_downloads: 0, downloads_used: 0, downloads_limit: 0 },
};

function stub(profile, rpcResult) {
  const row = Object.assign({ id: 'u1', email: 'qa@example.test', full_name: 'QA Maker', created_at: iso(-40 * DAY), billing_cycle: 'monthly' }, profile);
  return `window.__rpc=[];window.supabase={createClient:function(){var row=${JSON.stringify(row)};var res=${JSON.stringify(rpcResult)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(n,a){window.__rpc.push([n,a]);if(n!=='consume_download')return {data:null,error:null};if(res==='error')return {data:null,error:{message:'boom'}};return {data:res,error:null};},
  functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
}
// Records file hand-over without changing page behaviour.
const RECORDER = `window.__downloads=[];window.__opened=[];
(function(){var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push(this.download);return oc.apply(this,arguments);};
window.open=function(u){window.__opened.push(String(u||''));if(window.__popupBlocked)return null;return {closed:false,close:function(){this.closed=true;},focus:function(){},document:{open:function(){},write:function(){},close:function(){}}};};})();`;

const SDS = '2.2 Label elements\\nSignal word: Warning\\nH317 May cause an allergic skin reaction.\\nH412 Harmful to aquatic life with long lasting effects.\\nP261 P302+P352 P501';

let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

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
  try {
    async function open(page, profileKey, rpcKey, vp = { width: 1366, height: 900 }, opts = {}) {
      const t = await browser.newPage();
      await t.setViewport(vp);
      t.errs = []; t.dialogs = [];
      t.on('pageerror', e => t.errs.push(e.message));
      t.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) t.errs.push(m.text()); });
      t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
      await t.evaluateOnNewDocument(RECORDER);
      if (opts.popupBlocked) await t.evaluateOnNewDocument(() => { window.__popupBlocked = true; });
      await t.setRequestInterception(true);
      t.on('request', r => {
        const u = r.url();
        if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: opts.signedOut ? 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};' : stub(PROFILES[profileKey], RPC[rpcKey] || rpcKey) });
        if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
        if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
        return r.respond({ status: 204, body: '' });
      });
      await t.goto(`${base}/${page}`, { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 1500));
      return t;
    }
    // Brings Builder to a downloadable Step 5 with a valid label.
    async function readyBuilder(t, { confirm = true } = {}) {
      await t.evaluate(async (SDS, confirm) => {
        document.getElementById('scent-name').value = 'Guidance QA';
        document.getElementById('product-type').value = 'Scented Candle';
        if (typeof onProductTypeChange === 'function') onProductTypeChange();
        document.getElementById('smart-paste-input').value = SDS.replace(/\\n/g, '\n');
        extractSDS();
        document.getElementById('biz-name').value = 'QA Candles';
        document.getElementById('biz-address').value = '1 Test Street, Testtown, TE1 1ST';
        document.getElementById('biz-phone').value = '01234 567890';
        readForm(); updateLabel();
        // Walk the real stage gates 1 -> 5 (confirming Step 3 like a customer).
        for (let n = 2; n <= 5; n++) {
          if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
          setApprovedBuilderStep(n);
          await new Promise(r => setTimeout(r, 150));
        }
        if (approvedBuilderStep !== 5) throw new Error('could not reach Step 5 (at ' + approvedBuilderStep + ')');
        const v = document.getElementById('verify-checkbox'); v.checked = confirm; toggleDownload();
        await new Promise(r => setTimeout(r, 400));
      }, SDS, confirm);
    }
    const state = t => t.evaluate(() => {
      const g = document.getElementById('dl-print-guidance');
      const r = g.getBoundingClientRect();
      return { shown: !g.hidden && g.offsetParent !== null, text: g.innerText.replace(/\s+/g, ' ').trim(), role: g.getAttribute('role'), live: g.getAttribute('aria-live'),
        rpc: (window.__rpc || []).filter(x => x[0] === 'consume_download').length, downloads: window.__downloads.slice(), opened: window.__opened.length,
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, rect: { w: r.width, h: r.height, right: r.right }, vw: window.innerWidth,
        tick: (g.querySelector('.dl-pg-icon') || {}).textContent || '' };
    });
    const waitFor = async (t, fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await t.evaluate(fn)) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
    const BODY = 'Now load your chosen label paper or sheet into your printer. Print at 100% / Actual Size to preserve the label dimensions.';

    // 1-3, 9: PAYG successful PNG / SVG / PDF
    {
      const t = await open('builder.html', 'payg', 'charged');
      await readyBuilder(t);
      let s = await state(t);
      assert.strictEqual(s.shown, false, 'guidance hidden before any download');
      await t.evaluate(() => downloadPNG());
      assert.ok(await waitFor(t, () => window.__downloads.some(d => /\.png$/.test(d))), 'PNG file handed over');
      s = await state(t);
      assert.ok(s.shown, 'guidance shown after PNG'); assert.ok(s.text.startsWith('✓ Label downloaded'), s.text);
      assert.ok(s.text.includes(BODY), 'exact approved wording: ' + s.text);
      assert.strictEqual(s.role, 'status'); assert.strictEqual(s.live, 'polite'); assert.strictEqual(s.tick, '✓', 'success is not colour-only (✓ + text)');
      assert.strictEqual(s.rpc, 1, 'exactly one charge for the PNG');
      ok('1/9: PAYG successful Builder PNG download shows the approved guidance (role=status, ✓ + text, one charge)');

      await t.evaluate(() => downloadSVG());
      assert.ok(await waitFor(t, () => window.__downloads.some(d => /\.svg$/.test(d))), 'SVG file handed over');
      s = await state(t);
      assert.ok(s.shown && s.text.startsWith('✓ Label downloaded'), s.text); assert.strictEqual(s.rpc, 2);
      ok('2: successful Builder SVG download shows the guidance');

      await t.evaluate(() => printToPDF());
      await new Promise(r => setTimeout(r, 400));
      s = await state(t);
      assert.strictEqual(s.opened, 1, 'print window opened');
      assert.ok(s.shown && s.text.startsWith('✓ Label ready to print') && s.text.includes(BODY), s.text); assert.strictEqual(s.rpc, 3);
      ok('3: successful Builder PDF (print window) shows the guidance, headed "Label ready to print"');
      assert.deepStrictEqual(t.errs, [], 'no console errors: ' + t.errs.join(' | '));
      ok('14a: no console errors on the Builder success paths');
      await t.close();
    }
    // 4: blocked export — compliance checkbox not ticked, and an overflow block
    {
      const t = await open('builder.html', 'payg', 'charged');
      await readyBuilder(t, { confirm: false });
      await t.evaluate(() => downloadPNG());
      await new Promise(r => setTimeout(r, 800));
      let s = await state(t);
      assert.strictEqual(s.shown, false); assert.strictEqual(s.rpc, 0); assert.deepStrictEqual(s.downloads, []);
      await t.evaluate(() => { const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload(); window._labelBlockDownload = true; });
      await t.evaluate(() => downloadSVG());
      await new Promise(r => setTimeout(r, 500));
      s = await state(t);
      assert.strictEqual(s.shown, false); assert.strictEqual(s.rpc, 0);
      ok('4: blocked export (unconfirmed / overflow-blocked) shows no guidance and charges nothing');
      // popup blocked PDF: charged by the existing flow but no print window -> no guidance
      await t.close();
      const t2 = await open('builder.html', 'payg', 'charged', undefined, { popupBlocked: true });
      await readyBuilder(t2);
      await t2.evaluate(() => printToPDF());
      await new Promise(r => setTimeout(r, 500));
      s = await state(t2);
      assert.strictEqual(s.shown, false, 'no guidance when the print window was blocked');
      console.log('INFO: Builder PDF with pop-up blocked -> consume_download calls = ' + s.rpc + ' (existing behaviour, reported separately)');
      ok('4b: PDF with the pop-up blocked (no print window) shows no guidance');
      await t2.close();
    }
    // 5: zero entitlement and accounting error
    {
      const t = await open('builder.html', 'zero', 'none');
      await readyBuilder(t);
      await t.evaluate(() => downloadPNG());
      await new Promise(r => setTimeout(r, 800));
      let s = await state(t);
      assert.strictEqual(s.shown, false); assert.deepStrictEqual(s.downloads, []); assert.ok(t.dialogs.length >= 1, 'out-of-downloads message shown');
      ok('5: zero entitlement — export refused, no guidance, no file');
      await t.close();
      const t2 = await open('builder.html', 'payg', 'error');
      await readyBuilder(t2);
      await t2.evaluate(() => downloadSVG());
      await new Promise(r => setTimeout(r, 600));
      s = await state(t2);
      assert.strictEqual(s.shown, false); assert.deepStrictEqual(s.downloads, []);
      ok('5b: accounting failure — no guidance, no file');
      await t2.close();
    }
    // 6: free re-download shows guidance, exactly one RPC (no extra charge)
    {
      const t = await open('builder.html', 'payg', 'free');
      await readyBuilder(t);
      await t.evaluate(() => downloadSVG());
      assert.ok(await waitFor(t, () => window.__downloads.length === 1));
      const s = await state(t);
      assert.ok(s.shown); assert.strictEqual(s.rpc, 1, 'the guidance adds no RPC/charge');
      ok('6: free eligible re-download shows guidance; still a single consume_download call (no extra charge)');
      await t.close();
    }
    // 10: Trial / Start / Pro keep their accounting outcomes; guidance shows
    for (const [pk, rk, clean] of [['trial', 'trial', false], ['start', 'plan', true], ['pro', 'plan', true]]) {
      const t = await open('builder.html', pk, rk);
      await readyBuilder(t);
      await t.evaluate(() => downloadSVG());
      assert.ok(await waitFor(t, () => window.__downloads.length === 1));
      const s = await state(t);
      const isPro = await t.evaluate(() => S.isPro);
      assert.ok(s.shown); assert.strictEqual(s.rpc, 1); assert.strictEqual(isPro, clean, `${pk}: clean/watermark decision unchanged`);
      await t.close();
    }
    ok('10: Trial (watermarked), Easy Start and Easy Pro keep their entitlement outcome; one charge each; guidance shown');
    // guest (signed out): unchanged, no guidance
    {
      const t = await open('builder.html', null, null, undefined, { signedOut: true });
      await readyBuilder(t);
      await t.evaluate(() => downloadSVG());
      assert.ok(await waitFor(t, () => window.__downloads.length === 1), 'guest watermarked export still works');
      const s = await state(t);
      assert.strictEqual(s.shown, false);
      ok('10b: signed-out guest export unchanged (watermarked file, no guidance)');
      await t.close();
    }
    // 11-13: layout desktop + mobile
    for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
      const t = await open('builder.html', 'payg', 'charged', vp);
      await readyBuilder(t);
      const before = await t.evaluate(() => { const p = document.getElementById('label-svg-container'); const r = p.getBoundingClientRect(); return { top: r.top, h: r.height }; });
      await t.evaluate(() => downloadSVG());
      await waitFor(t, () => window.__downloads.length === 1);
      const s = await state(t);
      const after = await t.evaluate(() => { const p = document.getElementById('label-svg-container'); const r = p.getBoundingClientRect(); const g = document.getElementById('dl-print-guidance').getBoundingClientRect();
        const overlap = !(g.right < r.left || g.left > r.right || g.bottom < r.top || g.top > r.bottom) && getComputedStyle(document.getElementById('preview-panel-el')).display !== 'none';
        return { top: r.top, h: r.height, overlap, guidanceFixed: getComputedStyle(document.getElementById('dl-print-guidance')).position }; });
      assert.ok(s.shown); assert.strictEqual(s.hScroll, false, name + ': no horizontal overflow');
      assert.ok(s.rect.right <= s.vw + 1, name + ': guidance within the viewport');
      assert.strictEqual(after.guidanceFixed, 'static', 'in-flow panel, not an overlay/modal');
      if (name === 'desktop') { assert.strictEqual(after.overlap, false, 'does not cover the label preview'); assert.strictEqual(Math.round(after.top), Math.round(before.top), 'preview does not move'); }
      if (name === 'mobile') await t.evaluate(() => document.getElementById('dl-print-guidance').scrollIntoView({ block: 'center' }));
      await t.screenshot({ path: path.join(process.env.QA_SHOTS || require('os').tmpdir(), `print-guidance-builder-${name}.png`) }).catch(() => {});
      assert.deepStrictEqual(t.errs, []);
      ok(`11-13: Builder ${name}: in-flow panel, no overlay, no horizontal overflow${name === 'desktop' ? ', preview not covered or moved' : ''}`);
      await t.close();
    }

    // Composer
    async function readyComposer(t) {
      await t.evaluate(async () => {
        const rec = { id: '11111111-2222-4333-8444-555555555555', schemaVersion: 1, scentName: 'Sheet QA', productType: 'Scented Candle', shape: 'circle', size: 52, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '26/09/2026' };
        await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id }));
      });
      await t.goto(t.url().split('?')[0] + '?label=11111111-2222-4333-8444-555555555555', { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 1800));
    }
    const cstate = t => t.evaluate(() => { const g = document.getElementById('sheet-print-guidance');
      return { shown: !g.hidden && g.offsetParent !== null, text: g.innerText.replace(/\s+/g, ' ').trim(), role: g.getAttribute('role'), rpc: window.__rpc.filter(x => x[0] === 'consume_download').length,
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, qty: typeof getTotalQty === 'function' ? getTotalQty() : -1 }; });
    for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
      const t = await open('print.html', 'payg', 'charged', vp);
      await readyComposer(t);
      let s = await cstate(t);
      assert.ok(s.qty > 0, 'sheet has the preloaded label'); assert.strictEqual(s.shown, false);
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => { const g = document.getElementById('sheet-print-guidance'); return !g.hidden; }, 8000), 'guidance appears after the sheet is written');
      s = await cstate(t);
      assert.ok(s.text.startsWith('✓ Print sheet ready'), s.text);
      assert.ok(s.text.includes('Load the matching label sheet or printable material into your printer. Check your paper size and printer settings, then print at 100% / Actual Size to preserve the label dimensions.'), s.text);
      assert.strictEqual(s.role, 'status'); assert.strictEqual(s.rpc, 1, 'one charge'); assert.strictEqual(s.hScroll, false);
      const help = await t.evaluate(async () => { const a = document.querySelector('#sheet-print-guidance .spg-help-link'); if (!a) return 'no link'; a.click(); await new Promise(r => setTimeout(r, 300)); return { text: a.textContent, open: document.getElementById('printing-help').open, rpc: window.__rpc.filter(x => x[0] === 'consume_download').length }; });
      assert.deepStrictEqual(help, { text: 'Printing tips →', open: true, rpc: 1 }, 'Printing tips opens the existing Printing help, no charge');
      if (name === 'mobile') await t.evaluate(() => document.getElementById('sheet-print-guidance').scrollIntoView({ block: 'center' }));
      assert.deepStrictEqual(t.errs, []);
      await t.screenshot({ path: path.join(process.env.QA_SHOTS || require('os').tmpdir(), `print-guidance-composer-${name}.png`) }).catch(() => {});
      ok(`7/9/12/13: Composer ${name}: successful PAYG print-sheet export shows the sheet guidance + working "Printing tips →", one charge, no overflow, no console errors`);
      await t.close();
    }
    // 8: blocked Composer export (trial-only, and zero balance)
    for (const [pk, rk] of [['trial', 'trial'], ['zero', 'none']]) {
      const t = await open('print.html', pk, rk);
      await readyComposer(t);
      await t.evaluate(() => downloadPDF());
      await new Promise(r => setTimeout(r, 1200));
      const s = await cstate(t);
      assert.strictEqual(s.shown, false); assert.strictEqual(s.rpc, 0);
      await t.close();
    }
    ok('8: blocked Composer export (trial-only, zero balance) shows no guidance and charges nothing');
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`post-download print guidance checks passed (${passed} groups)`);
  }
});
