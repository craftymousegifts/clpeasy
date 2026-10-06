// Offline tests for supabase/functions/site-link-health (checker + handler).
// Every request goes to an in-memory fake web: nothing reaches clpeasy.com,
// GOV.UK, HSE or any other real site. Supabase is stubbed via the import map.
//   deno run --no-remote --allow-env --allow-read --import-map=tests/deno/link-health-import_map.json tests/deno/site-link-health.test.ts
import { freshLh } from './stubs/link-health-supabase.ts';
import {
  CONFIG, Fetcher, checkTarget, classify, extractLinks, isForbiddenIp, normaliseUrl, runScan, unsafeReason, type Deps,
} from '../../supabase/functions/site-link-health/checker.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) passed++;
  else failures.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
}

// ── Fake web ──────────────────────────────────────────────────────
type Route = { status?: number; html?: string; location?: string; headStatus?: number; hang?: boolean; type?: string };
const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

const SITE: Record<string, Route> = {
  'https://clpeasy.com/': { html: page(`
    <nav><a href="/">Home</a> <a href="pricing.html">Pricing</a> <a href="/pricing.html">Plans</a>
    <a href="#top">Top</a> <a href="mailto:support@clpeasy.com">Email</a> <a href="tel:+440000">Call</a>
    <a href="javascript:void(0)">JS</a> <a href="https://checkout.stripe.com/c/pay/x">Pay</a>
    <a href="https://qvkosdqcryrcfbjtaxic.supabase.co/auth/v1/logout">Logout</a>
    <a href="/builder.html">Builder</a> <a href="https://www.clpeasy.com/knowledge.html">Knowledge</a>
    <a href="/og-image.png">Image</a></nav>
    <!-- <a href="https://commented.example/">ignored</a> -->
    <script>const s = '<a href="https://script.example/">x</a>';</script>
    <a href="https://example.com/ok">OK link</a>
    <a href="https://example.com/old">Old page</a>
    <a href="https://example.com/temp">Temp</a>
    <a href="https://example.com/missing">Missing</a>
    <a href="https://example.com/gone">Gone</a>
    <a href="https://nohead.example/">No HEAD</a>
    <a href="https://slow.example/">Slow</a>
    <a href="http://127.0.0.1/admin">Loopback</a>
    <a href="http://169.254.169.254/latest/meta-data/">Metadata</a>
    <a href="https://private.example/">Private DNS</a>
    <a href="https://redirect-to-private.example/">Redirects inward</a>
    <a href="http://localhost:8080/">Localhost</a>
  `) },
  'https://clpeasy.com/pricing.html': { html: page(`<a href="/">Home</a><a href="/index.html">Home again</a><a href="/pricing.html#plans">Plans</a><a href="#faq">FAQ</a><a href="pricing.html?ref=x">self query</a><a href="/knowledge.html">Knowledge (apex)</a>`) },
  'https://clpeasy.com/knowledge.html': { html: page(`<a href="https://clpeasy.com/compliance.html">Compliance</a>`) },
  'https://www.clpeasy.com/knowledge.html': { html: page(`<a href="https://clpeasy.com/compliance.html">Compliance</a>
    <a href="https://www.hse.gov.uk/clp/">HSE &amp; CLP guidance</a>`) },
  'https://clpeasy.com/compliance.html': { html: page(`<a href="/">Home</a><a href="https://www.clpeasy.com/knowledge.html">Knowledge</a>
    <a href="https://www.hse.gov.uk/clp/">HSE CLP guidance</a>
    <a href="https://www.gov.uk/guidance/opss-old">OPSS cosmetics guidance</a>
    <a href="https://www.gov.uk/guidance/moved">Moved guidance</a>
    <a href="https://www.legislation.gov.uk/slow">Legislation</a>`) },
  'https://clpeasy.com/builder.html': { html: page(`<a href="https://never-crawled.example/">x</a>`) },
  'https://clpeasy.com/pricing.html?ref=x': { html: page('') },
  'https://www.hse.gov.uk/clp/': { html: page('HSE') },
  'https://www.gov.uk/guidance/opss-old': { status: 404 },
  'https://www.gov.uk/guidance/moved': { status: 301, location: '/guidance/new-official' },
  'https://www.gov.uk/guidance/new-official': { html: page('new') },
  'https://www.legislation.gov.uk/slow': { hang: true },
  'https://example.com/ok': { html: page('ok') },
  'https://example.com/old': { status: 301, location: 'https://example.com/new' },
  'https://example.com/new': { status: 308, location: '/newer' },
  'https://example.com/newer': { html: page('new') },
  'https://example.com/temp': { status: 302, location: '/elsewhere' },
  'https://example.com/elsewhere': { html: page('x') },
  'https://example.com/missing': { status: 404 },
  'https://example.com/gone': { status: 410 },
  'https://nohead.example/': { headStatus: 405, html: page('works with GET') },
  'https://slow.example/': { hang: true },
  'https://private.example/': { html: page('should never be fetched') },
  'https://redirect-to-private.example/': { status: 301, location: 'http://10.0.0.7/internal' },
};
const DNS: Record<string, string[]> = { 'private.example': ['10.1.2.3'] };

