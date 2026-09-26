// Runs the REAL supabase/functions/billing-status/index.ts offline under Deno.
// Supabase is stubbed (import map); Stripe's HTTP API is mocked. Proves the
// Account page's "Next payment" amount is Stripe's own upcoming-invoice
// amount for THIS user, and that every failure returns no amount.
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', SUPABASE_URL: 'http://offline.invalid', SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline',
  PROMO_2026_EASY_START_MONTHLY_COUPON_ID: 'coupon_promo_start', PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID: 'coupon_promo_pro',
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

// Mock Stripe: subscriptions/{id} and invoices/upcoming. The "upcoming" amount
// is computed from the price and attached discount exactly as Stripe would for
// these fixtures, so the test can prove which request the function made.
let stripeSubs: Record<string, any> = {};
let stripeDown = false;
const stripeRequests: string[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.stripe.com/v1/')) throw new Error('unexpected outbound fetch: ' + url);
  if (init?.headers?.Authorization !== 'Bearer sk_test_offline') throw new Error('Stripe secret must be sent server-side');
  stripeRequests.push(String(url));
  if (stripeDown) return new Response(JSON.stringify({ error: { message: 'Stripe unavailable' } }), { status: 503 });
  const u = new URL(url);
  const m = u.pathname.match(/^\/v1\/subscriptions\/(.+)$/);
  if (m) {
    const s = stripeSubs[decodeURIComponent(m[1])];
    return s ? new Response(JSON.stringify(s), { status: 200 }) : new Response(JSON.stringify({ error: { message: 'No such subscription' } }), { status: 404 });
  }
  if (u.pathname === '/v1/invoices/upcoming') {
    const s = stripeSubs[u.searchParams.get('subscription')!];
    const price = s.items.data[0].price.unit_amount;
    const noDiscounts = u.searchParams.has('discounts') && u.searchParams.get('discounts') === '';
    const c = noDiscounts ? null : s.discount?.coupon;
    const off = !c ? 0 : c.amount_off ?? Math.round(price * (c.percent_off / 100));
    return new Response(JSON.stringify({ amount_due: price - off, currency: 'gbp', next_payment_attempt: s.current_period_end,
      total_discount_amounts: off ? [{ amount: off }] : [] }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
const out = console.log.bind(console);
console.log = () => {}; console.error = () => {};

await import('../../supabase/functions/billing-status/index.ts');
const handler = (globalThis as any).__handler as (r: Request) => Promise<Response>;

let passed = 0;
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
const db = () => (globalThis as any).__db;
async function test(name: string, fn: () => Promise<void>) {
  (globalThis as any).__db = freshDb(); stripeSubs = {}; stripeDown = false; stripeRequests.length = 0;
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  await fn(); passed++; out('PASS:', name);
}
const call = (auth = 'Bearer user-jwt') => handler(new Request('http://localhost/', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: '{}' }));
const DEC_2026 = Math.floor(Date.UTC(2026, 11, 15) / 1000), JAN_2027 = Math.floor(Date.UTC(2027, 0, 15) / 1000);
function seed(price: number, interval: 'month' | 'year', coupon: any = null, periodEnd = DEC_2026, extra: Record<string, unknown> = {}) {
  db().tables.subscriptions.push({ user_id: 'user-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' });
  stripeSubs.sub_1 = { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, pause_collection: null,
    current_period_end: periodEnd, discount: coupon ? { coupon } : null,
    items: { data: [{ price: { unit_amount: price, recurring: { interval } } }] }, ...extra };
}
async function body() { const r = await call(); eq(r.status, 200, 'status'); return await r.json(); }

await test('Easy Start 2026 promotion: actual next payment £8.99', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', amount_off: 100 });
  const b = await body();
  eq([b.available, b.amount_due, b.currency, b.interval, b.promo_2026, b.discounted], [true, 899, 'gbp', 'month', true, true], 'Start promo');
  eq(b.next_payment_at, DEC_2026, 'date from Stripe');
});
await test('Easy Pro 2026 promotion (10% coupon): actual next payment £13.49', async () => {
  seed(1499, 'month', { id: 'coupon_promo_pro', percent_off: 10 });
  eq([(await body()).amount_due], [1349], 'Pro promo');
});
await test('Easy Start standard: £9.99', async () => { seed(999, 'month'); const b = await body(); eq([b.amount_due, b.promo_2026, b.discounted], [999, false, false], 'standard'); });
await test('Easy Pro standard: £14.99', async () => { seed(1499, 'month'); eq((await body()).amount_due, 1499, 'standard'); });
await test('Easy Start annual: £99/year', async () => { seed(9900, 'year'); const b = await body(); eq([b.amount_due, b.interval], [9900, 'year'], 'annual'); });
await test('Easy Pro annual: £149/year', async () => { seed(14900, 'year'); const b = await body(); eq([b.amount_due, b.interval], [14900, 'year'], 'annual'); });
await test('promotion ends before the next period (renewal on/after 1 Jan 2027): standard £9.99, not £8.99', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', amount_off: 100 }, JAN_2027);
  const b = await body();
  eq([b.amount_due, b.promo_2026], [999, false], 'Stripe preview without the ending promotion');
  eq(new URL(stripeRequests[1]).searchParams.get('discounts'), '', 'asked Stripe to preview without discounts');
});
await test('promotion already removed by the webhook: standard price', async () => {
  seed(1499, 'month', null, JAN_2027);
  eq((await body()).amount_due, 1499, 'standard');
});
await test('other legitimate Stripe discount (account save-offer 50%) is shown as Stripe calculates it', async () => {
  seed(999, 'month', { id: 'coupon_save_offer_50', percent_off: 50 }, JAN_2027);
  const b = await body();
  eq([b.amount_due, b.discounted, b.promo_2026], [499, true, false], 'save-offer kept even in 2027 (not the promotion)');
  eq(new URL(stripeRequests[1]).searchParams.has('discounts'), false, 'other discounts never stripped');
});
await test('Stripe unavailable: no amount', async () => {
  seed(999, 'month'); stripeDown = true;
  eq(await body(), { available: false, reason: 'lookup_failed' }, 'fails safe');
});
await test('no linked subscription: no amount', async () => { eq(await body(), { available: false, reason: 'no_subscription' }, 'fails safe'); });
await test('cancel-at-period-end / paused: no upcoming charge', async () => {
  seed(999, 'month', null, DEC_2026, { cancel_at_period_end: true });
  eq((await body()).available, false, 'no charge shown');
});
await test('subscription belonging to another customer is never reported', async () => {
  seed(999, 'month'); stripeSubs.sub_1.customer = 'cus_someone_else';
  eq(await body(), { available: false, reason: 'mismatch' }, 'mismatch');
});
await test('Stripe not configured: no amount', async () => { seed(999, 'month'); Deno.env.delete('STRIPE_SECRET_KEY'); eq(await body(), { available: false, reason: 'not_configured' }, 'fails safe'); });
await test('not signed in: 401 and no Stripe call', async () => {
  const r = await call(''); eq(r.status, 401, 'status'); eq(stripeRequests.length, 0, 'no Stripe call');
  db().authUser = null; eq((await call()).status, 401, 'invalid session');
});
await test('no Stripe IDs or secrets are returned to the browser', async () => {
  seed(899, 'month');
  const txt = JSON.stringify(await body());
  eq(/cus_|sub_|sk_|coupon_/.test(txt), false, 'response contains no identifiers or secrets');
});

out(`billing-status offline checks passed (${passed} scenarios)`);
