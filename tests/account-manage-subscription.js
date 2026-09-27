// Account page → manage-subscription: Pause / Cancel / Reactivate.
//
// Drives the REAL account.html in Chromium with Supabase stubbed in-page and
// every Edge Function request intercepted, and proves what the page sends to
// manage-subscription and how it handles each server answer:
//   - Pause and Cancel POST { action, reason } with the signed-in user's JWT
//     and show their confirmation step only on success; a server error is
//     shown and nothing is marked done.
//   - Reactivate first tries manage-subscription (same subscription); on
//     success it never opens Checkout; on FULLY_ENDED / NO_SUBSCRIPTION it
//     falls back to create-checkout-session exactly once.
// The real function behind this request is covered by
// tests/deno/manage-subscription.test.ts and was exercised on CLPeasy Test +
// Stripe Sandbox (docs/reports/pr156-final-qa/V15-RELEASE-GATES.md §12).
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/account-manage-subscription.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP account-manage-subscription: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP account-manage-subscription: no Chromium available'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILES = {
  active: { plan: 'easy_start', subscription_status: 'active', downloads_used: 3, downloads_limit: 20, topup_credits: 0, billing_cycle: 'monthly' },
  paused: { plan: 'easy_start', subscription_status: 'paused', downloads_used: 3, downloads_limit: 20, topup_credits: 0, billing_cycle: 'monthly' },
};
function stub(profile) {
  const row = Object.assign({ id: 'u1', email: 'qa@example.test', full_name: 'QA Maker', created_at: iso(-40 * DAY) }, profile);
  return `window.__invoked=[];window.supabase={createClient:function(){var row=${JSON.stringify(row)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'user-jwt-123',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},
  functions:{invoke:async function(n,o){window.__invoked.push([n,o&&o.body]);return {data:null,error:null}}}};}};`;
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
  let failed = false, passed = 0;
  const check = async (name, fn) => {
    try { await fn(); passed++; console.log('PASS:', name); } catch (e) { failed = true; console.log('FAIL:', name, '\n ', e.message); }
  };
  // manageAnswers: queue of { status, body } for successive manage-subscription calls.
  async function open(profileKey, manageAnswers) {
    const t = await browser.newPage();
    await t.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    t.calls = { manage: [], checkout: [] }; t.dialogs = []; t.errs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.dialogs.push(d.message()); d.dismiss(); });
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(PROFILES[profileKey]) });
      if (u.includes('/functions/v1/manage-subscription')) {
        if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: 'ok' });
        t.calls.manage.push({ auth: r.headers().authorization, body: JSON.parse(r.postData() || '{}') });
        const a = manageAnswers.shift() || { status: 500, body: { error: 'unexpected extra call' } };
        return r.respond({ status: a.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(a.body) });
      }
      if (u.includes('/functions/v1/create-checkout-session')) {
        if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: 'ok' });
        t.calls.checkout.push(JSON.parse(r.postData() || '{}'));
        return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ url: base + '/pricing.html?stub-checkout=1' }) });
      }
      if (u.includes('/functions/v1/')) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/account.html`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    return t;
  }
  const shown = (t, id) => t.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none'; }, id);
  const pick = (t, name, value) => t.evaluate((n, v) => { const el = document.querySelector(`input[name="${n}"][value="${v}"]`); el.closest('.survey-opt').click(); }, name, value);

  try {
    await check('Pause: POSTs {action:"pause", reason} with the user JWT; confirmation shown only after success; paused event sent', async () => {
      const t = await open('active', [{ status: 200, body: { success: true, status: 'active' } }]);
      await t.evaluate(() => openModal('pause'));
      await pick(t, 'pause-reason', 'quiet');
      await t.evaluate(() => confirmPause());
      await new Promise(r => setTimeout(r, 400));
      assert.deepStrictEqual(t.calls.manage, [{ auth: 'Bearer user-jwt-123', body: { action: 'pause', reason: 'quiet' } }]);
      assert.strictEqual(await shown(t, 'pause-step-2'), true, 'pause confirmation shown');
      assert.deepStrictEqual(await t.evaluate(() => window.__invoked.map(x => x[1] && x[1].event)), ['subscription_paused']);
      assert.deepStrictEqual([t.dialogs, t.errs], [[], []]);
      await t.close();
    });

    await check('Pause refused by the server: error shown, not marked paused, no paused event', async () => {
      const t = await open('active', [{ status: 500, body: { error: 'Stripe could not pause this subscription' } }]);
      await t.evaluate(() => openModal('pause'));
      await pick(t, 'pause-reason', 'break');
      await t.evaluate(() => confirmPause());
      await new Promise(r => setTimeout(r, 400));
      assert.deepStrictEqual(t.dialogs, ['Stripe could not pause this subscription']);
      assert.strictEqual(await shown(t, 'pause-step-2'), false, 'no false confirmation');
      assert.deepStrictEqual(await t.evaluate(() => window.__invoked.length), 0);
      await t.close();
    });

    await check('Cancel: POSTs {action:"cancel", reason} with the user JWT; done step shown; cancelled event sent', async () => {
      const t = await open('active', [{ status: 200, body: { success: true, status: 'active' } }]);
      await t.evaluate(() => openModal('cancel'));
      await pick(t, 'cancel-reason', 'price');
      await t.evaluate(() => { handleCancelReason(); return confirmCancel(); });
      await new Promise(r => setTimeout(r, 400));
      assert.deepStrictEqual(t.calls.manage, [{ auth: 'Bearer user-jwt-123', body: { action: 'cancel', reason: 'price' } }]);
      assert.strictEqual(await shown(t, 'cancel-step-done'), true, 'cancel done step shown');
      assert.deepStrictEqual(await t.evaluate(() => window.__invoked.map(x => x[1] && x[1].event)), ['subscription_cancelled']);
      await t.close();
    });

    await check('Reactivate (paused): resumes the SAME subscription via manage-subscription and never opens Checkout', async () => {
      const t = await open('paused', [{ status: 200, body: { success: true, status: 'active' } }]);
      await t.evaluate(() => { openModal('resubscribe'); selectResub('start'); });
      const nav = t.waitForNavigation({ waitUntil: 'domcontentloaded' });
      await t.evaluate(() => { confirmResub(); });
      await nav;
      assert.deepStrictEqual(t.calls.manage, [{ auth: 'Bearer user-jwt-123', body: { action: 'reactivate' } }]);
      assert.deepStrictEqual(t.calls.checkout, [], 'no new subscription checkout');
      assert.strictEqual(new URL(t.url()).search, '?reactivated=true');
      await t.close();
    });

    for (const [code, status] of [['FULLY_ENDED', 409], ['NO_SUBSCRIPTION', 404]]) {
      await check(`Reactivate when manage-subscription answers ${code}: falls back to one subscription Checkout`, async () => {
        const t = await open('paused', [{ status, body: { error: 'x', code } }]);
        await t.evaluate(() => { openModal('resubscribe'); selectResub('start'); });
        const nav = t.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await t.evaluate(() => { confirmResub(); });
        await nav;
        assert.strictEqual(t.calls.manage.length, 1);
        assert.strictEqual(t.calls.checkout.length, 1, 'exactly one checkout');
        assert.strictEqual(t.calls.checkout[0].mode, 'subscription');
        assert.ok(/^price_/.test(t.calls.checkout[0].priceId), 'a plan price');
        assert.ok(t.url().includes('stub-checkout=1'), 'sent to Checkout');
        await t.close();
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log(`account manage-subscription checks passed (${passed} scenarios)`);
});