const calls: { method: string; url: string }[] = [];
function fakeFetch(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  calls.push({ method, url });
  const r = SITE[url];
  if (!r) return Promise.reject(new TypeError('dns error: no such host'));
  if (r.hang) {
    return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  }
  const headers = new Headers({ 'content-type': r.type || 'text/html; charset=utf-8' });
  if (r.location) headers.set('location', r.location);
  const status = method === 'HEAD' && r.headStatus ? r.headStatus : (r.status ?? 200);
  return Promise.resolve(new Response(method === 'HEAD' || status === 301 || status === 302 || status === 308 ? null : (r.html ?? ''), { status, headers }));
}
const deps: Deps = {
  fetch: fakeFetch,
  resolveHost: async (h) => DNS[h] ?? ['93.184.216.34'],
  now: () => Date.now(),
  sleep: async () => {},
};
const cfg = { ...CONFIG, linkTimeoutMs: 40, pageTimeoutMs: 40, perHostGapMs: 0 };

// ── Unit checks ───────────────────────────────────────────────────
const base = 'https://clpeasy.com/faq.html';
check('relative URL resolves', (normaliseUrl('pricing.html', base) as any).url === 'https://clpeasy.com/pricing.html');
check('root-relative URL resolves', (normaliseUrl('/knowledge.html#sec', base) as any).url === 'https://clpeasy.com/knowledge.html');
check('fragment-only skipped', (normaliseUrl('#top', base) as any).skip === 'fragment');
check('same-page fragment skipped', (normaliseUrl('faq.html#q1', base) as any).skip === 'fragment');
check('mailto skipped', (normaliseUrl('mailto:a@b.c', base) as any).skip === 'mailto');
check('tel skipped', (normaliseUrl('tel:123', base) as any).skip === 'tel');
check('javascript skipped', (normaliseUrl('javascript:void(0)', base) as any).skip === 'javascript');
check('index.html normalised to /', (normaliseUrl('/index.html', base) as any).url === 'https://clpeasy.com/');
check('host lower-cased, default port dropped', (normaliseUrl('https://WWW.HSE.GOV.UK:443/clp/', base) as any).url === 'https://www.hse.gov.uk/clp/');
check('extractLinks decodes entities and ignores scripts/comments',
  JSON.stringify(extractLinks('<!-- <a href="/x">x</a> --><script>"<a href=\'/y\'>"</script><a class="b" href=\'/z?a=1&amp;b=2\'><b>Z</b> &amp; co</a><a aria-label="Icon" href="/i"><svg></svg></a>'))
    === JSON.stringify([{ href: '/z?a=1&b=2', text: 'Z & co' }, { href: '/i', text: 'Icon' }]));

for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) {
  check(`private/reserved IP rejected: ${ip}`, isForbiddenIp(ip));
}
check('public IP allowed', !isForbiddenIp('93.184.216.34') && !isForbiddenIp('2606:4700::1111'));
for (const [u, why] of [
  ['http://localhost/', 'local'], ['http://foo.localhost/', 'local'], ['http://127.0.0.1/', 'private'], ['http://[::1]/', 'private'],
  ['http://169.254.169.254/latest', 'private'], ['http://metadata.google.internal/', 'local'], ['https://private.example/', 'resolves'],
  ['ftp://example.com/', 'scheme'], ['https://user:pw@example.com/', 'credentials'], ['https://example.com:8443/', 'port'], ['http://2130706433/', 'private'],
] as const) {
  const r = await unsafeReason(u, deps);
  check(`SSRF rejected: ${u}`, !!r && r.includes(why), r);
}
check('SSRF allows normal public URL', (await unsafeReason('https://www.gov.uk/x', deps)) === null);

