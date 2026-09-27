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

// Mock Stripe, modelled on the real CLPeasy Sandbox responses (26 Sep 2026):
//  - GET /v1/subscriptions/{id}
//  - GET /v1/invoices/upcoming: works for classic subscriptions but returns
//    Stripe's real 400 for billing_mode=flexible (the Sandbox's Checkout
//    subscriptions are flexible).
//  - POST /v1/invoices/create_preview: works for BOTH billing modes; an empty
//    `discounts` previews without inherited discounts.
// Amounts are computed from the price and attached discount exactly as Stripe
// does for these fixtures, so the test can prove which request was made.
let stripeSubs: Record<string, any> = {};
let stripeDown = false;
let previewDown = false;
type StripeReq = { method: string, path: string, params: URLSearchParams };
const stripeRequests: StripeReq[] = [];
function preview(params: URLSearchParams) {
  const s = stripeSubs[params.get('subscription')!];
  if (!s || s.customer !== params.get('customer')) return new Response(JSON.stringify({ error: { message: 'No such subscription' } }), { status: 404 });
  const price = s.items.data[0].price.unit_amount;
  const noDiscounts = params.has('discounts') && params.get('discounts') === '';
  const c = noDiscounts ? null : s.discount?.coupon;
  const off = !c ? 0 : c.amount_off ?? Math.round(price * (c.percent_off / 100));
  const due = Math.max(0, price - off + (s.__customerBalance ?? 0));
  return new Response(JSON.stringify({ object: 'invoice', amount_due: due, currency: 'gbp', next_payment_attempt: s.current_period_end + 3600,
    total_discount_amounts: off ? [{ amount: off }] : [] }), { status: 200 });
}
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.stripe.com/v1/')) throw new Error('unexpected outbound fetch: ' + url);
  if (init?.headers?.Authorization !== 'Bearer sk_test_offline') throw new Error('Stripe secret must be sent server-side');
  const u = new URL(url);
  const method = (init?.method || 'GET').toUpperCase();
  const params = method === 'GET' ? u.searchParams : new URLSearchParams(String(init?.body ?? ''));
  stripeRequests.push({ method, path: u.pathname, params });
  if (stripeDown) return new Response(JSON.stringify({ error: { message: 'Stripe unavailable' } }), { status: 503 });
  const m = u.pathname.match(/^\/v1\/subscriptions\/(.+)$/);
  if (m && method === 'GET') {
    const s = stripeSubs[decodeURIComponent(m[1])];
    return s ? new Response(JSON.stringify(s), { status: 200 }) : new Response(JSON.stringify({ error: { message: 'No such subscription' } }), { status: 404 });
  }
  if (u.pathname === '/v1/invoices/upcoming' && method === 'GET') {
    const s = stripeSubs[params.get('subscription')!];
    if (s?.billing_mode?.type === 'flexible') return new Response(JSON.stringify({ error: { message: 'The Upcoming Invoice API does not support `billing_mode = flexible` subscriptions. To preview invoices for these subscriptions, use the Create Preview Invoice API instead.' } }), { status: 400 });
    return preview(params);
  }
  if (u.pathname === '/v1/invoices/create_preview' && method === 'POST') {
    if (previewDown) return new Response(JSON.stringify({ error: { message: 'preview failed' } }), { status: 400 });
    return preview(params);
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
  (globalThis as any).__db = freshDb(); stripeSubs = {}; stripeDown = false; previewDown = false; stripeRequests.length = 0;
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
  eq(b.next_payment_at, DEC_2026 + 3600, 'date from Stripe (next payment attempt)');
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
  eq(stripeRequests[1].params.get('discounts'), '', 'asked Stripe to preview without discounts');
});
await test('promotion already removed by the webhook: standard price', async () => {
  seed(1499, 'month', null, JAN_2027);
  eq((await body()).amount_due, 1499, 'standard');
});
await test('other legitimate Stripe discount (account save-offer 50%) is shown as Stripe calculates it', async () => {
  seed(999, 'month', { id: 'coupon_save_offer_50', percent_off: 50 }, JAN_2027);
  const b = await body();
  eq([b.amount_due, b.discounted, b.promo_2026], [499, true, false], 'save-offer kept even in 2027 (not the promotion)');
  eq(stripeRequests[1].params.has('discounts'), false, 'other discounts never stripped');
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

// ── billing_mode = flexible (V14 manual E2E, 26 Sep 2026) ────────────────
// The Sandbox's Checkout subscriptions are billing_mode=flexible, for which
// Stripe rejects GET /v1/invoices/upcoming. The preview must come from
// POST /v1/invoices/create_preview for every subscription.
const FLEX = { billing_mode: { type: 'flexible', flexible: { proration_discounts: 'included' } } };
const previewCalls = () => stripeRequests.filter(r => r.path.startsWith('/v1/invoices/'));
await test('flexible Easy Start monthly on the 2026 promotion: £8.99 via Create Preview Invoice', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', percent_off: 10 }, DEC_2026, FLEX);
  const b = await body();
  eq([b.available, b.amount_due, b.currency, b.interval, b.promo_2026, b.discounted, b.next_payment_at], [true, 899, 'gbp', 'month', true, true, DEC_2026 + 3600], 'flexible promo');
  const calls = previewCalls();
  eq(calls.map(r => `${r.method} ${r.path}`), ['POST /v1/invoices/create_preview'], 'one preview call, never the Upcoming Invoice API');
  eq([calls[0].params.get('customer'), calls[0].params.get('subscription'), calls[0].params.has('discounts')], ['cus_1', 'sub_1', false], 'previews THIS customer/subscription with its discounts');
});
await test('flexible Easy Pro monthly promotion: £13.49', async () => {
  seed(1499, 'month', { id: 'coupon_promo_pro', percent_off: 10 }, DEC_2026, FLEX);
  eq((await body()).amount_due, 1349, 'flexible Pro promo');
});
await test('flexible annual Easy Start £99 and Easy Pro £149 (no discount)', async () => {
  seed(9900, 'year', null, DEC_2026, FLEX);
  let b = await body(); eq([b.amount_due, b.interval, b.discounted], [9900, 'year', false], 'flexible Start annual');
  (globalThis as any).__db = freshDb(); stripeSubs = {}; stripeRequests.length = 0;
  seed(14900, 'year', null, DEC_2026, FLEX);
  b = await body(); eq([b.amount_due, b.interval], [14900, 'year'], 'flexible Pro annual');
});
await test('flexible: first renewal on/after 1 Jan 2027 previews without the ending promotion (£9.99)', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', percent_off: 10 }, JAN_2027, FLEX);
  const b = await body();
  eq([b.amount_due, b.promo_2026, b.discounted], [999, false, false], 'standard price');
  eq(previewCalls().map(r => [r.method, r.path, r.params.get('discounts')]), [['POST', '/v1/invoices/create_preview', '']], 'discounts cleared on create_preview');
});
await test('flexible: unrelated discount (save-offer) is kept in 2027', async () => {
  seed(999, 'month', { id: 'coupon_save_offer_50', percent_off: 50 }, JAN_2027, FLEX);
  const b = await body();
  eq([b.amount_due, b.discounted, b.promo_2026], [499, true, false], 'save-offer kept');
  eq(previewCalls()[0].params.has('discounts'), false, 'not stripped');
});
await test('flexible: account credit is reflected exactly as Stripe calculates it', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', percent_off: 10 }, DEC_2026, FLEX); stripeSubs.sub_1.__customerBalance = -300;
  eq((await body()).amount_due, 599, 'Stripe amount_due after £3 credit');
});
await test('flexible: scheduled cancellation / paused show no upcoming charge and make no preview call', async () => {
  seed(999, 'month', null, DEC_2026, { ...FLEX, cancel_at_period_end: true });
  eq((await body()).available, false, 'cancel scheduled');
  eq(previewCalls().length, 0, 'no preview call');
  (globalThis as any).__db = freshDb(); stripeSubs = {}; stripeRequests.length = 0;
  seed(999, 'month', null, DEC_2026, { ...FLEX, pause_collection: { behavior: 'void' } });
  eq((await body()).available, false, 'paused');
});
await test('flexible: preview failure shows no amount (never a guessed price)', async () => {
  seed(999, 'month', { id: 'coupon_promo_start', percent_off: 10 }, DEC_2026, FLEX); previewDown = true;
  eq(await body(), { available: false, reason: 'lookup_failed' }, 'fails safe');
});
await test('classic (non-flexible) subscriptions also use Create Preview Invoice', async () => {
  seed(1499, 'month');
  eq((await body()).amount_due, 1499, 'classic amount');
  eq(previewCalls().map(r => `${r.method} ${r.path}`), ['POST /v1/invoices/create_preview'], 'same endpoint for every billing mode');
});
await test('no PAYG/subscription row: no Stripe preview call at all', async () => {
  eq(await body(), { available: false, reason: 'no_subscription' }, 'PAYG / no subscription');
  eq(stripeRequests.length, 0, 'no Stripe call');
});

out(`billing-status offline checks passed (${passed} scenarios)`);
