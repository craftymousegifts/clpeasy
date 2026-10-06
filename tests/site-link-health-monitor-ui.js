// monitor.html → Website & Regulatory Links section.
//
// Drives the REAL monitor.html in Chromium. Supabase Auth and the
// site-link-health Edge Function are intercepted (fixtures); fonts and
// analytics are blocked, so nothing leaves the machine. Proves:
//   - the existing monitor still renders (summary counts, troubleshooter,
//     action items, Refresh) with no page errors;
//   - results need an admin sign-in; a 403 sends the user back to sign-in;
//   - rows, filters, healthy toggle, safe-replacement and regulatory review
//     wording, HTML escaping, summary integration, "Check links now" states;
//   - no service-role key in the page; mobile layout has no sideways scroll.
// Writes desktop + mobile screenshots to docs/reports/site-link-health/.
//
// Needs Chromium: $PUPPETEER_EXECUTABLE_PATH, /opt/pw-browsers, or
// puppeteer's own download. Prints SKIP and exits 0 if none is available.
//   node tests/site-link-health-monitor-ui.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP site-link-health-monitor-ui: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP site-link-health-monitor-ui: no Chromium available'); process.exit(0); }

const SHOTS = path.join(ROOT, 'docs', 'reports', 'site-link-health');
fs.mkdirSync(SHOTS, { recursive: true });
const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const link = (o) => Object.assign({
  source_page: '/', source_url: 'https://clpeasy.com/', link_text: 'Link', link_type: 'external', authority_type: 'standard',
  first_seen_at: iso(-30 * DAY), last_seen_at: iso(-1 * DAY), last_checked_at: iso(-1 * DAY), http_status: 200, final_url: null,
  redirect_count: 0, redirect_permanent: null, replacement_url: null, health_status: 'HEALTHY', failure_count: 0,
  first_failed_at: null, last_healthy_at: iso(-1 * DAY), last_error: null, review_required: false,
}, o);
const LINKS = [
  link({ source_page: '/compliance.html', link_text: 'HSE CLP guidance', target_url: 'https://www.hse.gov.uk/chemical-classification/', authority_type: 'regulatory' }),
  link({ source_page: '/knowledge.html', link_text: 'HSE CLP guidance', target_url: 'https://www.hse.gov.uk/chemical-classification/', authority_type: 'regulatory' }),
  link({ source_page: '/pricing.html', link_text: 'Pricing', target_url: 'https://clpeasy.com/pricing.html', link_type: 'internal' }),
  link({ source_page: '/faq.html', link_text: 'Old guide', target_url: 'https://example.com/old-guide', http_status: 200, final_url: 'https://example.com/new-guide', redirect_count: 1, redirect_permanent: true, replacement_url: 'https://example.com/new-guide', health_status: 'REDIRECTED' }),
  link({ source_page: '/faq.html', link_text: 'Old page <img src=x onerror="window.__xss=1">', target_url: 'https://example.com/old-page', http_status: 404, health_status: 'BROKEN', failure_count: 1, first_failed_at: iso(-8 * DAY), last_healthy_at: iso(-15 * DAY), last_error: 'HTTP 404' }),
  link({ source_page: '/compliance.html', link_text: 'OPSS cosmetics guidance', target_url: 'https://www.gov.uk/guidance/old-opss', authority_type: 'regulatory', http_status: 404, health_status: 'REVIEW_REQUIRED', review_required: true, failure_count: 1, first_failed_at: iso(-1 * DAY), last_healthy_at: iso(-8 * DAY), last_error: 'HTTP 404. Regulatory link — manual verification required' }),
  link({ source_page: '/knowledge.html', link_text: 'UK CLP legislation', target_url: 'https://www.legislation.gov.uk/old', authority_type: 'regulatory', http_status: 200, final_url: 'https://www.legislation.gov.uk/new', redirect_count: 1, redirect_permanent: true, health_status: 'REDIRECTED', review_required: true }),
  link({ source_page: '/support.html', link_text: 'Slow site', target_url: 'https://slow.example/', http_status: null, health_status: 'WARNING', failure_count: 1, first_failed_at: iso(-1 * DAY), last_error: 'timeout after 10s — will re-check next scan (1/3)' }),
];
const run = (o) => Object.assign({ id: 'r1', trigger: 'scheduled', started_at: iso(-1 * DAY - 120000), completed_at: iso(-1 * DAY), status: 'completed', pages_scanned: 14, links_checked: 7, healthy_count: 2, redirected_count: 2, warning_count: 1, broken_count: 1, review_required_count: 2, error_summary: null }, o);

