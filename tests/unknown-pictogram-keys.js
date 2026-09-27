// Regression coverage for Builder Label Technical Audit finding M38 (Issue #7):
// an unknown pictogram key must never be silently drawn as another pictogram.
//
//   Part 1 (jsdom, shared renderer): the nine valid keys each draw their own
//     pictogram; 105 valid-key labels are byte-identical to the renderer
//     before M38 (SVG, fits, warnings); unknown / misspelt / wrong-case /
//     display-label ("GHS06") / empty / non-text keys block the label
//     (fits:false, blockReason 'unrecognised-pictogram', a named warning and
//     overlay message) and are never substituted, dropped silently or
//     duplicated; the record is never modified.
//   Part 2 (real Chromium, builder.html served locally, network blocked):
//     desktop and mobile -- a saved label with a corrupted key opens blocked,
//     every export route refuses naming the key, nothing is downloaded, the
//     Step 5 note names it; Step 3 re-extraction rebuilds the pictograms from
//     the H-codes and the label can proceed; the saved record is unchanged
//     until the maker explicitly saves.
//   Part 3 (jsdom, print.html Composer): the corrupted saved label is blocked,
//     the key is named, no size advice, no output, records unchanged.
// Run from the repo root: node tests/unknown-pictogram-keys.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');
const puppeteer = require('puppeteer');
const { stubRenderer } = require('./fixtures/required-content-fixtures');
const { VALID_KEYS, renderPictogramFingerprints } = require('./fixtures/pictogram-key-fixtures');

const ROOT = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');
const flat = s => s.replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');
const overlayText = svg => flat((svg.match(/<g class="clp-fit-block"[\s\S]*?<\/g>/) || [''])[0]);

// ── PART 1 ──────────────────────────────────────────────────────────────
function partOne() {
  const LR = stubRenderer(rendererSource);
  // byte-identical valid-key labels
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pictogram-key-render-baseline.json'), 'utf8'));
  const now = renderPictogramFingerprints(rendererSource);
  assert.strictEqual(Object.keys(now).length, Object.keys(baseline).length);
  for (const k of Object.keys(baseline)) assert.deepStrictEqual(now[k], baseline[k], `${k}: a valid-key label must render exactly as before M38`);
  // identify drawn pictograms by their image data
  const base = { scentName: 'Test Oil', productType: 'Room Spray', bizName: 'Crafty Mouse Gifts', bizPhone: '01234 567890', hStatements: 'H317', pStatements: 'P102', signal: 'Warning',
    shape: 'rectangle', size: 'custom', customW: 150, customH: 100, textColour: 'dark', showBorder: true, hideEN15494: true };
  const imgs = svg => [...svg.matchAll(/href="(data:image\/[^"]+)"/g)].map(m => crypto.createHash('md5').update(m[1]).digest('hex'));
  const ref = {};
  for (const k of VALID_KEYS) {
    const r = LR.renderLabel(Object.assign({}, base, { pictograms: [k] }), { instanceId: 'ref' + k });
    assert(r.fits && !r.blockReason, `${k}: a valid key renders normally`);
    const h = imgs(r.svg); assert.strictEqual(h.length, 1, `${k}: exactly one pictogram image`);
    ref[h[0]] = k;
  }
  assert.strictEqual(new Set(Object.values(ref)).size, 9, 'the nine valid keys draw nine different pictograms');
  const drawn = svg => imgs(svg).map(h => ref[h] || 'UNKNOWN-IMAGE');
  // invalid keys: blocked, named, never substituted/duplicated
  const cases = [
    [['nonsense'], [], "Pictogram 'nonsense' was not recognised."],
    [['skul'], [], "Pictogram 'skul' was not recognised."],
    [['Health'], [], "Pictogram 'Health' was not recognised."],
    [['GHS06'], [], "Pictogram 'GHS06' was not recognised."],
    [[''], [], 'A saved pictogram was not recognised.'],
    [['   '], [], 'A saved pictogram was not recognised.'],
    [[null], [], 'A saved pictogram was not recognised.'],
    [['health', 'bogus'], ['health'], "Pictogram 'bogus' was not recognised."],
    [['exclamation', 'bogus'], ['exclamation'], "Pictogram 'bogus' was not recognised."],
    [['bogus', 'junk'], [], "Pictograms 'bogus', 'junk' were not recognised."],
    [['skul', ''], [], "Pictogram 'skul' and a blank saved pictogram were not recognised."],
  ];
  const record = Object.assign({}, base, { pictograms: ['exclamation', 'skul'] });
  const snap = JSON.stringify(record);
  LR.renderLabel(record, { instanceId: 'snap' });
  assert.strictEqual(JSON.stringify(record), snap, 'rendering never modifies the record');
  for (const [p, validDrawn, msg] of cases) {
    const r = LR.renderLabel(Object.assign({}, base, { pictograms: p }), { instanceId: 'bad' + JSON.stringify(p) });
    assert.strictEqual(r.fits, false, `${JSON.stringify(p)}: must block`);
    assert.strictEqual(r.blockReason, 'unrecognised-pictogram', `${JSON.stringify(p)}: block reason`);
    assert(Array.from(r.warnings).some(w => w.startsWith('unrecognized-pictogram:')), `${JSON.stringify(p)}: named warning`);
    const ov = overlayText(r.svg);
    assert(ov.includes(msg) && ov.includes('Re-check the hazards in Step 3.'), `${JSON.stringify(p)}: overlay must say "${msg}" -- got "${ov}"`);
    assert.deepStrictEqual(drawn(r.svg), validDrawn, `${JSON.stringify(p)}: only valid keys are drawn -- no substitute, no duplicate`);
  }
  assert.strictEqual(LR.describeInvalidPictograms(['skul']), "Pictogram 'skul' was not recognised. Re-check the hazards in Step 3.");
  // an unknown H-code together with a bad key: both named
  const both = LR.renderLabel(Object.assign({}, base, { hStatements: 'H317, H999', pictograms: ['skul'] }), { instanceId: 'both' });
  assert(!both.fits && overlayText(both.svg).includes('H999') && overlayText(both.svg).includes("Pictogram 'skul'"), 'code and pictogram issues are both named');
  return { baseline: Object.keys(baseline).length, cases: cases.length };
}

