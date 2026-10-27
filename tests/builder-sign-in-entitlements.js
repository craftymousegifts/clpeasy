// Builder sign-in requirement × download entitlements (founder clarification,
// Oct 2026): watermarked downloads are a benefit of the registered 14-day
// trial, not an anonymous feature. For each customer type the signed-in
// Builder must behave exactly as the entitlement rules say:
//   new trial, existing trial      → download, watermarked
//   trial with no downloads left   → refused
//   expired trial                  → refused (never a renewed trial)
//   PAYG with credits              → download, clean;  PAYG at zero → refused
//   annual Easy Start / Easy Pro   → download, clean
// and a signed-out visitor gets no download at all.
//
// The mocked consume_download() answers from entitlement.js, the browser
// mirror that tests/download-entitlement-sql.js proves equal to the real SQL.
// The Builder must never write to the profile (no client-side trial reset).
// Desktop 1280 and iPhone 390. Local server, every external request stubbed.
//   node tests/builder-sign-in-entitlements.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP builder-sign-in-entitlements: puppeteer not installed'); process.exit(0); }
const E = require('../entitlement.js');

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const CUSTOMERS = {
  'new trial':              { plan: 'trial', subscription_status: 'trialing', trial_end: iso(14 * DAY), downloads_used: 0, downloads_limit: 10, topup_credits: 0 },
  'existing trial':         { plan: 'trial', subscription_status: 'trialing', trial_end: iso(5 * DAY), downloads_used: 7, downloads_limit: 10, topup_credits: 0 },
  'trial, allowance used':  { plan: 'trial', subscription_status: 'trialing', trial_end: iso(5 * DAY), downloads_used: 10, downloads_limit: 10, topup_credits: 0 },
  'expired trial':          { plan: 'trial', subscription_status: 'trialing', trial_end: iso(-1 * DAY), downloads_used: 3, downloads_limit: 10, topup_credits: 0 },
  'PAYG with credits':      { plan: 'payg', subscription_status: 'payg', trial_end: iso(-20 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 5 },
  'PAYG, no credits':       { plan: 'payg', subscription_status: 'payg', trial_end: iso(-20 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 0 },
  'annual Easy Start':      { plan: 'easy_start', subscription_status: 'active', billing_cycle: 'annual', downloads_used: 40, downloads_limit: 1000, downloads_reset_date: iso(20 * DAY), topup_credits: 0 },
  'annual Easy Pro':        { plan: 'easy_pro', is_pro: true, subscription_status: 'active', billing_cycle: 'annual', downloads_used: 12, downloads_limit: 30, downloads_reset_date: iso(20 * DAY), topup_credits: 2 },
};
// What the real rules decide for each (independent of the Builder).
const EXPECT = {
  'new trial': 'watermarked', 'existing trial': 'watermarked', 'trial, allowance used': 'refused', 'expired trial': 'refused',
  'PAYG with credits': 'clean', 'PAYG, no credits': 'refused', 'annual Easy Start': 'clean', 'annual Easy Pro': 'clean',
};
for (const [name, p] of Object.entries(CUSTOMERS)) {
  const s = E.summarise(p);
  const rule = s.nextSource ? (s.nextClean ? 'clean' : 'watermarked') : 'refused';
  assert.strictEqual(rule, EXPECT[name], `entitlement rules for ${name}`);
}

function stub(profile) {
  const row = Object.assign({ id: 'u-ent', email: 'qa@example.test', created_at: iso(-30 * DAY), deletion_date: null }, profile);
  return `window.__rpc=0;window.__writes=[];window.supabase={createClient:function(){var row=${JSON.stringify(row)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},order:function(){return this},limit:function(){return this},
  update:function(v){window.__writes.push(['update',v]);return this},upsert:function(v){window.__writes.push(['upsert',v]);return Promise.resolve({error:null})},insert:function(v){window.__writes.push(['insert',v]);return Promise.resolve({error:null})},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:row.id,email:row.email,created_at:row.created_at,user_metadata:{}}}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(n){if(n!=='consume_download')return {data:null,error:null};window.__rpc++;
    var s=window.CLPEntitlement.summarise(row);
    if(!s.nextSource)return {data:{ok:false,reason:'no_downloads_remaining'},error:null};
    return {data:{ok:true,consumed:true,free_redownload:false,source:s.nextSource==='subscription'?'plan':s.nextSource,clean_export:s.nextClean},error:null};}};}};`;
}
const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}}}}};';
const RECORDER = `window.__files=[];(function(){var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){
  if(this.download&&/\\.svg$/.test(this.download)){var h=this.href||'';window.__files.push(h.indexOf('data:')===0?decodeURIComponent(h.split(',').slice(1).join(',')):'(blob)');return;}
  return oc.apply(this,arguments);};})();`;
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 Avoid breathing vapours.\nP302+P352 IF ON SKIN: Wash with plenty of water.\nP501 Dispose of contents/container in accordance with local regulations.';

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
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  async function open(supabase, width) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport(width === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width, height: 900 });
    p.errs = []; p.alerts = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => { p.alerts.push(d.message()); d.dismiss(); });
    await p.evaluateOnNewDocument(RECORDER);
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: supabase });
      if (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await p.goto(base + '/builder.html', { waitUntil: 'load' });
    await p.evaluate(require('./helpers/sds-doc-answer').SCRIPT).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    p.ctx = ctx;
    return p;
  }

  for (const width of [1280, 390]) {
    for (const [name, profile] of Object.entries(CUSTOMERS)) {
      const p = await open(stub(profile), width);
      const r = await p.evaluate(async (SDS) => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        document.getElementById('scent-name').value = 'Entitlement QA';
        document.getElementById('product-type').value = 'Scented Candle'; onProductTypeChange();
        document.getElementById('smart-paste-input').value = SDS; extractSDS();
        document.getElementById('biz-name').value = 'QA Candles';
        document.getElementById('biz-address').value = '1 Test Street, Testtown, TE1 1ST';
        document.getElementById('biz-phone').value = '01234 567890';
        selectSize(56); readForm(); updateLabel();
        for (let n = 2; n <= 5; n++) { if (n === 4) { document.getElementById('hazard-confirm').checked = true; toggleHazardNext(); } setApprovedBuilderStep(n); await wait(120); }
        const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload(); await wait(300);
        const before = { signedIn: !!currentUser, step: approvedBuilderStep, allowed: _downloadAllowed() };
        await downloadSVG(); await wait(600);
        const svg = window.__files[0] || '';
        return { before, rpc: window.__rpc, files: window.__files.length, watermark: /PREVIEW ONLY/.test(svg), writes: window.__writes };
      }, SDS);
      const tag = `${width}px ${name}`;
      assert.deepStrictEqual(r.before, { signedIn: true, step: 5, allowed: true }, tag + ': reaches a downloadable Step 5');
      assert.strictEqual(r.rpc, 1, tag + ': one entitlement check per download');
      assert.deepStrictEqual(r.writes, [], tag + ': the Builder never writes to the profile (no trial reset)');
      const want = EXPECT[name];
      if (want === 'refused') {
        assert.strictEqual(r.files, 0, tag + ': no file');
        assert(p.alerts.some(a => /download/i.test(a)), tag + ': customer is told why: ' + p.alerts.join(' | '));
      } else {
        assert.strictEqual(r.files, 1, tag + ': one file');
        assert.strictEqual(r.watermark, want === 'watermarked', tag + `: ${want}`);
      }
      assert.deepStrictEqual(p.errs, [], tag + ': no page errors');
      await p.ctx.close();
    }
    ok(`${width}px: new/existing trial watermarked; used-up and expired trials refused; PAYG and annual subscribers clean; PAYG at zero refused; no profile writes`);

    // Anonymous visitor: redirected before any download is possible.
    const p = await open(SIGNED_OUT, width);
    const where = await p.evaluate(() => location.pathname + location.search);
    assert.strictEqual(where, '/auth.html?mode=signup&next=builder.html');
    assert.strictEqual(await p.evaluate(() => typeof downloadSVG), 'undefined', 'Builder export code is not on the page');
    await p.ctx.close();
    ok(`${width}px: anonymous visitor is sent to registration; no guest download`);
  }

  await browser.close();
  server.close();
  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
