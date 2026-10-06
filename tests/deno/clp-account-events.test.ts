// Runs the REAL supabase/functions/clp-account-events/index.ts offline under
// Deno (Stripe and Supabase stubbed through import_map.json, Brevo fetch
// mocked; nothing leaves the machine). account.html calls it AFTER
// manage-subscription has paused/cancelled the Stripe subscription.
//
// Brevo ownership (6 Oct 2026): this function must NEVER write a Brevo contact
// attribute -- stripe-webhook is the sole writer of SUBSCRIPTION_STATUS. It
// still sends the pause-confirmation email (template 7).
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  BREVO_API_KEY: 'offline-brevo-key', STRIPE_SECRET_KEY: 'sk_test_offline', STRIPE_SAVE_OFFER_COUPON_ID: 'coupon_save_offer',
  SUPABASE_URL: 'http://offline.invalid', SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline',
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

let handler: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: any) => { handler = h; }, configurable: true, writable: true });
const brevo: any[] = [];
let brevoStatus = 201;
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected outbound fetch in test: ' + url);
  brevo.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
  return new Response('{"messageId":"m1"}', { status: brevoStatus });
};
const out = console.log.bind(console);
for (const k of ['log', 'warn', 'error'] as const) console[k] = () => {};

await import('../../supabase/functions/clp-account-events/index.ts');

let passed = 0;
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
function assert(c: unknown, msg: string) { if (!c) throw new Error('ASSERTION FAILED: ' + msg); }
async function test(name: string, fn: () => Promise<void>) {
  (globalThis as any).__db = freshDb(); brevo.length = 0; brevoStatus = 201;
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_1: { id: 'sub_1' } };
  db().tables.profiles.push({ id: 'user-1', email: 'maker@example.com', subscription_status: 'active', plan: 'easy_start' });
  db().tables.subscriptions.push({ user_id: 'user-1', stripe_subscription_id: 'sub_1' });
  await fn(); passed++; out('PASS:', name);
}
const db = () => (globalThis as any).__db;
function call(body: unknown, token = 'jwt-user-1') {
  return handler(new Request('http://localhost/', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) }));
}
const FORBIDDEN = ['SUBSCRIPTION_STATUS', 'CANCEL_REASON', 'DELETION_DATE', 'DISCOUNT_ACTIVE', 'CLPEASY_'];
function assertNoAttributeWrites() {
  assert(!brevo.some(c => c.url.includes('/v3/contacts')), 'no Brevo contact create/update/double-opt-in call');
  const all = JSON.stringify(brevo);
  for (const k of FORBIDDEN) assert(!all.includes(k), 'never sends ' + k);
}

await test('pause: sends the pause confirmation (template 7) to the account email; writes no Brevo attribute', async () => {
  const r = await call({ event: 'subscription_paused', reason: 'busy season' });
  eq([r.status, await r.json()], [200, { success: true }], 'response unchanged');
  eq(brevo.map(c => [c.url, c.body]), [['https://api.brevo.com/v3/smtp/email', { to: [{ email: 'maker@example.com' }], templateId: 7, params: { FIRSTNAME: 'maker' } }]], 'one transactional email');
  assertNoAttributeWrites();
});
await test('pause: Brevo send failure is reported as success:false (unchanged behaviour), still no attribute writes', async () => {
  brevoStatus = 400;
  const r = await call({ event: 'subscription_paused' });
  eq(await r.json(), { success: false }, 'success false');
  assertNoAttributeWrites();
});
await test('cancel (Account page): NO Brevo call at all -- no SUBSCRIPTION_STATUS, reason or date written; response unchanged', async () => {
  const r = await call({ event: 'subscription_cancelled', reason: 'too_expensive', deletionDate: '2026-10-31T00:00:00Z' });
  eq([r.status, await r.json()], [200, { success: true }], 'response unchanged');
  eq(brevo.length, 0, 'nothing sent to Brevo (stripe-webhook records the cancellation and sends the confirmation)');
  eq(db().tables.profiles[0].subscription_status, 'active', 'function does not touch the profile/Stripe cancellation (manage-subscription does)');
});
await test('save offer accepted: Stripe coupon + profile flags as before, response shape unchanged, NO Brevo write', async () => {
  const r = await call({ event: 'save_offer_accepted' });
  eq(await r.json(), { success: true, discountApplied: true }, 'response unchanged');
  eq((globalThis as any).__stripeCalls, [['subscriptions.update', 'sub_1', { coupon: 'coupon_save_offer' }]], 'Stripe coupon applied as before');
  eq(db().tables.profiles[0].discount_active, true, 'profile flag as before');
  eq(brevo.length, 0, 'no Brevo call');
});
await test('security unchanged: no token -> 401; unknown event -> 400; nothing sent', async () => {
  eq((await call({ event: 'subscription_paused' }, '')).status, 401, 'no token');
  eq((await call({ event: 'winback_day3' })).status, 400, 'unknown event');
  db().authUser = null;
  eq((await call({ event: 'subscription_paused' })).status, 401, 'bad token');
  eq(brevo.length, 0, 'nothing sent');
});

// Repository-wide ownership check: outside comments, the Brevo attribute
// SUBSCRIPTION_STATUS appears in exactly one Edge Function -- stripe-webhook.
await test('repository: stripe-webhook is the ONLY Edge Function that writes SUBSCRIPTION_STATUS', async () => {
  const writers: string[] = [];
  for await (const dir of Deno.readDir('supabase/functions')) {
    if (!dir.isDirectory) continue;
    let src = '';
    try { src = await Deno.readTextFile(`supabase/functions/${dir.name}/index.ts`); } catch { continue; }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    if (code.includes('SUBSCRIPTION_STATUS')) writers.push(dir.name);
  }
  eq(writers, ['stripe-webhook'], 'only stripe-webhook');
});

out(`clp-account-events offline checks passed (${passed} scenarios)`);
