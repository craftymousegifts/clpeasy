const { withConfirmedDoc } = require('./helpers/sds-doc-verified');
const docAnswer = require('./helpers/sds-doc-answer');
// Regression test for required-content export blocking (Builder Label
// Technical Audit, Sept 2026, findings M09 and M31). Previously a blank
// business name was printed as "Your Brand", a blank product name as "Your
// Scent Name" (saved records / Composer), and EUH208 without a named
// sensitising substance as "Contains: sensitising substance" -- and all of
// them could be exported.
//
// Required-content completeness is deliberately SEPARATE from physical fit:
// the rendered SVG, `fits` and the blocked overlay never change because
// content is incomplete (placeholders may still preview while a label is
// being built), but no export route may produce such a label.
//
//   Part 1 (jsdom, shared renderer): LabelRenderer.checkRequiredContent() and
//     renderLabel().requiredContent for blank / whitespace / undefined
//     business and product names, EUH208 without names or with blank names,
//     valid EUH208 and complete controls; the rendered SVG, fits and warnings
//     are byte-identical to the renderer before this change
//     (tests/fixtures/required-content-render-baseline.json).
//   Part 2 (jsdom, print.html Composer): saved records missing content are
//     marked and listed with a specific reason, every sheet export (PDF,
//     cutting-machine ZIP and sequential PNG) refuses with no side effect, the
//     saved record is never altered, and complete records print as before.
//   Part 3 (real Chromium, builder.html served locally, network blocked):
//     placeholders still preview while editing; Step 3 blocks EUH208 without
//     names (Smart Paste and manual chip); Step 4 requires a business name
//     (blank and whitespace-only); a confirmed complete label can export; and
//     clearing the product name, business name or EUH208 names AFTER
//     confirming at Step 5 is caught by every export route -- Step 5 buttons,
//     preview-panel buttons, the mobile preview sheet and the legacy export
//     functions -- with nothing downloaded or opened; physical fit
//     (window._labelBlockDownload) is unaffected throughout.
// Run from the repo root: node tests/required-content-export-blocking.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');
const puppeteer = require('puppeteer');
const { RECORDS, renderCases, stubRenderer, renderContentFingerprints } = require('./fixtures/required-content-fixtures');

const ROOT = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');
const EUH208_MSG = 'EUH208 needs the named sensitising substance(s). Check your current supplier SDS and paste the complete relevant EUH208/Contains information.';

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}

// ── PART 1: shared renderer ─────────────────────────────────────────────
function partOne() {
  const LR = stubRenderer(rendererSource);
  for (const [id, rec, missing] of RECORDS) {
    const rc = LR.checkRequiredContent(rec);
    assert.deepStrictEqual([...rc.missing], missing, `${id}: checkRequiredContent().missing`);
    assert.strictEqual(rc.complete, missing.length === 0, `${id}: checkRequiredContent().complete`);
  }
  assert.deepStrictEqual([...LR.checkRequiredContent(undefined).missing], ['product-name', 'business-name', 'business-address']);
  for (const c of renderCases()) {
    const r = LR.renderLabel(c.data, { instanceId: 'rc' });
    assert.deepStrictEqual([...r.requiredContent.missing], c.missing, `${c.key}: renderLabel().requiredContent`);
  }
  // the rendered label, fit and warnings are unchanged -- complete or not
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'required-content-render-baseline.json'), 'utf8'));
  const now = renderContentFingerprints(rendererSource);
  assert.strictEqual(Object.keys(now).length, Object.keys(baseline).length);
  for (const k of Object.keys(baseline)) assert.deepStrictEqual(now[k], baseline[k], `${k}: rendered SVG/fits/warnings changed`);
  // placeholders are still drawn (preview while editing) but flagged
  const ph = LR.renderLabel(Object.assign({}, RECORDS.find(r => r[0] === 'everything-missing')[1], { shape: 'circle', size: 'custom', customW: 75, customH: 75 }), { instanceId: 'ph' });
  assert(ph.svg.includes('Your Brand') && ph.svg.includes('sensitising substance'), 'preview placeholders must still render');
  assert.strictEqual(ph.requiredContent.complete, false);
  return Object.keys(baseline).length;
}