// HEAD rejected (405) then GET succeeds
{
  const f = new Fetcher(deps, cfg);
  const o = await checkTarget('https://nohead.example/', f, deps);
  check('HEAD 405 then GET 200 → healthy', o.status === 200 && o.method === 'GET' && classify(o, false, 0, cfg).health === 'HEALTHY', o);
}
// Transient failure handling
{
  const timeout = { status: null, finalUrl: 'x', chain: [], redirectCount: 0, permanent: false, error: 'timeout after 10s', method: 'GET' as const };
  check('single timeout is WARNING, not BROKEN', classify(timeout, false, 0, cfg).health === 'WARNING');
  check('second consecutive failure still WARNING', classify(timeout, false, 1, cfg).health === 'WARNING');
  check('third consecutive failure → BROKEN', classify(timeout, false, 2, cfg).health === 'BROKEN');
  check('regulatory repeated failure → REVIEW_REQUIRED', classify(timeout, true, 2, cfg).health === 'REVIEW_REQUIRED');
  const s503 = { ...timeout, status: 503, error: null };
  check('503 once is WARNING', classify(s503, false, 0, cfg).health === 'WARNING');
  const s429 = { ...timeout, status: 429, error: null };
  check('429 once is WARNING', classify(s429, false, 0, cfg).health === 'WARNING');
}

// ── Full crawl + check against the fake web ─────────────────────
calls.length = 0;
const scan = await runScan(deps, new Map(), cfg);
const R = (u: string) => scan.results.get(u);

check('crawled public pages only, each once (www and apex de-duplicated)',
  JSON.stringify([...scan.pagesScanned].sort()) === JSON.stringify(['https://clpeasy.com/', 'https://clpeasy.com/compliance.html', 'https://clpeasy.com/pricing.html', 'https://www.clpeasy.com/knowledge.html']),
  scan.pagesScanned);
