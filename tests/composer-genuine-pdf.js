// Print Sheet Composer genuine A4 PDF (31 Oct 2026, founder-approved) — real-browser checks.
//
// Serves the working tree on 127.0.0.1, stubs the Supabase client in-page (no
// network, no real downloads) and drives the REAL print.html downloadPDF().
// Proves:
//   1. A successful export hands over a genuine one-page PDF: MediaBox exactly
//      A4 (595.2756 x 841.8898 pt = 210 x 297 mm), /PrintScaling /None, one
//      2480 x 3508 px RGB image filling the page.
//   2. The PDF image is byte-identical to the Composer's finished sheet canvas
//      (lossless: dimensions, positions, pictograms, fonts and quality unchanged).
//   3. Labels sit at getSheetPlacementsMM() positions/sizes on the PDF page.
//   4. Exactly one consume_download per sheet; the PDF is built BEFORE it.
//   5. PDF generation failure: no charge, holding window closed, clear message.
//   6. Accounting error / no downloads / pop-up blocked: no charge or no file.
//   7. "Open my PDF again" never charges again.
//  10. Delivery failure after the charge (window closed / navigation error):
//      visible message + "Open my PDF" recovery, no second charge.
//  11. Double-click guard: a repeat click while exporting is ignored (one
//      window, one charge); the guard is released after success and failures.
//   8. Browsers without PDF support keep the previous HTML print page.
//   9. Same results under iPhone 13 emulation (portrait and landscape).
// Set QA_PDF_OUT=<dir> to keep the generated PDFs for independent measurement.
// Needs Chromium; prints SKIP and exits 0 if none is available.
//   node tests/composer-genuine-pdf.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP composer-genuine-pdf: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP composer-genuine-pdf: no Chromium available'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILES = {
  payg: { plan: 'payg', subscription_status: 'payg', trial_end: iso(-2 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 5 },
  zero: { plan: 'payg', subscription_status: 'payg', trial_end: iso(-9 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 0 },
};
const RPC = {
  charged: { ok: true, consumed: true, free_redownload: false, source: 'purchased', clean_export: true, purchased_downloads: 4, downloads_used: 0, downloads_limit: 0 },
  none: { ok: false, reason: 'no_downloads_remaining', purchased_downloads: 0, downloads_used: 0, downloads_limit: 0 },
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
// Records the holding window without changing page behaviour.
const RECORDER = `window.__opened=0;window.__openUrls=[];
window.open=function(u){window.__opened++;window.__openUrls.push(String(u||''));if(window.__popupBlocked)return null;var w={closed:!!window.__closeHoldingWindow,close:function(){this.closed=true;},focus:function(){},written:0,
location:{replace:function(x){if(window.__replaceThrows)throw new Error('forced navigation failure');w.navigated=String(x);}},document:{open:function(){},write:function(){w.written++;},close:function(){}}};if(!u)window.__lastPopup=w;return w;};`;
// Keeps a SHA-256 of the exact canvas pixels handed to the PDF writer (RGB, alpha dropped).
const CANVAS_HASH = `(function(){var f=CLPSheetPDF.fromCanvas;CLPSheetPDF.fromCanvas=function(c,o){window.__pdfCalls=(window.__pdfCalls||0)+1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,rgb=new Uint8Array(c.width*c.height*3);for(var i=0,j=0;i<d.length;i+=4){rgb[j++]=d[i];rgb[j++]=d[i+1];rgb[j++]=d[i+2];}
window.__canvasHash=crypto.subtle.digest('SHA-256',rgb).then(function(h){return Array.from(new Uint8Array(h)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');});
window.__chargesBeforePdf=(window.__rpc||[]).filter(function(x){return x[0]==='consume_download';}).length;return f.apply(this,arguments);};})();`;

const LABEL_ID = '11111111-2222-4333-8444-555555555555';
const SHEET_QTY = 6;

let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

// Minimal reader for the PDF this module writes (uncompressed objects, one image stream).
function readPdf(buf) {
  const s = buf.toString('latin1');
  assert(s.startsWith('%PDF-1.4'), 'PDF header');
  assert(/%%EOF\s*$/.test(s), 'PDF trailer');
  const media = s.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  const pages = (s.match(/\/Type \/Page\b/g) || []).length;
  const im = s.match(/\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/);
  assert(im, 'one RGB FlateDecode image');
  const start = s.indexOf(im[0]) + im[0].length;
  const raw = zlib.inflateSync(buf.subarray(start, start + Number(im[3])));
  // Cross-reference table offsets must point at the objects.
  const xref = s.slice(s.lastIndexOf('xref')).split('\n').slice(3).filter(l => / 00000 n $/.test(l)).map(l => Number(l.slice(0, 10)));
  xref.forEach((off, i) => assert(s.startsWith(`${i + 1} 0 obj`, off), `xref offset for object ${i + 1}`));
  const cm = s.match(/q ([\d.]+) 0 0 ([\d.]+) 0 0 cm \/Im1 Do Q/);
  return { pages, wPt: Number(media[1]), hPt: Number(media[2]), imgW: Number(im[1]), imgH: Number(im[2]), raw,
    printScalingNone: /\/PrintScaling \/None/.test(s), cm: cm && [Number(cm[1]), Number(cm[2])] };
}

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
  async function open(profileKey, rpcKey, vp, opts = {}) {
    const t = await browser.newPage();
    if (vp.userAgent) await t.setUserAgent(vp.userAgent);
    await t.setViewport(vp.viewport || vp);
    t.errs = []; t.dialogs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|generation failed/.test(m.text())) t.errs.push(m.text()); });
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    if (!opts.realPopup) await t.evaluateOnNewDocument(RECORDER);
    if (opts.popupBlocked) await t.evaluateOnNewDocument(() => { window.__popupBlocked = true; });
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(PROFILES[profileKey], RPC[rpcKey] || rpcKey) });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/print.html`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await t.evaluate(async (id, qty) => {
      const rec = { id, schemaVersion: 1, scentName: 'PDF QA', productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 60, customH: 60, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '31/10/2026' };
      if (window.SdsDocCheck) { rec.fragLoad = '10%'; rec.sdsDoc = { kind: 'finished', pct: '10', base: SdsDocCheck.GROUP_BY_TYPE[rec.productType] }; rec.sdsDoc.confirmed = SdsDocCheck.confirmationFor(rec); }
      await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id }));
    }, LABEL_ID, SHEET_QTY);
    await t.goto(`${base}/print.html?label=${LABEL_ID}`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1800));
    await t.evaluate(async (id, qty) => { if (typeof setQty === 'function') setQty(id, qty); await new Promise(r => setTimeout(r, 600)); updateExportButtonState(); }, LABEL_ID, SHEET_QTY);
    await t.evaluate(CANVAS_HASH);
    return t;
  }
  const charges = t => t.evaluate(() => (window.__rpc || []).filter(x => x[0] === 'consume_download').length);
  const waitFor = async (t, fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await t.evaluate(fn)) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const popup = t => t.evaluate(() => { const w = window.__lastPopup || {}; return { navigated: w.navigated || '', written: w.written || 0, closed: !!w.closed }; });

  const DEVICES = [
    ['desktop', { width: 1366, height: 900 }],
    ['iPhone 13', puppeteer.KnownDevices['iPhone 13']],
    ['iPhone 13 landscape', puppeteer.KnownDevices['iPhone 13 landscape']],
  ];
  try {
    for (const [name, vp] of DEVICES) {
      const t = await open('payg', 'charged', vp);
      const pre = await t.evaluate(() => ({ qty: getTotalQty(), gate: getSheetFitBlockMessage(), placements: getSheetPlacementsMM().map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })), supported: CLPSheetPDF.supported() }));
      assert.strictEqual(pre.qty, SHEET_QTY, 'sheet quantity'); assert.strictEqual(pre.gate, null, 'sheet fits'); assert.strictEqual(pre.supported, true);
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => (window.__lastPopup || {}).navigated, 15000), name + ': holding window shows the PDF');
      const pop = await popup(t);
      assert.ok(pop.navigated.startsWith('blob:'), 'PDF delivered as a blob URL'); assert.strictEqual(pop.written, 1, 'only the "Preparing" holding text was written, no HTML print page');
      assert.strictEqual(await charges(t), 1, 'exactly one consume_download');
      assert.strictEqual(await t.evaluate(() => window.__chargesBeforePdf), 0, 'PDF was built before the download was consumed');
      const b64 = await t.evaluate(async u => { const a = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768)); return btoa(s); }, pop.navigated);
      const buf = Buffer.from(b64, 'base64');
      if (process.env.QA_PDF_OUT) { fs.mkdirSync(process.env.QA_PDF_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.QA_PDF_OUT, `composer-${name.replace(/ /g, '-')}.pdf`), buf); fs.writeFileSync(path.join(process.env.QA_PDF_OUT, `composer-${name.replace(/ /g, '-')}.json`), JSON.stringify(pre.placements)); }
      const pdf = readPdf(buf);
      assert.strictEqual(pdf.pages, 1, 'one page');
      assert.ok(Math.abs(pdf.wPt - 210 * 72 / 25.4) < 0.001 && Math.abs(pdf.hPt - 297 * 72 / 25.4) < 0.001, `A4 MediaBox: ${pdf.wPt} x ${pdf.hPt}`);
      assert.deepStrictEqual(pdf.cm, [pdf.wPt, pdf.hPt], 'image fills the page exactly');
      assert.ok(pdf.printScalingNone, '/PrintScaling /None');
      assert.deepStrictEqual([pdf.imgW, pdf.imgH], [2480, 3508], '300 DPI A4 sheet image');
      const sha = crypto.createHash('sha256').update(pdf.raw).digest('hex');
      assert.strictEqual(sha, await t.evaluate(() => window.__canvasHash), 'PDF image is byte-identical to the finished sheet canvas');
      // Label positions: dark-pixel bounds inside each placement's cell match its size.
      const pxPerMm = pdf.imgW / 210, W = pdf.imgW;
      for (const p of pre.placements) {
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        const X0 = Math.max(0, Math.floor((p.x - 2) * pxPerMm)), X1 = Math.min(W, Math.ceil((p.x + p.w + 2) * pxPerMm));
        const Y0 = Math.max(0, Math.floor((p.y - 2) * pxPerMm)), Y1 = Math.min(pdf.imgH, Math.ceil((p.y + p.h + 2) * pxPerMm));
        for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const i = (y * W + x) * 3; if (pdf.raw[i] + pdf.raw[i + 1] + pdf.raw[i + 2] < 720) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        const mm = v => v / pxPerMm;
        // The renderer draws its outline slightly inside the label edge, so the
        // artwork's visible extent is up to ~1 mm smaller; its centre is exact.
        const cw = mm(x1 + 1 - x0), ch = mm(y1 + 1 - y0), cx = mm((x0 + x1 + 1) / 2), cy = mm((y0 + y1 + 1) / 2);
        assert.ok(cw <= p.w + 0.2 && cw > p.w - 1 && ch <= p.h + 0.2 && ch > p.h - 1, `label ${p.w}x${p.h} at ${p.x},${p.y}: artwork ${cw.toFixed(2)} x ${ch.toFixed(2)}`);
        assert.ok(Math.abs(cx - (p.x + p.w / 2)) < 0.2 && Math.abs(cy - (p.y + p.h / 2)) < 0.2, `label centre ${cx.toFixed(2)},${cy.toFixed(2)} vs ${p.x + p.w / 2},${p.y + p.h / 2}`);
      }
      // Guidance + re-open link: no further charge.
      const g = await t.evaluate(() => { const el = document.getElementById('sheet-print-guidance'); const a = el.querySelector('.spg-pdf-open'); return { shown: !el.hidden, text: el.innerText.replace(/\s+/g, ' '), btn: a && a.textContent }; });
      assert.ok(g.shown && g.text.startsWith('✓ Print sheet downloaded'), g.text);
      assert.ok(g.text.includes('Load the matching label sheet or printable material into your printer.'), 'existing guidance kept');
      assert.ok(g.text.includes('On iPhone or iPad, tap Share, then Print.'), 'PDF guidance shown');
      assert.strictEqual(g.btn, 'Open my PDF again');
      await t.evaluate(() => document.querySelector('#sheet-print-guidance .spg-pdf-open').click());
      await new Promise(r => setTimeout(r, 300));
      assert.strictEqual(await t.evaluate(() => window.__openUrls[window.__openUrls.length - 1]), pop.navigated, 'Open my PDF again opens the same PDF');
      assert.strictEqual(await charges(t), 1, 'Open my PDF again does not charge');
      const hScroll = await t.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.strictEqual(hScroll, false, 'no horizontal overflow');
      assert.deepStrictEqual(t.errs, []); assert.deepStrictEqual(t.dialogs, []);
      ok(`${name}: genuine A4 PDF (595.2756 x 841.8898 pt, 2480 x 3508 px, byte-identical to sheet canvas, ${pre.placements.length} labels at their placements), one charge after generation, guidance + free re-open link`);
      await t.close();
    }

    // Real browser pop-up (no window.open stub): the holding window itself ends on the PDF.
    {
      const t = await open('payg', 'charged', { width: 1366, height: 900 }, { realPopup: true });
      const popP = new Promise(r => browser.once('targetcreated', tg => r(tg)));
      await t.evaluate(() => downloadPDF());
      const tg = await popP;
      const end = Date.now() + 20000; while (Date.now() < end && !tg.url().startsWith('blob:')) await new Promise(r => setTimeout(r, 200));
      assert.ok(tg.url().startsWith('blob:'), 'real holding window navigated to the PDF: ' + tg.url());
      const head = await t.evaluate(async u => { const b = await (await fetch(u)).blob(); return { type: b.type, start: await b.slice(0, 8).text(), size: b.size }; }, tg.url());
      assert.deepStrictEqual([head.type, head.start], ['application/pdf', '%PDF-1.4'], JSON.stringify(head));
      assert.strictEqual(await charges(t), 1);
      ok('real pop-up: holding window shows the application/pdf blob, one charge');
      const pg = await tg.page().catch(() => null); if (pg) await pg.close().catch(() => {});
      await t.close();
    }
    // Delivery failure after the charge: visible message, free recovery.
    for (const [flag, label] of [['__replaceThrows', 'navigation error'], ['__closeHoldingWindow', 'holding window already closed']]) {
      const t = await open('payg', 'charged', { width: 1366, height: 900 });
      await t.evaluate(f => { window[f] = true; }, flag);
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => !document.getElementById('sheet-print-guidance').hidden, 15000), label + ': guidance shown');
      const g = await t.evaluate(() => { const el = document.getElementById('sheet-print-guidance'); const b = el.querySelector('.spg-pdf-open'); const r = el.getBoundingClientRect();
        return { text: el.innerText.replace(/\s+/g, ' '), btn: b && b.textContent, inView: r.top < innerHeight && r.bottom > 0 }; });
      assert.ok(g.text.includes('Your PDF sheet is ready, but it did not open automatically'), g.text);
      assert.ok(g.text.includes('Your download has been used for this sheet.') && g.text.includes('This does not use another download.'), g.text);
      assert.strictEqual(g.btn, 'Open my PDF'); assert.ok(g.inView, label + ': message scrolled into view');
      assert.strictEqual(await charges(t), 1, label + ': one charge');
      await t.evaluate(() => { window.__replaceThrows = false; window.__closeHoldingWindow = false; document.querySelector('#sheet-print-guidance .spg-pdf-open').click(); });
      await new Promise(r => setTimeout(r, 300));
      const url = await t.evaluate(() => window.__openUrls[window.__openUrls.length - 1]);
      assert.ok(url.startsWith('blob:'), label + ': Open my PDF opens the PDF: ' + url);
      const head = await t.evaluate(async u => (await (await fetch(u)).blob()).slice(0, 8).text(), url);
      assert.strictEqual(head, '%PDF-1.4');
      // Pop-ups blocked: the recovery button falls back to a file download.
      const dl = await t.evaluate(() => { window.__popupBlocked = true; window.__dl = []; const oc = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push([this.download, this.href]); return; } return oc.apply(this, arguments); };
        document.querySelector('#sheet-print-guidance .spg-pdf-open').click(); window.__popupBlocked = false; return window.__dl; });
      assert.ok(dl.length === 1 && /^CLPeasy-print-sheet-\d{4}-\d{2}-\d{2}\.pdf$/.test(dl[0][0]) && dl[0][1] === url, label + ': download fallback ' + JSON.stringify(dl));
      for (let i = 0; i < 2; i++) await t.evaluate(() => document.querySelector('#sheet-print-guidance .spg-pdf-open').click());
      assert.strictEqual(await charges(t), 1, label + ': recovery never charges');
      assert.strictEqual(await t.evaluate('_sheetExportBusy'), false, label + ': guard released');
      assert.deepStrictEqual(t.errs.filter(e => !/Could not show the PDF/.test(e)), []);
      ok(`delivery failure (${label}): visible message, "Open my PDF" opens the paid PDF, still one charge`);
      await t.close();
    }
    // Double-click guard.
    {
      const t = await open('payg', 'charged', { width: 1366, height: 900 });
      await t.evaluate(() => { downloadPDF(); downloadPDF(); downloadPDF(); });
      assert.ok(await waitFor(t, () => (window.__lastPopup || {}).navigated, 15000));
      await new Promise(r => setTimeout(r, 1500));
      assert.strictEqual(await t.evaluate(() => window.__opened), 1, 'one holding window for three rapid clicks');
      assert.strictEqual(await charges(t), 1, 'one charge for three rapid clicks');
      assert.strictEqual(await t.evaluate(() => window.__pdfCalls), 1, 'one PDF built');
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => window.__opened === 2 && (window.__rpc || []).filter(x => x[0] === 'consume_download').length === 2, 15000), 'a later, separate export works (guard released)');
      ok('double-click guard: rapid repeat clicks give one window, one PDF, one charge; guard released afterwards');
      await t.close();
    }
    // PDF generation failure -> no charge, window closed, message.
    {
      const t = await open('payg', 'charged', { width: 1366, height: 900 });
      await t.evaluate(() => { window.__realFromCanvas = CLPSheetPDF.fromCanvas; CLPSheetPDF.fromCanvas = () => Promise.reject(new Error('forced')); });
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => (window.__lastPopup || {}).closed, 15000), 'holding window closed');
      assert.strictEqual(await charges(t), 0, 'no charge');
      assert.ok(t.dialogs.some(d => /No download has been used/.test(d)), t.dialogs.join('|'));
      assert.strictEqual((await popup(t)).navigated, '');
      await t.evaluate(() => { CLPSheetPDF.fromCanvas = window.__realFromCanvas; });
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => window.__opened === 2 && (window.__lastPopup || {}).navigated, 15000), 'guard released after the failure: retry works');
      assert.strictEqual(await charges(t), 1, 'retry charges once');
      ok('PDF generation failure: no download used, holding window closed, message shown; retry works and charges once');
      await t.close();
    }
    // Accounting error and no downloads: PDF built but never handed over.
    for (const [pk, rk, label] of [['payg', 'error', 'accounting error'], ['zero', 'none', 'no downloads remaining']]) {
      const t = await open(pk, rk, { width: 1366, height: 900 });
      await t.evaluate(() => downloadPDF());
      await waitFor(t, () => (window.__lastPopup || {}).closed || (window.__rpc || []).length > 0, 15000);
      await new Promise(r => setTimeout(r, 800));
      const pop = await popup(t);
      assert.strictEqual(pop.navigated, '', label + ': no PDF handed over');
      assert.strictEqual(await t.evaluate(() => document.getElementById('sheet-print-guidance').hidden), true, label + ': no guidance');
      assert.ok(await charges(t) <= 1, label + ': at most the one refused accounting call');
      assert.strictEqual(await t.evaluate('_sheetExportBusy'), false, label + ': guard released');
      ok(`${label}: no PDF handed over, no guidance`);
      await t.close();
    }
    // Pop-up blocked: stop before any work or charge.
    {
      const t = await open('payg', 'charged', { width: 1366, height: 900 }, { popupBlocked: true });
      await t.evaluate(() => downloadPDF());
      await new Promise(r => setTimeout(r, 1500));
      assert.strictEqual(await charges(t), 0); assert.strictEqual(await t.evaluate(() => window.__pdfCalls || 0), 0);
      assert.ok(t.dialogs.some(d => /No download has been used/.test(d)));
      assert.strictEqual(await t.evaluate('_sheetExportBusy'), false, 'pop-up blocked: guard released');
      ok('pop-up blocked: no PDF work, no charge, guard released');
      await t.close();
    }
    // No PDF support: previous HTML print page, one charge, unchanged.
    {
      const t = await open('payg', 'charged', { width: 1366, height: 900 });
      await t.evaluate(() => { CLPSheetPDF.supported = () => false; });
      await t.evaluate(() => downloadPDF());
      assert.ok(await waitFor(t, () => (window.__lastPopup || {}).written > 1, 15000), 'HTML print page written');
      assert.strictEqual(await charges(t), 1); assert.strictEqual((await popup(t)).navigated, '');
      assert.strictEqual(await t.evaluate(() => !!document.querySelector('#sheet-print-guidance .spg-pdf-open')), false, 'no PDF button on the fallback');
      ok('no PDF support: previous HTML print page, one charge');
      await t.close();
    }
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`composer genuine PDF checks passed (${passed} groups)`);
  }
});
