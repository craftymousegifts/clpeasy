// supabase/functions/site-link-health/checker.ts
//
// Crawler + link checker for the Website & Link Health Monitor.
// Pure logic: network and DNS are injected (Deps) so the tests can run
// fully offline with fixtures. No AI, no third-party service.
//
// Safety rules implemented here:
//  - Only links DISCOVERED on CLPeasy's own public pages are ever checked;
//    nothing accepts a URL from a caller (no arbitrary-URL endpoint).
//  - SSRF guard on every request AND every redirect hop: http/https only,
//    default ports only, no credentials, no localhost/loopback/private/
//    link-local/metadata addresses (literal or DNS-resolved).
//  - Regulatory/authority links are never "replaced": a dead one becomes
//    REVIEW_REQUIRED, and an official redirect is recorded but still flagged
//    for the owner to verify. Nothing here searches for or guesses URLs.

export type Health = 'HEALTHY' | 'REDIRECTED' | 'WARNING' | 'BROKEN' | 'REVIEW_REQUIRED';

export interface Deps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  resolveHost: (host: string) => Promise<string[]>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const CONFIG = {
  startUrl: 'https://clpeasy.com/',
  siteHosts: ['clpeasy.com', 'www.clpeasy.com'],
  maxPages: 60,            // safety guard: public site is ~15 pages
  maxDepth: 4,
  maxTargets: 400,
  pageTimeoutMs: 15000,
  linkTimeoutMs: 10000,
  maxRedirects: 5,
  concurrency: 4,
  perHostGapMs: 400,       // politeness gap between requests to the same host
  maxHtmlBytes: 2_000_000,
  deadlineMs: 120_000,     // stays inside the Edge Function wall-clock limit
  brokenAfterFailures: 3,  // consecutive failed scans before a non-404 failure is BROKEN
  userAgent: 'CLPeasyLinkHealth/1.0 (+https://clpeasy.com; weekly website link check)',
};
export type Config = typeof CONFIG;

// Signed-in application / transactional pages: checked as link targets,
// but never crawled.
const NO_CRAWL_PAGES = new Set([
  '/builder', '/account', '/dashboard', '/my-labels', '/checkout', '/auth',
  '/print', '/plan-picker', '/monitor', '/packagemonitor', '/link-checker', '/scrum',
]);

// Never checked: payment, auth and backend endpoints.
const EXCLUDED_HOST_SUFFIXES = [
  'checkout.stripe.com', 'buy.stripe.com', 'billing.stripe.com', 'connect.stripe.com',
  'supabase.co', 'supabase.in', 'auth.clpeasy.com',
];

const SKIP_ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|m4v|mov|webm|avi|mp3|wav|ogg|zip|gz|tgz|rar|7z|dmg|exe|woff2?|ttf|otf|eot|css|js|json|xml|txt)$/i;

// Authority / regulatory domains (host or any subdomain). gov.uk covers
// HSE, OPSS guidance on GOV.UK, legislation.gov.uk, IPO, business.gov.uk.
export const REGULATORY_DOMAINS = [
  'gov.uk', 'ico.org.uk', 'businesscompanion.info',
  'echa.europa.eu', 'eur-lex.europa.eu', 'unece.org',
  'osha.gov', 'gov.au', 'canada.ca',
];

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

export function isRegulatoryHost(host: string): boolean {
  const h = host.toLowerCase();
  return REGULATORY_DOMAINS.some((d) => hostMatches(h, d));
}

export function isSiteHost(host: string, config: Config = CONFIG): boolean {
  return config.siteHosts.includes(host.toLowerCase());
}

// ── URL normalisation ────────────────────────────────────────────

export type Normalised = { url: string } | { skip: string };

