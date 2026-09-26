// Homepage mobile navigation: "Sign in" must reach the sign-in page.
//
// Regression for the PR #156 v15 iPhone Safari failure: with the mobile menu
// open, tapping "Sign in" did nothing. That link opened in a new tab and the
// menu's own click handler hid the whole menu (display:none) inside the same
// click. The fix keeps the menu rendered until after the link's navigation has
// started and makes mobile "Sign in" a same-tab link like "Start free trial".
//
// Real Chromium with iPhone emulation (touch, 390x844, iOS Safari UA). WebKit
// itself is not available in this environment, so this proves the page no
// longer does either of the two things involved, plus that the tap navigates.
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
assert(signin, 'mobile menu has a Sign in link to auth.html?mode=signin');
assert(!/target=/.test(signin), 'mobile Sign in opens in the same tab (no target attribute)');
assert(!/if \(e\.target\.tagName === 'A'\) closeMobileNav\(\);/.test(HTML), 'menu is not hidden synchronously inside the link click');
console.log('PASS: static: mobile Sign in is a same-tab link to auth.html?mode=signin; no synchronous menu hide on link click');

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
    await check('iPhone: tapping Sign in in the open mobile menu loads the sign-in page in the same tab', async () => {
      const page = await openHome(browser, base, IPHONE);
      const newTabs = [];
      const onTarget = t => { if (t.type() === 'page') newTabs.push(t.url()); };
      browser.on('targetcreated', onTarget);
      await page.tap('#nav-mobile-toggle');
      const open = await page.evaluate(() => ({
        hidden: document.getElementById('nav-mobile-menu').hasAttribute('hidden'),
        expanded: document.getElementById('nav-mobile-toggle').getAttribute('aria-expanded'),
      }));
      assert.deepStrictEqual(open, { hidden: false, expanded: 'true' }, 'menu opens');
      // Record, after the click has finished dispatching (window bubble
      // listener, added last), whether the tapped link was still rendered.
      await page.evaluate(() => {
        window.__signinRenderedAtClickEnd = null;
        window.addEventListener('click', e => {
          const a = e.target.closest && e.target.closest('a');
          if (a && a.textContent.trim() === 'Sign in') window.__signinRenderedAtClickEnd = a.getClientRects().length > 0;
        });
      });
      const hit = await page.evaluate(() => {
        const a = [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in');
        const r = a.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { onLink: el === a, inView: r.bottom <= innerHeight };
      });
      assert.deepStrictEqual(hit, { onLink: true, inView: true }, 'nothing overlays the Sign in link and it is on screen');
      const rendered = page.evaluate(() => new Promise(r => setTimeout(() => r(window.__signinRenderedAtClickEnd), 0)));
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      const box = await page.evaluate(() => {
        const a = [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'Sign in');
        const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.touchscreen.tap(box.x, box.y);
      const renderedAtClickEnd = await rendered.catch(() => 'navigated-before-read');
      await nav;
      browser.off('targetcreated', onTarget);
      const u = new URL(page.url());
      assert.strictEqual(u.pathname + u.search, '/auth.html?mode=signin', 'same tab is now on the sign-in page');
      assert.deepStrictEqual(newTabs, [], 'no new tab was opened');
      assert.notStrictEqual(renderedAtClickEnd, false, 'Sign in link was not hidden during its own click');
      await page.close();
    });

    await check('iPhone: an in-page menu link still closes the menu (after the click)', async () => {
      const page = await openHome(browser, base, IPHONE);
      await page.tap('#nav-mobile-toggle');
      const atClickEnd = await page.evaluate(() => new Promise(resolve => {
        window.addEventListener('click', () => resolve(document.getElementById('nav-mobile-menu').hasAttribute('hidden')), { once: true });
        [...document.querySelectorAll('#nav-mobile-menu a')].find(x => x.textContent.trim() === 'FAQ').click();
      }));
      assert.strictEqual(atClickEnd, false, 'menu still rendered while the click is dispatched');
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
