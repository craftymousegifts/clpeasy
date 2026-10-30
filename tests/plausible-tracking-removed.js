// Plausible tracking retired (30 Oct 2026): no page loads the Plausible script,
// calls plausible() or sets plausible_ignore. The cookie notice now offers a
// single OK button that records "essential", and the Cookie Policy no longer
// offers analytics on/off buttons. Pages that used to send events (Builder
// steps, homepage guide) still work without the analytics stub.
//   node tests/plausible-tracking-removed.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP plausible-tracking-removed: puppeteer not installed'); process.exit(0); }
const { MOCK } = require('./helpers/signed-in-builder-mock');
// Signed-out visitor for the pages that show the cookie notice (auth.html sends a signed-in visitor on).
const SIGNED_OUT = MOCK.replace(/getSession:async\(\)=>\(\{data:\{session:\{.*?\}\}\}\}\)/, 'getSession:async()=>({data:{session:null}})');

let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const SITE = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f));
for (const f of SITE) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert(!/plausible\.io\/js/.test(src), f + ': no Plausible script');
  assert(!/\bplausible\s*\(/.test(src), f + ': no plausible() event calls');
  assert(!/plausible_ignore/.test(src), f + ': no plausible_ignore flag');
}
ok('no site file loads Plausible, sends Plausible events or sets plausible_ignore');

const BANNER = ['index.html', 'auth.html', 'pricing.html', 'checkout.html'];
const PAGES = [...BANNER, 'account.html', 'privacy.html', 'support.html', 'cookie-policy.html', 'builder.html', 'monitor.html'];
const NOTICE = 'We only use essential browser storage, to keep you signed in and save your labels. No analytics, advertising or tracking.';

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  async function open(page, vp) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport(vp);
    p.errs = []; p.plausibleHits = 0;
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => d.dismiss());
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (u.includes('plausible.io')) p.plausibleHits++;
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: BANNER.includes(page) ? SIGNED_OUT : MOCK });
      if (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await p.goto(base + '/' + page, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    p.ctx = ctx;
    return p;
  }

  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    for (const page of PAGES) {
      const p = await open(page, vp);
      const tag = `${page} @${vp.width}`;
      assert.strictEqual(p.plausibleHits, 0, tag + ': no request to plausible.io');
      assert.deepStrictEqual(p.errs, [], tag + ': no page errors');
      assert.strictEqual(await p.evaluate(() => typeof window.plausible), 'undefined', tag + ': no plausible stub');
      if (BANNER.includes(page)) {
        const b = await p.evaluate(() => { const el = document.getElementById('cookie-banner'); return { shown: getComputedStyle(el).display !== 'none', text: el.querySelector('p').textContent, buttons: [...el.querySelectorAll('button')].map(x => x.textContent.trim()) }; });
        assert(b.shown, tag + ': notice shown on first visit');
        assert(b.text.startsWith(NOTICE), tag + ': notice wording');
        assert.deepStrictEqual(b.buttons, ['OK'], tag + ': single OK button');
        await p.click('#cookie-banner button');
        const after = await p.evaluate(() => ({ shown: getComputedStyle(document.getElementById('cookie-banner')).display !== 'none', consent: localStorage.getItem('clpeasy-cookie-consent'), ignore: localStorage.getItem('plausible_ignore') }));
        assert.deepStrictEqual(after, { shown: false, consent: 'essential', ignore: null }, tag + ': OK hides the notice and records essential');
        await p.reload({ waitUntil: 'load' });
        assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('cookie-banner')).display), 'none', tag + ': notice stays closed');
      }
      if (page === 'cookie-policy.html') {
        const c = await p.evaluate(() => ({ choice: !!document.getElementById('analytics-choice'), buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()), text: document.body.innerText }));
        assert(!c.choice && !c.buttons.some(t => /analytics/i.test(t)), tag + ': no analytics on/off controls');
        assert(/does not use analytics, advertising or tracking cookies or scripts/.test(c.text), tag + ': no-analytics statement');
      }
      if (page === 'builder.html' && vp.width === 1280) {
        const s = await p.evaluate(() => { const before = approvedBuilderStep; nextStep(); return { before, after: approvedBuilderStep }; });
        assert.strictEqual(s.after, s.before + 1, tag + ': Next step still advances');
        assert.deepStrictEqual(p.errs, [], tag + ': no errors after Next');
      }
      if (page === 'index.html' && vp.width === 1280) {
        await p.evaluate(() => openGuide());
        assert(await p.evaluate(() => document.getElementById('setup-guide-panel').classList.contains('open')), tag + ': How it works guide still opens');
      }
      await p.ctx.close();
    }
    ok(`${vp.width}px: ${PAGES.length} pages load with no Plausible requests or page errors; notice, Cookie Policy, Builder Next and guide behave`);
  }

  await browser.close();
  server.close();
  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