// ── PART 2: Builder in real Chromium ───────────────────────────────────
function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'builder.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}
const CORRUPT = { schemaVersion: 2, scentName: 'Old Label', productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 75, customH: 75, signal: 'Danger',
  hStatements: 'H301, H317', pStatements: 'P102', pictograms: ['exclamation', 'skul'], sensitisers: ['Linalool'], bizName: 'Crafty Mouse Gifts', bizAddress: '12 Mill Lane', bizPhone: '01234 567890' };
const SDS = '2.2 Label elements\nSignal word: Danger\nHazard statements:\nH301, Toxic if swallowed.\nH317, May cause an allergic skin reaction.\nPrecautionary statements:\nP102, Keep out of reach of children.';
async function partTwo() {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/builder.html`;
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { flows: 0, refusals: 0 };
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const tag = vp.width < 500 ? 'mobile' : 'desktop';
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.setRequestInterception(true);
      page.on('request', r => (r.url().startsWith(`http://127.0.0.1:${srv.address().port}/`) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()));
      const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.goto(url, { waitUntil: 'load' }); await new Promise(o => setTimeout(o, 600));
      // a corrupted label stored in the signed-out guest library, opened the real way
      const opened = await page.evaluate(async rec => {
        localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([rec]));
        currentUser = null; await initSavedLabelLibrary();
        const stored0 = JSON.stringify(getSaved()[0]); window.__sid = getSaved()[0].id; window.__stored0 = stored0;
        loadLabelAndGotoStep5(window.__sid);
        const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(o => setTimeout(o, 200));
        const on = id => getComputedStyle(document.getElementById(id)).pointerEvents !== 'none';
        return { step: approvedBuilderStep, pictos: [...S.pictograms], allowed: _downloadAllowed(), png: on('btn-png'), svg: on('btn-svg'), pdf: on('btn-pdf'), pngPrev: on('btn-png-preview'),
          note: document.getElementById('label-warn-step5').innerText.replace(/\s+/g, ' '), storedUnchanged: JSON.stringify(getSaved()[0]) === stored0 };
      }, CORRUPT);
      assert.strictEqual(opened.step, 5);
      assert.deepStrictEqual(opened.pictos, ['exclamation', 'skul'], `${tag}: opening must not repair the list`);
      assert(!opened.allowed && !opened.png && !opened.svg && !opened.pdf && !opened.pngPrev, `${tag}: every export must be disabled: ${JSON.stringify(opened)}`);
      assert(opened.note.includes("Pictogram 'skul' was not recognised"), `${tag}: Step 5 note must name the key: ${opened.note}`);
      assert(!/larger|Select a larger|smallest size/i.test(opened.note), `${tag}: no size advice`);
      assert(opened.storedUnchanged, `${tag}: opening leaves the saved record unchanged`);
      // every export route refuses, naming the key; nothing downloaded or opened
      const before = alerts.length;
      const dl = await page.evaluate(async () => {
        const dl = { anchor: 0, open: 0 };
        HTMLAnchorElement.prototype.click = function () { dl.anchor++; };
        window.open = () => { dl.open++; return { document: { write() {}, close() {} }, close() {}, focus() {}, print() {} }; };
        await downloadPNG(); await downloadSVG(); printToPDF(); await downloadPDFSheet(); await downloadPrintReadyPDF(); await downloadCricutPNGs();
        openPreviewSheet(); for (const b of document.querySelectorAll('#preview-sheet .preview-sheet-actions button')) b.click();
        await new Promise(o => setTimeout(o, 60)); closeSheet();
        return dl;
      });
      const msgs = alerts.slice(before);
      assert.strictEqual(msgs.length, 8, `${tag}: expected 8 refusals, got ${msgs.length}`);
      for (const m of msgs) assert(m.includes("Pictogram 'skul' was not recognised"), `${tag}: refusal must name the key: ${m}`);
      assert.strictEqual(dl.anchor + dl.open, 0, `${tag}: nothing may be downloaded or opened`);
      stats.refusals += msgs.length;
      // recovery: Step 3 re-extraction rebuilds pictograms from the H-codes
      const rec = await page.evaluate(async sds => {
        setApprovedBuilderStep(3);
        clearHazardData();
        document.getElementById('smart-paste-input').value = sds; extractSDS(); document.getElementById('extract-toast')?.remove();
        const hc = document.getElementById('hazard-confirm'); hc.checked = true; hc.dispatchEvent(new Event('change', { bubbles: true }));
        setApprovedBuilderStep(4); setApprovedBuilderStep(5);
        const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(o => setTimeout(o, 200));
        const unchangedBeforeSave = JSON.stringify(getSaved()[0]) === window.__stored0;
        const result = { step: approvedBuilderStep, pictos: [...S.pictograms].sort(), allowed: _downloadAllowed(), unchangedBeforeSave };
        await saveLabel(); await new Promise(o => setTimeout(o, 300));
        const after = getSaved().find(x => x.id === window.__sid);
        result.savedPictos = after ? after.pictograms.slice().sort() : null;
        return result;
      }, SDS);
      assert.strictEqual(rec.step, 5, `${tag}: after re-checking hazards the label proceeds`);
      assert.deepStrictEqual(rec.pictos, ['exclamation', 'skull'], `${tag}: pictograms rebuilt from H301/H317`);
      assert(rec.allowed, `${tag}: the repaired label is exportable`);
      assert(rec.unchangedBeforeSave, `${tag}: the saved record stays unchanged until the maker saves`);
      assert.deepStrictEqual(rec.savedPictos, ['exclamation', 'skull'], `${tag}: an explicit save stores the repaired list`);
      assert.deepStrictEqual(errors, [], `${tag}: no page errors`);
      stats.flows++;
      await page.close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  return stats;
}

