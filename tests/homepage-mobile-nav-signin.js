// Homepage mobile navigation: "Sign in" must reach the sign-in page.
//
// Regression for the PR #156 v15/v16 iPhone Safari failure: the mobile menu
// opened and showed "Sign in", but tapping (or press-and-holding) it did
// nothing. v16 made Sign in a same-tab link and stopped hiding the menu
// inside the click; iPhone Safari still failed. v17 removes the panel-level
// structure instead: the panel is no longer a second position:fixed layer
// that is its own scroll container (overflow-y:auto + max-height in vh), and
// no menu link or the panel has any click/touch handler -- links are plain
// native <a href> elements.
//
// Real Chromium with iPhone emulation (touch). WebKit itself is not
// available in this environment, so these checks pin down the page
// STRUCTURE iOS depends on (no fixed scroll-container ancestor, no
// listeners, no pointer-events/pseudo-element interference) plus the tap.
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/homepage-mobile-nav-signin.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── Static checks (always run) ─────────────────────────────────────
const menuHtml = (HTML.match(/<div class="nav-mobile-menu" id="nav-mobile-menu"[^>]*>([\s\S]*?)<\/div>\s*\n\s*<script>/) || [])[1];
assert(menuHtml, 'mobile menu markup found');
const signin = (menuHtml.match(/<a [^>]*href="auth\.html\?mode=signin"[^>]*>Sign in<\/a>/) || [])[0];
assert.strictEqual(signin, '<a href="auth.html?mode=signin">Sign in</a>', 'mobile Sign in is a plain native link (href only)');
const css = (HTML.match(/\n  \.nav-mobile-menu \{([\s\S]*?)\}/) || [])[1];
assert(css, '.nav-mobile-menu rule found');
assert(!/position:\s*fixed/.test(css), 'menu panel is not a position:fixed layer');
assert(!/overflow(-y)?:\s*(auto|scroll)/.test(css), 'menu panel is not its own scroll container');
assert(!/max-height/.test(css), 'menu panel has no vh max-height');
assert(!/\.nav-mobile-menu[^{]*::(before|after)/.test(HTML), 'no pseudo-elements on the menu or its links');
assert(!/getElementById\('nav-mobile-menu'\)\.addEventListener\('click'/.test(HTML), 'no click handler on the menu panel');
console.log('PASS: static: plain native Sign in link; panel not fixed / not a scroll container / no pseudo-elements / no click handler');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP homepage-mobile-nav-signin browser checks: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP homepage-mobile-nav-signin browser checks: no Chromium available'); process.exit(0); }

const IPHONE = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
        res.end(data);
      });
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openHome(browser, base, emulate) {
  const page = await browser.newPage();
  if (emulate) await page.emulate(emulate); else await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', r => (r.url().startsWith(base) ? r.continue() : r.abort()));
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  return page;
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false;
  const check = async (name, fn) => {
    try { await fn(); console.log('PASS:', name); } catch (e) { failed = true; console.log('FAIL:', name, '\n ', e.message); }
  };
  try {
    for (const [label, vp] of [['iPhone 390x664 (Safari toolbars shown)', { width: 390, height: 664 }], ['iPhone SE 375x548', { width: 375, height: 548 }]]) {
      await check(`${label}: menu opens under the header even after scrolling; Sign in has no fixed/scroll-container ancestor, no listeners, and a tap loads the sign-in page in the same tab`, async () => {
        const page = await openHome(browser, base, { viewport: Object.assign({ deviceScaleFactor: 3, isMobile: true, hasTouch: true }, vp), userAgent: IPHONE.userAgent });
        await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' })); // the page uses smooth scrolling
        await page.tap('#nav-mobile-toggle');
        const place = await page.evaluate(() => ({
          hidden: document.getElementById('nav-mobile-menu').hasAttribute('hidden'),
          menuTop: Math.round(document.getElementById('nav-mobile-menu').getBoundingClientRect().top),
          navBottom: Math.round(document.querySelector('nav').getBoundingClientRect().bottom),
        }));
        assert.strictEqual(place.hidden, false, 'menu opens');
        assert.strictEqual(place.menuTop, place.navBottom, 'menu sits directly under the header at the current scroll position');

        const chain = await page.evaluate(() => {
          const a = [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in');
          const bad = [];
          for (let el = a; el && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (cs.pointerEvents === 'none') bad.push(el.tagName + ' pointer-events:none');
            if (el !== a && cs.position === 'fixed') bad.push(el.tagName + '#' + el.id + ' position:fixed');
            if (/(auto|scroll)/.test(cs.overflowY) && el !== document.body) bad.push(el.tagName + '#' + el.id + ' overflow-y:' + cs.overflowY);
          }
          const pseudo = ['::before', '::after'].map(p => getComputedStyle(a, p).content).filter(c => c && c !== 'none' && c !== 'normal');
          return { bad, pseudo, attrs: [...a.attributes].map(x => x.name) };
        });
        assert.deepStrictEqual(chain, { bad: [], pseudo: [], attrs: ['href'] }, 'plain link, no fixed / scroll-container / pointer-events:none ancestor, no pseudo-elements');

        const cdp = await page.target().createCDPSession();
        const listenersOf = async sel => {
          const { result } = await cdp.send('Runtime.evaluate', { expression: sel });
          const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
          return listeners.map(l => l.type).filter(t => /^(click|touch|pointer|mouse)/.test(t));
        };
        assert.deepStrictEqual(await listenersOf("[...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in')"), [], 'no listeners on Sign in');
        assert.deepStrictEqual(await listenersOf("document.getElementById('nav-mobile-menu')"), [], 'no listeners on the menu panel');

        // Reach Sign in by scrolling the PAGE (no inner scroll container), then tap it.
        await page.evaluate(() => [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in').scrollIntoView({ block: 'center', behavior: 'instant' }));
        const box = await page.evaluate(() => {
          const a = [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in');
          const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
          return { x, y, onLink: document.elementFromPoint(x, y) === a };
        });
        assert.strictEqual(box.onLink, true, 'nothing overlays Sign in');
        const newTabs = [];
        const onTarget = t => { if (t.type() === 'page') newTabs.push(t.url()); };
        browser.on('targetcreated', onTarget);
        const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await page.touchscreen.tap(box.x, box.y);
        await nav;
        browser.off('targetcreated', onTarget);
        const u = new URL(page.url());
        assert.strictEqual(u.pathname + u.search, '/auth.html?mode=signin', 'same tab is now on the sign-in page');
        assert.deepStrictEqual(newTabs, [], 'no new tab was opened');
        await page.close();
      });
    }

    await check('iPhone: an in-page menu link (FAQ) closes the menu', async () => {
      const page = await openHome(browser, base, IPHONE);
      await page.tap('#nav-mobile-toggle');
      await page.evaluate(() => [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'FAQ').click());
      await page.waitForFunction(() => document.getElementById('nav-mobile-menu').hasAttribute('hidden'), { timeout: 2000 });
      const expanded = await page.$eval('#nav-mobile-toggle', b => b.getAttribute('aria-expanded'));
      assert.strictEqual(expanded, 'false', 'toggle reports closed');
      await page.close();
    });

    await check('iPhone: Escape and tapping outside still close the menu', async () => {
      const page = await openHome(browser, base, IPHONE);
      await page.tap('#nav-mobile-toggle');
      await page.keyboard.press('Escape');
      assert.strictEqual(await page.$eval('#nav-mobile-menu', m => m.hasAttribute('hidden')), true, 'Escape closes');
      await page.tap('#nav-mobile-toggle');
      await page.evaluate(() => document.querySelector('h1').click());
      assert.strictEqual(await page.$eval('#nav-mobile-menu', m => m.hasAttribute('hidden')), true, 'outside click closes');
      await page.close();
    });

    await check('desktop: mobile toggle hidden; header Sign in unchanged (new tab to auth.html?mode=signin)', async () => {
      const page = await openHome(browser, base, null);
      const r = await page.evaluate(() => {
        const t = document.getElementById('nav-mobile-toggle');
        const s = document.querySelector('.nav-signin');
        return { toggle: getComputedStyle(t).display, signinVisible: s.getClientRects().length > 0, href: s.getAttribute('href'), target: s.getAttribute('target') };
      });
      assert.deepStrictEqual(r, { toggle: 'none', signinVisible: true, href: 'auth.html?mode=signin', target: '_blank' });
      await page.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
  if (failed) process.exit(1);
  console.log('homepage mobile nav checks passed');
})().catch(e => { console.error(e); process.exit(1); });
