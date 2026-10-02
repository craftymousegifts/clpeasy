// Runs the REAL supabase/functions/create-checkout-session/index.ts offline
// under Deno. Stripe's HTTP API and Supabase are mocked; nothing leaves the
// machine. Documents exactly what each pricing-page button requests.
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', SUPABASE_URL: 'http://offline.invalid',
  SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline', PAYG_5_PRICE_ID: 'price_payg_server_side',
  PROMO_2026_EASY_START_MONTHLY_COUPON_ID: 'coupon_sandbox_start_2026', PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID: 'coupon_sandbox_pro_2026',
  EASY_START_ANNUAL_PRICE_ID: 'price_easy_start_annual_89_server_side',
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
// ── Easy Start Unlimited only (2 Oct 2026): Easy Pro and the old £99 annual are retired ──
const ANNUAL_89 = 'price_easy_start_annual_89_server_side';
const RETIRED = [['test-mode Easy Pro monthly', PRO_M], ['test-mode Easy Pro annual', PRO_A], ['test-mode old £99 Easy Start annual', START_A],
  ['live Easy Pro monthly', 'price_1TdoEXGZLILz5vqUvZKB1RQw'], ['live Easy Pro annual', 'price_1TdoEXGZLILz5vqUFgTznTUT'], ['live old £99 Easy Start annual', 'price_1TdoEXGZLILz5vqUQj5n6Zri'],
  ['sandbox Easy Pro monthly', 'price_1Tdd9OKF3jvQfgEaYsCmOwOa'], ['sandbox Easy Pro annual', 'price_1TddAyKF3jvQfgEaE7Vwbxl6'], ['sandbox old £99 Easy Start annual', 'price_1Tdd7pKF3jvQfgEa8DxgQHEW'],
  ['an arbitrary recurring price', 'price_something_else']];
