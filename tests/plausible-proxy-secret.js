// CLP-001 Plausible proxy — offline checks (nothing is deployed, no network).
//   - no credential literal in the function source;
//   - the key is read from the PLAUSIBLE_API_KEY Supabase secret and sent only
//     to plausible.io as a Bearer token;
//   - without the secret it answers 503 and makes no outgoing request;
//   - the site allowlist and the response shape are unchanged.
//   node tests/plausible-proxy-secret.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { stripTypeScriptTypes } = require('module');
const FILE = path.join(__dirname, '..', 'supabase', 'functions', 'plausible-proxy', 'index.ts');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

function load(secret) {
  const raw = fs.readFileSync(FILE, 'utf8');
  const src = stripTypeScriptTypes(raw.replace(/^import \{ serve \} from .*$/m, ''));
  let handler = null;
  const calls = [];
  const ctx = {
    serve: h => { handler = h; },
    Deno: { env: { get: k => { calls.push('env:' + k); return k === 'PLAUSIBLE_API_KEY' ? secret : undefined; } } },
    fetch: async (url, opts) => {
      calls.push({ url: String(url), auth: opts && opts.headers && opts.headers.Authorization });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    },
    Response, Request, Headers, URL, JSON, Object, Promise, console,
  };
  vm.runInNewContext(src, ctx, { filename: 'plausible-proxy/index.ts' });
  assert(typeof handler === 'function', 'function registers a handler');
  return { handler, calls };
}

(async () => {
  const raw = fs.readFileSync(FILE, 'utf8');
  assert(!/PLAUSIBLE_API_KEY\s*=\s*['"`]/.test(raw), 'no key literal assigned');
  assert(!/['"`][A-Za-z0-9_\-]{32,}['"`]/.test(raw), 'no long token-like string literal in the source');
  assert(/Deno\.env\.get\(\s*'PLAUSIBLE_API_KEY'\s*\)/.test(raw), 'key read from the Supabase secret');
  ok('source holds no credential; the key comes from the PLAUSIBLE_API_KEY secret');

  const none = load(undefined);
  const r1 = await none.handler(new Request('https://x.supabase.co/functions/v1/plausible-proxy?site=clpeasy.com'));
  assert.strictEqual(r1.status, 503);
  assert.deepStrictEqual(await r1.json(), { error: 'Analytics not configured' });
  assert(!none.calls.some(c => typeof c === 'object'), 'no outgoing request without the secret');
  const pre = await none.handler(new Request('https://x/functions/v1/plausible-proxy', { method: 'OPTIONS' }));
  assert.strictEqual(pre.status, 200);
  ok('missing secret: 503 "Analytics not configured", no request to Plausible; preflight unchanged');

  const FAKE = 'test-only-placeholder';
  const withKey = load(FAKE);
  const r2 = await withKey.handler(new Request('https://x/functions/v1/plausible-proxy?site=craftymousegifts.com'));
  assert.strictEqual(r2.status, 200);
  const body = await r2.json();
  assert.deepStrictEqual(Object.keys(body), ['rt', 'agg', 'pages', 'sources', 'devices', 'countries', 'entry', 'exit', 'events']);
  const out = withKey.calls.filter(c => typeof c === 'object');
  assert.strictEqual(out.length, 9);
  assert(out.every(c => c.url.startsWith('https://plausible.io/api/v1/stats/') && c.url.includes('site_id=craftymousegifts.com')));
  assert(out.every(c => c.auth === 'Bearer ' + FAKE), 'secret sent only as the Bearer token');
  assert.strictEqual(r2.headers.get('access-control-allow-origin'), 'https://clpeasy.com');
  ok('with the secret: same 9 Plausible calls and response keys as before');

  const r3 = await load(FAKE).handler(new Request('https://x/functions/v1/plausible-proxy?site=evil.example'));
  assert.strictEqual(r3.status, 403);
  ok('site allowlist unchanged (other sites → 403)');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
