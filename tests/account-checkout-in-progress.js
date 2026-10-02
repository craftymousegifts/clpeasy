// Account page → Reactivate falls back to a new subscription checkout. When
// create-checkout-session refuses with 409 CHECKOUT_IN_PROGRESS (the server's
// 5-minute duplicate-subscription lock), Account now shows the same shared
// "Checkout already in progress" dialog as pricing.html and checkout.html
// (checkout-notice.js) instead of "Something went wrong starting checkout".
// ALREADY_SUBSCRIBED keeps its own message; genuine failures keep the generic
// error. A started (or refused-as-in-progress) checkout is recorded with the
// shared markStarted(), so the existing header indicator appears on
// checkout.html / pricing.html -- Stripe's cancel link returns the customer
// to checkout.html. Account itself has no header and no indicator.
//
// Real account.html in Chromium; Supabase stubbed in-page; every Edge
// Function request intercepted.
// Screenshots: docs/reports/account-checkout-in-progress/*.png
//   node tests/account-checkout-in-progress.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'account-checkout-in-progress');
const KEY = 'clpeasy_checkout_in_progress';
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP account-checkout-in-progress: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP account-checkout-in-progress: no Chromium available'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILES = {
  ended: { plan: 'free', subscription_status: 'cancelled', downloads_used: 0, downloads_limit: 0, topup_credits: 0, billing_cycle: 'monthly' },
  active: { plan: 'easy_start', subscription_status: 'active', downloads_used: 3, downloads_limit: 20, topup_credits: 0, billing_cycle: 'monthly', topup_months: 0 },
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
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__stripe_checkout') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<title>Stripe Checkout (stub)</title>stub'); }
  const p = path.join(ROOT, u === '/' ? '/index.html' : u);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false, passed = 0;
  const check = async (name, fn) => {
    try { await fn(); passed++; console.log('PASS:', name); } catch (e) { failed = true; console.log('FAIL:', name, '\n ', e.message); }
  };
  const DESKTOP = { width: 1366, height: 900 };
  const IPHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  // checkout: { status, body } answer for create-checkout-session, or 'network' to fail the request.
  async function open(ctx, { profileKey = 'ended', checkout, viewport = DESKTOP, page = 'account.html' }) {
    const t = await ctx.newPage();
    await t.setViewport(viewport);
    t.calls = { manage: [], checkout: [] }; t.alerts = []; t.errs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => { t.alerts.push(d.message()); d.dismiss(); });
    await t.evaluateOnNewDocument(() => { try { localStorage.setItem('clpeasy-cookie-consent', 'accepted'); } catch (e) {} });
    await t.setRequestInterception(true);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(PROFILES[profileKey]) });
      if (u.includes('/functions/v1/manage-subscription')) {
        if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: 'ok' });
        t.calls.manage.push(JSON.parse(r.postData() || '{}'));
        // Nothing to resume: Account falls back to a new subscription checkout.
        return r.respond({ status: 409, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'Your previous subscription has fully ended.', code: 'FULLY_ENDED' }) });
      }
      if (u.includes('/functions/v1/create-checkout-session')) {
        if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: 'ok' });
        t.calls.checkout.push(JSON.parse(r.postData() || '{}'));
        if (checkout === 'network') return r.abort();
        const a = checkout || { status: 200, body: { url: base + '/__stripe_checkout' } };
        return r.respond({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body) });
      }
      if (u.includes('/functions/v1/')) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    return t;
  }
  // Easy Pro is retired from new sales (2 Oct 2026): reactivation offers Easy Start Unlimited only.
  const reactivate = t => t.evaluate(() => { openModal('resubscribe'); selectResub('start'); return confirmResub(); });
  const dialog = t => t.evaluate(() => {
    const d = document.querySelector('.clp-cn-dialog');
    return d ? { code: d.dataset.code, title: document.getElementById('clp-cn-title').textContent, role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), focused: document.activeElement === d.querySelector('.clp-cn-btn'), button: d.querySelector('.clp-cn-btn').textContent } : null;
  });
  const btnState = t => t.evaluate(() => { const b = document.getElementById('resub-confirm-btn'); return { text: b.textContent, disabled: b.disabled, opacity: b.style.opacity }; });
  const RESET = { text: 'Reactivate →', disabled: false, opacity: '1' };
  const stored = t => t.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return 'unreadable'; } }, KEY);
  const IN_PROGRESS = { status: 409, body: { error: 'A checkout is already in progress for this account. Please wait a moment and try again.', code: 'CHECKOUT_IN_PROGRESS' } };

  try {
    await check('Account loads the shared checkout-notice.js and mounts no indicator of its own', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, {});
      assert.deepStrictEqual(await t.evaluate(() => [typeof window.CLPCheckoutNotice?.showInProgress, !!document.getElementById('clp-checkout-indicator')]), ['function', false]);
      assert.deepStrictEqual(t.errs, []);
      await ctx.close();
    });

    await check('1-2. CHECKOUT_IN_PROGRESS: shared branded dialog (no generic alert); button reset; resubscribe modal stays open; focus in the dialog; checkout state recorded', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { checkout: IN_PROGRESS });
      await reactivate(t);
      await t.waitForSelector('.clp-cn-dialog');
      assert.deepStrictEqual(t.calls.manage, [{ action: 'reactivate' }], 'tries to resume the same subscription first');
      assert.deepStrictEqual(t.calls.checkout.map(c => [c.priceId, c.mode]), [['price_1TdoEYGZLILz5vqUIqlEsf4X', 'subscription']]);
      assert.deepStrictEqual(await dialog(t), { code: 'CHECKOUT_IN_PROGRESS', title: 'Checkout already in progress', role: 'dialog', modal: 'true', focused: true, button: 'Back to plans' });
      assert.deepStrictEqual(t.alerts, [], 'no browser alert');
      assert.deepStrictEqual(await btnState(t), RESET, 'Reactivate button usable again');
      assert.strictEqual(await t.evaluate(() => document.getElementById('modal-resubscribe').classList.contains('open')), true, 'plan choices still open behind the dialog');
      const s = await stored(t);
      assert(s && s.userId === 'u1' && s.until > Date.now(), 'checkout state recorded for this account');
      await t.screenshot({ path: path.join(SHOTS, 'account-in-progress-desktop.png') });
      assert.deepStrictEqual(t.errs, []);
      await ctx.close();
    });

    await check('10. dialog accessibility: Tab stays in the dialog; Escape closes it and returns focus to the Reactivate button; "Back to plans" and outside-click close it', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { checkout: IN_PROGRESS });
      await reactivate(t); await t.waitForSelector('.clp-cn-dialog');
      await t.keyboard.press('Tab'); await t.keyboard.down('Shift'); await t.keyboard.press('Tab'); await t.keyboard.up('Shift');
      assert.strictEqual((await dialog(t)).focused, true, 'focus trapped');
      await t.keyboard.press('Escape');
      assert.deepStrictEqual(await t.evaluate(() => [!document.querySelector('.clp-cn-dialog'), document.activeElement && document.activeElement.id]), [true, 'resub-confirm-btn']);
      await reactivate(t); await t.waitForSelector('.clp-cn-dialog'); await t.click('.clp-cn-btn');
      assert.strictEqual(await dialog(t), null, 'Back to plans closes');
      await reactivate(t); await t.waitForSelector('.clp-cn-dialog'); await t.mouse.click(5, 5);
      assert.strictEqual(await dialog(t), null, 'outside click closes');
      await ctx.close();
    });

    await check('3. ALREADY_SUBSCRIBED keeps its own server explanation, no dialog, button reset', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { checkout: { status: 409, body: { error: "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout.", code: 'ALREADY_SUBSCRIBED' } } });
      await reactivate(t);
      assert.strictEqual(t.alerts.length, 1); assert(/billing portal/.test(t.alerts[0]), t.alerts[0]);
      assert.strictEqual(await dialog(t), null);
      assert.deepStrictEqual(await btnState(t), RESET);
      assert.strictEqual(await stored(t), null, 'no checkout recorded');
      await ctx.close();
    });

    for (const [name, answer] of [
      ['Stripe error (400)', { status: 400, body: { error: 'No such price' } }],
      ['server error (500)', { status: 500, body: { error: 'boom' } }],
      ['not signed in (401 from the gateway)', { status: 401, body: { code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' } }],
      ['promotion not configured (503)', { status: 503, body: { error: 'This offer is not available right now. Please try again later.', code: 'PROMO_NOT_CONFIGURED' } }],
      ['network failure', 'network'],
    ]) {
      await check(`4. ${name}: generic error kept, no checkout-in-progress dialog, button reset`, async () => {
        const ctx = await browser.createBrowserContext();
        const t = await open(ctx, { checkout: answer });
        await reactivate(t);
        assert.deepStrictEqual(t.alerts, ['Something went wrong starting checkout. Please try again.']);
        assert.strictEqual(await dialog(t), null);
        assert.deepStrictEqual(await btnState(t), RESET);
        assert.strictEqual(await stored(t), null, 'no checkout recorded');
        await ctx.close();
      });
    }

    await check('5. success: redirects to Stripe Checkout exactly as before, and records the checkout', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, {});
      const nav = t.waitForNavigation({ waitUntil: 'domcontentloaded' });
      await reactivate(t); await nav;
      assert(t.url().endsWith('/__stripe_checkout'), t.url());
      assert.deepStrictEqual(t.calls.checkout, [{ priceId: 'price_1TdoEYGZLILz5vqUIqlEsf4X', mode: 'subscription' }], 'request body unchanged');
      const s = await t.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
      assert(s && s.userId === 'u1', 'recorded for the indicator');
      await ctx.close();
    });

    await check('7-8. indicator: after an Account checkout, returning to checkout.html (Stripe cancel link) shows the existing indicator; it opens its dialog and expires after 5 minutes', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { checkout: IN_PROGRESS });
      await reactivate(t); await t.waitForSelector('.clp-cn-dialog');
      const c = await open(ctx, { page: 'checkout.html?cancelled=true' });
      assert.strictEqual(await c.evaluate(() => { const e = document.getElementById('clp-checkout-indicator'); return !!e && !e.hidden; }), true, 'indicator visible on checkout.html');
      await c.click('#clp-checkout-indicator');
      await c.waitForSelector('.clp-cn-dialog[data-code="CHECKOUT_INDICATOR"]');
      await c.keyboard.press('Escape');
      await c.evaluate(k => { const v = JSON.parse(localStorage.getItem(k)); v.until = Date.now() + 800; localStorage.setItem(k, JSON.stringify(v)); CLPCheckoutNotice.refreshIndicator(); }, KEY);
      await new Promise(r => setTimeout(r, 1100));
      assert.strictEqual(await c.evaluate(() => document.getElementById('clp-checkout-indicator').hidden), true, 'expired');
      await ctx.close();
    });

    await check('6. top-ups retired and Pay As You Go unaffected: an unlimited subscriber has no top-up checkout (no modal, no request); a non-subscriber\'s Buy more downloads still goes to Pay As You Go (pricing.html#payg)', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { profileKey: 'active' });
      await t.evaluate(k => localStorage.setItem(k, JSON.stringify({ userId: 'u1', until: Date.now() + 60000 })), KEY);
      const before = t.url();
      await t.evaluate(() => buyTopup());
      assert.deepStrictEqual([await t.evaluate(() => [!!document.getElementById('modal-topup'), typeof confirmTopup]), t.url() === before], [[false, 'undefined'], true], 'no top-up modal or checkout; stays on Account');
      assert.deepStrictEqual([t.calls.checkout, t.alerts, await dialog(t)], [[], [], null]);
      await ctx.close();
      // A non-subscriber's "Buy more downloads" still goes to Pay As You Go on
      // the pricing page, even with a subscription checkout recorded.
      const ctx2 = await browser.createBrowserContext();
      const u = await open(ctx2, { profileKey: 'ended' });
      await u.evaluate(k => localStorage.setItem(k, JSON.stringify({ userId: 'u1', until: Date.now() + 60000 })), KEY);
      const nav = u.waitForNavigation({ waitUntil: 'domcontentloaded' });
      await u.evaluate(() => buyTopup()); await nav;
      assert(new URL(u.url()).pathname.endsWith('/pricing.html') && new URL(u.url()).hash === '#payg', 'PAYG route unchanged: ' + u.url());
      assert.deepStrictEqual([u.alerts, u.calls.checkout], [[], []]);
      await ctx2.close();
    });

    await check('9. iPhone: dialog over the Account page fits with gutters, full-width button, no horizontal scroll', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, { checkout: IN_PROGRESS, viewport: IPHONE });
      await reactivate(t); await t.waitForSelector('.clp-cn-dialog');
      const g = await t.evaluate(() => {
        const r = document.querySelector('.clp-cn-dialog').getBoundingClientRect(), b = document.querySelector('.clp-cn-btn').getBoundingClientRect();
        return { l: r.left, r: innerWidth - r.right, t: r.top, b: innerHeight - r.bottom, btnFull: b.width > r.width * 0.8, hscroll: document.documentElement.scrollWidth > innerWidth };
      });
      assert(g.l >= 16 && g.r >= 16 && g.t >= 16 && g.b >= 16, JSON.stringify(g));
      assert.deepStrictEqual([g.btnFull, g.hscroll], [true, false]);
      await t.screenshot({ path: path.join(SHOTS, 'account-in-progress-mobile.png') });
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log(`account checkout-in-progress checks passed (${passed} scenarios)`);
});
