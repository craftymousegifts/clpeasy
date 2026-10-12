// Fit warnings at Step 4, the iPhone preview sheet, and missing business
// details (Oct 2026):
//   1. Step 4 shows the same "needs more space" box (with "Use [size]") as
//      Step 5 when business details make the label overflow.
//   2. "We will check the fit again when you add more details." appears only
//      in the Step 3 Smart Paste warning.
//   3. From Step 4 on, an empty required business field (the existing
//      getMissingBusinessDetails() list: name, address, phone) is named, and
//      never explained as "needs more space" / "No supported size ... fits".
//      Entered details are kept.
//   4. On a short iPhone viewport the blocked preview sheet keeps the label
//      at full size (not clipped, not over "Adjust shape & size") and every
//      sheet control can be scrolled into view.
// Run from the repo root: node tests/fit-warning-step4-and-business-details.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP fit-warning-step4-and-business-details: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP fit-warning-step4-and-business-details: no Chromium'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};';
const SDS = 'Product: Synthetic Test Fragrance Oil\nFragrance oil supplied at 100% concentration\n2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nEUH208 Contains Linalool. May produce an allergic reaction.\nP102 Keep out of reach of children.\nP273 Avoid release to the environment.\nP501 Dispose of contents/container in accordance with local regulations.';
const LONG = { 'biz-name': 'Fernhill QA Candles and Home Fragrance', 'biz-address': 'Unit 12, Example Business Park, 1 Test Lane, Exampleton, Testshire, EX1 2AB', 'biz-phone': '01632 960000' };
const RECHECK = 'We will check the fit again when you add more details.';
const NO_SIZE = /No supported size tested/;

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
  const errors = [];
  async function open(w, h, mobile) {
    // A fresh context per page: the Builder remembers business details in
    // localStorage, which would otherwise leak between cases.
    const ctx = await browser.createBrowserContext();
    const t = await ctx.newPage();
    await t.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 3 : 1 });
    t.on('pageerror', e => errors.push(e.message));
    t.on('dialog', d => d.accept());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: SIGNED_OUT });
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(base + '/builder.html', { waitUntil: 'load' });
    await sleep(600);
    // Record the markup handed to the live preview (desktop panel + mobile sheet).
    await t.evaluate(() => { const orig = window.renderPreviewInto; window.renderPreviewInto = function (svg) { window.__preview = svg; return orig.apply(this, arguments); }; });
    t.ctx = ctx;
    return t;
  }
  // Steps 1-3 the way a maker completes them, then Step 4 with `biz`.
  async function toStep4(t, mm, biz) {
    const step3 = await t.evaluate((sds, mm) => {
      selectShape('circle'); selectSize('custom');
      document.getElementById('custom-w').value = String(mm); document.getElementById('custom-h').value = String(mm); onDimInput();
      setApprovedBuilderStep(2);
      document.getElementById('scent-name').value = 'Synthetic Test Candle';
      document.getElementById('product-type').value = 'Scented Candle';
      document.getElementById('frag-load').value = '6%'; readForm();
      setApprovedBuilderStep(3);
      document.getElementById('smart-paste-input').value = sds; extractSDS();
      const paste = document.getElementById('smart-paste-size-warning');
      const r = { pasteShown: paste.style.display === 'block', pasteText: paste.textContent };
      document.getElementById('hazard-confirm').click();
      setApprovedBuilderStep(4);
      return r;
    }, SDS, mm);
    await t.evaluate(biz => {
      for (const [id, v] of Object.entries(biz)) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    }, biz);
    await sleep(200);
    return step3;
  }
  const state = t => t.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!e && e.checkVisibility({ checkVisibilityCSS: true }); };
    const txt = id => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ');
    return {
      step: approvedBuilderStep, blocked: !!window._labelBlockDownload,
      step4Shown: vis('label-warn-step4'), step4: txt('label-warn-step4'), step4Class: document.getElementById('label-warn-step4')?.className,
      step5Shown: vis('label-warn-step5'), step5: txt('label-warn-step5'),
      note: document.getElementById('business-details-export-note')?.style.display !== 'none' ? txt('business-details-export-note') : '',
      sheet: txt('sheet-fit-advice'),
      biz: ['biz-name', 'biz-address', 'biz-phone'].map(id => document.getElementById(id).value),
      stage4Count: document.querySelectorAll('#label-warn-step4').length,
      overlay: /FULL CONTENT DOES NOT FIT/.test(window.__preview || '') ? 'fit' : /COMPLETE YOUR BUSINESS DETAILS/.test(window.__preview || '') ? 'details' : 'none',
    };
  });

  try {
    // ── 1/2. Long business details at 60mm: blocked at Step 4, box visible ──
    let t = await open(1366, 900, false);
    await toStep4(t, 60, LONG);
    let s = await state(t);
    assert.strictEqual(s.step, 4);
    assert.strictEqual(s.blocked, true, 'long business details should overflow a 60mm circle');
    assert.strictEqual(s.step4Shown, true, 'Step 4 must show the fit warning');
    assert(/Your label needs more space/.test(s.step4) && /Use 97mm/.test(s.step4), 'Step 4 box offers the suggested size: ' + s.step4);
    assert(!s.step4.includes(RECHECK), 'Step 4 box must not say the fit is checked again later');
    assert(!s.sheet.includes(RECHECK), 'sheet advice must not say the fit is checked again later');
    assert.strictEqual(s.stage4Count, 1);
    assert.strictEqual(s.overlay, 'fit', 'genuine overflow keeps the fit overlay');
    await t.evaluate(() => setApprovedBuilderStep(5));
    s = await state(t);
    assert.strictEqual(s.step5Shown, true);
    assert(/Use 97mm/.test(s.step5) && !s.step5.includes(RECHECK), 'Step 5 box: ' + s.step5);
    assert.strictEqual(s.step4Shown, false, 'Step 4 box is only visible on Step 4');
    // "Use 97mm" resizes and clears every warning, keeping the details.
    await t.evaluate(() => applySuggestedLabelSize());
    await sleep(200);
    s = await state(t);
    assert.strictEqual(s.blocked, false, 'suggested size must fit');
    assert.strictEqual(s.step5Shown, false);
    assert.deepStrictEqual(s.biz, Object.values(LONG));
    await t.ctx.close();

    // ── 2. Step 3 Smart Paste warning keeps the recheck sentence ──
    t = await open(1366, 900, false);
    const st3 = await toStep4(t, 40, {});
    assert.strictEqual(st3.pasteShown, true, 'hazard text alone overflows a 40mm circle');
    assert(st3.pasteText.includes(RECHECK), 'Step 3 warning keeps the recheck sentence');
    await t.ctx.close();

    // ── 3. Missing phone: named, never "no size fits"; details kept ──
    t = await open(1366, 900, false);
    await toStep4(t, 60, { 'biz-name': LONG['biz-name'], 'biz-address': LONG['biz-address'] });
    s = await state(t);
    assert.strictEqual(s.step4Shown, true);
    assert(/Complete your business details/.test(s.step4) && /business phone number/.test(s.step4), 'Step 4 names the phone: ' + s.step4);
    assert(!/business address|brand name/.test(s.step4), 'only the missing field is named');
    assert(!NO_SIZE.test(s.step4) && !/needs more space/.test(s.step4), 'Step 4 must not explain a missing field as a fit problem');
    assert(/field-alert-warn/.test(s.step4Class));
    assert.strictEqual(s.overlay, 'details', 'preview overlay names missing details, not a size failure');
    assert(/Add the missing details in Step 4/.test(await t.evaluate(() => window.__preview)));
    assert(/FULL CONTENT DOES NOT FIT/.test(await t.evaluate(() => buildSVG(false))), 'renderer output itself is unchanged');
    assert(!NO_SIZE.test(s.sheet) && /business phone number/.test(s.sheet), 'sheet names the phone: ' + s.sheet);
    await t.evaluate(() => setApprovedBuilderStep(5));
    s = await state(t);
    assert.strictEqual(s.step5Shown, false, 'Step 5 fit box hidden while a required field is empty');
    assert(/business phone number/.test(s.note), 'Step 5 note names the phone: ' + s.note);
    assert.deepStrictEqual(s.biz, [LONG['biz-name'], LONG['biz-address'], ''], 'entered details kept');
    const allowed = await t.evaluate(() => { document.getElementById('verify-checkbox').checked = true; return _downloadAllowed(); });
    assert.strictEqual(allowed, false, 'export stays blocked while the phone is missing');
    // Completing the phone brings back the real fit result.
    await t.evaluate(() => { setApprovedBuilderStep(4); const e = document.getElementById('biz-phone'); e.value = '01632 960000'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state(t);
    assert(/needs more space/.test(s.step4) && /Use 97mm/.test(s.step4) && /field-alert-danger/.test(s.step4Class), 'fit advice after completing: ' + s.step4);
    assert.strictEqual(s.overlay, 'fit', 'fit overlay returns once details are complete');
    await t.ctx.close();

    // ── 3b. All three missing: each named; short complete details: no box ──
    t = await open(1366, 900, false);
    await toStep4(t, 60, {});
    s = await state(t);
    assert(/business \/ brand name, business address, business phone number/.test(s.step4), 'all missing fields named: ' + s.step4);
    await t.evaluate(() => { for (const [id, v] of [['biz-name', 'Fernhill QA'], ['biz-address', '1 Test Lane, EX1 2AB'], ['biz-phone', '01632 960000']]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } });
    s = await state(t);
    assert.strictEqual(s.blocked, false); assert.strictEqual(s.step4Shown, false, 'no Step 4 box when complete and fitting');
    await t.ctx.close();

    // ── 4. Short iPhone viewport: blocked sheet keeps the label whole ──
    for (const [w, h] of [[390, 664], [375, 667], [390, 844]]) {
      t = await open(w, h, true);
      await toStep4(t, 60, LONG);
      await t.evaluate(() => setApprovedBuilderStep(5));
      await sleep(300);
      const opened = await t.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /View label/.test(x.textContent) && x.checkVisibility()); if (b) b.click(); return !!b; });
      assert(opened, `View label button at ${w}x${h}`);
      await sleep(700);
      const g = await t.evaluate(() => {
        const r = e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
        const svg = document.querySelector('#sheet-label-container svg'), box = document.getElementById('sheet-label-container');
        const adjust = [...document.querySelectorAll('#preview-sheet button')].find(x => /Adjust shape/.test(x.textContent));
        const inner = document.querySelector('.preview-sheet-inner');
        const controls = [...document.querySelectorAll('#preview-sheet button')].filter(b => b.checkVisibility({ checkVisibilityCSS: true }));
        const reach = controls.map(b => { b.scrollIntoView({ block: 'nearest' }); const x = b.getBoundingClientRect(), i = inner.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 24), ok: x.top >= i.top - 1 && x.bottom <= i.bottom + 1 }; });
        inner.scrollTop = 0;
        return { svg: r(svg), box: r(box), adjust: r(adjust), reach };
      });
      assert(g.svg.top >= g.box.top - 1 && g.svg.bottom <= g.box.bottom + 1, `label clipped at ${w}x${h}: ${JSON.stringify(g)}`);
      assert(g.svg.bottom <= g.adjust.top + 1, `label overlaps Adjust shape & size at ${w}x${h}`);
      const unreachable = g.reach.filter(c => !c.ok);
      assert.strictEqual(unreachable.length, 0, `controls not reachable at ${w}x${h}: ${JSON.stringify(unreachable)}`);
      await t.ctx.close();
    }
    assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join(' | '));
    console.log('PASS: Step 4 fit warning, Step 3-only recheck sentence, named missing business details, iPhone sheet layout');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
