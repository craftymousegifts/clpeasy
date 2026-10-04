// pricing.html: signed-in visitors are never invited to "Start free trial".
//
// Same rule index.html (and knowledge.html's header) already apply: when a
// session exists, the header CTA becomes "My account" (account.html) and every
// other trial CTA becomes "Go to builder →" (builder.html), whatever the
// account state. Signed-out visitors keep the acquisition CTAs unchanged.
// While a stored session is still being confirmed the trial CTAs are hidden,
// so a signed-in visitor never sees "Start free trial" flash.
//
// Also: all four plan cards carry the same top-border plan-name pill as the
// Pay As You Go card (EASY TRIAL / PAY AS YOU GO / EASY START / EASY PRO).
//
// Real pricing.html in Chromium; supabase-js is stubbed per scenario.
// Screenshots: docs/reports/pricing-signed-in-cta/*.png
//   node tests/pricing-signed-in-cta.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'pricing-signed-in-cta');
const TOKEN_KEY = 'sb-qvkosdqcryrcfbjtaxic-auth-token'; // supabase-js v2 default storage key for this project

// ── Static: exactly the four trial CTAs are marked; plan/PAYG buttons are not ──
const HTML = fs.readFileSync(path.join(ROOT, 'pricing.html'), 'utf8');
const marked = [...HTML.matchAll(/<a [^>]*data-trial-cta[^>]*>([\s\S]*?)<\/a>/g)].map(m => m[1].replace(/&#8594;/g, '→').trim());
// 4 Oct 2026: the header CTA now comes from the shared public-nav.js (the
// page's own header link was removed), so the page itself marks three CTAs.
// The header's signed-in behaviour is checked in the browser below.
assert.deepStrictEqual(marked, ['Start free trial →', 'Start your free 14-day trial →', 'Start free trial →'], 'the three in-page trial CTAs are marked');
const BODY_NO_NAV = HTML.replace(/<nav class="public-site-nav"[\s\S]*?<\/nav>/, '');
const unmarkedTrial = [...BODY_NO_NAV.matchAll(/<a [^>]*href="auth\.html\?mode=signup"[^>]*>/g)].filter(m => !/data-trial-cta/.test(m[0]));
assert.strictEqual(unmarkedTrial.length, 0, 'every signup link in the page body is a marked trial CTA (the shared header is checked in the browser)');
assert(!/data-trial-cta[^>]*(btn-payg|btn-easy_)/.test(HTML), 'plan and PAYG buttons are not trial CTAs');
console.log('PASS: static: exactly the three in-page "Start free trial" CTAs are marked; plan and PAYG buttons untouched');
const pills = [...HTML.matchAll(/<div class="(plan-pill [a-z-]+|payg-badge-pill|pro-badge-pill)"[^>]*>([^<]*)<\/div>/g)].map(m => m[2]);
// Easy Pro was withdrawn in the Easy Start Unlimited release (no Easy Pro card).
assert.deepStrictEqual(pills, ['Easy Trial', 'Pay As You Go', 'Easy Start'], 'one plan-name pill per card, in card order');
console.log('PASS: static: one plan-name pill per card (Easy Trial, Pay As You Go, Easy Start; Easy Pro withdrawn)');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP pricing-signed-in-cta browser checks: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP pricing-signed-in-cta browser checks: no Chromium available'); process.exit(0); }

const DAY = 86400000;
const iso = ms => new Date(Date.now() + ms).toISOString();
// Account states as stored in public.profiles (see entitlement.js summarise()).
const STATES = {
  'active trial': { subscription_status: 'trialing', plan: 'free', downloads_limit: 10, trial_end: iso(5 * DAY) },
  'expired trial / no plan': { subscription_status: 'trialing', plan: 'free', downloads_limit: 10, trial_end: iso(-DAY) },
  'Easy Start': { subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 },
  'Easy Pro': { subscription_status: 'active', plan: 'easy_pro', is_pro: true, downloads_limit: 30 },
  'Pay As You Go (no subscription)': { subscription_status: 'payg', plan: 'payg', downloads_limit: 0, topup_credits: 8 },
  'ended subscription': { subscription_status: 'cancelled', plan: 'free', downloads_limit: 0 },
};

// session: null (signed out) or a user; delayMs: how long getSession takes.
const stub = ({ signedIn, profile, delayMs = 0 }) => `window.__profileReads=0;window.supabase={createClient:function(){return{
  auth:{getSession:function(){return new Promise(function(r){setTimeout(function(){r({data:{session:${signedIn ? "{access_token:'user-jwt',user:{id:'u1',email:'maker@example.test'}}" : 'null'}}})},${delayMs})})},
    onAuthStateChange:function(){return{data:{subscription:{unsubscribe:function(){}}}}}},
  from:function(t){if(t==='profiles')window.__profileReads++;var q={select:function(){return q},eq:function(){return q},maybeSingle:async function(){return{data:${JSON.stringify(profile || null)},error:null}},single:async function(){return{data:${JSON.stringify(profile || null)},error:null}}};return q;}}}};`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
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

  // storedToken: whether localStorage already holds a session (as it does for a
  // signed-in visitor before supabase-js loads). blockSupabase: CDN failure.
  async function open({ signedIn, profile, storedToken = signedIn, delayMs = 0, blockSupabase = false, viewport = DESKTOP, wait = true }) {
    const t = await browser.newPage();
    await t.setViewport(viewport);
    t.errs = [];
    t.on('pageerror', e => t.errs.push(e.message));
    await t.evaluateOnNewDocument((key, has) => {
      try { localStorage.setItem('clpeasy-cookie-consent', 'accepted'); if (has) localStorage.setItem(key, '{"access_token":"x"}'); else localStorage.removeItem(key); } catch (e) {}
    }, TOKEN_KEY, storedToken);
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return blockSupabase ? r.abort() : r.respond({ status: 200, contentType: 'text/javascript', body: stub({ signedIn, profile, delayMs }) });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/pricing.html`, { waitUntil: wait ? 'load' : 'domcontentloaded' });
    if (wait) await new Promise(r => setTimeout(r, 300 + delayMs));
    return t;
  }
  // [text, href, visible] for each trial CTA, in page order.
  // The header CTA is now built by the shared public-nav.js (.public-nav-cta);
  // the in-page trial CTAs keep data-trial-cta. A signed-in visitor must see
  // "My account" in the header, never a trial invitation.
  const ctas = t => t.evaluate(() => [...document.querySelectorAll('.public-site-nav .public-nav-cta, [data-trial-cta]')].map(a => [a.textContent.trim(), a.getAttribute('href'), getComputedStyle(a).visibility === 'visible']));
  const SIGNED_OUT = [['Start free trial →', 'auth.html?mode=signup', true], ['Start free trial →', 'auth.html?mode=signup', true], ['Start your free 14-day trial →', 'auth.html?mode=signup', true], ['Start free trial →', 'auth.html?mode=signup', true]];
  const SIGNED_IN = [['My account', 'account.html', true], ['Go to builder →', 'builder.html', true], ['Go to builder →', 'builder.html', true], ['Go to builder →', 'builder.html', true]];
  const visibleTrialInvites = t => t.evaluate(() => [...document.querySelectorAll('a,button')].filter(a => /free trial|14-day trial/i.test(a.textContent) && getComputedStyle(a).visibility === 'visible' && a.getClientRects().length).map(a => a.textContent.trim()));

  try {
    await check('signed out: acquisition CTAs unchanged (Start free trial → auth.html?mode=signup), never hidden', async () => {
      const t = await open({ signedIn: false });
      assert.deepStrictEqual(await ctas(t), SIGNED_OUT);
      assert.strictEqual(await t.evaluate(() => document.documentElement.classList.contains('clp-auth-pending')), false);
      assert.deepStrictEqual(t.errs, []);
      await t.screenshot({ path: path.join(SHOTS, 'signed-out-desktop.png') });
      await t.close();
    });

    for (const [state, profile] of Object.entries(STATES)) {
      await check(`signed in (${state}): no "Start free trial"; header "My account" → account.html, trial CTAs "Go to builder →" → builder.html; profile not read`, async () => {
        const t = await open({ signedIn: true, profile });
        assert.deepStrictEqual(await ctas(t), SIGNED_IN);
        assert.deepStrictEqual(await visibleTrialInvites(t), [], 'no visible trial invitation');
        assert.strictEqual(await t.evaluate(() => window.__profileReads), 0, 'the CTA does not depend on (or read) the account profile');
        assert.deepStrictEqual(t.errs, []);
        await t.close();
      });
    }

    await check('no flash: with a stored session and a slow session check, "Start free trial" is never visible at any point', async () => {
      const t = await open({ signedIn: true, profile: STATES['Easy Pro'], delayMs: 1500, wait: false });
      const seen = [];
      for (let i = 0; i < 12; i++) { seen.push(...await visibleTrialInvites(t)); await new Promise(r => setTimeout(r, 150)); }
      assert.deepStrictEqual(seen, [], 'never visible: ' + seen.join(', '));
      await new Promise(r => setTimeout(r, 400));
      assert.deepStrictEqual(await ctas(t), SIGNED_IN);
      await t.close();
    });

    await check('stale stored session (session check says signed out): reverts to the signed-out CTAs, visible', async () => {
      const t = await open({ signedIn: false, storedToken: true, delayMs: 300 });
      assert.deepStrictEqual(await ctas(t), SIGNED_OUT);
      await t.close();
    });

    await check('Supabase script fails to load with a stored session: signed-in CTAs shown (never left hidden)', async () => {
      const t = await open({ signedIn: true, blockSupabase: true });
      assert.deepStrictEqual(await ctas(t), SIGNED_IN);
      await t.close();
    });

    await check('Supabase script fails to load, signed out: acquisition CTAs shown and visible', async () => {
      const t = await open({ signedIn: false, blockSupabase: true });
      assert.deepStrictEqual(await ctas(t), SIGNED_OUT);
      await t.close();
    });

    await check('signed in: plan and Pay As You Go buttons unchanged', async () => {
      const t = await open({ signedIn: true, profile: STATES['active trial'] });
      const b = await t.evaluate(() => ['btn-payg', 'btn-easy_start', 'btn-easy_pro'].map(id => { const e = document.getElementById(id); return e ? [e.textContent.trim(), e.getAttribute('onclick')] : null; }));
      // Easy Pro is withdrawn from sale: no Easy Pro button.
      assert.deepStrictEqual(b, [['Buy 8 downloads — £4.99 →', 'startPaygCheckout()'], ['Get started →', "startCheckout('easy_start')"], null]);
      await t.close();
    });

    for (const [name, vp] of [['desktop', DESKTOP], ['mobile', IPHONE]]) {
      await check(`signed in (${name}): header fits, "My account" does not overlap other header controls, no horizontal scroll`, async () => {
        const t = await open({ signedIn: true, profile: STATES['Easy Start'], viewport: vp });
        // Phone width: the shared header collapses its links behind the menu toggle.
        if (name === 'mobile') { await t.click('.public-nav-toggle'); await new Promise(r => setTimeout(r, 300)); }
        const g = await t.evaluate(() => {
          const items = [...document.querySelectorAll('nav a, nav button')].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { n: e.textContent.trim(), l: r.left, r: r.right, t: r.top, b: r.bottom }; });
          return { items, vw: window.innerWidth, hscroll: document.documentElement.scrollWidth > window.innerWidth };
        });
        assert.strictEqual(g.hscroll, false, 'no horizontal scroll');
        const acct = g.items.find(i => i.n === 'My account');
        assert(acct && acct.l >= 0 && acct.r <= g.vw, 'My account visible inside the viewport');
        for (const o of g.items) if (o !== acct) assert(acct.r <= o.l || acct.l >= o.r || acct.b <= o.t || acct.t >= o.b, `overlaps "${o.n}"`);
        await t.screenshot({ path: path.join(SHOTS, `signed-in-${name}.png`) });
        if (name === 'mobile') {
          await t.evaluate(() => document.querySelector('.card').scrollIntoView({ block: 'start', behavior: 'instant' }));
          await t.screenshot({ path: path.join(SHOTS, 'signed-in-mobile-trial-card.png') });
        }
        await t.close();
      });
    }
    for (const [name, vp] of [['desktop', DESKTOP], ['mobile', IPHONE]]) {
      await check(`plan pills (${name}): EASY TRIAL / PAY AS YOU GO / EASY START, same size and type, centred on the top border, not clipped or overlapping`, async () => {
        const t = await open({ signedIn: false, viewport: vp });
        const g = await t.evaluate(() => {
          const cards = [...document.querySelectorAll('.cards > .card')];
          return {
            vw: window.innerWidth,
            hscroll: document.documentElement.scrollWidth > window.innerWidth,
            pills: cards.map((c, i) => {
              const pill = c.querySelector(':scope > .plan-pill, :scope > .payg-badge-pill, :scope > .pro-badge-pill');
              if (!pill) return null;
              const cr = c.getBoundingClientRect(), pr = pill.getBoundingClientRect(), cs = getComputedStyle(pill);
              const prev = i ? cards[i - 1].getBoundingClientRect() : null;
              const icon = c.querySelector('.card-icon').getBoundingClientRect();
              return {
                text: pill.innerText.trim(), h: pr.height, font: [cs.fontSize, cs.fontWeight, cs.letterSpacing, cs.textTransform, cs.paddingTop, cs.paddingLeft, cs.borderRadius].join(' '),
                topFromCard: +(pr.top - cr.top).toFixed(2), offsetTop: pill.offsetTop, centreOffset: Math.abs((pr.left + pr.right) / 2 - (cr.left + cr.right) / 2),
                inside: pr.left >= 0 && pr.right <= window.innerWidth, clearOfIcon: pr.bottom <= icon.top,
                // Stacked (mobile): the pill must not touch the card above it.
                clearOfPrev: !prev || prev.bottom <= cr.top - 1 ? (!prev || prev.bottom <= pr.top || prev.right <= pr.left || prev.left >= pr.right) : true,
                bg: [cs.backgroundImage !== 'none' ? 'gradient' : cs.backgroundColor, cs.boxShadow, cs.color].join(' | '),
              };
            }),
          };
        });
        assert(g.pills.every(Boolean), 'every card has a pill');
        assert.deepStrictEqual(g.pills.map(p => p.text), ['EASY TRIAL', 'PAY AS YOU GO', 'EASY START']);
        assert(g.pills.every(p => p.font === g.pills[1].font), 'same typography/padding as the PAYG pill: ' + JSON.stringify(g.pills.map(p => p.font)));
        assert(g.pills.every(p => Math.abs(p.h - g.pills[1].h) < 0.5), 'same height: ' + g.pills.map(p => p.h));
        // Same CSS position over the top border (13px above the padding edge). The
        // PAYG card's border is 2px against 1.5px on the others, so the distance
        // from the outer edge legitimately differs by the rounded border width.
        assert(g.pills.every(p => p.offsetTop === g.pills[1].offsetTop), 'same position over the top border: ' + g.pills.map(p => p.offsetTop));
        assert(g.pills.every(p => p.topFromCard < 0 && p.topFromCard > -p.h), 'straddles the top border: ' + g.pills.map(p => p.topFromCard));
        assert(g.pills.every(p => p.centreOffset < 1), 'centred on the card');
        assert(g.pills.every(p => p.inside && p.clearOfIcon && p.clearOfPrev), 'not clipped, clear of the icon and of the card above: ' + JSON.stringify(g.pills));
        assert.strictEqual(new Set(g.pills.map(p => p.bg)).size, 3, 'each plan keeps its own colour treatment (background, outline, text colour)');
        assert.strictEqual(g.hscroll, false);
        await t.evaluate(() => { document.querySelector('.cards').scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -40); });
        await t.screenshot({ path: path.join(SHOTS, `plan-pills-${name}.png`) });
        if (name === 'mobile') {
          for (const [i, shot] of [[2, 'plan-pills-mobile-easy-start']]) {
            await t.evaluate(n => { document.querySelectorAll('.cards > .card')[n].scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -60); }, i);
            await t.screenshot({ path: path.join(SHOTS, shot + '.png') });
          }
        }
        await t.close();
      });
    }
    await check('signed out (mobile): header unchanged and fits', async () => {
      const t = await open({ signedIn: false, viewport: IPHONE });
      assert.deepStrictEqual((await ctas(t))[0], SIGNED_OUT[0]);
      assert.strictEqual(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await t.screenshot({ path: path.join(SHOTS, 'signed-out-mobile.png') });
      await t.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log(`pricing signed-in CTA checks passed (${passed} scenarios)`);
});
