// Stage 2 — download/save success feedback and beginner printing guidance.
//
// Static checks on the wording (concepts, not punctuation) plus real-Chromium
// checks that:
//   - the save/download confirmation becomes visible, only on success, and
//     is not permanent (auto-dismisses) or blocking;
//   - the print-window guidance is screen-only: it never prints, and the
//     single-label PDF page / Composer A4 page keep their exact geometry.
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/stage2-download-success-printing-guidance.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
const print = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// ── Static wording checks ────────────────────────────────────────────────
const guideMe = builder.slice(builder.indexOf('const systemPrompt = `'), builder.indexOf('`;', builder.indexOf('const systemPrompt = `')));
assert.ok(guideMe.length > 500, 'Guide Me prompt found');
assert.ok(!/Avery Sheet/.test(guideMe), 'Guide Me no longer recommends the Avery Sheet');
assert.ok(!/Print Shop PDF/.test(guideMe), 'Guide Me no longer recommends the Print Shop PDF');
assert.ok(!/plain paper[^\n]*use ⬇ PNG/.test(guideMe), 'Guide Me no longer recommends PNG for printing');
assert.ok(/PDF[^\n]*Recommended for printing[^\n]*Actual Size \/ 100%/.test(guideMe), 'Guide Me recommends PDF at Actual Size / 100%');
assert.ok(/PNG[^\n]*not the recommended way to print at an exact size/.test(guideMe), 'Guide Me describes PNG as an image, not the exact-size print route');
assert.ok(/PRINT SHEET COMPOSER/.test(guideMe) && /SVG/.test(guideMe), 'Guide Me names the current routes (Composer, SVG)');
ok('Guide Me: Avery Sheet / Print Shop PDF / PNG-for-printing advice replaced with the current routes');

