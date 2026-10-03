const { withConfirmedDoc } = require('./helpers/sds-doc-verified');
const docAnswer = require('./helpers/sds-doc-answer');
// Regression coverage for Builder Label Technical Audit finding M21 (Issue #6):
// suffixed hazard-statement codes (H350i, H360F, H360D, H360FD, H360Fd,
// H360Df, H361f, H361d, H361fd).
//
//   Part 1 (pure function + jsdom renderer): Smart Paste extraction keeps the
//     exact canonical code; clearly spaced forms canonicalise only to a
//     verified code; unknown suffixes are kept (then blocked), never reduced
//     to the base code; prose is never attached; non-suffixed extraction is
//     identical to the previous `\bH\d{3}\b` / `\bEUH\d{3}\b` extraction; M63
//     inputs ("H412Harmful") are deliberately unchanged. Every code renders
//     its exact verified statement.
//   Part 2 (real Chromium, builder.html served locally, network blocked):
//     for each of the nine codes, desktop and mobile -- Smart Paste keeps the
//     exact code, the verified statement is in the preview, the signal word
//     and GHS08 are correct, Step 3 accepts it, every export route's output
//     contains it, save keeps the exact code and reopening re-renders it.
//     Combinations with H317 (precedence), unknown suffixes blocked.
//   Part 3 (jsdom, print.html Composer): saved labels with each code render
//     the complete statement and print.
// Run from the repo root: node tests/suffixed-hazard-codes.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');
const puppeteer = require('puppeteer');
const { stubRenderer } = require('./fixtures/required-content-fixtures');

const ROOT = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');

// The verified M21 table (legislation.gov.uk, supplied by Michaela, Sept 2026).
const CODES = {
  'H350i': { text: 'May cause cancer by inhalation.', signal: 'Danger' },
  'H360F': { text: 'May damage fertility.', signal: 'Danger' },
  'H360D': { text: 'May damage the unborn child.', signal: 'Danger' },
  'H360FD': { text: 'May damage fertility. May damage the unborn child.', signal: 'Danger' },
  'H360Fd': { text: 'May damage fertility. Suspected of damaging the unborn child.', signal: 'Danger' },
  'H360Df': { text: 'May damage the unborn child. Suspected of damaging fertility.', signal: 'Danger' },
  'H361f': { text: 'Suspected of damaging fertility.', signal: 'Warning' },
  'H361d': { text: 'Suspected of damaging the unborn child.', signal: 'Warning' },
  'H361fd': { text: 'Suspected of damaging fertility. Suspected of damaging the unborn child.', signal: 'Warning' },
};
const flat = svg => svg.replace(/<g class="clp-fit-block"[\s\S]*?<\/g>/g, '').replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const P_LINES = '\nPrecautionary statements:\nP102, Keep out of reach of children.\nP501, Dispose of contents/container to approved disposal site, in accordance with local regulations.';
const sds = (...h) => '2.2 Label elements\nHazard statements:\n' + h.map(c => `${c}, ${CODES[c] ? CODES[c].text : 'May cause an allergic skin reaction.'}`).join('\n') + P_LINES;