const pageGets = (u: string) => calls.filter((c) => c.method === 'GET' && c.url === u).length;
check('crawler loop prevention: home page fetched once as a page (+ at most once as a target)', pageGets('https://clpeasy.com/') <= 2, pageGets('https://clpeasy.com/'));
check('app page builder.html checked as target but not crawled', R('https://clpeasy.com/builder.html')?.health === 'HEALTHY' && !calls.some((c) => c.url === 'https://never-crawled.example/'));
check('query-string pages not crawled', !scan.pagesScanned.includes('https://clpeasy.com/pricing.html?ref=x'));
check('mailto/tel/javascript/fragment never requested', !calls.some((c) => /^(mailto|tel|javascript):|#/.test(c.url)));
check('Stripe checkout and Supabase endpoints never requested', !calls.some((c) => /stripe\.com|supabase\.co/.test(c.url)));
check('binary asset links not checked', !calls.some((c) => c.url.endsWith('.png')));
check('commented-out and script links ignored', !calls.some((c) => /commented|script\.example/.test(c.url)));
check('no request ever made to a private/loopback/metadata address',
  !calls.some((c) => /127\.0\.0\.1|169\.254|10\.0\.0\.7|localhost|^https:\/\/private\.example/.test(c.url)), calls.filter((c) => /127|169|10\.0|localhost|\/\/private/.test(c.url)));

const dupTargets = scan.occurrences.filter((o) => o.targetUrl === 'https://clpeasy.com/pricing.html' && o.sourceUrl === 'https://clpeasy.com/');
check('duplicate link on same page stored once', dupTargets.length === 1, dupTargets);
const hseOcc = scan.occurrences.filter((o) => o.targetUrl === 'https://www.hse.gov.uk/clp/').map((o) => o.sourcePage).sort();
check('same target on two pages keeps both source pages', JSON.stringify(hseOcc) === JSON.stringify(['/compliance.html', '/knowledge.html']), hseOcc);
check('duplicate target checked only once', calls.filter((c) => c.url === 'https://www.hse.gov.uk/clp/').length === 1);
check('anchor text recorded', scan.occurrences.some((o) => o.linkText === 'HSE & CLP guidance'));
check('regulatory domain flagged', scan.occurrences.find((o) => o.targetUrl === 'https://www.hse.gov.uk/clp/')?.authorityType === 'regulatory');
check('internal/external flagged', scan.occurrences.find((o) => o.targetUrl === 'https://example.com/ok')?.linkType === 'external'
  && scan.occurrences.find((o) => o.targetUrl === 'https://clpeasy.com/compliance.html')?.linkType === 'internal');

check('healthy 200', R('https://example.com/ok')?.health === 'HEALTHY');
const old = R('https://example.com/old');
check('301→308 to healthy page → REDIRECTED with safe replacement',
  old?.health === 'REDIRECTED' && old.replacementUrl === 'https://example.com/newer' && old.outcome.redirectCount === 2 && old.note === 'Safe replacement available', old);
const temp = R('https://example.com/temp');
check('302 temporary → REDIRECTED, no replacement suggested', temp?.health === 'REDIRECTED' && temp.replacementUrl === null, temp);
check('404 → BROKEN', R('https://example.com/missing')?.health === 'BROKEN' && R('https://example.com/missing')?.outcome.status === 404);
check('410 → BROKEN', R('https://example.com/gone')?.health === 'BROKEN');
check('404 confirmed with GET before marking broken', calls.some((c) => c.method === 'GET' && c.url === 'https://example.com/missing'));
check('HEAD rejected then GET succeeds (crawl)', R('https://nohead.example/')?.health === 'HEALTHY');
const slow = R('https://slow.example/');
check('timeout → WARNING with failure count 1', slow?.health === 'WARNING' && slow.failureCount === 1 && /timeout/.test(slow.note), slow);
check('timeout retried once (HEAD + 2×GET)', calls.filter((c) => c.url === 'https://slow.example/').length === 3);
const opss = R('https://www.gov.uk/guidance/opss-old');
check('regulatory 404 → REVIEW_REQUIRED, review flag, no replacement',
  opss?.health === 'REVIEW_REQUIRED' && opss.reviewRequired && opss.replacementUrl === null && /manual verification/.test(opss.note), opss);
const moved = R('https://www.gov.uk/guidance/moved');
check('regulatory redirect recorded but NOT offered as replacement, still needs review',
  moved?.health === 'REDIRECTED' && moved.outcome.finalUrl === 'https://www.gov.uk/guidance/new-official' && moved.replacementUrl === null && moved.reviewRequired, moved);
check('regulatory single timeout is WARNING (not review yet)', R('https://www.legislation.gov.uk/slow')?.health === 'WARNING');
check('literal loopback link not fetched, WARNING', R('http://127.0.0.1/admin')?.health === 'WARNING' && /blocked/.test(R('http://127.0.0.1/admin')!.note));
check('metadata link not fetched, WARNING', /blocked/.test(R('http://169.254.169.254/latest/meta-data/')?.note || ''));
check('private DNS link not fetched', /blocked/.test(R('https://private.example/')?.note || ''));
check('redirect into private network blocked', /blocked/.test(R('https://redirect-to-private.example/')?.note || ''));
check('UA identifies CLPeasy', CONFIG.userAgent.startsWith('CLPeasyLinkHealth/'));
check('scan not partial', scan.partial === false, scan.errors);

// Max-page guard
{
  const loopSite = { ...cfg, maxPages: 2 };
  const s = await runScan(deps, new Map(), loopSite);
  check('maxPages guard stops crawl and marks run partial', s.pagesScanned.length === 2 && s.partial);
}

// ── Handler (auth, manual run, persistence) ─────────────────────
Deno.env.set('SUPABASE_URL', 'http://offline.invalid');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({});
const lh = freshLh();
// deno-lint-ignore no-explicit-any
(globalThis as any).__lh = lh;
lh.users['admin-token'] = { id: 'u-admin', email: 'Michaela.Feeley@googlemail.com' };
lh.users['customer-token'] = { id: 'u-cust', email: 'buyer@example.com' };
const mod = await import('../../supabase/functions/site-link-health/index.ts');
mod.runtime.deps = { ...deps, fetch: fakeFetch };
// Use the fast test config inside the handler too.
Object.assign(CONFIG, { linkTimeoutMs: 40, pageTimeoutMs: 40, perHostGapMs: 0 });

const call = (init: { method?: string; headers?: Record<string, string>; body?: unknown; qs?: string }) =>
  mod.handler(new Request('http://offline.invalid/functions/v1/site-link-health' + (init.qs || ''), {
    method: init.method || 'POST', headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }));

let res = await call({ body: { action: 'run' } });
check('unauthenticated manual run rejected (401)', res.status === 401);
res = await call({ headers: { Authorization: 'Bearer customer-token' }, body: { action: 'run' } });
check('signed-in customer cannot run (403)', res.status === 403);
res = await call({ headers: { Authorization: 'Bearer anon-key' }, body: { action: 'run' } });
check('public anon key cannot run (403)', res.status === 403);
res = await call({ headers: { 'x-link-health-token': 'wrong'.repeat(10) }, body: { action: 'run' } });
check('wrong cron token rejected (403)', res.status === 403);
res = await call({ method: 'GET', qs: '?action=results' });
check('unauthenticated results rejected (401)', res.status === 401);
res = await call({ method: 'GET', qs: '?action=results', headers: { Authorization: 'Bearer customer-token' } });
check('customer cannot read results (403)', res.status === 403);
res = await call({ headers: { 'x-link-health-token': lh.cronToken }, body: { action: 'results' } });
check('cron token cannot read results (403)', res.status === 403);
check('no run was started by rejected calls', lh.tables.link_check_runs.length === 0);
res = await call({ method: 'OPTIONS' });
check('CORS preflight ok', res.status === 200);

calls.length = 0;
res = await call({ headers: { Authorization: 'Bearer admin-token' }, body: { action: 'run', url: 'http://169.254.169.254/', target: 'https://attacker.example/' } });
let body = await res.json();
check('admin manual run accepted (202)', res.status === 202 && body.started === true && body.trigger === 'manual', body);
check('browser-supplied URLs ignored', !calls.some((c) => /attacker\.example|169\.254\.169\.254\/$/.test(c.url)));
const run1 = lh.tables.link_check_runs[0];
check('run row completed with counts', run1.status === 'completed' && run1.pages_scanned === 4 && run1.broken_count === 2 && run1.review_required_count === 2 && run1.links_checked > 15, run1);
const rowsFor = (u: string) => lh.tables.site_links.filter((r) => r.target_url === u);
check('site_links has one row per source page', rowsFor('https://www.hse.gov.uk/clp/').length === 2);
const opssRow = rowsFor('https://www.gov.uk/guidance/opss-old')[0];
check('regulatory failure persisted as REVIEW_REQUIRED with source page, anchor text, HTTP result',
  opssRow.health_status === 'REVIEW_REQUIRED' && opssRow.review_required === true && opssRow.source_page === '/compliance.html'
  && opssRow.link_text === 'OPSS cosmetics guidance' && opssRow.http_status === 404 && opssRow.first_failed_at && opssRow.replacement_url === null, opssRow);
const oldRow = rowsFor('https://example.com/old')[0];
check('redirect persisted with final URL + replacement', oldRow.health_status === 'REDIRECTED' && oldRow.final_url === 'https://example.com/newer' && oldRow.replacement_url === 'https://example.com/newer' && oldRow.redirect_permanent === true);
check('healthy row has last_healthy_at and no error', rowsFor('https://example.com/ok')[0].last_healthy_at && rowsFor('https://example.com/ok')[0].last_error === null);
const hist1 = lh.tables.link_check_history.length;
check('history recorded for first observations', hist1 === scan.results.size, { hist1, n: scan.results.size });

res = await call({ headers: { Authorization: 'Bearer admin-token' }, body: { action: 'run' } });
body = await res.json();
check('second manual run within 10 minutes refused (429)', res.status === 429 && body.reason === 'too_soon');
lh.tables.link_check_runs.push({ id: 'stuck', trigger: 'scheduled', started_at: new Date().toISOString(), status: 'running' });
res = await call({ headers: { 'x-link-health-token': lh.cronToken }, body: { action: 'run' } });
check('overlapping run refused while one is running (409)', res.status === 409);
lh.tables.link_check_runs.find((r) => r.id === 'stuck')!.started_at = new Date(Date.now() - 16 * 60000).toISOString();

// Scheduled run: stuck run is cleared, statuses mostly unchanged → only transitions logged.
const firstFailed = opssRow.first_failed_at;
res = await call({ headers: { 'x-link-health-token': lh.cronToken }, body: { action: 'run', trigger: 'manual' } });
body = await res.json();
check('cron run accepted and recorded as scheduled (body trigger ignored)', res.status === 202 && body.trigger === 'scheduled', body);
check('stuck run marked failed', lh.tables.link_check_runs.find((r) => r.id === 'stuck')!.status === 'failed');
check('unchanged statuses add no history rows', lh.tables.link_check_history.length === hist1, lh.tables.link_check_history.slice(hist1));
const slowRow = rowsFor('https://slow.example/')[0];
check('second consecutive timeout → failure_count 2, still WARNING', slowRow.failure_count === 2 && slowRow.health_status === 'WARNING', slowRow);
check('first_failed_at preserved across scans', rowsFor('https://www.gov.uk/guidance/opss-old')[0].first_failed_at === firstFailed);

res = await call({ method: 'GET', qs: '?action=results', headers: { Authorization: 'Bearer admin-token' } });
body = await res.json();
check('admin can read results', res.status === 200 && body.runs.length === 3 && body.links.length > 15 && body.last_scheduled?.trigger === 'scheduled', { s: res.status });
res = await call({ method: 'GET', qs: '?action=run', headers: { Authorization: 'Bearer admin-token' } });
check('GET cannot start a run', res.status === 400);
check('service-role client used only server-side', lh.clients.some((c) => c.key === 'service-key'));

console.log(`site-link-health: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log('FAIL ' + f);
  Deno.exit(1);
}