const fmt = builder.slice(builder.indexOf('id="dl-format-guide"'), builder.indexOf('</div>', builder.indexOf('</details>', builder.indexOf('id="dl-format-guide"'))));
assert.ok(/PDF — recommended for printing/.test(fmt), 'Step 5 recommends PDF for printing');
assert.ok(/SVG<\/strong> — for design or cutting software/.test(fmt), 'Step 5 describes SVG');
assert.ok(/PNG<\/strong> — a high-resolution image[^<]*isn't the best choice for printing at an exact size/.test(fmt), 'Step 5: PNG is not the preferred exact-size route');
for (const src of [builder, print]) assert.ok(!/PNG[^.<]{0,60}prints? at the correct size/i.test(src), 'never says PNG prints at the correct size');
ok('Step 5 format guidance: PDF recommended, SVG for design/cutting software, PNG not the exact-size print route');

assert.ok(!/will not print/i.test(builder), 'old "will not print" cut-line wording gone');
assert.ok(/dashed line is a cut guide and it <strong>does print<\/strong>/.test(builder), 'cut line described as printing');
ok('Help: dashed cut line is described accurately (it prints)');

const help = print.slice(print.indexOf('id="printing-help"'), print.indexOf('</details>', print.indexOf('id="printing-help"')));
assert.ok(/Actual Size \/ 100%/.test(help), 'Composer help: Actual Size / 100%');
assert.ok(/Avoid “Fit to page”, “Shrink” or “Scale to fit”/.test(help), 'Composer help: Fit/Shrink warning');
assert.ok(/paper to <strong>A4<\/strong>/.test(help), 'Composer help: printer paper setting A4');
assert.ok(/test on ordinary A4 paper/.test(help) && /check the alignment/.test(help), 'Composer help: first test print + alignment');
assert.ok(/Setting names vary/.test(help), 'Composer help: wording varies');
ok('Composer printing help: Actual Size / 100%, Fit/Shrink warning, A4 paper, first-test and alignment guidance');

assert.ok(!/id="label-done-splash"[^>]*display:\s*none/.test(builder), 'confirmation element no longer hard-hidden');
const bHelp = builder.slice(builder.indexOf('id="help-printing"'), builder.indexOf('<h3>Frequently asked questions</h3>'));
for (const h of ['Printing a single label', 'Printing a sheet of labels', 'Choosing a file format', 'First print check', 'Common printing problems']) assert.ok(bHelp.includes(h), 'Help printing section has ' + h);
ok('Builder Help: "Printing your CLPeasy labels" section present');

// ── Browser checks ───────────────────────────────────────────────────────
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP stage2 browser checks: puppeteer not installed'); console.log(`stage2 checks passed (${passed} groups)`); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP stage2 browser checks: no Chromium'); console.log(`stage2 checks passed (${passed} groups)`); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};';
// Signed-in PAYG stub, only for reaching the Composer's print window (the
// Composer export requires an account). No network is used.
const PAYG = `window.__rpc=[];window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'payg',subscription_status:'payg',trial_end:new Date(Date.now()-2*864e5).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:5,created_at:new Date(Date.now()-40*864e5).toISOString()};
var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
from:function(){return Object.create(q)},rpc:async function(n){window.__rpc.push(n);return {data:{ok:true,consumed:true,free_redownload:false,source:'purchased',clean_export:true,purchased_downloads:4,downloads_used:0,downloads_limit:0},error:null};},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
// Records file hand-over and print-window HTML without changing page behaviour.
const RECORDER = `window.__downloads=[];window.__opened=[];window.__written='';
(function(){var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push(this.download);return oc.apply(this,arguments);};
window.open=function(u){window.__opened.push(String(u||''));var w={closed:false,close:function(){this.closed=true;},focus:function(){},location:{replace:function(x){w.navigated=String(x);}},document:{open:function(){window.__written='';},write:function(h){window.__written+=h;},close:function(){}}};window.__lastPopup=w;return w;};})();`;
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 P302+P352 P501';
// Shorter hazard set for the small 63x44 rectangle (with product type Wax Melt
// and a short address) so the label fits and can be exported. A Scented Candle
// at 63x44 is export-blocked on main too (footer clipped) -- not a Stage 2 change.
const SDS_SMALL = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P501';

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
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function open(page, vp = { width: 1366, height: 900 }, supa = SIGNED_OUT) {
    const t = await browser.newPage();
    await t.setViewport(vp);
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
    return t;
  }
  async function readyBuilder(t, shape = 'circle', w = 60, h = 60, sds = SDS) {
    await t.evaluate(async (SDS, shape, w, h) => {
      currentUser = null; if (typeof initSavedLabelLibrary === 'function') await initSavedLabelLibrary();
      document.getElementById('scent-name').value = 'Stage2 QA';
      document.getElementById('product-type').value = shape === 'rectangle' ? 'Wax Melt' : 'Scented Candle';
      if (typeof onProductTypeChange === 'function') onProductTypeChange();
      document.getElementById('smart-paste-input').value = SDS;
      extractSDS();
      document.getElementById('biz-name').value = 'QA Candles';
      document.getElementById('biz-address').value = shape === 'rectangle' ? 'TE1 1ST' : '1 Test Street, Testtown, TE1 1ST';
      document.getElementById('biz-phone').value = '01234 567890';
      selectShape(shape); document.getElementById('custom-w').value = w; document.getElementById('custom-h').value = h; onDimInput();
      readForm(); updateLabel();
      const d = getDims(); if (d.mmW !== w || d.mmH !== h) throw new Error('size not applied: ' + d.mmW + 'x' + d.mmH);
      for (let n = 2; n <= 5; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
        setApprovedBuilderStep(n); await new Promise(r => setTimeout(r, 150));
      }
      if (approvedBuilderStep !== 5) throw new Error('could not reach Step 5');
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      await new Promise(r => setTimeout(r, 400));
    }, sds, shape, w, h);
  }
  const toast = t => t.evaluate(() => { const d = document.getElementById('label-done-splash'); const cs = getComputedStyle(d); const r = d.querySelector('.label-done-box').getBoundingClientRect();
    return { shown: d.classList.contains('show') && cs.visibility === 'visible' && cs.opacity !== '0', text: d.querySelector('[role=status]').innerText.replace(/\s+/g, ' ').trim(), position: cs.position,
      boxH: r.height, boxBottom: r.bottom, boxRight: r.right, vw: window.innerWidth, vh: window.innerHeight, hScroll: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
  try {
    for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
      const t = await open('builder.html', vp);
      await readyBuilder(t);
      let s = await toast(t);
      assert.strictEqual(s.shown, false, 'no confirmation before any action');
      // Save → confirmation
      await t.evaluate(() => saveLabel());
      await sleep(400);
      s = await toast(t);
      assert.ok(s.shown && /^Label saved/.test(s.text) && /saved to My Labels/.test(s.text), name + ' save confirmation: ' + JSON.stringify(s));
      assert.strictEqual(s.position, 'fixed');
      assert.ok(s.boxH < 140 && s.boxBottom <= s.vh && s.boxRight <= s.vw + 1 && !s.hScroll, name + ': small, on screen, no overflow');
      // Non-blocking: clicks elsewhere reach the page underneath.
      const under = await t.evaluate(() => { const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 3); return !!el && !el.closest('#label-done-splash'); });
      assert.ok(under, name + ': confirmation does not cover the page');
      await t.screenshot({ path: path.join(process.env.QA_SHOTS || require('os').tmpdir(), `stage2-toast-save-${name}.png`) }).catch(() => {});
      // Not permanent: auto-dismisses.
      await sleep(6800);
      s = await toast(t);
      assert.strictEqual(s.shown, false, name + ': confirmation auto-dismisses');
      ok(`${name}: save shows a visible, non-blocking "Label saved" confirmation that auto-dismisses`);

      await t.evaluate(() => downloadSVG());
      await sleep(300);
      s = await toast(t);
      assert.ok(s.shown && /^Label downloaded/.test(s.text), name + ' SVG confirmation: ' + s.text);
      assert.strictEqual(await t.evaluate(() => window.__downloads.length), 1);
      // Close button dismisses it; a second download re-shows a single toast.
      await t.evaluate(() => document.querySelector('#label-done-splash .label-done-close').click());
      await sleep(350);
      assert.strictEqual((await toast(t)).shown, false, 'close button dismisses');
      assert.strictEqual(await t.evaluate(() => document.querySelectorAll('#label-done-splash').length), 1, 'no duplicate confirmation elements');
      ok(`${name}: SVG download shows "Label downloaded"; close button works; single element`);
      assert.deepStrictEqual(t.errs, [], 'no page errors: ' + t.errs.join(' | '));
      await t.close();
    }

    // Never on failure
    {
      const t = await open('builder.html');
      await readyBuilder(t);
      await t.evaluate(() => { window.__origMutate = LabelLibrary.mutate; LabelLibrary.mutate = async () => { throw new Error('quota'); }; });
      await t.evaluate(() => saveLabel());
      await sleep(900);
      assert.strictEqual((await toast(t)).shown, false, 'no save confirmation when the save fails');
      await t.evaluate(() => { LabelLibrary.mutate = window.__origMutate; window.__origBuild = buildSVG; buildSVG = () => { throw new Error('boom'); }; });
      await t.evaluate(() => downloadSVG());
      await sleep(900);
      assert.strictEqual((await toast(t)).shown, false, 'no download confirmation when the SVG fails');
      await t.evaluate(() => { buildSVG = window.__origBuild; const v = document.getElementById('verify-checkbox'); v.checked = false; toggleDownload(); });
      await t.evaluate(() => downloadPNG());
      await sleep(2200);
      assert.strictEqual((await toast(t)).shown, false, 'no confirmation when the download is blocked (unconfirmed)');
      assert.strictEqual(await t.evaluate(() => window.__downloads.length), 0);
      ok('no confirmation on failed save, failed SVG or blocked download');
      await t.close();
    }

    // Single-label print window: guidance is screen-only; geometry unchanged
    for (const [shape, w, h] of [['circle', 60, 60], ['square', 60, 60], ['rectangle', 63, 44]]) {
      const t = await open('builder.html');
      await readyBuilder(t, shape, w, h, shape === 'rectangle' ? SDS_SMALL : SDS);
      await t.evaluate(() => printToPDF());
      await sleep(400);
      assert.strictEqual(await t.evaluate(() => window.__opened.length), 1, `${shape} ${w}x${h}: print window opened (flags: ${await t.evaluate(() => JSON.stringify({l: window._labelLegibilityWarn, f: window._footerLegibilityClipped, s: window._scentTooSmall, b: window._businessNameTooSmall, p: window._productTypeTooSmall, sw: window._signalWordTooSmall, u: window._unrecognizedCodes, dims: getDims()}))})`);
      const html = await t.evaluate(async () => { const u = window.__opened[window.__opened.length - 1]; return await (await fetch(u)).text(); });
      assert.ok(html.includes(`@page{size:${w}mm ${h}mm;margin:0;}`), `${shape}: @page size unchanged: ` + (html.match(/@page\{[^}]*\}/) || [html.slice(0, 200)])[0]);
      assert.ok(/class="print-tip"[\s\S]*Actual Size[\s\S]*Fit to page/.test(html), 'print window shows the guidance');
      const p = await browser.newPage();
      await p.setContent(html, { waitUntil: 'load' });
      const screen = await p.evaluate(() => getComputedStyle(document.querySelector('.print-tip')).display);
      await p.emulateMediaType('print');
      const pr = await p.evaluate(() => { const sv = document.querySelector('svg'); const r = sv.getBoundingClientRect();
        return { tip: getComputedStyle(document.querySelector('.print-tip')).display, btn: getComputedStyle(document.querySelector('.print-btn')).display, w: r.width, h: r.height, x: r.left, y: r.top,
          bodyW: document.body.getBoundingClientRect().width, bodyH: document.body.getBoundingClientRect().height, sw: sv.getAttribute('width'), sh: sv.getAttribute('height') }; });
      assert.strictEqual(screen, 'block'); assert.strictEqual(pr.tip, 'none', 'guidance never prints'); assert.strictEqual(pr.btn, 'none');
      assert.strictEqual(pr.sw, w + 'mm'); assert.strictEqual(pr.sh, h + 'mm');
      const px = mm => mm * 96 / 25.4;
      assert.ok(Math.abs(pr.w - px(w)) < 0.5 && Math.abs(pr.h - px(h)) < 0.5 && pr.x === 0 && pr.y === 0, `${shape}: label box ${pr.w}x${pr.h} at 0,0`);
      assert.ok(Math.abs(pr.bodyW - px(w)) < 0.5 && Math.abs(pr.bodyH - px(h)) < 0.5, 'no added margins/padding');
      const pdf = Buffer.from(await p.pdf({ preferCSSPageSize: true, printBackground: true }));
      const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox \[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
      assert.strictEqual(boxes.length, 1, 'single page');
      const toMM = pt => parseFloat(pt) * 25.4 / 72;
      assert.ok(Math.abs(toMM(boxes[0][1]) - w) < 0.3 && Math.abs(toMM(boxes[0][2]) - h) < 0.3, `${shape}: PDF page ${toMM(boxes[0][1]).toFixed(2)}x${toMM(boxes[0][2]).toFixed(2)}mm`);
      await p.close(); await t.close();
      ok(`single-label PDF ${shape} ${w}x${h}: guidance on screen only; page ${w}x${h}mm, label at 0,0, no margins`);
    }

    // Composer print window: guidance screen-only; A4 page unchanged
    {
      const t = await open('print.html', { width: 1366, height: 900 }, PAYG);
      await t.evaluate(async () => {
        const rec = { id: '11111111-2222-4333-8444-555555555555', schemaVersion: 1, scentName: 'Sheet QA', productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 60, customH: 60, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '27/09/2026' };
        await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id }));
      });
      await t.goto(t.url().split('?')[0] + '?label=11111111-2222-4333-8444-555555555555', { waitUntil: 'load' });
      await sleep(2000);
      const before = await t.evaluate(() => JSON.stringify(getSheetPlacementsMM().map(p => [p.x, p.y, p.w, p.h])));
      await t.evaluate(() => downloadPDF());
      const end = Date.now() + 10000; while (Date.now() < end && !(await t.evaluate(() => /print-btn/.test(window.__written)))) await sleep(200);
      const html = await t.evaluate(() => window.__written);
      const after = await t.evaluate(() => JSON.stringify(getSheetPlacementsMM().map(p => [p.x, p.y, p.w, p.h])));
      assert.strictEqual(after, before, 'guidance does not change Composer placements');
      assert.ok(/@page\{size:A4 portrait;margin:0;\}/.test(html), 'A4 @page unchanged');
      assert.ok(/class="print-tip"[\s\S]*Actual Size[\s\S]*Fit to page/.test(html), 'Composer print window shows the guidance');
      const p = await browser.newPage();
      await p.setContent(html, { waitUntil: 'load' });
      await p.emulateMediaType('print');
      const pr = await p.evaluate(() => ({ tip: getComputedStyle(document.querySelector('.print-tip')).display, img: (() => { const r = document.querySelector('img').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })() }));
      assert.strictEqual(pr.tip, 'none', 'Composer guidance never prints');
      const px = mm => mm * 96 / 25.4;
      assert.ok(pr.img[0] === 0 && pr.img[1] === 0 && Math.abs(pr.img[2] - px(210)) < 0.5 && Math.abs(pr.img[3] - px(297)) < 0.5, 'A4 image at 0,0, 210x297mm: ' + pr.img);
      const pdf = Buffer.from(await p.pdf({ preferCSSPageSize: true, printBackground: true }));
      const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox \[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
      assert.strictEqual(boxes.length, 1, 'single A4 page');
      assert.ok(Math.abs(parseFloat(boxes[0][1]) * 25.4 / 72 - 210) < 0.3 && Math.abs(parseFloat(boxes[0][2]) * 25.4 / 72 - 297) < 0.3, 'A4 page size');
      const g = await t.evaluate(() => document.getElementById('sheet-print-guidance').innerText);
      assert.ok(/Print sheet ready/.test(g) && /How to print this correctly/.test(g), 'Composer next-step state: ' + g);
      await p.close(); await t.close();
      ok('Composer: next-step state with "How to print this correctly"; print-window guidance screen-only; one A4 page, placements unchanged');
    }
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`stage2 checks passed (${passed} groups)`);
  }
});
