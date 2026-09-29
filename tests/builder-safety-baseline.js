#!/usr/bin/env node
'use strict';
// BUILDER SAFETY BASELINE (Builder Label Technical Audit, 29 Sep 2026).
//
// Drives the real CLPeasy journey in Chromium for a fixed set of labels:
//   Step 1 shape/size -> Step 2 product -> Step 3 Smart Paste + confirm ->
//   Step 4 supplier name/address/phone -> Step 5 preview, FIT / NOT FIT ->
//   SVG / PNG / PDF -> save -> reopen (builder.html?label=<id>) ->
//   Print Sheet Composer -> A4 PDF -> cutting-machine PNG.
//
// Two layers of protection:
//  1. INVARIANTS asserted on every run: preview and export carry the same
//     CLP text; required wording present; no placeholders; every pictogram
//     drawn, none substituted; exact export dimensions (SVG, PDF page, PNG
//     pixels); the reopened label is identical; the Composer renders the
//     same text and never resizes the label (A4 PDF and cutting PNG).
//  2. A GOLDEN SNAPSHOT (tests/fixtures/builder-safety-baseline.json) of each
//     label's FIT/NOT FIT state, warnings, printed text, pictograms, sizes and
//     download counts. Any difference fails the run and lists it -- a change
//     in behaviour must be understood before anything else is changed.
//
// Signed out in the Builder (guest exports are not counted). The Composer
// uses an in-page signed-in stub (no network, no real account).
//   node tests/builder-safety-baseline.js            -- check
//   node tests/builder-safety-baseline.js --update   -- rewrite the snapshot
//                                                       (only after review)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(__dirname, 'fixtures', 'builder-safety-baseline.json');
const UPDATE = process.argv.includes('--update');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP builder-safety-baseline: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP builder-safety-baseline: no Chromium'); process.exit(0); }

// ── The baseline labels ───────────────────────────────────────────────
const P = {
  P101: 'P101 If medical advice is needed, have product container or label at hand.',
  P102: 'P102 Keep out of reach of children.',
  P261: 'P261 Avoid breathing vapours.',
  P273: 'P273 Avoid release to the environment.',
  P302: 'P302+P352 IF ON SKIN: Wash with plenty of water.',
  P333: 'P333+P313 If skin irritation or rash occurs: Get medical advice/attention.',
  P301: 'P301+P310 IF SWALLOWED: Immediately call a POISON CENTER/doctor.',
  P331: 'P331 Do NOT induce vomiting.',
  P501: 'P501 Dispose of contents/container to an approved waste disposal plant.',
};
const sds = (signal, lines) => '2.2 Label elements\nSignal word: ' + signal + '\n' + lines.join('\n');
const LIGHT = sds('Warning', ['H317 May cause an allergic skin reaction.', P.P102, P.P501]);
const MEDIUM = sds('Warning', ['H317 May cause an allergic skin reaction.', 'H412 Harmful to aquatic life with long lasting effects.',
  'EUH208 Contains Linalool, Citral. May produce an allergic reaction.', P.P102, P.P261, P.P302, P.P501]);
const HEAVY = sds('Warning', ['H302 Harmful if swallowed.', 'H315 Causes skin irritation.', 'H317 May cause an allergic skin reaction.',
  'H319 Causes serious eye irritation.', 'H411 Toxic to aquatic life with long lasting effects.',
  'EUH208 Contains Linalool, Citral, Limonene, Coumarin. May produce an allergic reaction.', P.P101, P.P102, P.P261, P.P273, P.P302, P.P333, P.P501]);
const DIFFUSER = sds('Danger', ['H304 May be fatal if swallowed and enters airways.', 'H317 May cause an allergic skin reaction.',
  'H411 Toxic to aquatic life with long lasting effects.', 'EUH208 Contains Linalool. May produce an allergic reaction.', P.P101, P.P102, P.P301, P.P331, P.P501]);
const SUPPLIER = { name: 'Crafty Mouse Gifts', address: '12 Mill Lane, Duns, TD11 3AA', phone: '01234 567890' };
const SHORT_SUPPLIER = { name: 'Crafty Mouse Gifts', address: 'Duns TD11', phone: '01234 567890' };