const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  const fnCalls = [];
  const state = { runs: [run({})], forbid: false, runningPolls: 0 };
  let checks = 0;
  const ok = (c, m) => { assert.ok(c, m); checks++; };
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => sessionStorage.setItem('clp_auth', '1'));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
      if (u.startsWith(base)) return req.continue();
      if (req.method() === 'OPTIONS') return req.respond({ status: 200, headers: cors, body: '' });
      if (u.includes('/auth/v1/token')) {
        const b = JSON.parse(req.postData() || '{}');
        if (b.password === 'right-password' || b.refresh_token) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ access_token: 'admin-jwt', refresh_token: 'rt', expires_in: 3600 }) });
        return req.respond({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error_description: 'Invalid login credentials' }) });
      }
      if (u.includes('/functions/v1/site-link-health')) {
        fnCalls.push({ method: req.method(), url: u, auth: req.headers()['authorization'], body: req.postData() || null });
        const json = (status, body) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        if (state.forbid || req.headers()['authorization'] !== 'Bearer admin-jwt') return json(403, { error: 'Not authorized' });
        if (req.method() === 'POST') {
          state.runs.unshift(run({ id: 'r2', trigger: 'manual', started_at: new Date().toISOString(), completed_at: null, status: 'running' }));
          state.runningPolls = 1;
          return json(202, { started: true, run_id: 'r2', trigger: 'manual' });
        }
        if (state.runs[0].status === 'running' && state.runningPolls-- <= 0) Object.assign(state.runs[0], { status: 'completed', completed_at: new Date().toISOString() });
        return json(200, { runs: state.runs, last_scheduled: state.runs.find(r => r.trigger === 'scheduled'), links: LINKS });
      }
      if (u.includes('/functions/v1/plausible-proxy')) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"error":"offline test"}' });
      return req.abort();
    });

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(base + '/monitor.html', { waitUntil: 'load' });
    await page.waitForFunction(() => /Last refreshed: \d/.test(document.getElementById('lastRefresh').textContent));

    // Existing monitor still works
    const baseline = await page.evaluate(() => ({ ok: +sumOk.textContent, warn: +sumWarn.textContent, alert: +sumAlert.textContent,
      svc: document.getElementById('svc-check').children.length, actions: document.querySelectorAll('.action-item').length,
      gate: getComputedStyle(document.getElementById('clp-gate')).display }));
    ok(Number.isFinite(baseline.ok) && baseline.ok > 0, 'existing summary counts render');
    ok(baseline.svc > 0, 'existing troubleshooter renders');
    ok(baseline.actions > 5, 'existing action items render');
    ok(baseline.gate === 'none', 'existing password-gate session unlock still works');

    // Signed out: sign-in form, card not counted in the summary
    ok(await page.$eval('#lh-signin-wrap', e => getComputedStyle(e).display !== 'none'), 'sign-in form shown when not signed in');
    ok(await page.$eval('#card-links', e => e.className.includes('status-info')), 'card neutral (not counted) before sign-in');
    ok(fnCalls.length === 0, 'no function call before sign-in');

    await page.type('#lh-email', 'michaela@example.com');
    await page.type('#lh-password', 'wrong');
    await page.click('#lh-signin button');
    await page.waitForFunction(() => /Sign-in failed/.test(document.getElementById('lh-signin-msg').textContent));
    ok(true, 'wrong password shows error');

    await page.$eval('#lh-password', e => { e.value = ''; });
    await page.type('#lh-password', 'right-password');
    await page.click('#lh-signin button');
    await page.waitForFunction(() => document.getElementById('lh-n-checked').textContent === '7');
    ok(fnCalls[0].method === 'GET' && fnCalls[0].auth === 'Bearer admin-jwt', 'results requested with the admin token');

    const stats = await page.evaluate(() => ['checked', 'healthy', 'redirected', 'warning', 'broken', 'review'].map(k => document.getElementById('lh-n-' + k).textContent).join(','));
    ok(stats === '7,2,2,1,1,2', 'summary tiles: ' + stats);
    ok(/\d/.test(await page.$eval('#lh-last-auto', e => e.textContent)), 'last automatic check date shown');
    const rows = await page.$$eval('#lh-list .lh-row', els => els.map(e => e.innerText));
    ok(rows.length === 5, 'healthy links hidden by default (5 issue rows), got ' + rows.length);
    ok(/REVIEW REQUIRED/.test(rows[0]) && /OPSS cosmetics guidance/.test(rows[0]) && /manual verification required/.test(rows[0]) && /Last known healthy/.test(rows[0]), 'regulatory failure first and prominent');
    ok(/BROKEN/.test(rows[1]) && /HTTP 404/.test(rows[1]) && /First failed/.test(rows[1]) && /Last checked/.test(rows[1]), 'broken row shows status and dates');
    const reg = rows.find(r => /UK CLP legislation/.test(r));
    ok(/Official redirect recorded/.test(reg) && !/Safe replacement/.test(reg) && /legislation\.gov\.uk\/new/.test(reg), 'regulatory redirect recorded, not offered as a safe replacement');
    const safe = rows.find(r => /Old guide/.test(r));
    ok(/Safe replacement available: https:\/\/example\.com\/new-guide/.test(safe), 'ordinary 301 offers safe replacement');
    ok(await page.evaluate(() => !window.__xss && !document.querySelector('#lh-list img')), 'link text from the site is HTML-escaped');
    ok(await page.$eval('#card-links', e => e.className.includes('status-alert')), 'card shows action required');
    const after = await page.evaluate(() => ({ ok: +sumOk.textContent, warn: +sumWarn.textContent, alert: +sumAlert.textContent }));
    ok(after.alert === baseline.alert + 1 && after.ok === baseline.ok && after.warn === baseline.warn, 'summary: link health adds exactly one "Action required"');

    await page.screenshot({ path: path.join(SHOTS, 'monitor-links-desktop.png'), fullPage: false, clip: await page.$eval('#card-links', e => { e.scrollIntoView(); const r = e.getBoundingClientRect(); return { x: 0, y: window.scrollY + r.top - 60, width: 1280, height: Math.min(r.height + 80, 1600) }; }) });
    await page.screenshot({ path: path.join(SHOTS, 'monitor-summary-desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });

    const filterRows = async f => { await page.click(`[data-lh-filter="${f}"]`); return page.$$eval('#lh-list .lh-row', els => els.map(e => e.querySelector('.lh-tag').textContent)); };
    ok(JSON.stringify(await filterRows('broken')) === JSON.stringify(['🔴 BROKEN']), 'Broken filter');
    ok(JSON.stringify(await filterRows('warnings')) === JSON.stringify(['🟡 WARNING']), 'Warnings filter');
    ok(JSON.stringify(await filterRows('review')) === JSON.stringify(['🟠 REVIEW REQUIRED', '🟡 REDIRECTED']), 'Review required filter');
    ok((await filterRows('all')).length === 5, 'All filter');
    await page.click('#lh-healthy-toggle');
    const healthy = await page.$$eval('#lh-healthy-list .lh-row', els => els.map(e => e.innerText));
    ok(healthy.length === 2 && healthy.some(h => /\/compliance\.html/.test(h) && /\/knowledge\.html/.test(h)), 'healthy detail view lists every source page for a shared target');
    await page.click('#lh-healthy-toggle');

    // Check links now
    const before = fnCalls.length;
    await page.click('#lh-run-btn');
    await page.waitForFunction(() => /Checking/.test(document.getElementById('lh-run-state').textContent));
    ok(await page.$eval('#lh-run-btn', b => b.disabled), 'button disabled while checking');
    const post = fnCalls.slice(before).find(c => c.method === 'POST');
    ok(post && JSON.stringify(JSON.parse(post.body)) === '{"action":"run"}' && post.auth === 'Bearer admin-jwt', 'manual run sends only {action:"run"} with admin token');
    await page.waitForFunction(() => document.getElementById('lh-run-state').textContent === 'Completed', { timeout: 20000 });
    ok(!(await page.$eval('#lh-run-btn', b => b.disabled)), 'Completed state, button re-enabled');

    // Refresh still works and reloads link results
    const n = fnCalls.length;
    await page.click('.header .refresh-btn');
    await new Promise(r => setTimeout(r, 500));
    ok(fnCalls.length > n, 'Refresh also reloads link results');

    // Not authorised → back to sign-in
    state.forbid = true;
    await page.evaluate(() => window.loadLinkHealth());
    await page.waitForFunction(() => /isn.t authorised/.test(document.getElementById('lh-signin-msg').textContent), { timeout: 10000 });
    ok(await page.$eval('#card-links', e => e.className.includes('status-info')), 'a 403 signs out and returns to sign-in');

    // Mobile
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    // Switching to a mobile viewport reloads the page in Chromium: wait for the reloaded section.
    state.forbid = false;
    await page.evaluate(() => sessionStorage.setItem('clp_links_session', JSON.stringify({ access_token: 'admin-jwt', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600 })));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('lh-n-checked').textContent === '7' && /Last refreshed: \d/.test(document.getElementById('lastRefresh').textContent));
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      cols: getComputedStyle(document.querySelector('.lh-stats')).gridTemplateColumns.split(' ').length }));
    ok(m.sw <= m.iw, `mobile: no horizontal scroll (${m.sw} <= ${m.iw})`);
    ok(m.cols === 3, 'mobile: stats in 3 columns');
    await page.$eval('#card-links', e => e.scrollIntoView());
    await page.screenshot({ path: path.join(SHOTS, 'monitor-links-mobile.png'), fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, 'monitor-summary-mobile.png'), fullPage: false });

    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));

    // No service-role key or other secret in the page
    const src = fs.readFileSync(path.join(ROOT, 'monitor.html'), 'utf8');
    const roles = (src.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) || []).map(t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).role);
    ok(roles.length && roles.every(r => r === 'anon'), 'only the public anon key appears in monitor.html');
    ok(!/x-link-health-token|site_link_health_cron_token/.test(src), 'cron token name/header not referenced by the page');
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`site-link-health-monitor-ui passed (${checks} checks)`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