export function normaliseUrl(href: string, base: string): Normalised {
  const raw = (href || '').trim();
  if (!raw) return { skip: 'empty' };
  if (raw.startsWith('#')) return { skip: 'fragment' };
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    if (s !== 'http' && s !== 'https') return { skip: s };
  }
  let u: URL;
  try { u = new URL(raw, base); } catch { return { skip: 'invalid' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { skip: u.protocol.replace(':', '') };
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
  if (!u.pathname) u.pathname = '/';
  if (isSiteHost(u.hostname) && /\/index\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/index\.html$/i, '');
  // Fragment-only link to the same page (e.g. "page.html#top" on page.html).
  const b = new URL(base);
  b.hash = '';
  if (/#/.test(raw) && u.href === b.href) return { skip: 'fragment' };
  return { url: u.href };
}

export function excludedTarget(url: string): string | null {
  const u = new URL(url);
  if (EXCLUDED_HOST_SUFFIXES.some((s) => hostMatches(u.hostname, s))) return 'payment/auth/backend endpoint';
  if (/(^|\/)(log-?out|sign-?out)(\.html)?$/i.test(u.pathname) || /[?&](action=)?(logout|signout)\b/i.test(u.search)) return 'auth action';
  if (SKIP_ASSET_EXT.test(u.pathname)) return 'binary/static asset';
  return null;
}

function pageKey(pathname: string): string {
  const p = pathname.replace(/\.html$/i, '').replace(/\/+$/, '');
  return p || '/';
}

export function isCrawlable(url: string, config: Config = CONFIG): boolean {
  const u = new URL(url);
  if (!isSiteHost(u.hostname, config) || u.protocol !== 'https:') return false;
  if (u.search) return false;
  if (NO_CRAWL_PAGES.has(pageKey(u.pathname))) return false;
  if (/\.[a-z0-9]+$/i.test(u.pathname) && !/\.html?$/i.test(u.pathname)) return false; // PDFs etc.
  return true;
}

// ── HTML link extraction ─────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', mdash: '—', ndash: '–', middot: '·', hellip: '…' };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

export function extractLinks(html: string): { href: string; text: string }[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ');
  const out: { href: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const href = attr(m[1], 'href');
    if (href === null) continue;
    let text = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text) text = attr(m[1], 'aria-label') || attr(m[1], 'title') || '';
    out.push({ href, text: text.slice(0, 200) });
  }
  return out;
}

// ── SSRF protection ──────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function inRange(n: number, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const b = ipv4ToInt(base)!;
  const size = 2 ** (32 - Number(bits));
  return n >= b && n < b + size;
}

const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15',
  '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

export function isForbiddenIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4ToInt(addr);
  if (v4 !== null) return BLOCKED_V4.some((c) => inRange(v4, c));
  if (!addr.includes(':')) return true; // not an IP we understand → refuse
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isForbiddenIp(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(addr)) return true; // hex-form v4-mapped
  if (addr === '::' || addr === '::1') return true;
  const first = parseInt(addr.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (addr.startsWith('64:ff9b:') || addr.startsWith('2001:db8:')) return true;
  return false;
}

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|local|internal|localdomain|home\.arpa|lan)$|^metadata(\.google\.internal)?$|^instance-data$/i;

export async function unsafeReason(url: string, deps: Deps): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return 'invalid URL'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme not allowed';
  if (u.username || u.password) return 'credentials in URL';
  if (u.port && u.port !== '80' && u.port !== '443') return 'non-standard port';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.test(host)) return 'local/internal hostname';
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    return isForbiddenIp(host) ? 'private/reserved address' : null;
  }
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return 'numeric host';
  let ips: string[];
  try { ips = await deps.resolveHost(host); } catch { return null; } // DNS failure surfaces as a fetch error
  if (ips.some(isForbiddenIp)) return 'resolves to private/reserved address';
  return null;
}

// ── Fetching (manual redirects, each hop validated) ──────────────

export interface FetchOutcome {
  status: number | null;
  finalUrl: string;
  chain: { url: string; status: number }[];
  redirectCount: number;
  permanent: boolean;      // every hop was 301/308
  error: string | null;
  method: 'HEAD' | 'GET';
  body?: string;
  contentType?: string;
}

// Politeness: requests to the same host start at least gapMs apart.
class HostGate {
  private nextSlot = new Map<string, number>();
  constructor(private deps: Deps, private gapMs: number) {}
  async wait(host: string) {
    const now = this.deps.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + this.gapMs);
    if (slot > now) await this.deps.sleep(slot - now);
  }
}

export class Fetcher {
  private gate: HostGate;
  constructor(private deps: Deps, private config: Config = CONFIG) {
    this.gate = new HostGate(deps, config.perHostGapMs);
  }