// id, shape, W, H (mm), product type, SDS, expected wording, supplier
const CASES = [
  ['circle-52-light', 'circle', 52, 52, 'Scented Candle', LIGHT, ['May cause an allergic skin reaction.', 'Keep out of reach of children.'], SUPPLIER],
  ['circle-63-medium-euh208', 'circle', 63, 63, 'Scented Candle', MEDIUM, ['May cause an allergic skin reaction.', 'Harmful to aquatic life with long lasting effects.', 'Linalool', 'Citral', 'May produce an allergic reaction.'], SUPPLIER],
  ['circle-90-heavy', 'circle', 90, 90, 'Scented Candle', HEAVY, ['Harmful if swallowed.', 'Causes skin irritation.', 'Causes serious eye irritation.', 'Toxic to aquatic life with long lasting effects.', 'Coumarin'], SUPPLIER],
  ['square-52-light', 'square', 52, 52, 'Wax Melt', LIGHT, ['May cause an allergic skin reaction.'], SUPPLIER],
  ['square-63-medium-euh208', 'square', 63, 63, 'Wax Melt', MEDIUM, ['Harmful to aquatic life with long lasting effects.', 'Citral'], SUPPLIER],
  ['square-75-heavy', 'square', 75, 75, 'Scented Candle', HEAVY, ['Causes serious eye irritation.', 'Limonene'], SUPPLIER],
  ['rectangle-63x44-waxmelt-light', 'rectangle', 63, 44, 'Wax Melt', LIGHT, ['May cause an allergic skin reaction.'], SHORT_SUPPLIER],
  ['rectangle-63x44-candle-light', 'rectangle', 63, 44, 'Scented Candle', LIGHT, [], SHORT_SUPPLIER],
  ['rectangle-52x36-min-light', 'rectangle', 52, 36, 'Wax Melt', LIGHT, [], SHORT_SUPPLIER],
  ['rectangle-100x60-diffuser-danger', 'rectangle', 100, 60, 'Reed Diffuser', DIFFUSER, ['May be fatal if swallowed and enters airways.', 'Do NOT induce vomiting.', 'Linalool'], SUPPLIER],
];
const NAMES = {"circle-52-light": "Lavender Fields", "circle-63-medium-euh208": "Fig & Cassis", "circle-90-heavy": "Winter Spice", "square-52-light": "Sea Salt", "square-63-medium-euh208": "Rose Garden", "square-75-heavy": "Amber Woods", "rectangle-63x44-waxmelt-light": "Lemon Zest", "rectangle-63x44-candle-light": "Vanilla", "rectangle-52x36-min-light": "Mint", "rectangle-100x60-diffuser-danger": "Black Pomegranate"};
const PLACEHOLDERS = ['Your Brand', 'Your Scent Name', 'sensitising substance', '…', 'undefined', 'NaN', 'null'];
const WATERMARK = /^(PREVIEW ONLY|CLPeasy|clpeasy\.com)$/;

const OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){window.__rpc=(window.__rpc||0)+1;return {data:null,error:null}}}}};';
const IN = `window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'pro',status:'active',created_at:new Date(Date.now()-40*864e5).toISOString()};
var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
from:function(){return Object.create(q)},rpc:async function(){window.__rpc=(window.__rpc||0)+1;return {data:{ok:true},error:null};},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
// Records every file hand-over and print window without changing behaviour.
const RECORDER = `window.__rpc=0;window.__svg=[];window.__png=[];window.__pdf=[];window.__written='';
window.open=function(u){window.__pdf.push(String(u||''));var w={closed:false,close:function(){this.closed=true;},focus:function(){},location:{replace:function(x){window.__pdf.push(String(x));}},document:{open:function(){window.__written='';},write:function(h){window.__written+=h;},close:function(){}}};return w;};
(function(){var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var h=this.href,d=this.download;
 if(d&&/\\.svg$/.test(d))window.__svg.push(decodeURIComponent(h.split(',').slice(1).join(',')));
 if(d&&/\\.png$/.test(d)&&h.indexOf('blob:')===0){var i=new Image();var rec={name:d};window.__png.push(rec);i.onload=function(){rec.w=i.naturalWidth;rec.h=i.naturalHeight;};i.src=h;}
 return oc.apply(this,arguments);};})();`;

// In-page helpers (serialised into each page).
const PAGE_HELPERS = `
window.__texts=function(svg){var d=new DOMParser().parseFromString(svg,'image/svg+xml');if(d.querySelector('parsererror'))return {err:true,lines:[]};
 return {err:false,lines:[...d.querySelectorAll('text')].map(function(t){var w=document.createTreeWalker(t,NodeFilter.SHOW_TEXT),a=[],n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\\s+/g,' ').trim();}).filter(Boolean)};};
