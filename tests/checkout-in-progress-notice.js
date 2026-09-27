// Checkout-in-progress notice on pricing.html and checkout.html.
//
// create-checkout-session refuses a second SUBSCRIPTION checkout for the same
// account for 5 minutes after one was started (409 CHECKOUT_IN_PROGRESS;
// checkout_locks). pricing.html used to show that as a browser alert and
// checkout.html hid it behind "Something went wrong starting checkout".
// Both pages now show the shared accessible CLPeasy dialog (checkout-notice.js).
//
// Real pages in Chromium. Supabase auth is stubbed (signed in) and every
// create-checkout-session request is answered by an emulation of the server's
// lock rule with a controllable clock. The rule itself is proven against the
// REAL Edge Function in tests/deno/create-checkout-session.test.ts ("lock:").
//
// Screenshots: docs/reports/checkout-in-progress-notice/*.png
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or puppeteer's
// own download. Prints SKIP and exits 0 if none is available.
//   node tests/checkout-in-progress-notice.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'checkout-in-progress-notice');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP checkout-in-progress-notice: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP checkout-in-progress-notice: no Chromium available'); process.exit(0); }

const SERVER_MSG = 'A checkout is already in progress for this account. Please wait a moment and try again.';
const LOCK_MS = 5 * 60 * 1000;
const PRICES = {
  start_m: 'price_1TdoEYGZLILz5vqUIqlEsf4X', pro_m: 'price_1TdoEXGZLILz5vqUvZKB1RQw',
  start_a: 'price_1TdoEXGZLILz5vqUQj5n6Zri', pro_a: 'price_1TdoEXGZLILz5vqUFgTznTUT',
};

// ── Emulated server lock (same rule as create-checkout-session) ──
const srv = { now: Date.parse('2026-10-01T12:00:00Z'), lockAt: null, requests: [], force: null };
function answer(body) {
  srv.requests.push(body);
  if (srv.force) return srv.force;
  const subscription = !(body.mode === 'payment' || body.productKey === 'payg_5');
  if (subscription) {
    if (srv.lockAt !== null && srv.now - srv.lockAt < LOCK_MS) return { status: 409, body: { error: SERVER_MSG, code: 'CHECKOUT_IN_PROGRESS' } };
    srv.lockAt = srv.now;
  }
  return { status: 200, body: { url: 'STRIPE' } };
}