  private async one(url: string, method: 'HEAD' | 'GET', timeoutMs: number, wantBody: boolean): Promise<{ res?: Response; body?: string; error?: string }> {
    const host = new URL(url).hostname;
    await this.gate.wait(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.deps.fetch(url, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': this.config.userAgent, 'Accept': wantBody ? 'text/html,application/xhtml+xml' : '*/*' },
      });
      let body: string | undefined;
      if (wantBody && res.status >= 200 && res.status < 300 && /html/i.test(res.headers.get('content-type') || '')) {
        body = await readLimited(res, this.config.maxHtmlBytes);
      } else {
        try { await res.body?.cancel(); } catch { /* ignore */ }
      }
      return { res, body };
    } catch (e) {
      const msg = ctrl.signal.aborted ? `timeout after ${Math.round(timeoutMs / 1000)}s` : `network error: ${(e as Error)?.message || e}`;
      return { error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  async request(startUrl: string, method: 'HEAD' | 'GET', opts: { timeoutMs?: number; wantBody?: boolean } = {}): Promise<FetchOutcome> {
    const chain: { url: string; status: number }[] = [];
    let url = startUrl;
    let permanent = true;
    for (let hop = 0; hop <= this.config.maxRedirects; hop++) {
      const unsafe = await unsafeReason(url, this.deps);
      if (unsafe) return { status: null, finalUrl: url, chain, redirectCount: chain.length, permanent, error: `blocked: ${unsafe}`, method };
      const r = await this.one(url, method, opts.timeoutMs ?? this.config.linkTimeoutMs, !!opts.wantBody);
      if (!r.res) return { status: null, finalUrl: url, chain, redirectCount: chain.length, permanent, error: r.error!, method };
      const status = r.res.status;
      const loc = r.res.headers.get('location');
      if (status >= 300 && status < 400 && loc) {
        chain.push({ url, status });
        if (status !== 301 && status !== 308) permanent = false;
        let next: string;
        try { next = new URL(loc, url).href; } catch { return { status, finalUrl: url, chain, redirectCount: chain.length, permanent, error: 'invalid redirect location', method }; }
        url = next;
        continue;
      }
      return { status, finalUrl: url, chain, redirectCount: chain.length, permanent: chain.length > 0 && permanent, error: null, method, body: r.body, contentType: r.res.headers.get('content-type') || '' };
    }
    return { status: null, finalUrl: url, chain, redirectCount: chain.length, permanent: false, error: `too many redirects (>${this.config.maxRedirects})`, method };
  }
}

async function readLimited(res: Response, max: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await reader.cancel(); } catch { /* ignore */ } break; }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}

// ── Checking a single destination ───────────────────────────────

const ok = (s: number | null) => s !== null && s >= 200 && s < 300;
const transientError = (o: FetchOutcome) => o.status === null && !!o.error && !o.error.startsWith('blocked:') && !o.error.startsWith('too many');

// HEAD first; any non-2xx HEAD answer (405/501/403/404…) is confirmed with
// GET before it is trusted. Network errors/timeouts are retried once.
export async function checkTarget(url: string, fetcher: Fetcher, deps: Deps): Promise<FetchOutcome> {
  let head = await fetcher.request(url, 'HEAD');
  if (ok(head.status)) return head;
  if (head.error?.startsWith('blocked:')) return head;
  let get = await fetcher.request(url, 'GET');
  if (transientError(get)) {
    await deps.sleep(1500);
    get = await fetcher.request(url, 'GET');
  }
  return get;
}

// ── Classification ──────────────────────────────────────────────

export interface Classified {
  health: Health;
  reviewRequired: boolean;
  failureCount: number;
  replacementUrl: string | null;
  note: string;
}

export function classify(o: FetchOutcome, regulatory: boolean, previousFailures: number, config: Config = CONFIG): Classified {
  if (ok(o.status) && o.redirectCount === 0) {
    return { health: 'HEALTHY', reviewRequired: false, failureCount: 0, replacementUrl: null, note: `${o.status} OK` };
  }
  if (ok(o.status) && o.redirectCount > 0) {
    if (regulatory) {
      return { health: 'REDIRECTED', reviewRequired: true, failureCount: 0, replacementUrl: null,
        note: 'Official redirect recorded — regulatory link, verify the new page before changing anything' };
    }
    if (o.permanent) {
      return { health: 'REDIRECTED', reviewRequired: false, failureCount: 0, replacementUrl: o.finalUrl, note: 'Safe replacement available' };
    }
    return { health: 'REDIRECTED', reviewRequired: false, failureCount: 0, replacementUrl: null, note: 'Temporary redirect — no replacement suggested' };
  }
  if (o.error?.startsWith('blocked:')) {
    return { health: 'WARNING', reviewRequired: regulatory, failureCount: previousFailures, replacementUrl: null, note: `Not checked — ${o.error}` };
  }
  const failures = previousFailures + 1;
  const definitive = o.status === 404 || o.status === 410;
  const label = o.status !== null ? `HTTP ${o.status}` : (o.error || 'request failed');
  if (definitive || failures >= config.brokenAfterFailures) {
    const why = definitive ? label : `${label} — failed ${failures} scans in a row`;
    if (regulatory) {
      return { health: 'REVIEW_REQUIRED', reviewRequired: true, failureCount: failures, replacementUrl: null,
        note: `${why}. Regulatory link — manual verification required` };
    }
    return { health: 'BROKEN', reviewRequired: false, failureCount: failures, replacementUrl: null, note: why };
  }
  return { health: 'WARNING', reviewRequired: false, failureCount: failures, replacementUrl: null,
    note: `${label} — will re-check next scan (${failures}/${config.brokenAfterFailures})` };
}

