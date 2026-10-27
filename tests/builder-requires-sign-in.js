// The Label Builder requires sign-in (founder decision, Oct 2026).
//   - signed out → auth.html?mode=signup&next=builder.html, Builder hidden;
//   - a saved-label link (?label=<uuid>) survives sign-in; anything else in
//     the query is dropped and auth.html still refuses open redirects;
//   - if the session cannot be checked (library missing, getSession fails)
//     there is no guest fallback;
//   - a repeat bounce shows a sign-in message instead of looping;
//   - signed-in customers stay on the Builder;
//   - the Builder is out of the sitemap and marked noindex.
// Desktop 1280 and iPhone 390. Local server, every external request stubbed.
//   node tests/builder-requires-sign-in.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const { MOCK: SIGNED_IN } = require('./helpers/signed-in-builder-mock');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP builder-requires-sign-in browser checks: puppeteer not installed'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),rpc:async()=>({data:null,error:null})})};';
const THROWS = 'window.supabase={createClient:()=>({auth:{getSession:async()=>{throw new Error("network")},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};';
const LABEL = '3f2a9c4e-1b7d-4e8a-9c3f-5d6e7f8a9b0c';

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
  // Static checks: sitemap and indexing.
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert(!/builder/.test(sitemap), 'sitemap must not list the Builder');
  const builderSrc = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
  assert(/<meta name="robots" content="noindex, follow">/.test(builderSrc.slice(0, 2000)), 'Builder head carries noindex, follow');
  ok('Builder removed from sitemap.xml and marked noindex, follow');

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });

  async function open(url, supabaseBody, width, ctx) {
    const context = ctx || await browser.createBrowserContext();
    const p = await context.newPage();
    await p.setViewport({ width, height: 900 });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.dismiss());
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return supabaseBody === null ? r.respond({ status: 503, body: '' }) : r.respond({ status: 200, contentType: 'text/javascript', body: supabaseBody });
      if (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await p.goto(base + url, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    return { p, context, errors };
  }
  const where = p => p.evaluate(() => location.pathname + location.search);

  for (const width of [1280, 390]) {
    // 1. Signed out → registration, Builder never usable.
    let { p, context } = await open('/builder.html', SIGNED_OUT, width);
    assert.strictEqual(await where(p), '/auth.html?mode=signup&next=builder.html', 'signed out goes to registration');
    const tab = await p.evaluate(() => ({ title: document.getElementById('auth-title').textContent, signinTab: !!document.getElementById('tab-signin') }));
    assert.strictEqual(tab.title, 'Create your account');
    assert(tab.signinTab, 'existing customers can switch to Sign in');
    await context.close();
    ok(`${width}px: signed-out visitor is sent to registration (Sign in tab available)`);

    // 2. Signed in → stays on the Builder, Step 1 usable.
    ({ p, context } = await open('/builder.html', SIGNED_IN, width));
    assert.strictEqual(await where(p), '/builder.html');
    const st = await p.evaluate(() => ({ user: !!currentUser, visible: getComputedStyle(document.documentElement).visibility, step: approvedBuilderStep, signinHidden: getComputedStyle(document.getElementById('nav-signin')).display === 'none' }));
    assert.deepStrictEqual(st, { user: true, visible: 'visible', step: 1, signinHidden: true });
    await p.screenshot({ path: path.join(ROOT, 'qa-artifacts', `builder-signed-in-${width}.png`) }).catch(() => {});
    await context.close();
    ok(`${width}px: signed-in customer stays on the Builder at Step 1`);
  }

  // 3. Saved-label link preserved; tampered ones reduced to the plain Builder.
  let r = await open('/builder.html?label=' + LABEL, SIGNED_OUT, 1280);
  assert.strictEqual(await where(r.p), '/auth.html?mode=signup&next=' + encodeURIComponent('builder.html?label=' + LABEL));
  await r.context.close();
  r = await open('/builder.html?label=' + LABEL + '&x=1', SIGNED_OUT, 1280);
  assert.strictEqual(await where(r.p), '/auth.html?mode=signup&next=' + encodeURIComponent('builder.html?label=' + LABEL), 'only the label id is carried, other parameters dropped');
  await r.context.close();
  for (const bad of ['javascript:alert(1)', LABEL.toUpperCase() + 'X', '../account', '%22%3E%3Cscript%3E']) {
    r = await open('/builder.html?label=' + bad, SIGNED_OUT, 1280);
    assert.strictEqual(await where(r.p), '/auth.html?mode=signup&next=builder.html', 'unsafe label value dropped: ' + bad);
    await r.context.close();
  }
  ok('saved-label link (?label=<uuid>) carried to sign-in; other values dropped');

  // 4. auth.html sends a signed-in customer back to that label, and still
  //    refuses anything outside the allow-list.
  const cases = [
    ['builder.html?label=' + LABEL, '/builder.html?label=' + LABEL],
    ['builder.html?label=' + LABEL + '&open=1', '/builder.html'],
    ['builder.html?label=not-a-uuid', '/builder.html'],
    ['builder.html?label=' + LABEL + '#x', '/builder.html'],
    ['https://evil.example/builder.html?label=' + LABEL, '/builder.html'],
    ['//evil.example/builder.html', '/builder.html'],
    ['dashboard.html', '/dashboard.html'],
  ];
  for (const [next, expected] of cases) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setRequestInterception(true);
    p.on('request', q => {
      const u = q.url();
      if (u.includes('supabase-js')) return q.respond({ status: 200, contentType: 'text/javascript', body: SIGNED_IN });
      if (u.startsWith(base + '/')) return q.continue();
      return q.respond({ status: 204, body: '' });
    });
    await p.goto(base + '/auth.html?next=' + encodeURIComponent(next), { waitUntil: 'load' });
    await p.waitForFunction(() => !/auth\.html/.test(location.pathname), { timeout: 10000 });
    assert.strictEqual(await p.evaluate(() => location.pathname + location.search), expected, 'auth.html next=' + next);
    await ctx.close();
  }
  ok('auth.html returns signed-in customers to the saved label; open-redirect protection unchanged');

  // 5. Fail closed: no sign-in library, or the session check fails.
  r = await open('/builder.html', null, 1280);
  assert.strictEqual(await where(r.p), '/auth.html?mode=signup&next=builder.html', 'library missing: no guest access');
  await r.context.close();
  r = await open('/builder.html', THROWS, 390);
  assert.strictEqual(await where(r.p), '/auth.html?mode=signup&next=builder.html', 'session check failed: no guest access');
  await r.context.close();
  ok('if sign-in cannot be verified (library missing or session check fails) there is no guest access');

  // 6. Loop guard: a second bounce within a minute shows a sign-in message.
  r = await open('/builder.html', THROWS, 390);
  // Same tab (sessionStorage is per tab): the first redirect landed on
  // auth.html; returning to the Builder at once is the second bounce.
  await r.p.goto(base + '/builder.html', { waitUntil: 'load' });
  await new Promise(res => setTimeout(res, 1200));
  const guard = await r.p.evaluate(() => ({ path: location.pathname, text: document.body.innerText, form: !!document.getElementById('scent-name'), links: [...document.querySelectorAll('a')].map(a => a.textContent + ' ' + a.getAttribute('href')) }));
  assert.strictEqual(guard.path, '/builder.html');
  assert(/Please sign in to continue/.test(guard.text) && !guard.form, 'message shown, Builder removed');
  assert.deepStrictEqual(guard.links, ['Create account auth.html?mode=signup&next=builder.html', 'Sign in auth.html?mode=signin&next=builder.html']);
  await r.p.screenshot({ path: path.join(ROOT, 'qa-artifacts', 'builder-sign-in-message-390.png') }).catch(() => {});
  await r.context.close();
  ok('repeat bounce shows "Please sign in to continue" with Create account / Sign in links instead of looping');

  await browser.close();
  server.close();
  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
