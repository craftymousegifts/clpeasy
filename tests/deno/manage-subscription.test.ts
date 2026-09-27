// Runs the REAL supabase/functions/manage-subscription/index.ts offline under
// Deno (Stripe and Supabase stubbed through import_map.json; nothing leaves
// the machine). The function backs the Account page's Pause / Cancel /
// Reactivate buttons, which POST { action, reason? } with the signed-in
// user's JWT.
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', SUPABASE_URL: 'http://offline.invalid', SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline',
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

let handler: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: any) => { handler = h; }, configurable: true, writable: true });
(globalThis as any).fetch = async (url: string) => { throw new Error('unexpected outbound fetch in test: ' + url); };
const out = console.log.bind(console);
console.error = () => {};

await import('../../supabase/functions/manage-subscription/index.ts');

let passed = 0;
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
async function test(name: string, fn: () => Promise<void>) {
  (globalThis as any).__db = freshDb();
  (globalThis as any).__stripeCalls = [];
  (globalThis as any).__stripeSubscriptions = {};
  await fn(); passed++; out('PASS:', name);
}
const db = () => (globalThis as any).__db;
const calls = () => (globalThis as any).__stripeCalls as any[];
const PERIOD_END = 1803600000; // 2027-02-26T…Z
function seed(sub: Record<string, any> = {}, withRow = true) {
  db().tables.profiles.push({ id: 'user-1', plan: 'easy_start', subscription_status: 'active', downloads_used: 3, downloads_limit: 20, topup_credits: 5 });
  db().tables.profiles.push({ id: 'user-2', plan: 'easy_pro', subscription_status: 'active' });
  if (withRow) db().tables.subscriptions.push({ user_id: 'user-1', stripe_subscription_id: 'sub_1' });
  db().tables.subscriptions.push({ user_id: 'user-2', stripe_subscription_id: 'sub_2' });
  (globalThis as any).__stripeSubscriptions = {
    sub_1: Object.assign({ id: 'sub_1', status: 'active', cancel_at_period_end: false, pause_collection: null, current_period_end: PERIOD_END }, sub),
    sub_2: { id: 'sub_2', status: 'active', cancel_at_period_end: false, pause_collection: null, current_period_end: PERIOD_END },
  };
}
const prof = (id = 'user-1') => db().tables.profiles.find((r: any) => r.id === id);
const call = (body: unknown, auth: string | null = 'Bearer user-jwt') =>
  handler(new Request('http://localhost/', { method: 'POST', headers: auth ? { Authorization: auth, 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body) }));

await test('pause: real Stripe pause (mark_uncollectible) first, then profile paused with reason', async () => {
  seed();
  const r = await call({ action: 'pause', reason: 'seasonal' });
  eq([r.status, await r.json()], [200, { success: true, status: 'active' }], 'response');
  eq(calls(), [['subscriptions.update', 'sub_1', { pause_collection: { behavior: 'mark_uncollectible' } }]], 'one Stripe change on THIS user\'s subscription');
  eq([prof().subscription_status, prof().pause_reason, typeof prof().paused_at], ['paused', 'seasonal', 'string'], 'profile paused');
  eq([prof().plan, prof().downloads_limit, prof().downloads_used, prof().topup_credits], ['easy_start', 20, 3, 5], 'plan, allowance and purchased downloads untouched');
});

await test('cancel: cancel_at_period_end, profile cancelled with deletion_date = Stripe period end', async () => {
  seed();
  const r = await call({ action: 'cancel', reason: 'too_expensive' });
  eq(r.status, 200, 'status');
  eq(calls(), [['subscriptions.update', 'sub_1', { cancel_at_period_end: true }]], 'scheduled, not immediate');
  eq([prof().subscription_status, prof().cancel_reason, prof().deletion_date], ['cancelled', 'too_expensive', new Date(PERIOD_END * 1000).toISOString()], 'profile');
  eq([prof().plan, prof().downloads_limit], ['easy_start', 20], 'paid access kept until the period ends');
});

await test('reactivate after pause or scheduled cancellation: same subscription, both flags cleared, profile active', async () => {
  seed({ pause_collection: { behavior: 'mark_uncollectible' }, cancel_at_period_end: true });
  Object.assign(prof(), { subscription_status: 'cancelled', deletion_date: '2027-02-26T00:00:00.000Z', cancel_reason: 'x', pause_reason: 'y', paused_at: '2027-01-01T00:00:00.000Z' });
  const r = await call({ action: 'reactivate' });
  eq([r.status, await r.json()], [200, { success: true, status: 'active' }], 'response');
  eq(calls(), [['subscriptions.update', 'sub_1', { cancel_at_period_end: false, pause_collection: null }]], 'undo on the SAME subscription (no new subscription)');
  eq([prof().subscription_status, prof().deletion_date, prof().cancel_reason, prof().pause_reason, prof().paused_at], ['active', null, null, null, null], 'profile');
});

await test('reactivate a fully ended subscription: 409 FULLY_ENDED, no Stripe change, profile untouched (Account falls back to Checkout)', async () => {
  seed({ status: 'canceled' });
  Object.assign(prof(), { plan: 'free', subscription_status: 'cancelled' });
  const r = await call({ action: 'reactivate' });
  eq([r.status, (await r.json()).code], [409, 'FULLY_ENDED'], 'response');
  eq(calls(), [], 'no Stripe change');
  eq([prof().plan, prof().subscription_status], ['free', 'cancelled'], 'profile untouched');
});

await test('no linked Stripe subscription: 404 NO_SUBSCRIPTION (Account falls back to Checkout), nothing changed', async () => {
  seed({}, false);
  for (const action of ['pause', 'cancel', 'reactivate']) {
    const r = await call({ action });
    eq([r.status, (await r.json()).code], [404, 'NO_SUBSCRIPTION'], action);
  }
  eq(calls(), [], 'no Stripe change');
  eq(prof().subscription_status, 'active', 'profile untouched');
});

await test('security: user comes from the JWT only; body cannot target another user or subscription', async () => {
  seed();
  const r = await call({ action: 'cancel', user_id: 'user-2', userId: 'user-2', subscriptionId: 'sub_2', stripe_subscription_id: 'sub_2' });
  eq(r.status, 200, 'status');
  eq(calls().map(c => c[1]), ['sub_1'], 'only the caller\'s own subscription changed');
  eq(prof('user-2').subscription_status, 'active', 'other user untouched');
});

await test('not signed in / bad token: 401 and no Stripe call; unknown action 400; GET 405', async () => {
  seed();
  eq((await call({ action: 'pause' }, null)).status, 401, 'no token');
  db().authUser = null;
  eq((await call({ action: 'pause' })).status, 401, 'invalid token');
  db().authUser = { id: 'user-1' };
  eq((await call({ action: 'delete_everything' })).status, 400, 'unknown action');
  eq((await handler(new Request('http://localhost/', { method: 'GET' }))).status, 405, 'GET');
  eq(calls(), [], 'no Stripe call');
});

await test('Stripe error: 500 with the error, profile NOT changed (Stripe first, profile second)', async () => {
  seed();
  (globalThis as any).__stripeSubscriptions = {}; // Stripe no longer knows sub_1
  const r = await call({ action: 'pause' });
  eq(r.status, 500, 'status');
  eq(prof().subscription_status, 'active', 'profile untouched when Stripe refused');
});

out(`manage-subscription offline checks passed (${passed} scenarios)`);