const STUB = `window.supabase={createClient:function(){return{auth:{
  getSession:async function(){return{data:{session:{access_token:'user-jwt',user:{id:'u1',email:'maker@example.test'}}}}},
  onAuthStateChange:function(){return{data:{subscription:{unsubscribe:function(){}}}}}}}}};`;

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

  async function open(page, viewport) {
    const t = await browser.newPage();
    await t.setViewport(viewport || { width: 1366, height: 900 });
    t.alerts = []; t.errs = [];
    t.on('dialog', d => { t.alerts.push(d.message()); d.dismiss(); });
    t.on('pageerror', e => t.errs.push(e.message));
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: STUB });
      if (u.includes('/functions/v1/create-checkout-session')) {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: 'ok' });
        const a = answer(JSON.parse(r.postData() || '{}'));
        const body = a.body.url === 'STRIPE' ? { url: base + '/__stripe_checkout' } : a.body;
        return r.respond({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      }
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await t.waitForFunction(() => typeof window.startCheckout === 'function');
    await new Promise(r => setTimeout(r, 300));
    return t;
  }
  // Starts a subscription checkout the way a customer does on each page.
  async function start(t, page, plan, billing) {
    if (page === 'pricing.html') {
      await t.evaluate(b => { const btn = [...document.querySelectorAll('.toggle-btn')].find(x => x.getAttribute('onclick').includes(`'${b}'`)); setBilling(b, btn); }, billing);
      await t.evaluate(p => { document.getElementById('btn-' + p).click(); }, plan);
    } else {
      await t.evaluate((p, b) => { setBilling(b); selectPlan(p); }, plan, billing);
      await t.click('#btn-checkout');
    }
  }
  const notice = t => t.evaluate(() => {
    const d = document.querySelector('.clp-cn-dialog');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return {
      role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'),
      labelled: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
      described: document.getElementById(d.getAttribute('aria-describedby'))?.textContent.replace(/\s+/g, ' ').trim(),
      button: d.querySelector('button').textContent, focused: document.activeElement === d.querySelector('button'),
      left: Math.round(r.left), right: Math.round(window.innerWidth - r.right), top: Math.round(r.top), bottom: Math.round(window.innerHeight - r.bottom),
      bodyOverflow: document.body.style.overflow,
    };
  });
  const waitNotice = t => t.waitForSelector('.clp-cn-dialog', { timeout: 3000 });
  const expectOpensCheckout = async (t, fn) => {
    const nav = t.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await fn();
    await nav;
    assert(t.url().endsWith('/__stripe_checkout'), 'Stripe Checkout opened, got ' + t.url());
  };
  const texts = {};

  try {
    for (const page of ['pricing.html', 'checkout.html']) {
      const trigger = page === 'pricing.html' ? plan => '#btn-' + plan : () => '#btn-checkout';
      srv.lockAt = null; srv.requests.length = 0;

      await check(`${page}: 1. Easy Start monthly checkout opens normally`, async () => {
        const t = await open(page);
        await expectOpensCheckout(t, () => start(t, page, 'easy_start', 'monthly'));
        assert.strictEqual(srv.requests.at(-1).priceId, PRICES.start_m);
        assert.deepStrictEqual([t.alerts, t.errs], [[], []]);
        await t.close();
      });

      await check(`${page}: 2. immediate second Easy Start attempt shows the in-progress dialog (no alert, no Checkout)`, async () => {
        srv.now += 5000;
        const t = await open(page);
        await start(t, page, 'easy_start', 'monthly');
        await waitNotice(t);
        const n = await notice(t);
        assert.strictEqual(n.role, 'dialog'); assert.strictEqual(n.modal, 'true');
        assert.strictEqual(n.labelled, 'Checkout already in progress');
        assert(/You recently started a subscription checkout\./.test(n.described));
        assert(/no more than 5/.test(n.described) && /return to your previous checkout if it is still open/.test(n.described));
        assert.strictEqual(n.button, 'Back to plans'); assert.strictEqual(n.focused, true, 'focus moved to the dialog button');
        assert.strictEqual(n.bodyOverflow, 'hidden', 'page scroll locked behind the dialog');
        assert.deepStrictEqual(t.alerts, [], 'no browser alert');
        assert(t.url().endsWith('/' + page), 'no Checkout opened');
        texts[page] = n.described;
        const state = await t.evaluate(p => {
          const b = document.querySelector(p === 'pricing.html' ? '#btn-easy_start' : '#btn-checkout');
          const ov = document.getElementById('loading-overlay');
          return { disabled: b.disabled, text: b.textContent.trim(), overlay: ov ? ov.classList.contains('show') : false };
        }, page);
        assert.strictEqual(state.disabled, false, 'button usable again');
        assert(/Get started|Continue to payment/.test(state.text), 'button label restored: ' + state.text);
        assert.strictEqual(state.overlay, false, 'loading overlay removed');
        await t.screenshot({ path: path.join(SHOTS, `${page.replace('.html', '')}-desktop.png`) });
        // Keyboard: Tab / Shift+Tab stay on the dialog button; Escape closes
        // and returns focus to the button that started checkout.
        await t.keyboard.press('Tab'); await t.keyboard.down('Shift'); await t.keyboard.press('Tab'); await t.keyboard.up('Shift');
        assert.strictEqual((await notice(t)).focused, true, 'focus kept inside the dialog');
        await t.keyboard.press('Escape');
        assert.strictEqual(await notice(t), null, 'Escape closes');
        const after = await t.evaluate(sel => ({ focus: document.activeElement === document.querySelector(sel), overflow: document.body.style.overflow }), trigger('easy_start'));
        assert.deepStrictEqual(after, { focus: true, overflow: '' }, 'focus returned to the trigger; page scroll restored');
        await t.close();
      });

      await check(`${page}: 3. immediate Easy Pro monthly attempt after Easy Start shows the dialog; "Back to plans" closes it`, async () => {
        srv.now += 97000;
        const t = await open(page);
        await start(t, page, 'easy_pro', 'monthly');
        await waitNotice(t);
        assert.strictEqual(srv.requests.at(-1).priceId, PRICES.pro_m);
        await t.click('.clp-cn-btn');
        assert.strictEqual(await notice(t), null, 'button closes');
        assert.deepStrictEqual(t.alerts, []);
        await t.close();
      });

      await check(`${page}: 7. switching to Easy Pro ANNUAL (and Easy Start annual) still respects the lock; backdrop click closes`, async () => {
        srv.now += 60000;
        const t = await open(page);
        for (const [plan, price] of [['easy_pro', PRICES.pro_a], ['easy_start', PRICES.start_a]]) {
          await start(t, page, plan, 'annual');
          await waitNotice(t);
          assert.strictEqual(srv.requests.at(-1).priceId, price);
          await t.mouse.click(5, 5);
          assert.strictEqual(await notice(t), null, 'backdrop click closes');
        }
        assert.deepStrictEqual(t.alerts, []);
        await t.close();
      });

      await check(`${page}: 10. mobile (iPhone 390x844): dialog fits with 16px gutters and a full-width button`, async () => {
        const t = await open(page, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await start(t, page, 'easy_pro', 'monthly');
        await waitNotice(t);
        const n = await notice(t);
        assert(n.left >= 16 && n.right >= 16, `side gutters ${n.left}/${n.right}`);
        assert(n.top >= 16 && n.bottom >= 16, `fits vertically ${n.top}/${n.bottom}`);
        const w = await t.evaluate(() => [document.querySelector('.clp-cn-btn').getBoundingClientRect().width, document.querySelector('.clp-cn-dialog').clientWidth]);
        assert(w[0] > w[1] * 0.8, 'full-width button on mobile');
        assert.strictEqual(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
        await t.screenshot({ path: path.join(SHOTS, `${page.replace('.html', '')}-mobile.png`) });
        await t.close();
      });

      await check(`${page}: 4. after the lock expires, Easy Pro monthly checkout opens normally`, async () => {
        srv.now = srv.lockAt + LOCK_MS + 1000;
        const t = await open(page);
        await expectOpensCheckout(t, () => start(t, page, 'easy_pro', 'monthly'));
        assert.strictEqual(srv.requests.at(-1).priceId, PRICES.pro_m);
        assert.deepStrictEqual([t.alerts, t.errs], [[], []]);
        await t.close();
      });
    }

    await check('8. pricing.html and checkout.html show the same message', async () => {
      assert(texts['pricing.html'] && texts['pricing.html'] === texts['checkout.html'], JSON.stringify(texts));
    });

    await check('5. PAYG checkout on pricing.html is not blocked while a subscription lock is held', async () => {
      srv.now += 10000; // lock from test 4 still held
      const t = await open('pricing.html');
      await expectOpensCheckout(t, () => t.evaluate(() => startPaygCheckout()));
      assert.strictEqual(srv.requests.at(-1).productKey, 'payg_5');
      assert.deepStrictEqual(t.alerts, []);
      await t.close();
    });

    await check('checkout.html: ALREADY_SUBSCRIBED now shows the server explanation (as pricing.html does), not the generic error', async () => {
      srv.force = { status: 409, body: { code: 'ALREADY_SUBSCRIBED', error: "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout." } };
      const t = await open('checkout.html');
      await start(t, 'checkout.html', 'easy_pro', 'monthly');
      await t.waitForFunction(() => !document.getElementById('btn-checkout').disabled);
      await new Promise(r => setTimeout(r, 200));
      assert.strictEqual(t.alerts.length, 1); assert(/billing portal/.test(t.alerts[0]), t.alerts[0]);
      await t.close();
    });

    for (const page of ['pricing.html', 'checkout.html']) {
      await check(`${page}: an unexpected server failure keeps the generic message and no dialog`, async () => {
        srv.force = { status: 500, body: { error: 'Stripe error' } };
        const t = await open(page);
        await start(t, page, 'easy_start', 'monthly');
        await new Promise(r => setTimeout(r, 500));
        assert.deepStrictEqual(t.alerts, ['Something went wrong starting checkout. Please try again.']);
        assert.strictEqual(await notice(t), null);
        await t.close();
      });
    }
    srv.force = null;
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log(`checkout-in-progress notice checks passed (${passed} scenarios)`);
});
