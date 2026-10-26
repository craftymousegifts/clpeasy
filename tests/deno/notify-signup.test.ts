// Runs the REAL supabase/functions/notify-signup/index.ts offline under Deno
// (Supabase stubbed, Brevo fetch mocked). Nothing leaves the machine.
//   node tests/deno/run.js
import { freshDb } from './stubs/supabase.ts';

for (const [k, v] of Object.entries({ BREVO_API_KEY: 'offline-brevo-key', BREVO_LIST_ID: '3', BREVO_AUTOMATION_ID: '1', SUPABASE_URL: 'http://offline.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline' })) Deno.env.set(k, v);
let calls: any[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected outbound fetch in test: ' + url);
  calls.push({ url, body: JSON.parse(init.body) });
  return new Response('{"id":1}', { status: 201 });
};
const logged: string[] = [];
for (const k of ['log', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(' ')); };
const out = (...a: unknown[]) => Deno.stdout.writeSync(new TextEncoder().encode(a.join(' ') + '\n'));
const SECRET = 'offline-test-webhook-secret';
const reset = () => {
  calls = []; logged.length = 0;
  (globalThis as any).__db = freshDb();
  (globalThis as any).__db.tables.signup_notifications = [];
  (globalThis as any).__db.webhookSecret = SECRET;
};
reset();
await import('../../supabase/functions/notify-signup/index.ts');
const handler = (globalThis as any).__handler as (r: Request) => Promise<Response>;

function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
const post = (body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const authed = { 'x-clpeasy-webhook-secret': SECRET };
// Shape sent by the notify_signup_webhook() trigger (migration 20261024000000).
const triggerPayload = { type: 'INSERT', schema: 'auth', table: 'users', record: { id: 'user-9', email: 'new.maker@example.com', created_at: '2026-10-24T10:00:00Z' } };
const legacyBrowserPayload = { email: 'new.maker@example.com', user_id: 'user-9', is_beta: false };

// 1. Unauthorised callers are rejected before any Brevo call or claim.
for (const [label, headers] of [
  ['no secret header', {}],
  ['wrong secret', { 'x-clpeasy-webhook-secret': 'guess' }],
  ['public anon key as Bearer (old auth.html call)', { Authorization: 'Bearer public-anon-key' }],
  ['secret in the wrong header', { Authorization: 'Bearer ' + SECRET }],
] as const) {
  reset();
  const r = await post(legacyBrowserPayload, headers as Record<string, string>);
  eq(r.status, 401, `401 for ${label}`);
  eq(calls.length, 0, `no Brevo call for ${label}`);
  eq((globalThis as any).__db.tables.signup_notifications.length, 0, `no idempotency claim for ${label}`);
}
out('PASS: unauthorised requests (no/wrong secret, anon Bearer, secret in Authorization) get 401 with no Brevo call');

reset(); (globalThis as any).__db.failVerifyRpc = true;
eq((await post(triggerPayload, authed)).status, 401, 'secret check failure fails closed');
eq(calls.length, 0, 'no Brevo call when the secret check cannot run');
out('PASS: secret check unavailable -> fail closed (401), nothing sent');

reset(); (globalThis as any).__db.webhookSecret = null;
eq((await post(triggerPayload, authed)).status, 401, 'Vault secret missing -> 401');
out('PASS: Vault secret missing -> 401, nothing sent');

eq((await handler(new Request('http://localhost/', { method: 'GET' }))).status, 405, 'GET 405');

// 2. Authorised trigger delivery: behaviour unchanged.
reset();
const r = await post(triggerPayload, authed);
eq(r.status, 200, 'status');
const contact = calls.find(c => c.url === 'https://api.brevo.com/v3/contacts');
eq(contact.body, { email: 'new.maker@example.com', updateEnabled: true, listIds: [3], attributes: { FIRSTNAME: 'new.maker' } }, 'sign-up contact: list + FIRSTNAME only');
const all = JSON.stringify(calls.filter(c => !c.url.endsWith('/smtp/email')));
for (const k of ['CLPEASY_', 'SUBSCRIPTION_STATUS', 'PLAN']) if (all.includes(k)) throw new Error('ASSERTION FAILED: sign-up must not write ' + k);
eq(calls.some(c => c.url.includes('/automations')), false, 'onboarding relies on list membership; no invalid automation request');
const alerts = calls.filter(c => c.url.endsWith('/smtp/email'));
eq(alerts.length, 1, 'admin alert still sent (unchanged)');
eq(alerts[0].body.subject.includes('new.maker@example.com'), true, 'alert names the new user');
eq((globalThis as any).__db.tables.signup_notifications.map((x: any) => x.user_id), ['user-9'], 'user_id claimed once');
out('PASS: authorised trigger payload -> Brevo contact (list + FIRSTNAME only) + one admin alert, as before');

const logText = logged.join('\n');
eq(logText.includes(SECRET), false, 'secret never logged');
eq(logText.includes('new.maker@example.com') && logText.includes('received'), false, 'request body not dumped to logs');
out('PASS: logs contain neither the secret nor the request body');

// 3. Duplicate delivery of the same sign-up: no second admin alert.
calls = [];
const r2 = await post(triggerPayload, authed);
eq(r2.status, 200, 'duplicate status');
eq(calls.filter(c => c.url.endsWith('/smtp/email')).length, 0, 'no second admin alert');
eq(calls.filter(c => c.url.endsWith('/v3/contacts')).length, 1, 'contact upsert repeats harmlessly (updateEnabled)');
out('PASS: duplicate delivery -> no second admin alert; contact upsert is idempotent');

out('notify-signup offline checks passed (9 scenarios)');
