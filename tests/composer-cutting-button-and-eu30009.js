// Print Sheet Composer (27 Oct 2026):
//   1. a disabled "Download for cutting machine" button looks disabled, like
//      Print / PDF (styling only -- entitlement rules unchanged);
//   2. EU30009 is hidden from customer template selection (the Builder saves
//      whole millimetres, so no label can be 99.1 x 57.3mm yet). Its
//      TEMPLATE_REGISTRY entry is unchanged and still works when selected.
// Signed out, free trial, PAYG with credits and annual Easy Start, at desktop
// 1280 and iPhone 390. Local server, every external request stubbed.
//   node tests/composer-cutting-button-and-eu30009.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP composer-cutting-button-and-eu30009: puppeteer not installed'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const USER = '00000000-0000-4000-8000-0000000c0e05';
const CUSTOMERS = {
  'signed out': null,
  'free trial': { plan: 'trial', subscription_status: 'trialing', trial_end: iso(10 * DAY), downloads_used: 1, downloads_limit: 10, topup_credits: 0 },
  'PAYG with credits': { plan: 'payg', subscription_status: 'payg', trial_end: iso(-20 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 5 },
  'annual Easy Start': { plan: 'easy_start', subscription_status: 'active', billing_cycle: 'annual', downloads_used: 4, downloads_limit: 1000, downloads_reset_date: iso(20 * DAY), topup_credits: 0 },
};
const ENTITLED = { 'signed out': false, 'free trial': false, 'PAYG with credits': true, 'annual Easy Start': true };
const LABEL = { id: 'aaaaaaaa-0000-4000-8000-0000000c0e05', scentName: 'Composer QA', productType: 'Scented Candle', signal: 'Warning', shape: 'circle', size: 'custom', customW: 63, customH: 63,
  bizName: 'QA Candles', bizAddress: '1 Test Street, Testtown, TE1 1ST', bizPhone: '01234 567890', hStatements: 'H317', pStatements: 'P261, P302+P352, P501',
  hSelected: ['H317'], pSelected: ['P261', 'P302+P352', 'P501'], pictograms: ['exclamation'], sensitisers: ['Linalool'], sourceSection22: '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP261 Avoid breathing vapours.\nP302+P352 IF ON SKIN: Wash with plenty of water.\nP501 Dispose of contents.',
  hazardFromExtraction: true, savedAt: '27/10/2026', schemaVersion: 2 };

function stub(profile) {
  if (!profile) return 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}}}}};';
  const row = Object.assign({ id: USER, email: 'qa@example.test', created_at: iso(-30 * DAY), deletion_date: null, is_pro: false, billing_cycle: null, downloads_reset_date: null }, profile);
  return `window.supabase={createClient:function(){var row=${JSON.stringify(row)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},order:function(){return this},limit:function(){return this},
  update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:row.id,email:row.email,created_at:row.created_at,user_metadata:{}}}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
}

let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  // Static: EU30009 configuration preserved; card present but hidden; no
  // customer-facing text still points at it.
  const src = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
  assert(/\.btn-secondary:disabled\{opacity:0\.4;pointer-events:none;\}/.test(src), 'disabled secondary-button style present');
  assert(/<div class="tpl-card" data-tpl="eu30009"[^>]*style="display:none;"/.test(src), 'EU30009 card hidden');
  assert(!/Pick Custom Sheet or EU30009/.test(src), 'empty-state text no longer mentions EU30009');
  ok('source: disabled style added; EU30009 card hidden; empty-state text updated');

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });

  for (const width of [1280, 390]) {
    for (const [name, profile] of Object.entries(CUSTOMERS)) {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      await p.setViewport(width === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width, height: 900 });
      const errs = [], alerts = [];
      p.on('pageerror', e => errs.push(e.message));
      p.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });
      const ns = profile ? USER : 'guest';
      await p.evaluateOnNewDocument(`localStorage.setItem('clpeasy_labels__u_${ns}', ${JSON.stringify(JSON.stringify([LABEL]))});
        window.__opened=[];window.open=function(u){window.__opened.push(String(u||''));return null;};`);
      await p.setRequestInterception(true);
      p.on('request', r => {
        const u = r.url();
        if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(profile) });
        if (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
        return r.respond({ status: 204, body: '' });
      });
      await p.goto(base + '/print.html', { waitUntil: 'load' });
      await p.evaluate(require('./helpers/sds-doc-answer').SCRIPT).catch(() => {});
      await new Promise(r => setTimeout(r, 1800));
      await p.evaluate(id => { addToSheet(id); }, LABEL.id);
      await new Promise(r => setTimeout(r, 600));
      const tag = `${width}px ${name}`;

      const s = await p.evaluate(() => {
        const look = id => { const e = document.getElementById(id), c = getComputedStyle(e); return { disabled: e.disabled, opacity: c.opacity, pointerEvents: c.pointerEvents }; };
        const cards = [...document.querySelectorAll('.tpl-card[data-tpl]')];
        return {
          visibleTemplates: cards.filter(c => c.offsetParent !== null).map(c => c.dataset.tpl),
          eu30009InDom: cards.some(c => c.dataset.tpl === 'eu30009'),
          onSheet: sheetItems.length, gate: getComputedStyle(document.getElementById('pro-gate')).display !== 'none',
          pdf: look('btn-pdf'), cut: look('btn-png-all'), sizeTest: look('btn-size-test'),
        };
      });
      assert.deepStrictEqual(s.visibleTemplates, ['custom'], tag + ': only Custom Sheet is offered');
      assert(s.eu30009InDom, tag + ': EU30009 card kept in the page (hidden)');
      assert.strictEqual(s.onSheet, 1, tag + ': saved label added to the Custom Sheet');
      const want = ENTITLED[name];
      assert.strictEqual(s.gate, !want, tag + ': restriction notice ' + (want ? 'hidden' : 'shown'));
      for (const b of ['pdf', 'cut']) {
        assert.deepStrictEqual(s[b], want ? { disabled: false, opacity: '1', pointerEvents: 'auto' } : { disabled: true, opacity: '0.4', pointerEvents: 'none' }, `${tag}: ${b} button ${want ? 'enabled' : 'disabled and faded'}`);
      }
      assert.deepStrictEqual(s.sizeTest, { disabled: false, opacity: '1', pointerEvents: 'auto' }, tag + ': alignment test always available');

      // Cutting-machine button: opens its modal only when entitled.
      await p.$eval('#btn-png-all', b => b.scrollIntoView({ block: 'center' }));
      if (want) {
        await p.click('#btn-png-all');
        assert(await p.evaluate(() => document.getElementById('cricutModal').classList.contains('show')), tag + ': cutting-machine options open');
        await p.evaluate(() => closeCricutModal());
      } else {
        assert.strictEqual(await p.evaluate(() => { document.getElementById('btn-png-all').click(); return document.getElementById('cricutModal').classList.contains('show'); }), false, tag + ': disabled button opens nothing');
      }

      // Free alignment test still opens (no download credit).
      await p.$eval('#btn-size-test', b => b.scrollIntoView({ block: 'center' }));
      await p.click('#btn-size-test');
      const opened = await p.evaluate(() => window.__opened.filter(u => /print-size-test\.html#/.test(u)).length);
      assert.strictEqual(opened, 1, tag + ': alignment test opened');

      if (width === 390 && (name === 'free trial' || name === 'annual Easy Start')) {
        const el = await p.$('#preview-export-footer');
        await el.screenshot({ path: path.join(ROOT, 'qa-artifacts', `composer-export-${name.replace(/\s+/g, '-')}-390.png`) }).catch(() => {});
      }

      // EU30009 configuration still works when selected directly (future testing).
      if (name === 'annual Easy Start' && width === 1280) {
        const reg = await p.evaluate(() => { const r = getRegistryTemplate('eu30009'); selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]')); const t = getTplConfig(); return { reg: { w: r.labelWidthMm, h: r.labelHeightMm, cols: r.columns, rows: r.rows, r: r.cornerRadiusMm, mt: r.marginTopMm, ml: r.marginLeftMm, gh: r.horizontalGapMm, gv: r.verticalGapMm }, rows: t.rows, cols: t.cols, current: currentTpl }; });
        assert.deepStrictEqual(reg.reg, { w: 99.1, h: 57.3, cols: 2, rows: 5, r: 2, mt: 5.25, ml: 4.65, gh: 2.5, gv: 0 }, 'EU30009 registry values unchanged');
        assert.deepStrictEqual([reg.current, reg.cols, reg.rows], ['eu30009', 2, 5], 'EU30009 still selectable programmatically');
      }
      assert.deepStrictEqual(errs, [], tag + ': no page errors');
      await ctx.close();
    }
    ok(`${width}px: only Custom Sheet offered; signed-out and trial see both exports disabled and faded; PAYG and annual enabled; alignment test always works`);
  }
  ok('EU30009 configuration preserved and still selectable for future testing');

  await browser.close();
  server.close();
  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
