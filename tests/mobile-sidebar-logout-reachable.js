// Signed-in sidebar on short iPhone screens (28 Oct 2026): the sidebar was a
// fixed full-height column with no scrolling, so on Safari views of ~664px
// or less the account card at the bottom -- and the Log out item inside it --
// was cut off and unreachable. The sidebar now scrolls when needed.
// Each signed-in page (Builder, My Labels, Dashboard, Composer, Account), at
// iPhone 390x548 and 390x664: open the menu, reach the account card,
// Log out is visible and on top, and tapping it signs out. Desktop account styling retained; Log out also visible.
//   node tests/mobile-sidebar-logout-reachable.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP mobile-sidebar-logout-reachable: puppeteer not installed'); process.exit(0); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const ROW = { id: '00000000-0000-4000-8000-0000000051de', email: 'qa-trial@example.invalid', created_at: iso(-30 * DAY), plan: 'trial', subscription_status: 'trialing',
  trial_end: iso(10 * DAY), downloads_used: 1, downloads_limit: 10, topup_credits: 0, is_pro: false, deletion_date: null, billing_cycle: null, downloads_reset_date: null };
const MOCK = `window.__signedOut=0;window.supabase={createClient:function(){var row=${JSON.stringify(ROW)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},order:function(){return this},limit:function(){return this},in:function(){return this},
  update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){var out=false;try{out=sessionStorage.getItem('qaSignedOut')==='1';}catch(e){}return {data:{session:(window.__signedOut||out)?null:{access_token:'x',user:{id:row.id,email:row.email,created_at:row.created_at,user_metadata:{}}}}}},
  getUser:async function(){return {data:{user:{id:row.id,email:row.email}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},
  signOut:async function(){window.__signedOut++;try{sessionStorage.setItem('qaSignedOut','1');}catch(e){}return {}}},
  from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const PAGES = ['builder.html', 'my-labels.html', 'dashboard.html', 'print.html', 'account.html'];

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
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!src.includes('closeProfileMenu') && !src.includes('aria-haspopup="true"'), f + ': account popup removed');
    assert(/\.sidebar\{overflow-y:auto;overscroll-behavior:contain;\}/.test(src), f + ': sidebar scroll rule present');
  }
  ok('all five signed-in pages carry the sidebar scroll rule');

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  async function open(page, vp) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport(vp);
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => d.dismiss());
    await p.evaluateOnNewDocument(() => { try { localStorage.setItem('clpeasy-cookie-consent', 'essential'); } catch (e) {} });
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
      if (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await p.goto(base + '/' + page, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    p.ctx = ctx;
    return p;
  }

  for (const h of [420, 548, 664]) {
    for (const page of PAGES) {
      const p = await open(page, { width: 390, height: h, isMobile: true, hasTouch: true });
      const tag = `${page} 390x${h}`;
      assert.strictEqual(await p.evaluate(() => location.pathname.replace(/^\//, '')), page, tag + ': signed-in page loads');
      await p.evaluate(() => { const t = document.querySelector('.sidebar-toggle-inline, .sidebar-toggle'); t && t.click(); });
      await new Promise(r => setTimeout(r, 450));
      const before = await p.evaluate(() => { const sb = document.querySelector('.sidebar'); const c = document.getElementById('sidebar-user').getBoundingClientRect(); return { open: sb.classList.contains('open'), cut: c.bottom > innerHeight, scrollable: sb.scrollHeight > sb.clientHeight }; });
      assert(before.open, tag + ': menu opens');
      // Reach the account card by scrolling the menu (as a finger swipe would).
      await p.evaluate(() => document.querySelector('.sidebar').scrollTo({ top: 1e6 }));
      await new Promise(r => setTimeout(r, 150));
      const card = await p.evaluate(() => { const e = document.getElementById('sidebar-user'); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; return { x, y, inView: q.top >= 0 && q.bottom <= innerHeight, onTop: e.contains(document.elementFromPoint(x, y)) }; });
      assert(card.inView && card.onTop, `${tag}: account card reachable (was cut: ${before.cut}, menu scrolls: ${before.scrollable})`);
      const out = await p.evaluate(() => { const b = document.querySelector('.sidebar-signout'); const q = b.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; return { x, y, visible: q.height > 0 && q.top >= 0 && q.bottom <= innerHeight, onTop: b.contains(document.elementFromPoint(x, y)), text: b.textContent.trim() }; });
      assert(out.visible && out.onTop && /Log out/.test(out.text), tag + ': Log out visible and tappable');
      await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 10000 }).catch(() => {}), p.touchscreen.tap(out.x, out.y)]);
      const after = await p.evaluate(() => ({ at: location.pathname, signedOut: sessionStorage.getItem('qaSignedOut') === '1' }));
      assert(after.signedOut, tag + ': Log out signs out');
      // Each page keeps its existing sign-out destination (Builder/Composer: sign-in page; others: homepage).
      assert(/\/(auth|index)\.html$/.test(after.at), tag + ': left the signed-in page after Log out, at ' + after.at);
      if (h === 548 && page === 'builder.html') await p.screenshot({ path: path.join(ROOT, 'qa-artifacts', 'mobile-sidebar-logout-548.png') }).catch(() => {});
      await p.ctx.close();
    }
    ok(`iPhone 390x${h}: on all five pages the account card is reachable and Log out signs out`);
  }

  // Desktop: content fits, nothing scrolls, layout unchanged.
  for (const page of PAGES) {
    const p = await open(page, { width: 1280, height: 900 });
    const d = await p.evaluate(() => { const sb = document.querySelector('.sidebar'); const c = document.getElementById('sidebar-user').getBoundingClientRect(); return { scrolls: sb.scrollHeight > sb.clientHeight, cardVisible: c.bottom <= innerHeight && c.height > 0 }; });
    assert.deepStrictEqual(d, { scrolls: false, cardVisible: true }, page + ' desktop: sidebar fits, account card visible');
    assert.deepStrictEqual(p.errs, [], page + ' desktop: no page errors');
    await p.ctx.close();
  }
  ok('desktop 1280x900: sidebars fit without scrolling; account card visible on all five pages');

  await browser.close();
  server.close();
  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
