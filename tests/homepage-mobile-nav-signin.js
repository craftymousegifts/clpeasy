// Homepage mobile navigation: "Sign in" must reach the sign-in page.
//
// 4 Oct 2026 refresh: the homepage menu is now the shared public navigation
// (public-nav.js builds .public-site-nav / .public-nav-toggle /
// .public-nav-links; the old in-page #nav-mobile-menu markup was removed in
// cc8750c). These checks target that real structure and keep the iPhone
// lessons below: Sign in is a plain same-tab link, nothing overlays it, it has
// no listener or pointer-events:none, and no ancestor is a fixed SCROLL
// CONTAINER (the v15/v16 failure). The header itself is position:fixed with a
// non-scrolling, absolutely positioned panel; that is allowed. The panel's
// single delegated click handler (closes the menu after a tap) is current
// design; real iPhone Safari tapping is an owner device check.
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
const NAVJS = fs.readFileSync(path.join(ROOT, 'public-nav.js'), 'utf8');

// ── Static checks (always run) ─────────────────────────────────────
assert(/<script src="public-nav\.js"[^>]*><\/script>/.test(HTML), 'homepage loads the shared public navigation');
assert(/class="[^"]*public-site-nav[^"]*"/.test(HTML) && /class="public-nav-toggle"/.test(HTML) && /class="public-nav-links"/.test(HTML), 'homepage header has the shared nav, toggle and links container');
assert(!/id="nav-mobile-menu"/.test(HTML), 'the old duplicate in-page mobile menu is not reintroduced');
const signins = NAVJS.match(/<a [^>]*>Sign in<\/a>/g) || [];
assert.deepStrictEqual(signins, ['<a class="public-nav-link" href="auth.html?mode=signin">Sign in</a>'], 'exactly one Sign in: a plain same-tab link to auth.html?mode=signin');
console.log('PASS: static: shared nav present on the homepage; one plain same-tab Sign in link; old duplicate menu absent');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP homepage-mobile-nav-signin browser checks: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP homepage-mobile-nav-signin browser checks: no Chromium available'); process.exit(0); }

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.webp': 'image/webp' };
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
async function openHome(browser, base, vp, mobile) {
  const page = await browser.newPage();
  await page.emulate({ viewport: Object.assign({ deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile }, vp), userAgent: mobile ? IPHONE_UA : 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36' });
  await page.setRequestInterception(true);
  page.on('request', r => (r.url().startsWith(base) ? r.continue() : r.abort()));
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  return page;
}
const signinEl = "[...document.querySelectorAll('.public-site-nav a')].find(x => x.textContent.trim() === 'Sign in')";

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
      await check(`${label}: menu opens after scrolling; Sign in is visible, unobstructed, a plain link with no fixed scroll-container ancestor, and a tap loads the sign-in page in the same tab`, async () => {
        const page = await openHome(browser, base, vp, true);
        const closed = await page.evaluate(s => { const a = eval(s); return { visible: a.getClientRects().length > 0 }; }, signinEl);
        assert.strictEqual(closed.visible, false, 'Sign in is inside the closed menu on a phone');
        await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
        await page.tap('.public-nav-toggle');
        const st = await page.evaluate(s => {
          const nav = document.querySelector('.public-site-nav'); const a = eval(s);
          const bad = [];
          for (let el = a; el && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (cs.pointerEvents === 'none') bad.push(el.tagName + ' pointer-events:none');
            if (el !== document.body && /(auto|scroll)/.test(cs.overflowY) && (cs.position === 'fixed' || /vh/.test(cs.maxHeight))) bad.push(el.tagName + '.' + el.className + ' fixed/vh scroll container');
          }
          // A pseudo-element may only be a small decoration inside the link's own
          // box (the 2px hover underline); anything larger or outside it could
          // intercept the tap and is reported.
          const pseudo = ['::before', '::after'].map(p => { const c = getComputedStyle(a, p); return { p, content: c.content, pos: c.position, h: parseFloat(c.height) || 0, pe: c.pointerEvents }; })
            .filter(c => c.content && c.content !== 'none' && c.content !== 'normal')
            .filter(c => !(c.content === '""' && c.pos === 'absolute' && c.h <= 3 && getComputedStyle(a).position === 'relative'))
            .map(c => c.p + ' ' + c.content + ' h=' + c.h);
          return { open: nav.classList.contains('menu-open'), expanded: nav.querySelector('.public-nav-toggle').getAttribute('aria-expanded'), visible: a.getClientRects().length > 0, bad, pseudo, attrs: [...a.attributes].map(x => x.name + '=' + x.value) };
        }, signinEl);
        assert.deepStrictEqual(st, { open: true, expanded: 'true', visible: true, bad: [], pseudo: [], attrs: ['class=public-nav-link', 'href=auth.html?mode=signin'] }, 'open menu; plain same-tab link; no blocking ancestor');
        const cdp = await page.target().createCDPSession();
        const { result } = await cdp.send('Runtime.evaluate', { expression: signinEl });
        const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
        assert.deepStrictEqual(listeners.map(l => l.type).filter(t => /^(click|touch|pointer|mouse)/.test(t)), [], 'no listener on the Sign in link itself');
        await page.evaluate(s => eval(s).scrollIntoView({ block: 'center', behavior: 'instant' }), signinEl);
        const box = await page.evaluate(s => { const a = eval(s); const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return { x, y, onLink: document.elementFromPoint(x, y) === a }; }, signinEl);
        assert.strictEqual(box.onLink, true, 'nothing overlays Sign in');
        const newTabs = []; const onTarget = t => { if (t.type() === 'page') newTabs.push(t.url()); };
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

    await check('iPhone: tapping an in-page link closes the menu; Escape closes it and returns focus to the toggle', async () => {
      const page = await openHome(browser, base, { width: 390, height: 844 }, true);
      await page.tap('.public-nav-toggle');
      await page.evaluate(() => [...document.querySelectorAll('.public-site-nav a')].find(x => x.textContent.trim() === 'How it works').click());
      let s = await page.evaluate(() => ({ open: document.querySelector('.public-site-nav').classList.contains('menu-open'), exp: document.querySelector('.public-nav-toggle').getAttribute('aria-expanded') }));
      assert.deepStrictEqual(s, { open: false, exp: 'false' }, 'link tap closes the menu');
      await page.tap('.public-nav-toggle');
      await page.keyboard.press('Escape');
      s = await page.evaluate(() => ({ open: document.querySelector('.public-site-nav').classList.contains('menu-open'), exp: document.querySelector('.public-nav-toggle').getAttribute('aria-expanded'), focus: document.activeElement === document.querySelector('.public-nav-toggle') }));
      assert.deepStrictEqual(s, { open: false, exp: 'false', focus: true }, 'Escape closes');
      await page.close();
    });

    await check('desktop: toggle hidden; Sign in visible in the header as a same-tab link to auth.html?mode=signin', async () => {
      const page = await openHome(browser, base, { width: 1366, height: 900 }, false);
      const r = await page.evaluate(s => { const t = document.querySelector('.public-nav-toggle'); const a = eval(s); return { toggle: getComputedStyle(t).display, visible: a.getClientRects().length > 0, href: a.getAttribute('href'), target: a.getAttribute('target') }; }, signinEl);
      assert.deepStrictEqual(r, { toggle: 'none', visible: true, href: 'auth.html?mode=signin', target: null });
      await page.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
  if (failed) process.exit(1);
  console.log('homepage mobile nav checks passed');
})().catch(e => { console.error(e); process.exit(1); });
