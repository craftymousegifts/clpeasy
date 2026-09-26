// Runs the REAL supabase/functions/create-checkout-session/index.ts offline
// under Deno. Stripe's HTTP API and Supabase are mocked; nothing leaves the
// machine. Documents exactly what each pricing-page button requests.
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', SUPABASE_URL: 'http://offline.invalid',
  SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline', PAYG_5_PRICE_ID: 'price_payg_server_side',
  PROMO_2026_EASY_START_MONTHLY_COUPON_ID: 'coupon_sandbox_start_2026', PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID: 'coupon_sandbox_pro_2026',
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

const stripeRequests: URLSearchParams[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (url !== 'https://api.stripe.com/v1/checkout/sessions') throw new Error('unexpected outbound fetch in test: ' + url);
  stripeRequests.push(new URLSearchParams(init.body));
  return new Response(JSON.stringify({ id: 'cs_test_x', url: 'https://checkout.stripe.com/c/pay/cs_test_x' }), { status: 200 });
};
const out = console.log.bind(console);
console.log = () => {}; console.error = () => {};

await import('../../supabase/functions/create-checkout-session/index.ts');
const handler = (globalThis as any).__handler as (r: Request) => Promise<Response>;

let passed = 0;
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
async function test(name: string, fn: () => Promise<void>) {
  (globalThis as any).__db = freshDb(); stripeRequests.length = 0;
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  await fn(); passed++; out('PASS:', name);
}
const db = () => (globalThis as any).__db;
const call = (body: unknown) => handler(new Request('http://localhost/', { method: 'POST', headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const paygBody = { productKey: 'payg_5', mode: 'payment', successUrl: 'https://clpeasy.com/account.html?payg=success', cancelUrl: 'https://clpeasy.com/pricing.html?payg=cancelled' };

await test('PAYG uses the server-side price, stamps type=payg and 8 downloads during 2026, ignores any browser price', async () => {
  const r = await call({ ...paygBody, priceId: 'price_attacker_cheap' });
  eq(r.status, 200, 'status');
  const p = stripeRequests[0];
  eq(p.get('line_items[0][price]'), 'price_payg_server_side', 'server-side PAYG price');
  eq(p.get('mode'), 'payment', 'one-off payment');
  eq(p.get('metadata[type]'), 'payg', 'type');
  eq(p.get('metadata[downloads]'), '8', '5 + 3 free during the 2026 launch');
  eq(p.get('metadata[userId]'), 'user-1', 'user from the verified JWT');
  eq(p.get('success_url'), paygBody.successUrl, 'allowed success URL');
  eq(p.get('cancel_url'), paygBody.cancelUrl, 'allowed cancel URL');
});

await test('PAYG fails closed when PAYG_5_PRICE_ID is missing (never falls back to a browser price)', async () => {
  Deno.env.delete('PAYG_5_PRICE_ID');
  const r = await call({ ...paygBody, priceId: 'price_attacker_cheap' });
  eq(r.status, 503, 'service unavailable'); eq(stripeRequests.length, 0, 'no Stripe session created');
});

await test('from 1 January 2027 the same PAYG purchase is stamped 5 downloads', async () => {
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a: any[]) { super(...(a.length ? a : ['2027-01-01T00:00:01Z'] as any)); } static now() { return new RealDate('2027-01-01T00:00:01Z').getTime(); } }
  (globalThis as any).Date = FakeDate;
  try { await call(paygBody); } finally { (globalThis as any).Date = RealDate; }
  eq(stripeRequests[0].get('metadata[downloads]'), '5', 'post-campaign quantity');
});

await test('31 December 2026 23:59 UTC is still the launch offer', async () => {
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a: any[]) { super(...(a.length ? a : ['2026-12-31T23:59:59Z'] as any)); } }
  (globalThis as any).Date = FakeDate;
  try { await call(paygBody); } finally { (globalThis as any).Date = RealDate; }
  eq(stripeRequests[0].get('metadata[downloads]'), '8', 'still 8 at the last second of 2026');
});

const START_M = 'price_1TyDuRGZLILz5vqU3RIuVFJD', PRO_M = 'price_1TyDxBGZLILz5vqUEKx7d2jp';
const START_A = 'price_1TyrwjGZLILz5vqUjYaiQtfL', PRO_A = 'price_1TyryIGZLILz5vqU5OaMB0jG';
function atDate(iso: string) {
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a: any[]) { super(...(a.length ? a : [iso] as any)); } static now() { return new RealDate(iso).getTime(); } }
  (globalThis as any).Date = FakeDate;
  return () => { (globalThis as any).Date = RealDate; };
}
async function callAt(iso: string, body: unknown) { const restore = atDate(iso); try { return await call(body); } finally { restore(); } }
const discountKeys = (p: URLSearchParams) => [...p.keys()].filter(k => /discount|coupon|promotion/i.test(k));