// ── PART 3: Composer (print.html) ───────────────────────────────────────
function partThree() {
  const source = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
  const librarySource = fs.readFileSync(path.join(ROOT, 'label-library.js'), 'utf8');
  const base = { productType: 'Candle', shape: 'circle', size: 'custom', customW: 75, customH: 75, bizName: 'Crafty Mouse Gifts', bizAddress: '', bizPhone: '01234 567890', bizWebsite: '',
    netWeight: '', burnTime: '', hStatements: 'H317', pStatements: 'P102', signal: 'Warning', sensitisers: [], textColour: 'dark', showBorder: true, hideEN15494: false, labelLang: 'en', schemaVersion: 2 };
  const saved = [
    ['OK', Object.assign({}, base, { scentName: 'Valid Label', pictograms: ['exclamation'] }), null],
    ['BAD', Object.assign({}, base, { scentName: 'Corrupt Label', pictograms: ['exclamation', 'skul'] }), "Pictogram 'skul' was not recognised"],
    ['BLANK', Object.assign({}, base, { scentName: 'Blank Picto', pictograms: [''] }), 'A saved pictogram was not recognised'],
  ].map(([tag, rec, reason]) => ({ tag, reason, rec: Object.assign(rec, { batchNum: tag }) }));
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
      window.eval(rendererSource); window.eval(librarySource);
      window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
      window.fetch = async () => ({ ok: true, json: async () => ({}) });
      window.open = () => { counts.open++; return { document: { write() {}, close() {} }, location: { href: '' }, close() {}, opener: null }; };
      window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () { counts.anchor++; };
      window.JSZip = function () { this.file = function () { counts.zip++; }; this.generateAsync = async function () { return { size: 0 }; }; };
      class FakeImage { set src(v) { if (this.onload) this.onload(); } } window.Image = FakeImage;
      window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
      window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(saved.map(s => s.rec)));
    },
  });
  const { window } = dom;
  return new Promise((resolve, reject) => setTimeout(async () => {
    try {
      window.eval("sbClient={from:()=>({select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{plan:'pro',status:'active'},error:null});}})}; currentUser=currentUser||{id:'test-user'}; isPro=true; if(typeof updateProGate==='function')updateProGate();");
      const before = JSON.stringify(window.eval('getSaved()'));
      const ids = window.eval('getSaved()').map(r => ({ id: r.id, tag: r.batchNum }));
      let checked = 0;
      for (const s of saved) {
        const id = ids.find(x => x.tag === s.tag).id;
        window.eval(`addToSheet('${id}')`);
        const fit = JSON.parse(JSON.stringify(window.eval('sheetFitIssues')));
        counts.open = 0; counts.anchor = 0; counts.zip = 0; window.__lastAlert = '';
        if (s.reason) {
          assert.strictEqual(fit.length, 1, `${s.tag}: blocked`);
          assert(fit[0].reason.includes(s.reason) && fit[0].reason.includes('Open this label in the Builder'), `${s.tag}: reason "${fit[0].reason}"`);
          assert(!/size|larger|mm/i.test(fit[0].reason), `${s.tag}: no size advice -- "${fit[0].reason}"`);
          assert(window.document.getElementById('fit-issues-panel').textContent.includes(s.reason), `${s.tag}: the issues panel names it`);
          await window.eval('downloadPDF()'); await window.eval('cricutDownloadZip()'); await window.eval('cricutDownloadSequential()');
          assert.strictEqual(counts.open + counts.anchor + counts.zip, 0, `${s.tag}: no output`);
        } else {
          assert.strictEqual(fit.length, 0, `${s.tag}: a valid label is not blocked`);
          await window.eval('downloadPDF()');
          assert.strictEqual(counts.open, 1, `${s.tag}: prints`);
        }
        window.eval(`removeSheetItem('${id}')`);
        checked++;
      }
      assert.strictEqual(JSON.stringify(window.eval('getSaved()')), before, 'saved records unchanged');
      assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no jsdom errors');
      resolve(checked);
    } catch (e) { reject(e); }
  }, 300));
}

(async () => {
  const p1 = partOne();
  const s2 = await partTwo();
  const n3 = await partThree();
  console.log(`unknown pictogram-key checks passed: renderer -- 9 valid keys draw their own pictogram, ${p1.baseline} valid-key labels byte-identical to before M38, ${p1.cases} invalid-key cases blocked and named with no substitute or duplicate; Builder (real Chromium, desktop + mobile) -- ${s2.flows} corrupted-label flows (opened blocked, ${s2.refusals} export attempts refused naming the key, Step 3 re-extraction repairs, record unchanged until saved); Composer -- ${n3} saved labels (corrupted ones blocked and named, no size advice, no output, records unchanged)`);
})().catch(err => { console.error(err); process.exit(1); });