// ── PART 2: Composer (print.html) ───────────────────────────────────────
function partTwo() {
  const source = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
  const librarySource = fs.readFileSync(path.join(ROOT, 'label-library.js'), 'utf8');
  const base = { productType: 'Wax Melt', shape: 'circle', size: 'custom', customW: 52, customH: 52, bizAddress: 'Duns', bizPhone: '', bizWebsite: '',
    netWeight: '220g', batchNum: 'B001', burnTime: '', signal: 'Warning', pStatements: 'P273', pictograms: ['exclamation'], textColour: 'dark', showBorder: true, hideEN15494: false, labelLang: 'en' };
  // 52mm content verified to FIT physically, so only content can block
  const saved = [
    ['C1', { scentName: 'Complete One', bizName: 'Crafty Mouse Gifts', hStatements: 'H315', sensitisers: [] }, null],
    ['C2', { scentName: 'Complete EUH208', bizName: 'Crafty Mouse Gifts', hStatements: 'EUH208', sensitisers: ['Citral'] }, null],
    ['B1', { scentName: 'Blank Business', bizName: '', hStatements: 'H315', sensitisers: [] }, 'No business name.'],
    ['B2', { scentName: 'Spaces Business', bizName: '    ', hStatements: 'H315', sensitisers: [] }, 'No business name.'],
    ['B3', { scentName: 'Undefined Business', hStatements: 'H315', sensitisers: [] }, 'No business name.'],
    ['P1', { scentName: '   ', bizName: 'Crafty Mouse Gifts', hStatements: 'H315', sensitisers: [] }, 'No product name.'],
    ['E1', { scentName: 'EUH208 No Names', bizName: 'Crafty Mouse Gifts', hStatements: 'EUH208', sensitisers: [] }, 'EUH208 is listed without'],
    ['E2', { scentName: 'EUH208 Blank Names', bizName: 'Crafty Mouse Gifts', hStatements: 'EUH208', sensitisers: ['  ', ''] }, 'EUH208 is listed without'],
  ].map(([tag, o, reason]) => ({ tag, reason, rec: Object.assign({}, base, o, { batchNum: tag }) }));
  const counts = { open: 0, anchor: 0, zip: 0 };
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const emptyQuery = { select() { return this; }, eq() { return this; }, update() { return this; }, upsert() { return this; },
    single() { return Promise.resolve({ data: null, error: null }); }, then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
  const dom = new JSDOM(source, {
    url: 'https://local.clpeasy.test/print.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t) { const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((w, c) => w + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; } });
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
      window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb({ size: 1, type: 'image/png' }); };
      try { window.crypto.subtle = webcrypto.subtle; } catch (e) { /* already present */ }
      window.eval(rendererSource); window.eval(librarySource); window.eval(fs.readFileSync(path.join(ROOT,'entitlement.js'),'utf8')); window.eval(fs.readFileSync(path.join(ROOT,'sds-doc-check.js'),'utf8'));
      window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
      window.fetch = async () => ({ ok: true, json: async () => ({}) });
      window.open = () => { counts.open++; return { document: { open() {}, write() {}, close() {} }, location: { href: '' }, close() {}, opener: null }; };
      window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () { counts.anchor++; };
      window.JSZip = function () { this.file = function () { counts.zip++; }; this.generateAsync = async function () { return { size: 0 }; }; };
      class FakeImage { set src(v) { if (this.onload) this.onload(); } } window.Image = FakeImage;
      window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
      window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(saved.map(s => withConfirmedDoc(s.rec,'10%'))));
    },
  });
  const { window } = dom;
  return new Promise((resolve, reject) => setTimeout(async () => {
    try {
      window.eval("sbClient={from:()=>({select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{plan:'easy_start',status:'active',subscription_status:'active',downloads_used:0,downloads_limit:999,topup_credits:0},error:null});}}),rpc:async()=>({data:{ok:true,consumed:true,source:'plan',clean_export:true},error:null})}; currentUser=currentUser||{id:'test-user'}; isPro=true; _previewVerifiedAt=Date.now(); if(typeof updateProGate==='function')updateProGate();");
      const before = JSON.stringify(window.eval('getSaved()'));
      const ids = window.eval('getSaved()').map(r => ({ id: r.id, tag: r.batchNum }));
      let checked = 0;
      for (const s of saved) {
        const id = ids.find(x => x.tag === s.tag).id;
        window.eval(`addToSheet('${id}')`);
        const fit = window.eval('sheetFitIssues.length'), content = JSON.parse(JSON.stringify(window.eval('sheetContentIssues')));
        assert.strictEqual(fit, 0, `${s.tag}: 52mm fixture must fit physically (content is what is being tested)`);
        counts.open = 0; counts.anchor = 0; counts.zip = 0; window.__lastAlert = '';
        if (s.reason) {
          assert.strictEqual(content.length, 1, `${s.tag}: expected one content issue`);
          assert(content[0].reason.includes(s.reason), `${s.tag}: reason "${content[0].reason}" must include "${s.reason}"`);
          assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), true, `${s.tag}: PDF button must be disabled`);
          assert((window.document.getElementById('sheet-canvas').innerHTML.match(/sheet-cell-invalid/g) || []).length >= 1, `${s.tag}: cell must be marked`);
          assert(window.document.getElementById('fit-issues-panel').innerHTML.includes('missing required label content'), `${s.tag}: issues panel must say content is missing`);
          await window.eval('downloadPDF()');
          assert.strictEqual(counts.open, 0, `${s.tag}: a blocked PDF must not open anything`);
          assert(window.__lastAlert.includes('missing required label content'), `${s.tag}: PDF refusal must name the content problem`);
          await window.eval('cricutDownloadZip()'); await window.eval('cricutDownloadSequential()');
          assert.strictEqual(counts.anchor + counts.zip, 0, `${s.tag}: cutting-machine exports must refuse`);
        } else {
          assert.strictEqual(content.length, 0, `${s.tag}: a complete record must not be blocked`);
          assert.strictEqual(window.eval('document.getElementById("btn-pdf").disabled'), false, `${s.tag}: PDF button must be enabled`);
          await window.eval('downloadPDF()');
          assert.strictEqual(counts.open, 1, `${s.tag}: a complete record must print as before`);
        }
        window.eval(`removeSheetItem('${id}')`);
        assert.strictEqual(window.eval('sheetContentIssues.length'), 0, `${s.tag}: removing the label must clear the block`);
        checked++;
      }
      assert.strictEqual(JSON.stringify(window.eval('getSaved()')), before, 'saved records must never be altered or repaired');
      assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no jsdom errors');
      resolve(checked);
    } catch (e) { reject(e); }
  }, 300));
}