window.__pictoMap=function(){var L=window.LabelRenderer,m={};['explosion','flame','oxidiser','gas','corrosion','skull','health','exclamation','aquatic','environment'].forEach(function(k){if(!L.isValidPictogramKey(k))return;
 var r=L.renderLabel({shape:'circle',size:'custom',customW:80,customH:80,scentName:'x',productType:'Room Spray',bizName:'x',bizAddress:'x',bizPhone:'1',signal:'Warning',hStatements:'H317',pStatements:'',pictograms:[k],sensitisers:[]},{instanceId:'pm-'+k});
 var imgs=(r.svg.match(/<image href="([^"]+)"[^>]*width="([\\d.]+)"/g)||[]).map(function(x){return {h:x.match(/href="([^"]+)"/)[1],w:+x.match(/width="([\\d.]+)"/)[1]};}).sort(function(a,b){return b.w-a.w;});
 if(imgs[0])m[imgs[0].h.slice(-200)]=k;});return m;};
window.__pictos=function(svg,map){var out=[];(svg.match(/<image href="([^"]+)"/g)||[]).forEach(function(x){var h=x.slice(13,-1).slice(-200);if(map[h])out.push(map[h]);});return out.sort();};
`;

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
  const problems = [];
  const fail = (id, msg) => problems.push(`${id}: ${msg}`);
  async function open(url, supa) {
    const t = await browser.newPage();
    await t.setViewport({ width: 1366, height: 900 });
    t.errs = []; t.dialogs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    await t.evaluateOnNewDocument(RECORDER + PAGE_HELPERS);
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: supa });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){this.files={};this.file=function(n,b){this.files[n]=b;};this.generateAsync=async function(){return new Blob(["zip"]);};};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(base + '/' + url, { waitUntil: 'load' });
    await sleep(1500);
    return t;
  }
  const snapshot = {};
  const saved = [];
  try {
    for (const [id, shape, w, h, type, text, wording, sup] of CASES) {
      // ── Builder: the real Step 1-5 journey ──────────────────────────
      const t = await open('builder.html', OUT);
      const B = await t.evaluate(async (c) => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const set = (elId, v, ev) => { const el = document.getElementById(elId); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
        currentUser = null; if (typeof initSavedLabelLibrary === 'function') await initSavedLabelLibrary();
        selectShape(c.shape); set('custom-w', String(c.w)); if (c.shape === 'rectangle') set('custom-h', String(c.h)); onDimInput();
        setApprovedBuilderStep(2); set('scent-name', c.name); set('product-type', c.type, 'change');
        setApprovedBuilderStep(3); document.getElementById('smart-paste-input').value = c.text; extractSDS();
        const hc = document.getElementById('hazard-confirm'); hc.checked = true; hc.dispatchEvent(new Event('change', { bubbles: true }));
        setApprovedBuilderStep(4); set('biz-name', c.sup.name); set('biz-address', c.sup.address); set('biz-phone', c.sup.phone);
        checkStep4AndNext(); await wait(300);
        const vb = document.getElementById('verify-checkbox'); vb.checked = true; vb.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
        const map = __pictoMap();
        const preview = buildSVG(false); // the SVG the on-screen preview is drawn from (rasterised for unpaid users)
        const out = { step: approvedBuilderStep, allowed: _downloadAllowed(), fitBlocked: !!window._labelBlockDownload,
          state: { signal: S.signal, h: S.hStatements, p: S.pStatements, sens: [...S.sensitisers], pictos: [...S.pictograms].sort() },
          dims: getDims(), preview: __texts(preview), previewPictos: __pictos(preview, map) };
        const r = LabelRenderer.renderLabel(window._lastLabelData, { instanceId: 'bsb', forExport: true });
        out.fits = r.fits; out.warnings = [...r.warnings].sort(); out.requiredComplete = r.requiredContent ? r.requiredContent.complete : null;
        // exports: SVG, PNG, PDF (refused when blocked)
        await downloadSVG(); await downloadPNG(); printToPDF(); await wait(2500);
        out.svgCount = __svg.length; out.pngCount = __png.length; out.pdfCount = __pdf.length;
        if (__svg[0]) { const s = __svg[0]; out.svgAttr = [(s.match(/<svg[^>]*\swidth="([^"]+)"/) || [])[1], (s.match(/<svg[^>]*\sheight="([^"]+)"/) || [])[1]]; out.exportText = __texts(s); out.exportPictos = __pictos(s, map); }
        if (__png[0]) out.png = [__png[0].w, __png[0].h];
        if (__pdf[0]) { const html = await (await fetch(__pdf[0])).text(); out.pdfPage = (html.match(/@page\{size:([^;]+);/) || [])[1]; out.pdfSvg = [(html.match(/<svg[^>]*\swidth="([^"]+)"/) || [])[1], (html.match(/<svg[^>]*\sheight="([^"]+)"/) || [])[1]]; }
        // save to My Labels
        await saveLabel(); await wait(300);
        const rec = LabelLibrary.findById(getSaved(), editingLabelId);
        out.saved = rec ? JSON.parse(JSON.stringify(rec)) : null;
        out.rpc = window.__rpc;
        return out;
      }, { id, shape, w, h, type, text, sup, name: NAMES[id] });
      const errs = t.errs.slice();
      await t.close();

      // ── Invariants (Builder) ──────────────────────────────────────────
      if (B.step !== 5) fail(id, `did not reach Step 5 (at ${B.step}); dialogs: ${errs.join(' | ')}`);
      if (errs.length) fail(id, 'Builder page errors: ' + errs.join(' | '));
      const clp = lines => (lines || []).filter(l => !WATERMARK.test(l));
      const joined = clp(B.preview.lines).join(' ');
      if (B.preview.err) fail(id, 'preview SVG does not parse');
      for (const p of PLACEHOLDERS) if (joined.includes(p)) fail(id, `placeholder/invalid text "${p}" in preview`);
      const need = wording.concat([B.state.signal ? B.state.signal.toUpperCase() : '', type.toUpperCase(), NAMES[id], sup.name, sup.address, sup.phone]).filter(Boolean);
      for (const wd of need) if (!joined.replace(/\s+/g, '').includes(wd.replace(/\s+/g, ''))) fail(id, `required wording missing from preview: "${wd}"`);
      if (JSON.stringify(B.previewPictos) !== JSON.stringify(B.state.pictos)) fail(id, `preview pictograms ${B.previewPictos} != selected ${B.state.pictos}`);
      if (B.allowed) {
        if (B.svgCount !== 1 || B.pngCount !== 1 || B.pdfCount < 1) fail(id, `exports: svg ${B.svgCount} png ${B.pngCount} pdf ${B.pdfCount}`);
        if (JSON.stringify(clp(B.exportText && B.exportText.lines)) !== JSON.stringify(clp(B.preview.lines))) fail(id, 'exported SVG text differs from the preview');
        if (JSON.stringify(B.exportPictos) !== JSON.stringify(B.state.pictos)) fail(id, `exported pictograms ${B.exportPictos} != selected ${B.state.pictos}`);
        if (JSON.stringify(B.svgAttr) !== JSON.stringify([w + 'mm', h + 'mm'])) fail(id, `SVG size ${B.svgAttr} != ${w}x${h}mm`);
        if (B.pdfPage !== `${w}mm ${h}mm` || JSON.stringify(B.pdfSvg) !== JSON.stringify([w + 'mm', h + 'mm'])) fail(id, `PDF page ${B.pdfPage} / svg ${B.pdfSvg} != ${w}x${h}mm`);
        const px = mm => Math.round(mm / 25.4 * 600);
        if (JSON.stringify(B.png) !== JSON.stringify([px(w), px(h)])) fail(id, `PNG ${B.png} != ${px(w)}x${px(h)} (600 dpi)`);
      } else if (B.svgCount || B.pngCount || B.pdfCount) fail(id, 'a blocked label produced an export');
      if (B.rpc) fail(id, 'guest export touched download accounting');
      if (!B.saved) fail(id, 'label was not saved');

      // ── Reopen the saved label (the My Labels link) ──────────────────
      let R = null;
      if (B.saved) {
        const t2 = await open('builder.html', OUT);
        await t2.evaluate(async (rec) => { currentUser = null; if (typeof initSavedLabelLibrary === 'function') await initSavedLabelLibrary(); await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id })); }, B.saved);
        await t2.goto(base + '/builder.html?label=' + B.saved.id, { waitUntil: 'load' });
        await sleep(2000);
        R = await t2.evaluate(async () => {
          const vb = document.getElementById('verify-checkbox'); if (vb && !vb.checked) { vb.checked = true; vb.dispatchEvent(new Event('change', { bubbles: true })); }
          await new Promise(r => setTimeout(r, 400));
          const map = __pictoMap(); const preview = buildSVG(false); // the SVG the on-screen preview is drawn from (rasterised for unpaid users)
          return { step: approvedBuilderStep, allowed: _downloadAllowed(), preview: __texts(preview), pictos: __pictos(preview, map), dims: getDims() };
        });
        if (t2.errs.length) fail(id, 'reopen page errors: ' + t2.errs.join(' | '));
        await t2.close();
        if (JSON.stringify(clp(R.preview.lines)) !== JSON.stringify(clp(B.preview.lines))) fail(id, 'reopened label text differs from the original');
        if (JSON.stringify(R.pictos) !== JSON.stringify(B.previewPictos)) fail(id, 'reopened label pictograms differ');
        if (R.dims.mmW !== B.dims.mmW || R.dims.mmH !== B.dims.mmH) fail(id, 'reopened label size differs');
        if (R.allowed !== B.allowed) fail(id, `reopened label export state ${R.allowed} != original ${B.allowed}`);
        saved.push({ id, rec: B.saved, exportText: clp(B.exportText && B.exportText.lines), w, h, allowed: B.allowed });
      }
      snapshot[id] = {
        builder: { allowed: B.allowed, fits: B.fits, fitBlocked: B.fitBlocked, requiredComplete: B.requiredComplete, warnings: B.warnings,
          signal: B.state.signal, h: B.state.h, p: B.state.p, sensitisers: B.state.sens, pictograms: B.state.pictos,
          text: clp(B.preview.lines), exports: { svg: B.svgCount, png: B.pngCount, pdf: B.pdfCount ? 1 : 0 }, png: B.png || null, pdfPage: B.pdfPage || null },
        reopen: R ? { step: R.step, allowed: R.allowed } : null,
      };
    }

    // ── Print Sheet Composer: every saved label, one sheet each ─────────
    const c = await open('print.html', IN);
    await c.evaluate(async (recs) => { await LabelLibrary.mutate(() => ({ collection: recs, usedId: recs[0].id })); }, saved.map(s => s.rec));
    await c.goto(base + '/print.html', { waitUntil: 'load' });
    await sleep(2500);
    // spy: the size every label is actually rendered at in the A4 PDF / PNG
    await c.evaluate(() => { const L = window.LabelRenderer, o = L.renderLabel; window.__renders = []; L.renderLabel = function (d, op) { if (op && op._pictoMmOverride == null) window.__renders.push({ name: d && d.scentName, pw: op.pw, ph: op.ph }); return o.apply(this, arguments); }; });
    for (const s of saved) {
      const C = await c.evaluate(async (s) => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        sheetItems.length = 0; rebuildSheet(); addToSheet(s.rec.id); await wait(1000);
        const rec = resolveSheetLabel(s.rec.id);
        const text = __texts(renderSheetPosition(rec, 1000, Math.round(1000 * s.h / s.w), { watermark: true }).svg).lines;
        const out = { qty: getTotalQty(), fitIssues: sheetFitIssues.length, contentIssues: (typeof sheetContentIssues !== 'undefined' ? sheetContentIssues.length : 0), text };
        window.__renders.length = 0; window.__written = ''; const rpc0 = window.__rpc;
        await downloadPDF(); const end = Date.now() + 12000; while (Date.now() < end && !/print-btn/.test(window.__written)) await wait(200);
        out.pdf = /print-btn/.test(window.__written);
        out.pdfRenders = window.__renders.filter(r => r.name === rec.scentName).map(r => [r.pw, r.ph]);
        const png = await buildLabelPNGBlob(rec); const bm = png.blob ? await createImageBitmap(png.blob) : null;
        out.png = bm ? [bm.width, bm.height] : null;
        out.rpc = window.__rpc - rpc0;
        return out;
      }, s);
      const WM = l => !/^(PREVIEW ONLY|CLPeasy|clpeasy\.com)$/.test(l);
      const px300 = mm => Math.round(mm * 300 / 25.4);
      if (s.allowed) {
        if (C.fitIssues || C.contentIssues) fail(s.id, `Composer lists an exportable label as blocked (fit ${C.fitIssues}, content ${C.contentIssues})`);
        if (JSON.stringify(C.text.filter(WM)) !== JSON.stringify(s.exportText)) fail(s.id, 'Composer label text differs from the Builder export');
        if (!C.pdf) fail(s.id, 'Composer A4 PDF not produced');
        for (const [pw, ph] of C.pdfRenders) if (Math.abs(pw - px300(s.w)) > 1 || Math.abs(ph - px300(s.h)) > 1) fail(s.id, `Composer A4 PDF resized the label: ${pw}x${ph}px vs ${px300(s.w)}x${px300(s.h)}px`);
        if (!C.pdfRenders.length) fail(s.id, 'Composer A4 PDF render not captured');
      }
      if (JSON.stringify(C.png) !== JSON.stringify([px300(s.w), px300(s.h)])) fail(s.id, `cutting PNG ${C.png} != ${px300(s.w)}x${px300(s.h)} (300 dpi)`);
      snapshot[s.id].composer = { fitIssues: C.fitIssues, contentIssues: C.contentIssues, pdf: C.pdf, pdfRenderPx: C.pdfRenders[0] || null, cutPng: C.png, accountingCalls: C.rpc };
    }
    if (c.errs.length) fail('composer', 'page errors: ' + c.errs.join(' | '));
    await c.close();

    // ── Golden snapshot ──────────────────────────────────────────────────
    if (problems.length) { /* never record a snapshot from a run that breaks an invariant */ }
    else if (UPDATE || !fs.existsSync(SNAP)) {
      fs.mkdirSync(path.dirname(SNAP), { recursive: true });
      fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 1) + '\n');
      console.log('snapshot written: ' + path.relative(ROOT, SNAP));
    } else {
      const golden = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
      const diff = (a, b, p) => {
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '.' + k); return; }
        problems.push(`snapshot ${p}: was ${JSON.stringify(a)}, now ${JSON.stringify(b)}`);
      };
      diff(golden, snapshot, 'baseline');
    }
  } catch (e) {
    problems.push('harness error: ' + (e && e.stack || e));
  } finally {
    await browser.close(); server.close();
    for (const id of Object.keys(snapshot)) {
      const s = snapshot[id].builder;
      console.log(`${s.allowed ? 'EXPORTABLE' : 'BLOCKED   '} ${id.padEnd(34)} fits=${s.fits} pictos=[${s.pictograms}] ${s.warnings.length ? 'warnings=' + s.warnings.join(',') : ''}`);
    }
    if (problems.length) {
      console.error('\nBUILDER SAFETY BASELINE: FAIL');
      problems.forEach(p => console.error(' - ' + p));
      process.exit(1);
    }
    console.log(`\nBUILDER SAFETY BASELINE: PASS (${Object.keys(snapshot).length} labels; invariants + snapshot)`);
  }
});