for (const [name, priceId] of RETIRED) {
  await test(`retired: ${name} cannot start a new subscription (400 PLAN_NOT_AVAILABLE, no Stripe call, no lock)`, async () => {
    const r = await callAt('2026-10-01T12:00:00Z', { priceId, mode: 'subscription' });
    eq([r.status, (await r.json()).code], [400, 'PLAN_NOT_AVAILABLE'], 'refused');
    eq(stripeRequests.length, 0, 'no Stripe session'); eq(db().tables.checkout_locks.length, 0, 'no lock');
  });
}
await test('Easy Start Unlimited monthly: sandbox and live monthly prices are accepted', async () => {
  for (const priceId of ['price_1Tdd5SKF3jvQfgEaclfSUxn5', 'price_1TdoEYGZLILz5vqUIqlEsf4X']) {
    db().tables.checkout_locks = [];
    eq((await callAt('2026-10-01T12:00:00Z', { priceId, mode: 'subscription' })).status, 200, priceId);
  }
  eq(stripeRequests.map(p => p.get('line_items[0][price]')), ['price_1Tdd5SKF3jvQfgEaclfSUxn5', 'price_1TdoEYGZLILz5vqUIqlEsf4X'], 'prices');
});
await test('Easy Start Unlimited annual £89: productKey easy_start_annual uses the SERVER price, ignores any browser price, no discount', async () => {
  eq((await callAt('2026-10-01T12:00:00Z', { productKey: 'easy_start_annual', priceId: PRO_A, mode: 'subscription' })).status, 200, 'status');
  eq(stripeRequests[0].get('line_items[0][price]'), ANNUAL_89, 'server-side annual price');
  eq(stripeRequests[0].get('mode'), 'subscription', 'subscription');
  eq(discountKeys(stripeRequests[0]), [], 'no discount on annual');
});
await test('Easy Start Unlimited annual: the configured price id sent directly is also accepted', async () => {
  eq((await callAt('2026-10-01T12:00:00Z', { priceId: ANNUAL_89, mode: 'subscription' })).status, 200, 'status');
  eq(discountKeys(stripeRequests[0]), [], 'no discount');
});
await test('Easy Start Unlimited annual fails closed while EASY_START_ANNUAL_PRICE_ID is not configured', async () => {
  Deno.env.delete('EASY_START_ANNUAL_PRICE_ID');
  const r = await callAt('2026-10-01T12:00:00Z', { productKey: 'easy_start_annual', priceId: START_A, mode: 'subscription' });
  eq([r.status, (await r.json()).code], [503, 'ANNUAL_NOT_CONFIGURED'], 'refused');
  eq(stripeRequests.length, 0, 'never falls back to the browser price or the old £99 price');
  eq(db().tables.checkout_locks.length, 0, 'no lock');
});
await test('D3 live-mode monthly price IDs are recognised too', async () => {
  await callAt('2026-10-01T12:00:00Z', { priceId: 'price_1TdoEYGZLILz5vqUIqlEsf4X', mode: 'subscription' });
  eq(stripeRequests[0].get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'live Start monthly');
});
await test('D3 the browser cannot inject or choose a discount', async () => {
  await callAt('2026-10-01T12:00:00Z', { productKey: 'easy_start_annual', mode: 'subscription', coupon: 'FREE100', discounts: [{ coupon: 'FREE100' }], promotion_code: 'promo_x', allow_promotion_codes: true });
  eq(discountKeys(stripeRequests[0]), [], 'annual + injected fields: nothing applied');
  db().tables.checkout_locks = []; // the real 5-minute duplicate-checkout lock
  await callAt('2026-10-01T12:00:00Z', { priceId: START_M, mode: 'subscription', coupon: 'FREE100', discounts: [{ coupon: 'FREE100' }] });
  eq(stripeRequests[1].get('discounts[0][coupon]'), 'coupon_sandbox_start_2026', 'monthly: only the server coupon');
  eq(discountKeys(stripeRequests[1]), ['discounts[0][coupon]'], 'exactly one discount parameter');
});
await test('D3 missing promotion configuration fails closed (no checkout at the standard price)', async () => {
  Deno.env.delete('PROMO_2026_EASY_START_MONTHLY_COUPON_ID');
  const r = await callAt('2026-10-01T12:00:00Z', { priceId: START_M, mode: 'subscription' });
  eq(r.status, 503, 'service unavailable'); eq((await r.json()).code, 'PROMO_NOT_CONFIGURED', 'code'); eq(stripeRequests.length, 0, 'no Stripe session');
  eq(db().tables.checkout_locks.length, 0, 'no checkout lock left behind');
  eq((await callAt('2026-10-01T12:00:00Z', { productKey: 'easy_start_annual', mode: 'subscription' })).status, 200, 'annual (no promotion) still works');
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

// ── Subscriber top-ups: retired from new sales (2 Oct 2026) ──
const TOPUP5 = 'price_1Tys3JGZLILz5vqUXA6L9jxc';
const DAY = 86400000;
const ALL_TOPUPS = ['price_1Tdpd7GZLILz5vqUAiSw9udI', 'price_1TdpdzGZLILz5vqUYEjn6TZ2', TOPUP5, 'price_1Tys3qGZLILz5vqUnNlRAF6Q', 'price_1TeBHjKF3jvQfgEaX2aPZX6E', 'price_1TeBIKKF3jvQfgEaxU4TjPHu', 'price_something_else'];
for (const priceId of ALL_TOPUPS) {
  await test(`top-ups retired: ${priceId} is refused even for an active subscriber (410 TOPUPS_RETIRED, no Stripe call)`, async () => {
    db().tables.profiles.push({ id: 'user-1', subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 });
    const r = await call({ priceId, mode: 'payment' });
    eq([r.status, (await r.json()).code], [410, 'TOPUPS_RETIRED'], 'refused');
    eq(stripeRequests.length, 0, 'no Stripe session');
  });
}
await test('D4 a trial customer can still start Pay As You Go', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  eq((await call(paygBody)).status, 200, 'PAYG allowed'); eq(stripeRequests[0].get('metadata[type]'), 'payg', 'PAYG');
  eq(db().tables.profiles[0].subscription_status, 'trialing', 'opening checkout never ends the trial (D5)');
});

// ── Approved decisions 1 + 2: the complete purchase-route matrix, enforced
//    by the server (direct endpoint calls, not just hidden buttons). ──
const MATRIX: [string, Record<string, unknown>, boolean, boolean][] = [
  // state, profile, PAYG allowed, (unused: top-ups are retired for everyone)
  ['trial', { subscription_status: 'trialing', plan: 'free', downloads_limit: 10, trial_end: new Date(Date.now() + 5 * DAY).toISOString() }, true, false],
  ['expired trial', { subscription_status: 'trialing', plan: 'free', downloads_limit: 10, trial_end: new Date(Date.now() - DAY).toISOString() }, true, false],
  ['Pay As You Go', { subscription_status: 'payg', plan: 'payg', downloads_limit: 0 }, true, false],
  ['active Easy Start', { subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 }, false, true],
  ['active Easy Pro', { subscription_status: 'active', plan: 'easy_pro', downloads_limit: 30 }, false, true],
  ['cancel at period end, still paid', { subscription_status: 'cancelled', plan: 'easy_pro', downloads_limit: 30, deletion_date: new Date(Date.now() + 9 * DAY).toISOString() }, false, true],
  ['paused', { subscription_status: 'paused', plan: 'easy_start', downloads_limit: 20 }, true, false],
  ['fully ended (downgraded)', { subscription_status: 'cancelled', plan: 'free', downloads_limit: 0 }, true, false],
  ['fully ended (paid period over)', { subscription_status: 'cancelled', plan: 'easy_pro', downloads_limit: 30, deletion_date: new Date(Date.now() - DAY).toISOString() }, true, false],
];
for (const [name, profile, paygOk, topupOk] of MATRIX) {
  await test(`matrix: ${name} -> PAYG ${paygOk ? 'available' : 'refused'}, top-ups refused`, async () => {
    db().tables.profiles.push({ id: 'user-1', ...profile });
    const r1 = await call(paygBody);
    const b1 = await r1.json();
    if (paygOk) { eq(r1.status, 200, 'PAYG status'); eq(stripeRequests[0].get('metadata[type]'), 'payg', 'PAYG session'); }
    else {
      eq(r1.status, 403, 'PAYG refused'); eq(b1.code, 'PAYG_NOT_FOR_SUBSCRIBERS', 'code');
      eq(/unlimited downloads/.test(b1.error), true, 'explains the subscription already includes unlimited downloads');
      eq('topupUrl' in b1, false, 'no top-up redirect');
      eq(stripeRequests.length, 0, 'no PAYG Stripe session');
    }
    stripeRequests.length = 0;
    const r2 = await call({ priceId: TOPUP5, mode: 'payment' });
    eq(r2.status, 410, 'top-up retired'); void topupOk;
    eq(db().tables.profiles[0].subscription_status, profile.subscription_status, 'opening/refusing checkout never changes the account');
  });
}
await test('decision 2: an active subscriber cannot reach PAYG by sending mode=subscription or no mode', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'active', plan: 'easy_start', downloads_limit: 20 });
  for (const body of [{ productKey: 'payg_5', mode: 'subscription' }, { productKey: 'payg_5' }]) {
    const r = await call(body);
    eq(r.status, 403, 'refused'); eq((await r.json()).code, 'PAYG_NOT_FOR_SUBSCRIBERS', 'code');
  }
  eq(stripeRequests.length, 0, 'no Stripe session');
});