// ── PART 3: Builder in real Chromium ───────────────────────────────────
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'builder.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function partThree() {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/builder.html`;
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { flows: 0, refusals: 0 };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(`http://127.0.0.1:${srv.address().port}/`) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()));
    const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
    const reload = async () => {
      await page.goto(url, { waitUntil: 'load' }); await page.evaluate(docAnswer.SCRIPT); await new Promise(o => setTimeout(o, 600));
      await page.evaluate(() => {
        window.__dl = { anchor: 0, open: 0 };
        HTMLAnchorElement.prototype.click = function () { window.__dl.anchor++; };
        window.open = () => { window.__dl.open++; return { document: { open() {}, write() {}, close() {} }, close() {}, focus() {}, print() {} }; };
      });
    };
    const H = {
      set: (id, v, ev) => page.evaluate((id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); }, id, v, ev || null),
      step: n => page.evaluate(n => { setApprovedBuilderStep(n); return approvedBuilderStep; }, n),
      at: () => page.evaluate(() => approvedBuilderStep),
      paste: t => page.evaluate(t => { document.getElementById('smart-paste-input').value = t; extractSDS(); }, t),
      confirmHazards: () => page.evaluate(() => { const c = document.getElementById('hazard-confirm'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }),
      tick: () => page.evaluate(() => { const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }),
    };
    const SDS_OK = 'H317 May cause an allergic skin reaction. H412 Harmful to aquatic life. EUH208 Contains: Linalool, Citral. May produce an allergic reaction. P102, P501';
    const SDS_NO_NAMES = 'H412 Harmful to aquatic life with long lasting effects. EUH208 May produce an allergic reaction. P102, P501';
    const toStep3 = async () => { await page.evaluate(() => { selectShape('circle'); }); await H.set('custom-w', '75'); await page.evaluate(() => onDimInput()); await H.step(2); await H.set('scent-name', 'Lavender Fields'); await H.set('product-type', 'Scented Candle', 'change'); await H.step(3); };
    const toStep5Complete = async () => { await toStep3(); await H.paste(SDS_OK); await H.confirmHazards(); await H.step(4); await H.set('biz-name', 'Crafty Mouse Gifts'); await H.set('biz-address', '12 Mill Lane'); await H.set('biz-phone', '01234 567890'); await H.step(5); await H.tick(); };
    const gateState = () => page.evaluate(() => {
      const on = id => { const b = document.getElementById(id); return b ? getComputedStyle(b).pointerEvents !== 'none' : null; };
      return { allowed: _downloadAllowed(), physicalBlock: !!window._labelBlockDownload,
        png: on('btn-png'), svg: on('btn-svg'), pdf: on('btn-pdf'), pngPrev: on('btn-png-preview'), svgPrev: on('btn-svg-preview'), pdfPrev: on('btn-pdf-preview'), save: on('btn-save'),
        contentWarn: document.getElementById('content-warn-step5').style.display !== 'none' ? document.getElementById('content-warn-step5').innerText : '' };
    });
    // every export route, including the mobile preview sheet's own buttons
    const tryAllExports = async label => {
      await page.evaluate(() => { window.__dl.anchor = 0; window.__dl.open = 0; });
      const before = alerts.length;
      await page.evaluate(async () => {
        await downloadPNG(); await downloadSVG(); printToPDF();
        await downloadPDFSheet(); await downloadPrintReadyPDF(); await downloadCricutPNGs();
        openPreviewSheet(); for (const b of document.querySelectorAll('#preview-sheet .preview-sheet-actions button')) b.click();
        await new Promise(o => setTimeout(o, 50)); closeSheet();
      });
      const msgs = alerts.slice(before); const dl = await page.evaluate(() => window.__dl);
      assert.strictEqual(msgs.length, 8, `${label}: expected 8 refusals (6 export functions + 2 mobile-sheet buttons), got ${msgs.length}`);
      for (const m of msgs) assert(m.includes('missing required content'), `${label}: refusal must name the missing content: ${m}`);
      assert.strictEqual(dl.anchor + dl.open, 0, `${label}: nothing may be downloaded or opened`);
      stats.refusals += msgs.length;
      return msgs[0];
    };

    // 1. placeholders preview while editing; no overlay, no content warning outside Step 5
    await reload();
    const fresh = await page.evaluate(() => { const svg = buildSVG(false); return { yb: svg.includes('Your Brand'), ys: svg.includes('Your Scent Name'), overlay: svg.includes('clp-fit-block'), warnVisible: !!document.getElementById('content-warn-step5').offsetParent, stage4: document.getElementById('label-warn-stage4').style.display !== 'none', allowed: _downloadAllowed() }; });
    assert(fresh.yb && fresh.ys && !fresh.overlay && !fresh.warnVisible && !fresh.stage4 && !fresh.allowed, `placeholders must preview while editing: ${JSON.stringify(fresh)}`);
    stats.flows++;

    // 2. Step 2 still requires a product name (whitespace counts as blank)
    await reload(); await page.evaluate(() => selectShape('circle')); await H.set('custom-w', '75'); await page.evaluate(() => onDimInput()); await H.step(2);
    await H.set('scent-name', '   '); await H.set('product-type', 'Scented Candle', 'change'); await H.step(3);
    assert.strictEqual(await H.at(), 2, 'Step 2 must not continue with a blank product name'); stats.flows++;

    // 3. Step 3 blocks EUH208 without a named substance
    for (const [label, act] of [
      ['Smart Paste EUH208 without names', () => H.paste(SDS_NO_NAMES)],
      ['manual EUH208 chip', () => page.evaluate(() => { for (const c of ['H412', 'EUH208']) document.querySelector(`#h-chips .h-chip[data-code="${c}"]`).click(); updateLabel(); })],
      ['EUH208 with blank names', () => page.evaluate(() => { for (const c of ['H412', 'EUH208']) document.querySelector(`#h-chips .h-chip[data-code="${c}"]`).click(); S.sensitisers = ['  ', '']; updateLabel(); })],
    ]) {
      await reload(); await toStep3(); await act(); await H.confirmHazards();
      const n = alerts.length; await H.step(4);
      assert.strictEqual(await H.at(), 3, `${label}: Step 3 must not continue`);
      assert.strictEqual(alerts[n], EUH208_MSG, `${label}: Step 3 must explain the EUH208 requirement`);
      stats.flows++;
    }
    await reload(); await toStep3(); await H.paste(SDS_OK); await H.confirmHazards(); await H.step(4);
    assert.strictEqual(await H.at(), 4, 'Step 3 must continue with EUH208 and named substances');

    // 4. Step 4 requires a business name (visibly marked), blank or whitespace-only
    assert(await page.evaluate(() => document.getElementById('biz-name').closest('.form-group').querySelector('label').textContent.includes('(required)')), 'business name must be marked (required)');
    for (const v of ['', '   ']) {
      await H.set('biz-name', v); await H.set('biz-phone', '01234 567890');
      const n = alerts.length; await H.step(5);
      assert.strictEqual(await H.at(), 4, `Step 4 must not continue with business name ${JSON.stringify(v)}`);
      assert.strictEqual(alerts[n], 'Add your business name before continuing.');
      stats.flows++;
    }
    await H.set('biz-name', 'Crafty Mouse Gifts'); await H.set('biz-address', 'Duns'); await H.step(5);
    assert.strictEqual(await H.at(), 5, 'Step 4 must continue with a business name and phone');

    // 5. complete label: confirmed at Step 5 -> exportable exactly as before
    await reload(); await toStep5Complete();
    let g = await gateState();
    assert(g.allowed && g.png && g.svg && g.pdf && g.pngPrev && g.save && !g.physicalBlock && !g.contentWarn, `complete label must be exportable: ${JSON.stringify(g)}`);
    stats.flows++;

    // 6. fields cleared AFTER confirming are caught by every export route
    for (const [label, act, restore] of [
      ['business name cleared after confirming', async () => { await H.step(4); await H.set('biz-name', ''); }, async () => { await H.set('biz-name', 'Crafty Mouse Gifts'); }],
      ['business name set to spaces after confirming', async () => { await H.step(4); await H.set('biz-name', '    '); }, async () => { await H.set('biz-name', 'Crafty Mouse Gifts'); }],
      ['product name cleared after confirming', async () => { await H.step(2); await H.set('scent-name', ' '); }, async () => { await H.set('scent-name', 'Lavender Fields'); }],
      ['EUH208 names removed after confirming', async () => { await H.step(3); await page.evaluate(() => { S.sensitisers = []; updateLabel(); }); }, async () => { await page.evaluate(() => { S.sensitisers = ['Linalool', 'Citral']; updateLabel(); }); }],
    ]) {
      await reload(); await toStep5Complete();
      await act();
      g = await gateState();
      assert(!g.allowed && !g.png && !g.svg && !g.pdf && !g.pngPrev && !g.svgPrev && !g.pdfPrev, `${label}: every export button must be disabled: ${JSON.stringify(g)}`);
      assert.strictEqual(g.save, true, `${label}: saving to the library keeps its existing gate`);
      assert.strictEqual(g.physicalBlock, false, `${label}: physical fit must be unaffected`);
      assert(await page.evaluate(() => document.getElementById('verify-checkbox').checked), `${label}: (confirmation is still ticked)`);
      await tryAllExports(label);
      await restore();
      g = await gateState();
      assert(g.allowed && g.png, `${label}: restoring the content must make the label exportable again`);
      stats.flows++;
    }
    // Step 5 explains what is missing
    await reload(); await toStep5Complete(); await H.step(4); await H.set('biz-name', ''); await H.step(3); await H.step(4);
    await H.set('biz-name', ''); await page.evaluate(() => { S.sensitisers = []; toggleDownload(); });
    g = await gateState();
    assert(g.contentWarn.includes('Add your business name (Step 4).') && g.contentWarn.includes(EUH208_MSG), `Step 5 content message: ${g.contentWarn}`);
  } finally {
    await browser.close(); srv.close();
  }
  return stats;
}

(async () => {
  const n1 = partOne();
  const n2 = await partTwo();
  const s3 = await partThree();
  console.log(`required-content export blocking checks passed: renderer -- ${RECORDS.length} records classified correctly, ${n1} renders byte-identical (SVG, fits, warnings) to the renderer before this change; Composer -- ${n2} saved records (6 incomplete blocked with a specific reason on PDF/ZIP/sequential PNG, 2 complete printed as before, records never altered); Builder (real Chromium) -- ${s3.flows} flows, ${s3.refusals} export attempts refused with nothing downloaded, physical fit unaffected`);
})().catch(err => { console.error(err); process.exit(1); });
