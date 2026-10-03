// M55 (Issue #9). Executes the REAL label-render.js (no copied validation
// function): it fails if renderLabel() cannot run (e.g. bgCol undefined).
// label-render.js must accept a label background colour only
// when it is a six-digit hex string (^#[0-9a-fA-F]{6}$); anything else --
// missing, "#fff", named/rgb() colours, non-strings, markup, attribute or
// element injection -- falls back to the existing white default before it
// reaches the SVG fill attribute. Valid values are used exactly as given.
//
// Real Chromium: the shared renderer directly, and the Print Sheet Composer
// (in-page signed-in stub, no network) with tampered saved records: preview
// cells, thumbnails, A4 PDF and cutting-machine PNG.
//   node tests/m55-bgcolour-validation.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const renderer = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');
// The declaration must be real, executable code -- not commented out (the
// original M55 commit put it on a "//" line via literal "\n" sequences).
const declLine = renderer.split('\n').find(l => /const bgCol=/.test(l)) || '';
assert.ok(/^\s*const bgCol=\(typeof opts\.bgColour==='string' && \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(opts\.bgColour\)\)\s*$/.test(declLine), 'bgCol declaration is its own executable line: ' + declLine.slice(0, 120));
assert.ok(!/\\n\s*const bgCol/.test(renderer), 'no literal "\\n" before the declaration');
assert.ok(!/const bgCol=opts\.bgColour\|\|/.test(renderer), 'raw bgColour no longer used');
ok('static: the renderer declares bgCol as executable code with the six-digit hex rule');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP m55 browser checks: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP m55 browser checks: no Chromium'); process.exit(0); }