// ── Duplicate-subscription checkout lock (checkout_locks, 5 minutes) ──
// What pricing.html / checkout.html receive when a customer comes back from a
// Stripe Checkout they did not finish and picks a plan again. The response
// carries no plan, price, session or remaining time (the lock stores none).
const LIVE_START_M = 'price_1TdoEYGZLILz5vqUIqlEsf4X';
const T0 = '2026-10-01T12:00:00.000Z';
const plus = (ms: number) => new Date(new Date(T0).getTime() + ms).toISOString();
await test('lock: Easy Start opens; an immediate second Easy Start monthly or annual attempt gets 409 CHECKOUT_IN_PROGRESS without calling Stripe', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  eq((await callAt(T0, { priceId: LIVE_START_M, mode: 'subscription' })).status, 200, 'Easy Start checkout opens');
  eq(db().tables.checkout_locks.length, 1, 'lock held after a successful session');
  for (const [label, body, at] of [['Easy Start again', { priceId: LIVE_START_M }, plus(5_000)], ['Easy Start annual', { productKey: 'easy_start_annual' }, plus(102_000)], ['Easy Start annual (direct id)', { priceId: ANNUAL_89 }, plus(4 * 60_000 + 59_000)]] as const) {
    const r = await callAt(at, { ...body, mode: 'subscription' });
    const b = await r.json();
    eq([r.status, b.code], [409, 'CHECKOUT_IN_PROGRESS'], label);
    eq(Object.keys(b).sort(), ['code', 'error'], label + ': response has only code + message (no plan, price, session or time)');
  }
  eq(stripeRequests.length, 1, 'only the first attempt reached Stripe');
});
await test('lock: after 5 minutes the stale lock is cleared and Easy Start annual opens normally', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  await callAt(T0, { priceId: LIVE_START_M, mode: 'subscription' });
  eq((await callAt(plus(5 * 60_000 + 1_000), { productKey: 'easy_start_annual', mode: 'subscription' })).status, 200, 'annual opens after expiry');
  eq(stripeRequests[1].get('line_items[0][price]'), ANNUAL_89, 'Easy Start annual price');
  eq(db().tables.checkout_locks.length, 1, 'one fresh lock for the new checkout');
});
await test('lock: Pay As You Go is not blocked by a subscription checkout lock', async () => {
  db().tables.profiles.push({ id: 'user-1', subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  await callAt(T0, { priceId: LIVE_START_M, mode: 'subscription' });
  eq((await callAt(plus(30_000), paygBody)).status, 200, 'PAYG opens during the lock');
  eq(stripeRequests[1].get('metadata[type]'), 'payg', 'PAYG session');
});
await test("lock: one customer's lock never blocks another customer", async () => {
  db().tables.checkout_locks.push({ user_id: 'someone-else', created_at: plus(0) });
  eq((await callAt(plus(10_000), { priceId: LIVE_START_M, mode: 'subscription' })).status, 200, 'user-1 unaffected');
});

out(`create-checkout-session offline checks passed (${passed} scenarios)`);
