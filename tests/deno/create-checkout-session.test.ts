// Runs the REAL supabase/functions/create-checkout-session/index.ts offline
// under Deno. Stripe's HTTP API and Supabase are mocked; nothing leaves the
// machine. Documents exactly what each pricing-page button requests.
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', SUPABASE_URL: 'http://offline.invalid',
  SUPABASE_ANON_KEY: 'offline', SUPABASE_SERVICE_ROLE_KEY: 'offline', PAYG_5_PRICE_ID: 'price_payg_server_side',
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

await test('subscription checkout sends exactly the browser-chosen price with NO discount/coupon/promotion parameters', async () => {
  const r = await call({ priceId: 'price_1TdoEYGZLILz5vqUIqlEsf4X', mode: 'subscription' });
  eq(r.status, 200, 'status');
  const p = stripeRequests[0];
  eq(p.get('line_items[0][price]'), 'price_1TdoEYGZLILz5vqUIqlEsf4X', 'Easy Start monthly price id');
  eq(p.get('mode'), 'subscription', 'subscription');
  eq([...p.keys()].filter(k => /discount|coupon|promotion/i.test(k)), [], 'no promotion handling exists in checkout today');
});

out(`create-checkout-session offline checks passed (${passed} scenarios)`);
