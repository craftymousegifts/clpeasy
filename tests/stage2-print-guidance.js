// Stage 2 (27 Sep 2026): download/save success feedback and beginner printing
// guidance — real-browser checks.
//
// Serves the working tree on 127.0.0.1, stubs Supabase in-page (no network)
// and drives the REAL builder.html / print.html. Proves:
//   - a successful save shows a visible, accessible confirmation that goes
//     away by itself, and a failed save shows none;
//   - download guidance is format-specific (two neutral routes: PDF for a
//     single label, Print Sheet Composer for several on A4; PNG explicitly
//     NOT presented as the exact-size print route; SVG keeps mm) and can be
//     dismissed;
//   - Step 5 format help, Help Guide printing section and Guide Me prompt say
//     the right things (obsolete Avery Sheet / Print Shop PDF advice gone);
//   - the dashed cut line is described as printing;
//   - the on-screen notes in both print windows are hidden when printing and
//     do not change the printed page size (single label and A4 sheet).
// Composer geometry itself is covered by tests/print-sheet-size-integrity.js.
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/stage2-print-guidance.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP stage2-print-guidance: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP stage2-print-guidance: no Chromium available'); process.exit(0); }

const builderSrc = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
const printSrc = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// ── Static wording checks (concepts, not punctuation) ─────────────────────
{
  const prompt = builderSrc.slice(builderSrc.indexOf('CLPeasy has these features:'), builderSrc.indexOf('Respond in plain HTML suitable for a chat bubble'));
  assert(prompt.length > 500, 'setup: Guide Me system prompt found');
  assert(!/Avery Sheet/i.test(prompt), 'Guide Me must not offer the removed "Avery Sheet" export');
  assert(!/Print Shop PDF/i.test(prompt), 'Guide Me must not offer the removed "Print Shop PDF" export');
  assert(!/PNG[^\n]*(home printing|printing at home|plain paper)/i.test(prompt), 'Guide Me must not recommend PNG for home printing');
  assert(/PDF[^\n]*individual label file/i.test(prompt) && /one individual label → ▣ PDF/.test(prompt) && /several labels arranged on A4 → Print Sheet Composer/.test(prompt), 'Guide Me must distinguish single label (PDF) from several on A4 (Composer)');
  assert(/neither is the default for everyone/i.test(prompt), 'Guide Me must not present either route as the universal default');
  assert(!/Recommended for printing a single label at home/i.test(prompt), 'Guide Me must not present PDF as the home-printing route');
  assert(/PNG[^\n]*does not store a print size/i.test(prompt), 'Guide Me must explain PNG has no stored print size');
  assert(/Actual Size \/ 100%/.test(prompt) && /Fit to page/.test(prompt), 'Guide Me must know the Actual Size / avoid Fit to page rule');
  ok('Guide Me: obsolete Avery Sheet / Print Shop PDF / PNG-for-printing advice gone; two routes (PDF single / Composer several on A4); scaling rule present');

  assert(!/will not print/i.test(builderSrc), 'the Help Guide must no longer say the dashed line "will not print"');
  assert(/dashed line is the cut guide border[^<]*<strong>does print<\/strong>/i.test(builderSrc), 'the Help Guide must say the dashed cut guide does print');
  ok('Help Guide: dashed cut line described accurately (it prints; Hide border turns it off)');

  assert(!/PNG for printing/.test(builderSrc), 'the mobile preview caption must not say "PNG for printing"');
  ok('mobile preview caption no longer recommends PNG for printing');

  const help = builderSrc.slice(builderSrc.indexOf('id="help-printing"'));
  for (const t of ['Printing a single label', 'Printing a sheet of labels', 'Choosing a file format', 'First print check', 'too large or too small', "doesn't line up"]) {
    assert(help.includes(t), `Help Guide printing section must cover "${t}"`);
  }
  ok('Help Guide has a short "Printing your CLPeasy labels" section (single, sheet, format, first check, two problems)');

  const ph = printSrc.slice(printSrc.indexOf('id="printing-help"'), printSrc.indexOf('</details>', printSrc.indexOf('id="printing-help"')));
  assert(/A4/.test(ph) && /Actual Size/.test(ph) && /100%/.test(ph), 'Composer Printing help: A4 + Actual Size / 100%');
  assert(/Fit to page/.test(ph) && /Shrink/.test(ph), 'Composer Printing help: Fit to page / Shrink warning');
  assert(/ordinary A4 paper/.test(ph) && /line up/.test(ph), 'Composer Printing help: test on ordinary paper + alignment check');
  assert(/keeps every label at the size it was saved/.test(ph), 'Composer Printing help: saved physical size is kept');
  ok('Composer Printing help: saved size kept, A4, Actual Size / 100%, avoid Fit/Shrink, test print + alignment');
}

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILE = { id: 'u1', email: 'qa@example.test', full_name: 'QA', created_at: iso(-40 * DAY), plan: 'payg', subscription_status: 'payg', trial_end: iso(-2 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 50, billing_cycle: 'monthly' };
const RPC = { ok: true, consumed: true, free_redownload: false, source: 'purchased', clean_export: true, purchased_downloads: 49, downloads_used: 0, downloads_limit: 0 };
const STUB = `window.supabase={createClient:function(){var row=${JSON.stringify(PROFILE)};var res=${JSON.stringify(RPC)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(n){if(n!=='consume_download')return {data:null,error:null};return {data:res,error:null};},
  functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP261 P302+P352 P501';

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
  async function open(page, vp = { width: 1366, height: 900 }) {
    const t = await browser.newPage();
    await t.setViewport(vp);
    t.errs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => d.dismiss());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: STUB });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.evaluateOnNewDocument(() => { const oc = HTMLAnchorElement.prototype.click; window.__downloads = []; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push(this.download); return; } return oc.apply(this, arguments); }; });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' }); await t.evaluate(require('./helpers/sds-doc-answer').SCRIPT).catch(()=>{});
    await sleep(1500);
    return t;
  }
  async function readyBuilder(t, shape = 'circle', w = 60, h = 60) {
    await t.evaluate(async (SDS, shape, w, h) => {
      document.getElementById('scent-name').value = 'Stage Two QA';
      document.getElementById('product-type').value = 'Scented Candle';
      if (typeof onProductTypeChange === 'function') onProductTypeChange();
      selectShape(shape); document.getElementById('custom-w').value = w; document.getElementById('custom-h').value = h; onDimInput();
      document.getElementById('smart-paste-input').value = SDS; extractSDS();
      document.getElementById('biz-name').value = 'QA Candles';
      document.getElementById('biz-address').value = '1 Test Street, Testtown, TE1 1ST';
      document.getElementById('biz-phone').value = '01234 567890';
      readForm(); updateLabel();
      for (let n = 2; n <= 5; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
        setApprovedBuilderStep(n); await new Promise(r => setTimeout(r, 120));
      }
      if (approvedBuilderStep !== 5) throw new Error('could not reach Step 5');
      const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload();
      await new Promise(r => setTimeout(r, 300));
    }, SDS, shape, w, h);
  }
  const panel = (t, id) => t.evaluate(id => { const g = document.getElementById(id); return { shown: !g.hidden && g.offsetParent !== null, text: g.innerText.replace(/\s+/g, ' ').trim(), role: g.getAttribute('role'), live: g.getAttribute('aria-live'), hScroll: document.documentElement.scrollWidth > window.innerWidth + 1 }; }, id);
  const waitFor = async (t, fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await t.evaluate(fn)) return true; await sleep(150); } return false; };

  try {
    // ── Step 5 format help ────────────────────────────────────────────────
    {
      const t = await open('builder.html');
      await readyBuilder(t);
      const fh = await t.evaluate(() => { const e = document.getElementById('dl-format-help'); return { shown: e.offsetParent !== null, text: e.innerText.replace(/\s+/g, ' ') }; });
      assert(fh.shown, 'Step 5 format help visible');
      assert(/Printing your labels\? For a single label, use PDF\. For several labels on A4, use the Print Sheet Composer\. Always print at Actual Size \/ 100%/.test(fh.text), 'two neutral routes: ' + fh.text);
      assert(!/most reliable printed size|Printing at home\? Choose PDF/.test(fh.text), 'PDF must not be presented as the home-printing route');
      assert(/PDF is an individual label file/.test(fh.text), 'PDF described as an individual label file');
      assert(/Actual Size \/ 100%/.test(fh.text), 'Step 5 mentions Actual Size / 100%');
      assert(/PNG[^.]*high-resolution image/.test(fh.text) && /may choose its own print size/.test(fh.text), 'PNG explained (app may choose print size): ' + fh.text);
      assert(!/PNG[^.]*(prints at the correct size|correct print size)/i.test(fh.text), 'PNG never claimed to print at the correct size');
      ok('Step 5 format help: single label → PDF, several on A4 → Composer, Actual Size / 100%; SVG keeps mm; PNG size set by the app');

      // ── Save: visible confirmation, auto-hides ───────────────────────
      let s = await panel(t, 'save-status');
      assert.strictEqual(s.shown, false, 'save status hidden before saving');
      await t.evaluate(() => saveLabel());
      assert(await waitFor(t, () => !document.getElementById('save-status').hidden), 'save confirmation appears');
      s = await panel(t, 'save-status');
      assert(s.shown && /Label saved/.test(s.text) && /My Labels/.test(s.text), s.text);
      assert.strictEqual(s.role, 'status'); assert.strictEqual(s.live, 'polite');
      assert(await t.evaluate(() => !!document.querySelector('#save-status a[href="my-labels.html"]')), 'links to My Labels');
      await sleep(8500);
      s = await panel(t, 'save-status');
      assert.strictEqual(s.shown, false, 'save confirmation is not permanent (auto-hides)');
      ok('Save: visible "Label saved" status (role=status, link to My Labels) that hides itself after ~8s');

      // A failed save must not show success.
      await t.evaluate(() => { window.__origMutate = LabelLibrary.mutate; LabelLibrary.mutate = async () => { throw new Error('boom'); }; });
      await t.evaluate(() => saveLabel());
      await sleep(900);
      s = await panel(t, 'save-status');
      assert.strictEqual(s.shown, false, 'no success message when the save fails');
      await t.evaluate(() => { LabelLibrary.mutate = window.__origMutate; });
      ok('Save failure shows no success confirmation');

      // ── Downloads: format-specific guidance + dismiss ─────────────────
      await t.evaluate(() => downloadPNG());
      assert(await waitFor(t, () => window.__downloads.some(d => /\.png$/.test(d))), 'PNG handed over');
      let g = await panel(t, 'dl-print-guidance');
      assert(g.shown && g.text.startsWith('✓ Label downloaded'), g.text);
      assert(/PNG files don't store a print size/.test(g.text) && /For an individual exact-size print, use PDF\. For several labels on A4, use the Print Sheet Composer\./.test(g.text), 'PNG guidance names both routes: ' + g.text);
      ok('PNG download: approved confirmation + "PNG files don\'t store a print size ... use PDF"');

      await t.evaluate(() => downloadSVG());
      assert(await waitFor(t, () => window.__downloads.some(d => /\.svg$/.test(d))), 'SVG handed over');
      g = await panel(t, 'dl-print-guidance');
      assert(/SVG is saved at 60 × 60 mm/.test(g.text), 'SVG guidance states its mm size: ' + g.text);
      ok('SVG download: states the saved mm size and to check it after importing');

      const popupP = new Promise(r => browser.once('targetcreated', async tg => r(await tg.page())));
      await t.evaluate(() => printToPDF());
      const pop = await popupP;
      await sleep(800);
      g = await panel(t, 'dl-print-guidance');
      assert(/This PDF is an individual label file at 60 × 60 mm/.test(g.text) && /ordinary paper/.test(g.text) && /ruler/.test(g.text), 'PDF guidance: individual file + size + test print: ' + g.text);
      assert(/Printing several labels on A4\? Use the Print Sheet Composer\./.test(g.text), 'PDF panel mentions the Composer for several labels: ' + g.text);
      assert(!/should have used|instead of PDF/i.test(g.text), 'PDF panel must not tell the user they chose wrongly');
      const more = await t.evaluate(() => { const d = document.querySelector('#dl-print-guidance details'); d.open = true; return d.innerText.replace(/\s+/g, ' '); });
      assert(/How to print this label correctly/.test(more) && /Use: Actual Size or 100%/.test(more) && /Avoid: Fit to page, Shrink or Scale to fit/.test(more), 'expander: Use / Avoid spelled out in words: ' + more);
      assert(/CLPeasy creates the label at the size shown in the Builder\. Your browser, PDF viewer and printer settings can still change the printed size\./.test(more), 'expander: control-boundary note');
      assert(/Printing this individual label\? Use PDF and print at Actual Size \/ 100%/.test(more), 'expander: individual PDF route: ' + more);
      assert(!/Printing several labels on A4/.test(more), 'expander must not repeat the Composer line shown in the panel above it');
      assert(!/most reliable printed size/.test(more), 'expander: PDF not presented as the universal route');
      await t.evaluate(() => document.querySelector('#dl-print-guidance .dl-pg-close').click());
      g = await panel(t, 'dl-print-guidance');
      assert.strictEqual(g.shown, false, 'Dismiss hides the guidance');
      ok('PDF: size + first-test guidance, "How to print" expander (Use / Avoid in words, control note), Dismiss works');

      // ── Single-label print window: note is screen-only, page size unchanged ──
      await pop.waitForSelector('svg');
      const scr = await pop.evaluate(() => { const n = document.querySelector('.print-note'); return { note: n ? n.innerText.replace(/\s+/g, ' ') : '', vis: n ? getComputedStyle(n).display : 'none' }; });
      assert(/Use: Actual Size or 100%/.test(scr.note) && /Avoid: Fit to page, Shrink or Scale to fit/.test(scr.note) && /60 × 60 mm/.test(scr.note), 'print window note: ' + scr.note);
      assert.notStrictEqual(scr.vis, 'none', 'note visible on screen');
      await pop.emulateMediaType('print');
      const prn = await pop.evaluate(() => ({ note: getComputedStyle(document.querySelector('.print-note')).display, btn: getComputedStyle(document.querySelector('.print-btn')).display, svgW: document.querySelector('svg').getBoundingClientRect().width, bodyW: document.body.getBoundingClientRect().width, bodyH: document.body.getBoundingClientRect().height }));
      assert.strictEqual(prn.note, 'none', 'the print note must not print');
      assert.strictEqual(prn.btn, 'none', 'the print button must not print');
      const MM = 96 / 25.4;
      assert(Math.abs(prn.svgW - 60 * MM) < 0.5 && Math.abs(prn.bodyW - 60 * MM) < 0.5 && Math.abs(prn.bodyH - 60 * MM) < 0.5, `label/page box must stay 60 x 60 mm in print: ${JSON.stringify(prn)}`);
      const pdf = await pop.pdf({ preferCSSPageSize: true, printBackground: true });
      const mb = Buffer.from(pdf).toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\]/);
      assert(mb, 'PDF MediaBox found');
      const [wmm, hmm] = [+mb[1] / 72 * 25.4, +mb[2] / 72 * 25.4];
      assert(Math.abs(wmm - 60) < 0.3 && Math.abs(hmm - 60) < 0.3, `single-label PDF page must stay 60 x 60 mm, got ${wmm.toFixed(2)} x ${hmm.toFixed(2)}`);
      assert.strictEqual((Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 1, 'still exactly one page');
      ok(`single-label print window: note screen-only (hidden in print), page stays ${wmm.toFixed(2)} x ${hmm.toFixed(2)} mm, one page`);
      await pop.close();
      assert.deepStrictEqual(t.errs, [], 'no page errors: ' + t.errs.join(' | '));
      await t.close();
    }

    // ── Mobile: Step 5 help, save status and guidance fit the screen ──────
    {
      const t = await open('builder.html', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await readyBuilder(t);
      await t.evaluate(() => saveLabel());
      assert(await waitFor(t, () => !document.getElementById('save-status').hidden));
      await t.evaluate(() => downloadSVG());
      assert(await waitFor(t, () => !document.getElementById('dl-print-guidance').hidden));
      const m = await t.evaluate(() => { const ids = ['dl-format-help', 'dl-print-guidance', 'save-status']; return { hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, fits: ids.every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; }) }; });
      assert.strictEqual(m.hScroll, false, 'mobile: no horizontal overflow'); assert(m.fits, 'mobile: panels within the viewport');
      assert.deepStrictEqual(t.errs, []);
      const popP = new Promise(r => browser.once('targetcreated', async tg => r(await tg.page())));
      await t.evaluate(() => printToPDF());
      const mpop = await popP;
      await mpop.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await mpop.waitForSelector('svg');
      const vis = await mpop.evaluate(() => ['.print-note', '.print-btn'].every(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1; }));
      assert(vis, 'mobile: single-label print window note and Print button must be on screen');
      await mpop.close();
      ok('mobile 390px: format help, save status and download guidance fit, no horizontal overflow; print window note + button on screen');
      await t.close();
    }

    // ── Composer: hint + sheet guidance + print window note ──────────────
    for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
      const t = await open('print.html', vp);
      await t.evaluate(async () => {
        const rec = { id: '11111111-2222-4333-8444-555555555555', schemaVersion: 1, scentName: 'Sheet QA', productType: 'Scented Candle', shape: 'circle', size: 52, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '27/09/2026' };
        // 3 Oct 2026: a label completed in the Builder carries its supplier-document confirmation.
        if (window.SdsDocCheck) { rec.fragLoad = '10%'; rec.sdsDoc = { kind: 'finished', pct: '10', base: SdsDocCheck.GROUP_BY_TYPE[rec.productType] }; rec.sdsDoc.confirmed = SdsDocCheck.confirmationFor(rec); } 
        await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id }));
      });
      await t.goto(t.url().split('?')[0] + '?label=11111111-2222-4333-8444-555555555555', { waitUntil: 'load' }); await t.evaluate(require('./helpers/sds-doc-answer').SCRIPT).catch(()=>{});
      await sleep(1800);
      const hint = await t.evaluate(() => { const e = document.getElementById('export-print-hint'); return { vis: e.offsetParent !== null, text: e.innerText.replace(/\s+/g, ' ') }; });
      assert(hint.vis && /A4/.test(hint.text) && /saved size/.test(hint.text) && /Actual Size \/ 100%/.test(hint.text) && /Fit to page or Shrink/.test(hint.text), 'Composer export hint: ' + hint.text);
      const before = await t.evaluate(() => JSON.stringify(getSheetPlacementsMM().map(p => [p.x, p.y, p.w, p.h])));
      const popupP = new Promise(r => browser.once('targetcreated', async tg => r(await tg.page())));
      await t.evaluate(() => downloadPDF());
      const pop = await popupP;
      assert(await waitFor(t, () => !document.getElementById('sheet-print-guidance').hidden, 8000), 'sheet guidance shows');
      const sg = await panel(t, 'sheet-print-guidance');
      assert(sg.text.startsWith('✓ Print sheet downloaded') && /ordinary A4 paper/.test(sg.text) && /line up/.test(sg.text), sg.text);
      assert.strictEqual(sg.hScroll, false);
      assert.strictEqual(await t.evaluate(() => JSON.stringify(getSheetPlacementsMM().map(p => [p.x, p.y, p.w, p.h]))), before, 'guidance must not change Composer geometry');
      await pop.waitForSelector('img');
      await pop.waitForFunction(() => document.querySelector('img').complete);
      const onScreen = await pop.evaluate(() => ['.print-note', '.print-btn'].every(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1; }));
      assert(onScreen, `${name}: sheet print window note and Print button must be on screen`);
      const note = await pop.evaluate(() => document.querySelector('.print-note').innerText.replace(/\s+/g, ' '));
      assert(/Paper: A4/.test(note) && /Use: Actual Size or 100%/.test(note) && /Avoid: Fit to page, Shrink or Scale to fit/.test(note), 'sheet print note: ' + note);
      await pop.emulateMediaType('print');
      assert.strictEqual(await pop.evaluate(() => getComputedStyle(document.querySelector('.print-note')).display), 'none', 'sheet note must not print');
      const pdf = await pop.pdf({ preferCSSPageSize: true, printBackground: true });
      const mb = Buffer.from(pdf).toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\]/);
      const [wmm, hmm] = [+mb[1] / 72 * 25.4, +mb[2] / 72 * 25.4];
      assert(Math.abs(wmm - 210) < 0.3 && Math.abs(hmm - 297) < 0.3, `sheet PDF must stay A4, got ${wmm.toFixed(2)} x ${hmm.toFixed(2)}`);
      assert.strictEqual((Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 1, 'sheet stays one page');
      await t.evaluate(() => document.querySelector('#sheet-print-guidance .spg-close').click());
      assert.strictEqual((await panel(t, 'sheet-print-guidance')).shown, false, 'sheet guidance can be dismissed');
      assert.deepStrictEqual(t.errs, []);
      ok(`Composer ${name}: export hint, sheet guidance (test print + alignment, dismissible), geometry unchanged, print note hidden in print, PDF stays A4 (${wmm.toFixed(2)} x ${hmm.toFixed(2)} mm)`);
      await pop.close(); await t.close();
    }
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.stack || e);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`stage 2 print guidance checks passed (${passed} groups)`);
  }
});
