// CLP-004 retirement package — offline checks (nothing is deployed).
//   - the retired-endpoint stub answers 410 / 204 (preflight) and makes no
//     outgoing request, reads no secret and touches no database;
//   - a rollback copy exists for each endpoint to be retired;
//   - no site page still calls the retired endpoints once the local guide
//     ships (reported, not failed, while that change is still pending).
//   node tests/retired-endpoint-stub.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'supabase', 'retirement');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

(async () => {
  const src = fs.readFileSync(path.join(DIR, 'stub', 'index.ts'), 'utf8');
  assert(!/\bimport\b|\bfetch\s*\(|Deno\.env|createClient|ANTHROPIC|BREVO|api\.anthropic|api\.brevo/.test(src), 'stub must not import, fetch, read secrets or create clients');
  let handler = null;
  const calls = [];
  const ctx = {
    Deno: { serve: h => { handler = h; }, env: { get: k => { calls.push('env:' + k); return ''; } } },
    fetch: (...a) => { calls.push('fetch:' + a[0]); throw new Error('stub must not fetch'); },
    Response, Request, Headers, JSON, console,
  };
  vm.runInNewContext(src, ctx, { filename: 'stub/index.ts' });
  assert(typeof handler === 'function', 'stub registers a handler');
  const post = await handler(new Request('https://x.supabase.co/functions/v1/clp-wizard', { method: 'POST', headers: { origin: 'https://clpeasy.com', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] }) }));
  assert.strictEqual(post.status, 410);
  const body = await post.json();
  assert(/retired/.test(body.error) && /support@clpeasy\.com/.test(body.error), 'plain-English retired message');
  assert.strictEqual(post.headers.get('access-control-allow-origin'), 'https://clpeasy.com');
  const other = await handler(new Request('https://x/functions/v1/beta-tester-email', { method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ record: { email: 'victim@example.com' } }) }));
  assert.strictEqual(other.status, 410);
  assert.strictEqual(other.headers.get('access-control-allow-origin'), 'https://clpeasy.com', 'other origins are not echoed');
  const pre = await handler(new Request('https://x/functions/v1/clp-search', { method: 'OPTIONS', headers: { origin: 'https://www.clpeasy.com' } }));
  assert.strictEqual(pre.status, 204);
  const get = await handler(new Request('https://x/functions/v1/clp-wizard'));
  assert.strictEqual(get.status, 410);
  assert.deepStrictEqual(calls, [], 'no fetch / secret access: ' + calls.join(', '));
  ok('stub: POST/GET → 410 with a plain message, OPTIONS → 204; no AI call, no email, no secret read, no database');

  for (const slug of ['clp-wizard', 'clp-search', 'finn-chat', 'beta-tester-email']) {
    const f = path.join(DIR, 'rollback', slug, 'index.ts');
    assert(fs.existsSync(f) && fs.statSync(f).size > 500, 'rollback copy for ' + slug);
  }
  ok('rollback copies of the live clp-wizard v40, clp-search v47, beta-tester-email v40 are kept (finn-chat v21 copy kept as a backup only — Finn is preserved, not retired)');

  const callers = [];
  for (const f of fs.readdirSync(ROOT).filter(n => /\.(html|js)$/.test(n))) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const slug of ['clp-wizard', 'clp-search', 'beta-tester-email']) if (t.includes('functions/v1/' + slug)) callers.push(f + ' → ' + slug);
  }
  if (callers.length) console.log('INFO: still called by the site (retire only after the local guide is live):', callers.join(', '));
  else ok('no site page calls the endpoints to be retired');
  console.log(`\nretired-endpoint-stub: ${passed} checks passed`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
