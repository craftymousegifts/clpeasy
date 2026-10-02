// Pricing / checkout UX (after PR #157):
//   1. Header "Checkout in progress" indicator (checkout-notice.js): shown only
//      while THIS browser knows a subscription checkout was started for the
//      signed-in account in the last 5 minutes; never a plan, price, session
//      or countdown; PAYG never sets it.
//   2. checkout.html order summary shows the 2026 monthly offer exactly as
//      Stripe Checkout charges it (£8.99 / £13.49), never on annual, and
//      reverts on 1 Jan 2027 (same boundary as create-checkout-session).
//   3. Pricing card icons: only Pay As You Go and Easy Start changed.
//
// Real pages in Chromium; Supabase auth stubbed (signed in); the server's
// 5-minute subscription-checkout lock emulated (proven against the real Edge
// Function in tests/deno/create-checkout-session.test.ts, "lock:").
// Screenshots: docs/reports/pricing-checkout-ux/*.png
//   node tests/pricing-checkout-ux.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'pricing-checkout-ux');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP pricing-checkout-ux: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP pricing-checkout-ux: no Chromium available'); process.exit(0); }

// ── Static: only the PAYG and Easy Start card icons changed ──
const HTML = fs.readFileSync(path.join(ROOT, 'pricing.html'), 'utf8');
const icons = [...HTML.matchAll(/<span class="card-icon[^"]*">([\s\S]*?)<\/span>/g)].map(m => m[1]);
assert.strictEqual(icons.length, 3, 'three pricing-card icons (Easy Pro retired from new sales, 2 Oct 2026)');
assert.strictEqual(icons[0], '✨', 'Easy Trial icon unchanged');
assert(/^<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">/.test(icons[1]) && !/127991/.test(icons[1]), 'Pay As You Go: inline SVG payment-card icon (no 🏷️)');
assert(/^<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">/.test(icons[2]) && !/🕯/.test(icons[2]), 'Easy Start: inline SVG clipboard icon (no 🕯️)');
assert(!/<image|xlink:href|href=/.test(icons[1] + icons[2]), 'icons are self-contained vector shapes (no external artwork)');
console.log('PASS: static: Easy Trial ✨ unchanged; PAYG and Easy Start Unlimited are inline SVG; no Easy Pro card');

const LOCK_MS = 5 * 60 * 1000;
const PRICES = { start_m: 'price_1TdoEYGZLILz5vqUIqlEsf4X', start_a: 'easy_start_annual' }; // annual: server-side £89 price via productKey
const srv = { lockAt: null, requests: [] };
function answer(body) {
  srv.requests.push(body);
  const subscription = !(body.mode === 'payment' || body.productKey === 'payg_5');
  if (subscription) {
    if (srv.lockAt !== null && Date.now() - srv.lockAt < LOCK_MS) return { status: 409, body: { error: 'A checkout is already in progress for this account. Please wait a moment and try again.', code: 'CHECKOUT_IN_PROGRESS' } };
    srv.lockAt = Date.now();
  }
  return { status: 200, body: { url: 'STRIPE' } };
}
const stub = uid => `window.supabase={createClient:function(){return{auth:{
  getSession:async function(){return{data:{session:{access_token:'user-jwt',user:{id:'${uid}',email:'maker@example.test'}}}}},
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
  const DESKTOP = { width: 1366, height: 900 };
  const IPHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  // One browser context per "customer browser" so localStorage persists across pages.
  async function newCustomer() { return browser.createBrowserContext(); }
  async function open(ctx, page, { viewport = DESKTOP, uid = 'u1', nowIso = null, cookies = true } = {}) {
    const t = await ctx.newPage();
    await t.setViewport(viewport);
    t.alerts = []; t.errs = [];
    t.on('dialog', d => { t.alerts.push(d.message()); d.dismiss(); });
    t.on('pageerror', e => t.errs.push(e.message));
    if (nowIso) await t.evaluateOnNewDocument(iso => {
      const Real = Date, fixed = new Real(iso).getTime();
      class Fake extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
      window.Date = Fake;
    }, nowIso);
    if (!cookies) await t.evaluateOnNewDocument(() => { try { localStorage.setItem('clpeasy-cookie-consent', 'accepted'); } catch (e) {} });
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(uid) });
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
  const indicator = t => t.evaluate(() => {
    const el = document.getElementById('clp-checkout-indicator');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { visible: !el.hidden && r.width > 0, label: el.getAttribute('aria-label'), text: el.textContent.trim(), tag: el.tagName, type: el.type,
      rect: { l: r.left, r: r.right, t: r.top, b: r.bottom } };
  });
  const summary = t => t.evaluate(() => ({
    plan: document.getElementById('summary-plan-name').textContent,
    price: document.getElementById('summary-plan-price').textContent,
    promoRow: getComputedStyle(document.getElementById('summary-promo-row')).display !== 'none',
    promoLabel: document.querySelector('#summary-promo-row .summary-label').textContent,
    promoAmount: document.getElementById('summary-promo-amount').textContent,
    total: document.getElementById('summary-total').textContent,
    note: getComputedStyle(document.getElementById('summary-promo-note')).display !== 'none' ? document.getElementById('summary-promo-note').textContent : '',
  }));
  // Per card: [price line, offer line or null].
  const cardParts = t => t.evaluate(() => [...document.querySelectorAll('#plan-grid .plan-card')].map(c => [
    c.querySelector('.plan-price').textContent.trim(),
    c.querySelector('.plan-offer-note') ? c.querySelector('.plan-offer-note').textContent.replace(/\s+/g, ' ').trim() : null]));
  const planCards = t => t.evaluate(() => [...document.querySelectorAll('#plan-grid .plan-card')].map(card => card.textContent.replace(/\s+/g, ' ').trim()));
  const startOn = async (t, page, plan, billing) => {
    if (page === 'pricing.html') {
      await t.evaluate(b => { const btn = [...document.querySelectorAll('.toggle-btn')].find(x => x.getAttribute('onclick').includes(`'${b}'`)); setBilling(b, btn); }, billing);
      await t.evaluate(p => document.getElementById('btn-' + p).click(), plan);
    } else {
      await t.evaluate((p, b) => { setBilling(b); selectPlan(p); }, plan, billing);
      await t.click('#btn-checkout');
    }
  };
  const opensCheckout = async (t, fn) => {
    const nav = t.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await fn(); await nav;
    assert(t.url().endsWith('/__stripe_checkout'), 'Stripe Checkout opened, got ' + t.url());
  };

  try {
    // ── 2. checkout.html promotional order summary ──
    await check('checkout.html: monthly plan-choice cards show the same 2026 offer prices as the summary', async () => {
      const ctx = await browser.createBrowserContext();
      const t = await open(ctx, 'checkout.html', { nowIso: '2026-09-27T12:00:00Z', cookies: false });
      await t.evaluate(() => setBilling('monthly'));
      assert.deepStrictEqual(await cardParts(t), [
        ['£8.99/month', 'Normally £9.99/month · 10% launch offer until 31 December 2026'],
      ]);
      const style = await t.evaluate(() => {
        const n = document.querySelector('.plan-offer-note'), d = document.querySelector('.plan-desc');
        return { noteWeight: getComputedStyle(n).fontWeight, descWeight: getComputedStyle(d).fontWeight, nowrap: getComputedStyle(n.querySelector('.nowrap')).whiteSpace };
      });
      assert.deepStrictEqual(style, { noteWeight: style.descWeight, descWeight: style.descWeight, nowrap: 'nowrap' }, 'offer line uses the card text weight; end date never splits');
      await ctx.close();
    });

    for (const [name, vp] of [['desktop', DESKTOP], ['mobile', IPHONE]]) {
      await check(`checkout.html (${name}): monthly offer cards fit, the end date stays on one line, screenshot`, async () => {
        const ctx = await newCustomer();
        const t = await open(ctx, 'checkout.html', { viewport: vp, nowIso: '2026-10-01T12:00:00Z', cookies: false });
        await t.evaluate(() => setBilling('monthly'));
        const g = await t.evaluate(() => ({
          dateLines: [...document.querySelectorAll('.plan-offer-note .nowrap')].map(e => e.getClientRects().length),
          overflow: [...document.querySelectorAll('#plan-grid .plan-card')].some(c => c.scrollWidth > c.clientWidth + 1),
          hscroll: document.documentElement.scrollWidth > window.innerWidth,
        }));
        assert.deepStrictEqual(g, { dateLines: [1], overflow: false, hscroll: false });
        await t.evaluate(() => { document.getElementById('plan-grid').scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -140); });
        await t.screenshot({ path: path.join(SHOTS, `checkout-plan-cards-monthly-${name}.png`) });
        await ctx.close();
      });
    }

    await check('checkout.html: Easy Start MONTHLY summary = standard £9.99, 2026 offer −£1.00, due today £8.99/month', async () => {
      const ctx = await newCustomer();
      const t = await open(ctx, 'checkout.html', { nowIso: '2026-10-01T12:00:00Z', cookies: false });
      await t.evaluate(() => { setBilling('monthly'); selectPlan('easy_start'); });
      assert.deepStrictEqual(await summary(t), { plan: 'Easy Start Unlimited Monthly', price: '£9.99/moStandard price', promoRow: true, promoLabel: '2026 offer – 10% off', promoAmount: '−£1.00', total: '£8.99/month', note: '£8.99/month until 31 December 2026, then £9.99/month.' });
      await t.screenshot({ path: path.join(SHOTS, 'checkout-summary-easy-start-monthly-desktop.png') });
      await ctx.close();
    });
    await check('checkout.html: Easy Start Unlimited MONTHLY sends the standard monthly price (the server adds the coupon)', async () => {
      srv.lockAt = null;
      const ctx = await newCustomer();
      const t = await open(ctx, 'checkout.html', { nowIso: '2026-10-01T12:00:00Z', cookies: false });
      await t.evaluate(() => { setBilling('monthly'); selectPlan('easy_start'); });
      await opensCheckout(t, () => t.click('#btn-checkout'));
      const req = srv.requests.at(-1);
      assert.deepStrictEqual([req.priceId, req.mode, Object.keys(req).filter(k => /coupon|discount|promo/i.test(k))], [PRICES.start_m, 'subscription', []], 'no browser-chosen discount');
      await ctx.close();
    });
    await check('checkout.html (iPhone): Easy Start monthly summary readable, no horizontal scroll', async () => {
      const ctx = await newCustomer();
      const t = await open(ctx, 'checkout.html', { viewport: IPHONE, nowIso: '2026-10-01T12:00:00Z', cookies: false });
      await t.evaluate(() => { setBilling('monthly'); selectPlan('easy_start'); document.querySelector('.summary-card').scrollIntoView({ block: 'start', behavior: 'instant' }); });
      assert.strictEqual((await summary(t)).total, '£8.99/month');
      assert.strictEqual(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
      const clipped = await t.evaluate(() => [...document.querySelectorAll('.summary-card .summary-row')].filter(r => r.offsetParent && r.scrollWidth > r.clientWidth + 1).length);
      assert.strictEqual(clipped, 0, 'no clipped summary rows');
      await t.screenshot({ path: path.join(SHOTS, 'checkout-summary-easy-start-monthly-mobile.png') });
      await ctx.close();
    });
    for (const [plan, label, total] of [['easy_start', 'Easy Start Unlimited Annual', '£89.00']]) {
      await check(`checkout.html: ${label} card and summary are never discounted (due today ${total})`, async () => {
        const ctx = await newCustomer();
        const t = await open(ctx, 'checkout.html', { nowIso: '2026-10-01T12:00:00Z', cookies: false });
        await t.evaluate(p => { setBilling('annual'); selectPlan(p); }, plan);
        const s = await summary(t);
        assert.deepStrictEqual([s.plan, s.promoRow, s.total, s.note], [label, false, total, '']);
        assert(!/Standard price/.test(s.price));
        assert.deepStrictEqual(await cardParts(t), [['£89/yr', null]], 'annual card: £89, no 2026 offer');
        assert(!/launch offer|Normally|2026/.test((await planCards(t)).join(' ')), 'no promotional wording on annual cards');
        if (plan === 'easy_start') { await new Promise(r => setTimeout(r, 400)); await t.screenshot({ path: path.join(SHOTS, 'checkout-plan-cards-annual-desktop.png') }); } // after the toggle's .2s transition
        await ctx.close();
      });
    }
    await check('checkout.html: from 1 January 2027 monthly shows the standard price with no offer (same boundary as the server)', async () => {
      const ctx = await newCustomer();
      const t = await open(ctx, 'checkout.html', { nowIso: '2027-01-01T00:00:01Z', cookies: false });
      await t.evaluate(() => { setBilling('monthly'); selectPlan('easy_start'); });
      const s = await summary(t);
      assert.deepStrictEqual([s.price, s.promoRow, s.total, s.note], ['£9.99/mo', false, '£9.99', '']);
      const cards = await planCards(t);
      assert.deepStrictEqual(await cardParts(t), [['£9.99/mo', null]], '2027: standard monthly card, no offer');
      assert(!cards.join(' ').includes('launch offer'));
      await ctx.close();
    });

    // ── 3. Pricing page: icons and unchanged offer copy, desktop + iPhone ──
    for (const [name, vp] of [['desktop', DESKTOP], ['mobile', IPHONE]]) {
      await check(`pricing.html (${name}): three card icons the same height, names aligned, PAYG £4.99 / 8 downloads and monthly £8.99 offer copy (annual £89: tests/payg-pricing-checkout.js)`, async () => {
        const ctx = await newCustomer();
        const t = await open(ctx, 'pricing.html', { viewport: vp, cookies: false });
        const g = await t.evaluate(() => [...document.querySelectorAll('.card-icon')].map(e => ({ h: e.getBoundingClientRect().height, gap: e.nextElementSibling.getBoundingClientRect().top - e.getBoundingClientRect().top, svg: e.querySelector('svg') ? [e.querySelector('svg').getBoundingClientRect().width, e.querySelector('svg').getBoundingClientRect().height] : null })));
        assert(g.every(x => Math.abs(x.h - g[0].h) < 0.5), 'same icon box height: ' + JSON.stringify(g));
        assert(g.every(x => Math.abs(x.gap - g[0].gap) <= 1), 'card name sits the same distance below every icon');
        assert(g[1].svg && g[2].svg && g[1].svg[0] >= 30 && g[1].svg[0] <= 36, 'SVG icons rendered at emoji size');
        const txt = await t.evaluate(() => document.body.innerText);
        for (const s of ['8 downloads for £4.99', '5 downloads + 3 FREE', '£8.99/month until']) assert(txt.includes(s), 'missing: ' + s);
        assert.strictEqual(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
        await t.evaluate(() => document.querySelector('.cards').scrollIntoView({ block: 'start', behavior: 'instant' }));
        await t.screenshot({ path: path.join(SHOTS, `pricing-${name}.png`) });
        if (name === 'mobile') {
          for (const [sel, shot] of [['#payg', 'pricing-mobile-payg'], ['.card.featured', 'pricing-mobile-easy-start']]) {
            await t.evaluate(q => document.querySelector(q).scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
            await t.evaluate(() => window.scrollBy(0, -24));
            await t.screenshot({ path: path.join(SHOTS, shot + '.png') });
          }
        }
        await ctx.close();
      });
    }

    // ── 1. Header checkout indicator ──
    for (const page of ['pricing.html', 'checkout.html']) {
      await check(`${page}: no indicator before any checkout; after a subscription checkout is started it shows (button, aria-label), and its dialog never shows a plan, price, session or countdown`, async () => {
        srv.lockAt = null;
        const ctx = await newCustomer();
        let t = await open(ctx, page);
        assert.strictEqual((await indicator(t)).visible, false, 'hidden when no checkout is known');
        await opensCheckout(t, () => startOn(t, page, 'easy_start', 'monthly'));
        await t.close();
        t = await open(ctx, page); // customer comes back from Stripe without paying
        const ind = await indicator(t);
        assert.deepStrictEqual([ind.visible, ind.tag, ind.type, ind.label], [true, 'BUTTON', 'button', 'Checkout in progress. Show details']);
        await t.focus('#clp-checkout-indicator');
        await t.keyboard.press('Enter');
        await t.waitForSelector('.clp-cn-dialog[data-code="CHECKOUT_INDICATOR"]');
        const d = await t.evaluate(() => ({ title: document.getElementById('clp-cn-title').textContent, body: document.getElementById('clp-cn-body').textContent, button: document.querySelector('.clp-cn-btn').textContent, focused: document.activeElement === document.querySelector('.clp-cn-btn'), all: document.querySelector('.clp-cn-dialog').textContent }));
        assert.deepStrictEqual([d.title, d.body, d.button, d.focused], ['Checkout in progress', "You've recently started a secure checkout. CLPeasy allows one subscription checkout at a time for up to 5 minutes.", 'Back to plans', true]);
        assert(!/£|Easy Start|Easy Pro|Monthly|Annual|cs_|checkout\.stripe|\d+:\d\d|seconds|remaining|Return to checkout|basket/i.test(d.all), 'no plan, price, session, countdown, resume action or "basket": ' + d.all);
        await t.keyboard.press('Escape');
        assert.strictEqual(await t.evaluate(() => !document.querySelector('.clp-cn-dialog') && document.activeElement.id), 'clp-checkout-indicator', 'Escape closes; focus back on the indicator');
        await t.close(); await ctx.close();
      });
    }

    await check('indicator: desktop and iPhone screenshots; on iPhone it fits in the header without overlapping Home / Start free trial / Back to pricing or the cookie banner', async () => {
      srv.lockAt = null;
      const ctx = await newCustomer();
      for (const [page, vp, shot] of [['pricing.html', DESKTOP, 'indicator-pricing-desktop'], ['pricing.html', IPHONE, 'indicator-pricing-mobile'], ['checkout.html', IPHONE, 'indicator-checkout-mobile']]) {
        await ctx.newPage().then(p => p.goto(base + '/__stripe_checkout')).catch(() => {});
        const t = await open(ctx, page, { viewport: vp });
        await t.evaluate(() => CLPCheckoutNotice.markStarted('u1'));
        const ind = await indicator(t);
        assert.strictEqual(ind.visible, true, shot + ': visible');
        const others = await t.evaluate(() => [...document.querySelectorAll('nav a, nav button:not(#clp-checkout-indicator), #cookie-banner')].filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { n: e.textContent.trim().slice(0, 20), l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
        for (const o of others) {
          const overlap = !(ind.rect.r <= o.l || ind.rect.l >= o.r || ind.rect.b <= o.t || ind.rect.t >= o.b);
          assert(!overlap, `${shot}: indicator overlaps "${o.n}"`);
        }
        assert(ind.rect.l >= 0 && ind.rect.r <= vp.width, shot + ': inside the viewport');
        if (vp === IPHONE) assert(ind.rect.r - ind.rect.l >= 36 && ind.rect.b - ind.rect.t >= 36, shot + ': 36px tap target');
        assert.strictEqual(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, shot + ': no horizontal scroll');
        await t.screenshot({ path: path.join(SHOTS, shot + '.png') });
        if (shot === 'indicator-pricing-mobile') {
          await t.click('#clp-checkout-indicator');
          await t.waitForSelector('.clp-cn-dialog');
          await t.screenshot({ path: path.join(SHOTS, 'indicator-dialog-mobile.png') });
        }
        if (shot === 'indicator-pricing-desktop') {
          await t.click('#clp-checkout-indicator');
          await t.waitForSelector('.clp-cn-dialog');
          await t.screenshot({ path: path.join(SHOTS, 'indicator-dialog-desktop.png') });
          await t.mouse.click(5, 880);
          assert.strictEqual(await t.evaluate(() => !document.querySelector('.clp-cn-dialog')), true, 'outside click closes');
        }
        await t.close();
      }
      await ctx.close();
    });

    await check('indicator: a CHECKOUT_IN_PROGRESS refusal (checkout started elsewhere) also shows it, alongside the PR #157 dialog', async () => {
      srv.lockAt = Date.now(); // lock held by a checkout this browser never saw
      const ctx = await newCustomer();
      const t = await open(ctx, 'checkout.html');
      assert.strictEqual((await indicator(t)).visible, false);
      await startOn(t, 'checkout.html', 'easy_start', 'monthly');
      await t.waitForSelector('.clp-cn-dialog[data-code="CHECKOUT_IN_PROGRESS"]');
      assert.strictEqual(await t.evaluate(() => document.getElementById('clp-cn-title').textContent), 'Checkout already in progress', 'PR #157 dialog unchanged');
      await t.keyboard.press('Escape');
      assert.strictEqual((await indicator(t)).visible, true, 'indicator now shown');
      assert.deepStrictEqual(t.alerts, []);
      await ctx.close();
    });

    await check('indicator: hides itself once 5 minutes have passed, and never shows for a different signed-in account', async () => {
      const ctx = await newCustomer();
      let t = await open(ctx, 'pricing.html');
      await t.evaluate(() => localStorage.setItem('clpeasy_checkout_in_progress', JSON.stringify({ userId: 'u1', until: Date.now() + 1500 })));
      await t.evaluate(() => CLPCheckoutNotice.refreshIndicator());
      assert.strictEqual((await indicator(t)).visible, true);
      await new Promise(r => setTimeout(r, 1800));
      assert.strictEqual((await indicator(t)).visible, false, 'auto-hidden at expiry');
      await t.evaluate(() => localStorage.setItem('clpeasy_checkout_in_progress', JSON.stringify({ userId: 'u1', until: Date.now() + 60000 })));
      await t.close();
      t = await open(ctx, 'pricing.html', { uid: 'someone-else' });
      assert.strictEqual((await indicator(t)).visible, false, 'another account never sees it');
      await ctx.close();
    });

    await check('PAYG: opens during a subscription lock (£4.99 / 8 downloads), and never sets the indicator', async () => {
      srv.lockAt = Date.now();
      const ctx = await newCustomer();
      const t = await open(ctx, 'pricing.html');
      await opensCheckout(t, () => t.evaluate(() => startPaygCheckout()));
      assert.strictEqual(srv.requests.at(-1).productKey, 'payg_5');
      const t2 = await open(ctx, 'pricing.html');
      assert.strictEqual((await indicator(t2)).visible, false, 'PAYG does not show the subscription indicator');
      assert.deepStrictEqual([t.alerts, t2.alerts], [[], []]);
      await ctx.close();
    });

    await check('storage blocked: pages still work and the indicator simply stays hidden', async () => {
      const ctx = await newCustomer();
      const t = await ctx.newPage();
      await t.evaluateOnNewDocument(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
      await t.close();
      srv.lockAt = null;
      const t2 = await open(ctx, 'checkout.html');
      await t2.evaluate(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } }); CLPCheckoutNotice.markStarted('u1'); CLPCheckoutNotice.refreshIndicator(); });
      assert.strictEqual((await indicator(t2)).visible, false);
      assert.deepStrictEqual(t2.errs, []);
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log(`pricing/checkout UX checks passed (${passed} scenarios)`);
});