// ── PART 1 ──────────────────────────────────────────────────────────────
function partOne() {
  const LR = stubRenderer(rendererSource);
  const x = t => Array.from(LR.extractHazardCodesFromText(t));
  let n = 0;
  const eq = (t, want, why) => { assert.deepStrictEqual(x(t), want, `${JSON.stringify(t)}: ${why}`); n++; };
  for (const c of Object.keys(CODES)) {
    eq(`${c} ${CODES[c].text}`, [c], 'the exact canonical code is kept');
    eq(`H317, ${c}, EUH208`, ['H317', c, 'EUH208'], 'kept alongside other codes');
    for (const [pre, post] of [['(', ')'], ['', '.'], ['', ','], ['', ':'], ['\n', '\n']]) eq(`${pre}${c}${post}`, [c], 'punctuation boundary');
    assert.strictEqual(LR.H_LIB.find(h => h.code === c).desc + '.', CODES[c].text, `${c}: verified wording in H_LIB`);
  }
  // clearly spaced suffixes canonicalise ONLY to a verified code
  eq('H361 d Suspected of damaging the unborn child.', ['H361d'], 'spaced suffix canonicalised');
  eq('H360 FD May damage', ['H360FD'], 'spaced suffix canonicalised');
  eq('H350 i May cause cancer by inhalation', ['H350i'], 'spaced suffix canonicalised');
  eq('H361 fd Suspected', ['H361fd'], 'spaced suffix canonicalised');
  eq('H360 Df May damage', ['H360Df'], 'spaced suffix canonicalised');
  // prose is never attached
  eq('H317 a skin sensitiser', ['H317'], 'prose stays prose');
  eq('H317 d', ['H317'], 'H317d is not a verified code, so "d" is prose');
  eq('H350 i.e. inhalation', ['H350'], '"i.e." is prose');
  eq('H317 s', ['H317'], '"s" after a space is prose');
  // unknown suffixes are kept exactly (then blocked) -- never reduced to the base code
  eq('H317s', ['H317s'], 'unknown suffix kept, not reduced to H317');
  eq('H361F', ['H361F'], 'wrong-case suffix kept, not reduced to H361');
  eq('H360fd', ['H360fd'], 'wrong-case suffix kept, not reduced to H360');
  // M63 (open, separate): code run into longer text -- unchanged by M21
  eq('H412Harmful to aquatic life', [], 'M63 input unchanged');
  eq('H317something', [], 'M63 input unchanged');
  eq('H317May cause', [], 'M63 input unchanged');
  // non-suffixed extraction identical to the previous extraction
  const old = t => [...new Set(t.match(/\bH\d{3}\b/g) || []), ...new Set(t.match(/\bEUH\d{3}\b/g) || [])];
  const base = Array.from(LR.H_LIB, h => h.code).filter(c => /^(H\d{3}|EUH\d{3})$/.test(c));
  const seps = [' ', ', ', ': ', '\n', '. ', '(', ')', '/', '-', '_', '\t', ';']; // (a letter directly after the digits is a suffix -- covered above)
  let combos = 0;
  for (const c of base) for (const a of seps) for (const b of seps) { const t = 'x' + a + c + b + 'y'; assert.deepStrictEqual(x(t), old(t), `non-suffixed extraction changed for ${JSON.stringify(t)}`); combos++; }
  // every code renders its exact statement; unknown suffixes are blocked, never rendered as the base code
  const lab = { scentName: 'Test Oil', productType: 'Reed Diffuser', bizName: 'Crafty Mouse Gifts', bizPhone: '01234 567890', pStatements: 'P102',
    shape: 'rectangle', size: 'custom', customW: 150, customH: 100, textColour: 'dark', showBorder: true };
  for (const c of Object.keys(CODES)) {
    const r = LR.renderLabel(Object.assign({}, lab, { hStatements: `H317, ${c}`, signal: CODES[c].signal, pictograms: ['exclamation', 'health'] }), { instanceId: 'r' + c });
    assert(r.fits && flat(r.svg).includes(CODES[c].text), `${c}: exact statement must render (fits ${r.fits})`);
  }
  for (const c of ['H317s', 'H361F', 'H360fd']) {
    const r = LR.renderLabel(Object.assign({}, lab, { hStatements: `H317, ${c}`, signal: 'Warning', pictograms: ['exclamation'] }), { instanceId: 'u' + c });
    assert(!r.fits && r.blockReason === 'unrecognised-code' && Array.from(r.unrecognizedCodesGeneric).includes(c), `${c} must be blocked as unrecognised`);
  }
  return { n, combos };
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
async function partTwo() {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/builder.html`;
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { flows: 0, exportsChecked: 0 };
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.setRequestInterception(true);
      page.on('request', r => (r.url().startsWith(`http://127.0.0.1:${srv.address().port}/`) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()));
      const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      const run = (hCodes, pasteText) => page.evaluate(async (pasteText) => {
        await new Promise(o => setTimeout(o, 0));
        const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
        selectShape('rectangle'); set('custom-w', '150'); set('custom-h', '100'); onDimInput(); setApprovedBuilderStep(2); set('scent-name', 'Test Oil'); set('product-type', 'Reed Diffuser', 'change'); setApprovedBuilderStep(3);
        document.getElementById('smart-paste-input').value = pasteText; extractSDS(); document.getElementById('extract-toast')?.remove();
        const hc = document.getElementById('hazard-confirm'); hc.checked = true; hc.dispatchEvent(new Event('change', { bubbles: true }));
        setApprovedBuilderStep(4); const after3 = approvedBuilderStep;
        set('biz-name', 'Crafty Mouse Gifts'); set('biz-address', '12 Mill Lane'); set('biz-phone', '01234 567890'); setApprovedBuilderStep(5);
        const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
        const flat = s => s.replace(/<g class="clp-fit-block"[\s\S]*?<\/g>/g, '').replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
        const svg = buildSVG(false);
        // capture what every export route actually produces
        const got = [];
        const blobs = [];
        const realCreate = URL.createObjectURL;
        URL.createObjectURL = b => { blobs.push(b); return 'blob:test'; };
        HTMLAnchorElement.prototype.click = function () { got.push(String(this.href || '')); };
        window.open = () => ({ document: { open() {}, write() {}, close() {} }, close() {}, focus() {}, print() {} });
        const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, set(v) { got.push(String(v)); srcDesc.set.call(this, v); }, get() { return srcDesc.get.call(this); } });
        const routes = {};
        for (const [name, fn] of [['svg', () => downloadSVG()], ['png', () => downloadPNG()], ['pdf', () => printToPDF()], ['pdfSheet', () => downloadPDFSheet()], ['printReady', () => downloadPrintReadyPDF()], ['cricut', () => downloadCricutPNGs()]]) {
          got.length = 0; blobs.length = 0;
          try { await fn(); } catch (e) { routes[name] = 'error: ' + e; continue; }
          await new Promise(o => setTimeout(o, 250));
          const texts = got.map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
          for (const b of blobs) { try { texts.push(await b.text()); } catch (e) { /* binary */ } }
          routes[name] = texts.map(flat).join(' || ');
        }
        URL.createObjectURL = realCreate;
        Object.defineProperty(HTMLImageElement.prototype, 'src', srcDesc);
        return { after3, step: approvedBuilderStep, h: S.hStatements, signal: S.signal, pictograms: [...S.pictograms], allowed: _downloadAllowed(), preview: flat(svg), routes };
      }, pasteText);
      const reload = async () => { await page.goto(url, { waitUntil: 'load' }); await page.evaluate(docAnswer.SCRIPT); await new Promise(o => setTimeout(o, 600)); };
      const tag = vp.width < 500 ? 'mobile' : 'desktop';

      // each of the nine codes on its own
      for (const [c, want] of Object.entries(CODES)) {
        await reload();
        const r = await run([c], sds(c));
        assert.strictEqual(r.h, c, `${tag} ${c}: Smart Paste must keep the exact code -- got ${r.h}`);
        assert.strictEqual(r.after3, 4, `${tag} ${c}: Step 3 must accept a supported code (alerts: ${alerts.slice(-1)})`);
        assert.strictEqual(r.signal, want.signal, `${tag} ${c}: signal word`);
        assert.deepStrictEqual(r.pictograms, ['health'], `${tag} ${c}: GHS08 only`);
        assert(r.preview.includes(want.text) && r.preview.toUpperCase().includes(want.signal.toUpperCase()), `${tag} ${c}: preview must show the statement and signal word`);
        assert.strictEqual(r.step, 5); assert(r.allowed, `${tag} ${c}: export allowed`);
        for (const [route, text] of Object.entries(r.routes)) {
          assert(text.includes(want.text), `${tag} ${c}: ${route} export must contain "${want.text}" -- got ${text.slice(0, 200)}`);
          stats.exportsChecked++;
        }
        stats.flows++;
      }
      // combinations with an existing hazard: precedence and pictogram union
      for (const [c, signal] of [['H360FD', 'Danger'], ['H361f', 'Warning'], ['H350i', 'Danger'], ['H360Df', 'Danger']]) {
        await reload();
        const r = await run(['H317', c], sds('H317', c));
        assert.strictEqual(r.h, `H317, ${c}`);
        assert.strictEqual(r.signal, signal, `${tag} H317 + ${c}: signal word must be ${signal}`);
        assert.deepStrictEqual(r.pictograms.slice().sort(), ['exclamation', 'health'], `${tag} H317 + ${c}: pictograms`);
        assert(r.preview.includes('May cause an allergic skin reaction.') && r.preview.includes(CODES[c].text));
        stats.flows++;
      }
      // spaced form through the real Builder
      await reload();
      let r = await run(['H317', 'H361d'], '2.2 Label elements\nHazard statements:\nH317, May cause an allergic skin reaction.\nH361 d, Suspected of damaging the unborn child.' + P_LINES);
      assert.strictEqual(r.h, 'H317, H361d', `${tag}: "H361 d" must become H361d`);
      assert(r.preview.includes(CODES['H361d'].text));
      stats.flows++;
      // unknown suffixes: captured exactly and BLOCKED, never reduced to the base code
      for (const u of ['H317s', 'H361F', 'H360fd']) {
        await reload();
        const n = alerts.length;
        r = await run([], `2.2 Label elements\nHazard statements:\nH317, May cause an allergic skin reaction.\n${u}, Something.` + P_LINES);
        assert.strictEqual(r.h, `H317, ${u}`, `${tag} ${u}: must be kept exactly -- got ${r.h}`);
        assert.strictEqual(r.after3, 3, `${tag} ${u}: Step 3 must block`);
        assert(alerts.slice(n).some(a => a.includes(u) && /not recognise/.test(a)), `${tag} ${u}: the block message must name the code`);
        stats.flows++;
      }
      // saved label keeps the exact code; reopening re-renders it
      await reload();
      r = await run(['H317', 'H360Fd'], sds('H317', 'H360Fd'));
      const saved = await page.evaluate(async () => {
        currentUser = null; await initSavedLabelLibrary(); await saveLabel(); await new Promise(o => setTimeout(o, 300));
        const rec = getSaved().find(x => x.scentName === 'Test Oil');
        clearHazardData(); loadLabelAndGotoStep5(rec.id);
        const svg = buildSVG(false).replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
        return { h: rec.hStatements, signal: rec.signal, pictograms: rec.pictograms, reopenedH: S.hStatements, reopenedSignal: S.signal, reopenedText: svg };
      });
      assert.strictEqual(saved.h, 'H317, H360Fd', `${tag}: the saved record must keep the exact code`);
      assert.strictEqual(saved.signal, 'Danger');
      assert.deepStrictEqual(saved.pictograms.slice().sort(), ['exclamation', 'health']);
      assert.strictEqual(saved.reopenedH, 'H317, H360Fd');
      assert.strictEqual(saved.reopenedSignal, 'Danger');
      assert(saved.reopenedText.includes(CODES['H360Fd'].text), `${tag}: reopened label must re-render the statement`);
      stats.flows++;
      assert.deepStrictEqual(errors, [], `${tag}: no page errors`);
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
  const base = { productType: 'Reed Diffuser', shape: 'rectangle', size: 'custom', customW: 150, customH: 100, bizName: 'Crafty Mouse Gifts', bizAddress: 'Duns', bizPhone: '01234 567890', bizWebsite: '',
    netWeight: '', burnTime: '', pStatements: 'P102', sensitisers: [], textColour: 'dark', showBorder: true, hideEN15494: true, labelLang: 'en', schemaVersion: 2 };
  const saved = Object.entries(CODES).map(([c, w]) => Object.assign({}, base, { scentName: 'Oil ' + c, hStatements: `H317, ${c}`, signal: w.signal, pictograms: ['exclamation', 'health'], batchNum: c }));
  const counts = { open: 0 };
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const emptyQuery = { select() { return this; }, eq() { return this; }, update() { return this; }, upsert() { return this; },
    single() { return Promise.resolve({ data: null, error: null }); }, then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
  const dom = new JSDOM(source, {
    url: 'https://local.clpeasy.test/print.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t) { const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((w, c) => w + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; } });
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
      try { window.crypto.subtle = webcrypto.subtle; } catch (e) { /* already present */ }
      window.eval(rendererSource); window.eval(librarySource); window.eval(fs.readFileSync(path.join(ROOT,'entitlement.js'),'utf8')); window.eval(fs.readFileSync(path.join(ROOT,'sds-doc-check.js'),'utf8'));
      window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
      window.fetch = async () => ({ ok: true, json: async () => ({}) });
      window.open = () => { counts.open++; return { document: { open() {}, write() {}, close() {} }, location: { href: '' }, close() {}, opener: null }; };
      window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
      class FakeImage { set src(v) { if (this.onload) this.onload(); } } window.Image = FakeImage;
      window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
      window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(saved.map(r => withConfirmedDoc(r,'10%'))));
    },
  });
  const { window } = dom;
  return new Promise((resolve, reject) => setTimeout(async () => {
    try {
      window.eval("sbClient={from:()=>({select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{plan:'easy_start',status:'active',subscription_status:'active',downloads_used:0,downloads_limit:999,topup_credits:0},error:null});}}),rpc:async()=>({data:{ok:true,consumed:true,source:'plan',clean_export:true},error:null})}; currentUser=currentUser||{id:'test-user'}; isPro=true; _previewVerifiedAt=Date.now(); if(typeof updateProGate==='function')updateProGate();");
      const before = JSON.stringify(window.eval('getSaved()'));
      let checked = 0;
      for (const rec of window.eval('getSaved()')) {
        const c = rec.batchNum;
        window.eval(`addToSheet('${rec.id}')`);
        await new Promise(o => setTimeout(o, 300)); // the sheet cell is filled asynchronously
        assert.strictEqual(window.eval('sheetFitIssues.length'), 0, `${c}: fits`);
        assert.strictEqual(window.eval('sheetContentIssues.length'), 0, `${c}: complete`);
        const text = flat(window.document.getElementById('sheet-canvas').innerHTML);
        assert(text.includes(CODES[c].text), `${c}: the Composer must render the complete statement`);
        counts.open = 0; await window.eval('downloadPDF()');
        assert.strictEqual(counts.open, 1, `${c}: prints`);
        window.eval(`removeSheetItem('${rec.id}')`);
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
  console.log(`suffixed hazard-code checks passed: extraction -- ${p1.n} cases (9 exact codes, spaced forms, unknown suffixes kept for blocking, prose never attached, M63 inputs unchanged) + ${p1.combos} non-suffixed boundary combinations identical to the previous extraction; Builder (real Chromium, desktop + mobile) -- ${s2.flows} flows, ${s2.exportsChecked} export outputs contain the exact statement; Composer -- ${n3} saved labels render and print the complete statement`);
})().catch(err => { console.error(err); process.exit(1); });