// ── Crawl + check ───────────────────────────────────────────────

export interface Occurrence {
  sourceUrl: string;
  sourcePage: string;
  linkText: string;
  targetUrl: string;
  linkType: 'internal' | 'external';
  authorityType: 'standard' | 'regulatory';
}

export interface TargetResult extends Classified {
  outcome: FetchOutcome;
}

export interface ScanResult {
  pagesScanned: string[];
  occurrences: Occurrence[];
  results: Map<string, TargetResult>;
  partial: boolean;
  errors: string[];
}

export async function crawl(deps: Deps, fetcher: Fetcher, config: Config, startedAt: number) {
  const queue: { url: string; depth: number }[] = [{ url: config.startUrl, depth: 0 }];
  // www.clpeasy.com and clpeasy.com serve the same pages: crawl each page once.
  const pageId = (u: string) => u.replace('://www.', '://');
  const seenPages = new Set<string>([pageId(config.startUrl)]);
  const scanned: string[] = [];
  const occ = new Map<string, Occurrence>();
  const errors: string[] = [];
  let truncated = false;

  while (queue.length) {
    if (deps.now() - startedAt > config.deadlineMs / 2) { truncated = true; errors.push('crawl stopped at time limit'); break; }
    if (scanned.length >= config.maxPages) { truncated = true; errors.push(`crawl stopped at ${config.maxPages} pages`); break; }
    const { url, depth } = queue.shift()!;
    const page = await fetcher.request(url, 'GET', { timeoutMs: config.pageTimeoutMs, wantBody: true });
    if (!page.body) {
      if (page.status === null || !ok(page.status)) errors.push(`page ${new URL(url).pathname}: ${page.error || 'HTTP ' + page.status}`);
      continue;
    }
    if (!isSiteHost(new URL(page.finalUrl).hostname, config)) continue; // redirected off-site
    scanned.push(url);
    const base = page.finalUrl;
    const source = new URL(url);
    for (const link of extractLinks(page.body)) {
      const n = normaliseUrl(link.href, base);
      if ('skip' in n) continue;
      if (excludedTarget(n.url)) continue;
      const key = url + '\n' + n.url;
      if (!occ.has(key)) {
        if (occ.size >= config.maxTargets * 4) { truncated = true; continue; }
        const host = new URL(n.url).hostname;
        occ.set(key, {
          sourceUrl: url,
          sourcePage: source.pathname,
          linkText: link.text,
          targetUrl: n.url,
          linkType: isSiteHost(host, config) ? 'internal' : 'external',
          authorityType: isRegulatoryHost(host) ? 'regulatory' : 'standard',
        });
      }
      if (isCrawlable(n.url, config) && depth + 1 <= config.maxDepth && !seenPages.has(pageId(n.url))) {
        seenPages.add(pageId(n.url));
        queue.push({ url: n.url, depth: depth + 1 });
      }
    }
  }
  return { scanned, occurrences: [...occ.values()], errors, truncated };
}

export async function runScan(
  deps: Deps,
  previousFailures: Map<string, number>,
  config: Config = CONFIG,
): Promise<ScanResult> {
  const startedAt = deps.now();
  const fetcher = new Fetcher(deps, config);
  const c = await crawl(deps, fetcher, config, startedAt);
  let partial = c.truncated;
  const errors = [...c.errors];

  const targets = [...new Set(c.occurrences.map((o) => o.targetUrl))];
  if (targets.length > config.maxTargets) { partial = true; errors.push(`only first ${config.maxTargets} destinations checked`); }
  const todo = targets.slice(0, config.maxTargets);
  const results = new Map<string, TargetResult>();

  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      if (deps.now() - startedAt > config.deadlineMs) { partial = true; return; }
      const url = todo[i++];
      const outcome = await checkTarget(url, fetcher, deps);
      const regulatory = isRegulatoryHost(new URL(url).hostname);
      results.set(url, { ...classify(outcome, regulatory, previousFailures.get(url) ?? 0, config), outcome });
    }
  };
  await Promise.all(Array.from({ length: Math.min(config.concurrency, todo.length) }, worker));
  if (results.size < todo.length && !errors.some((e) => e.includes('time limit'))) errors.push('link checks stopped at time limit');

  return { pagesScanned: c.scanned, occurrences: c.occurrences, results, partial, errors };
}

export function defaultDeps(): Deps {
  return {
    fetch: (url, init) => fetch(url, init),
    resolveHost: async (host) => {
      const out: string[] = [];
      for (const t of ['A', 'AAAA'] as const) {
        try { out.push(...(await Deno.resolveDns(host, t))); } catch { /* no record of this type */ }
      }
      return out;
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