// Signed-in stub for this pre-PAYG audit branch (active subscription row).
const STUB = `window.__rpc=[];window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'easy_start',subscription_status:'active',status:'active',created_at:new Date(Date.now()-40*864e5).toISOString()};
var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
from:function(){return Object.create(q)},rpc:async function(n){window.__rpc.push(n);return {data:{ok:true},error:null};},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const RECORDER = `window.__written='';window.__m55=[];window.open=function(){var w={closed:false,close:function(){this.closed=true;},focus:function(){},location:{replace:function(){}},document:{open:function(){window.__written='';},write:function(h){window.__written+=h;},close:function(){}}};return w;};`;

const VALID = ['#ffffff', '#ffe4e1', '#FFE4E1', '#000000', '#123456', '#a1b2c3'];
const INVALID = {
  short: '#fff', named: 'red', rgb: 'rgb(10,20,30)', number: 123, empty: '', missing: undefined, nul: null,
  attr: '#fff" data-m55="attr',
  elem: '#fff"/><image href="data:," onerror="window.__m55.push(\'elem\')"/><circle fill="#fff',
  xmlbreak: '#fff&x<',
  sevenDigit: '#ffffff0', trailingSpace: '#ffffff ', leadingSpace: ' #ffffff', noHash: 'ffffff', badHex: '#gggggg',
  newline: '#ffffff\n', script: '<script>window.__m55.push("script")</script>', object: { toString() { return '#ffffff'; } }, array: ['#ffffff'], bool: true,
  nan: NaN, inf: Infinity, ninf: -Infinity, emptyObj: {},
};

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
  try {
    // ── Renderer ──────────────────────────────────────────────────────────
    const rp = await browser.newPage();
    await rp.setContent('<html><body></body></html>');
    await rp.addScriptTag({ url: `${base}/label-render.js` });
    // Non-JSON values (functions/objects/undefined) are built inside the page.
    const R = await rp.evaluate((VALID, keys) => {
      const L = window.LabelRenderer;
      const rec = { shape: 'circle', size: 'custom', customW: 60, customH: 60, scentName: 'M55', productType: 'Scented Candle', signal: 'Warning', hStatements: 'H317', pStatements: '', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123' };
      const bad = { short: '#fff', named: 'red', rgb: 'rgb(10,20,30)', number: 123, empty: '', missing: undefined, nul: null,
        attr: '#fff" data-m55="attr', elem: '#fff"/><image href="data:," onerror="window.__m55.push(\'elem\')"/><circle fill="#fff', xmlbreak: '#fff&x<',
        sevenDigit: '#ffffff0', trailingSpace: '#ffffff ', leadingSpace: ' #ffffff', noHash: 'ffffff', badHex: '#gggggg', newline: '#ffffff\n',
        script: '<script>window.__m55.push("script")</script>', object: { toString() { return '#ffffff'; } }, array: ['#ffffff'], bool: true, nan: NaN, inf: Infinity, ninf: -Infinity, emptyObj: {} };
      const out = { valid: {}, invalid: {}, shapes: {} };
      const render = (r, bg, id) => { const o = { instanceId: id, pw: 709, ph: 709 }; if (bg !== undefined) o.bgColour = bg; return L.renderLabel(r, o); };
      const fillsOf = svg => [...svg.matchAll(/<(circle|rect)[^>]*fill="([^"]*)"/g)].map(m => m[2]);
      for (const v of VALID) { const s = render(rec, v, 'v').svg; out.valid[v] = { firstFill: fillsOf(s)[0], valid: !new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror') }; }
      const white = render(rec, '#ffffff', 'x');
      for (const k of keys) {
        const r = render(rec, bad[k], 'x');
        const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
        out.invalid[k] = { sameAsWhite: r.svg === white.svg, xmlErr: !!doc.querySelector('parsererror'), injected: /data-m55|<image href="data:,"|onerror=|<script/.test(r.svg), fits: r.fits, fs: JSON.stringify(r.metrics.fontSizes) === JSON.stringify(white.metrics.fontSizes) };
      }
      for (const shape of ['circle', 'square', 'rectangle']) {
        const r2 = Object.assign({}, rec, { shape, customH: shape === 'rectangle' ? 44 : 60, productType: shape === 'rectangle' ? 'Wax Melt' : rec.productType, customW: shape === 'rectangle' ? 63 : 60 });
        const w = render(r2, '#ffffff', 's'), b = render(r2, bad.elem, 's');
        out.shapes[shape] = { same: w.svg === b.svg, fill: fillsOf(b.svg)[0] };
      }
      return out;
    }, VALID, Object.keys(INVALID));
    await rp.close();
    for (const v of VALID) { assert.strictEqual(R.valid[v].firstFill, v, `valid ${v} used exactly as given`); assert.ok(R.valid[v].valid, `valid ${v}: SVG parses`); }
    ok('valid six-digit hex values (#ffffff, #ffe4e1, #FFE4E1, #000000, #123456, #a1b2c3) are used exactly as given');
    for (const [k, v] of Object.entries(R.invalid)) {
      assert.ok(v.sameAsWhite, `${k}: renders byte-identically to #ffffff`);
      assert.ok(!v.xmlErr, `${k}: SVG stays valid`);
      assert.ok(!v.injected, `${k}: nothing injected`);
      assert.ok(v.fs, `${k}: font sizes unchanged`);
    }
    for (const [s, v] of Object.entries(R.shapes)) { assert.ok(v.same, s + ': element payload renders exactly like white'); assert.strictEqual(v.fill, '#ffffff'); }
    ok(`${Object.keys(R.invalid).length} invalid/tampered values (incl. #fff, red, rgb(), 123, empty, missing, attribute and element injection, &/<) render byte-identically to the white fallback: valid SVG, nothing injected, same fit/font sizes; circle, square and rectangle`);

    // ── Composer with tampered saved records ─────────────────────────────
    const keys = ['short', 'named', 'rgb', 'number', 'attr', 'elem', 'xmlbreak', 'script'];
    const t = await browser.newPage();
    await t.setViewport({ width: 1366, height: 900 });
    t.errs = []; t.dialogs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    await t.evaluateOnNewDocument(RECORDER);
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: STUB });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/print.html`, { waitUntil: 'load' });
    await sleep(1500);
    const payload = {}; keys.forEach(k => { payload[k] = INVALID[k]; });
    const ids = await t.evaluate(async (payload) => {
      const mk = (i, name, bg) => ({ id: '11111111-2222-4333-8444-' + String(555555555500 + i), schemaVersion: 1, scentName: name, productType: 'Scented Candle', shape: 'circle', size: 'custom', customW: 60, customH: 60, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '28/09/2026', bgColour: bg });
      const recs = [mk(0, 'White control', '#ffffff')].concat(Object.entries(payload).map(([k, v], i) => mk(i + 1, 'BG ' + k, v)));
      await LabelLibrary.mutate(() => ({ collection: recs, usedId: recs[0].id }));
      return recs.map(r => r.id);
    }, payload);
    await t.goto(`${base}/print.html`, { waitUntil: 'load' });
    await sleep(2500);
    const C = await t.evaluate(async (ids) => {
      const out = { perLabel: [] };
      const q = sel => document.querySelectorAll(sel).length;
      const control = resolveSheetLabel(ids[0]);
      const ctl = renderSheetPosition(control, 709, 709, { watermark: true, instanceId: 'cmp' }).svg;
      for (const id of ids.slice(1)) {
        const rec = resolveSheetLabel(id);
        const same = renderSheetPosition(rec, 709, 709, { watermark: true, instanceId: 'cmp' }).svg === ctl.replace(/White control/g, rec.scentName);
        // one sheet per label (a sheet holds one design at a time here)
        sheetItems.length = 0; addToSheet(id); await new Promise(r => setTimeout(r, 900));
        const cells = [...document.querySelectorAll('.sheet-cell')].map(c => [c.style.left, c.style.top, c.style.width, c.style.height].join(','));
        window.__written = ''; await downloadPDF();
        const end = Date.now() + 10000; while (Date.now() < end && !/print-btn/.test(window.__written)) await new Promise(r => setTimeout(r, 200));
        const png = await buildLabelPNGBlob(rec); const bm = png.blob ? await createImageBitmap(png.blob) : null;
        out.perLabel.push({ name: rec.scentName, same, cells: cells.join('|'), pdf: /print-btn/.test(window.__written), png: bm ? [bm.width, bm.height] : null });
      }
      out.injectedInPage = q('[data-m55]') + q('image[onerror]') + q('.sheet-cell script') + q('.sli-prev script');
      out.executed = window.__m55.slice();
      out.thumbs = ids.every(id => { const el = document.getElementById('sli-prev-' + id); return el && el.querySelector('svg'); });
      return out;
    }, ids);
    const cellsCtl = C.perLabel[0].cells;
    for (const l of C.perLabel) {
      assert.ok(l.same, l.name + ': Composer render identical to the white control (apart from the name)');
      assert.ok(l.pdf, l.name + ': A4 PDF generated');
      assert.deepStrictEqual(l.png, [709, 709], l.name + ': cutting-machine PNG generated at 709x709');
      assert.strictEqual(l.cells, cellsCtl, l.name + ': placement unchanged');
    }
    assert.strictEqual(C.injectedInPage, 0, 'no injected attribute/element anywhere in the Composer page');
    assert.deepStrictEqual(C.executed, [], 'no injected script/event handler executed');
    assert.ok(C.thumbs, 'every saved-label thumbnail rendered');
    assert.ok(!t.dialogs.some(d => /Could not render/.test(d)), 'no render failures: ' + t.dialogs.join(' | '));
    assert.deepStrictEqual(t.errs, [], 'no page errors: ' + t.errs.join(' | '));
    ok('Composer with tampered saved records: thumbnails and preview cells safe (nothing injected or executed), A4 PDF and cutting PNGs generated, placement unchanged');
    await t.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e && e.message);
  } finally {
    await browser.close(); server.close();
    if (failed) process.exit(1);
    console.log(`m55 bgColour validation checks passed (${passed} groups)`);
  }
});