// ── D3: 2026 monthly promotion ──
await test('D3 Easy Start MONTHLY checkout gets the server-configured 2026 coupon (£9.99 price → £8.99)', async () => {
  eq((await callAt('2026-10-01T12:00:00Z', { priceId: START_M, mode: 'subscription' })).status, 200, 'status');
  const p = stripeRequests[0];
  eq(p.get('line_items[0][price]'), START_M, 'standard monthly price unchanged');
  eq(p.get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'Start coupon');
  eq(p.get('allow_promotion_codes'), null, 'no customer promotion codes');
});
await test('D3 Easy Pro MONTHLY checkout gets the Pro coupon (£14.99 price → £13.49)', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: PRO_M, mode: 'subscription' });
  eq(stripeRequests[0].get('discounts[0][coupon]'), 'coupon_sandbox_pro_2026', 'Pro coupon');
});
await test('D3 live-mode monthly price IDs are recognised too', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: 'price_1TdoEYGZLILz5vqUIqlEsf4X', mode: 'subscription' });
  eq(stripeRequests[0].get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'live Start monthly');
});
await test('D3 Easy Start ANNUAL has no discount', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: START_A, mode: 'subscription' });
  eq(discountKeys(stripeRequests[0]), [], 'no discount on annual');
});
await test('D3 Easy Pro ANNUAL has no discount', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: PRO_A, mode: 'subscription' });
  eq(discountKeys(stripeRequests[0]), [], 'no discount on annual');
});
await test('D3 the browser cannot inject or choose a discount', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: START_A, mode: 'subscription', coupon: 'FREE100', discounts: [{ coupon: 'FREE100' }], promotion_code: 'promo_x', allow_promotion_codes: true });
  eq(discountKeys(stripeRequests[0]), [], 'annual + injected fields: nothing applied');
  db().tables.checkout_locks = []; // the real 5-minute duplicate-checkout lock
  await callAt('2026-10-01T12:00:00Z', { priceId: START_M, mode: 'subscription', coupon: 'FREE100', discounts: [{ coupon: 'FREE100' }] });
  eq(stripeRequests[1].get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'monthly: only the server coupon');
  eq(discountKeys(stripeRequests[1]), ['discounts[0][coupon]'], 'exactly one discount parameter');
});
await test('D3 missing promotion configuration fails closed (no checkout at the standard price)', async () => {
  Deno.env.delete('PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID');
  const r = await callAt('2026-10-01T12:00:00Z', { priceId: PRO_M, mode: 'subscription' });
  eq(r.status, 503, 'service unavailable'); eq((await r.json()).code, 'PROMO_NOT_CONFIGURED', 'code'); eq(stripeRequests.length, 0, 'no Stripe session');
  eq(db().tables.checkout_locks.length, 0, 'no checkout lock left behind');
  eq((await callAt('2026-10-01T12:00:00Z', { priceId: START_M, mode: 'subscription' })).status, 200, 'the configured plan still works');
});
await test('D3 the promotion applies through 31 December 2026 (23:59:59 UK)', async () => {
  await callAt('2026-12-31T23:59:59Z', { priceId: START_M, mode: 'subscription' });
  eq(stripeRequests[0].get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'still discounted');
});
await test('D3 from 1 January 2027 monthly checkout is standard price (no coupon needed or applied)', async () => {
  Deno.env.delete('PROMO_2026_EASY_START_MONTHLY_COUPON_ID');
  const r = await callAt('2027-01-01T00:00:01Z', { priceId: START_M, mode: 'subscription' });
  eq(r.status, 200, 'works without promo configuration after the promotion');
  eq(discountKeys(stripeRequests[0]), [], 'no discount');
});

// ── D4: subscriber top-ups ──
const TOPUP5 = 'price_1Tys3JGZLILz5vqUXA6L9jxc';
const DAY = 86400000;
const topupCases: [string, Record<string, unknown> | null, number][] = [
  ['active Easy Start', { subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 }, 200],
  ['active Easy Pro', { subscription_status: 'active', plan: 'easy_pro', downloads_limit: 30 }, 200],
  ['cancellation scheduled, still paid', { subscription_status: 'cancelled', plan: 'easy_pro', downloads_limit: 30, deletion_date: new Date(Date.now() + 9 * DAY).toISOString() }, 200],
  ['cancellation period ended', { subscription_status: 'cancelled', plan: 'easy_pro', downloads_limit: 30, deletion_date: new Date(Date.now() - DAY).toISOString() }, 403],
  ['subscription ended (downgraded)', { subscription_status: 'cancelled', plan: 'free', downloads_limit: 0 }, 403],
  ['live trial', { subscription_status: 'trialing', plan: 'free', downloads_limit: 10 }, 403],
  ['Pay As You Go', { subscription_status: 'payg', plan: 'payg', downloads_limit: 0 }, 403],
  ['paused', { subscription_status: 'paused', plan: 'easy_start', downloads_limit: 20 }, 403],
  ['no profile', null, 403],
];
for (const [name, profile, status] of topupCases) {
  await test(`D4 top-up for ${name} -> ${status}`, async () => {
    if (profile) db().tables.profiles.push({ id: 'user-1', ...profile });
    const r = await call({ priceId: TOPUP5, mode: 'payment' });
    eq(r.status, status, 'status');
    if (status === 200) { eq(stripeRequests[0].get('metadata[type]'), 'topup', 'top-up session'); }
    else { eq((await r.json()).code, 'TOPUP_SUBSCRIBERS_ONLY', 'code'); eq(stripeRequests.length, 0, 'no Stripe session'); }
  });
}
await test('D4 unknown one-off price is rejected (cannot buy an arbitrary price as a top-up)', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 });
  const r = await call({ priceId: 'price_something_else', mode: 'payment' });
  eq(r.status, 400, 'status'); eq(stripeRequests.length, 0, 'no Stripe session');
});
await test('D4 a trial customer can still start Pay As You Go', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  eq((await call(paygBody)).status, 200, 'PAYG allowed'); eq(stripeRequests[0].get('metadata[type]'), 'payg', 'PAYG');
  eq(db().tables.profiles[0].subscription_status, 'trialing', 'opening checkout never ends the trial (D5)');
});

out(`create-checkout-session offline checks passed (${passed} scenarios)`);
