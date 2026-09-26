// Runs the REAL supabase/functions/stripe-webhook/index.ts offline under Deno,
// with Stripe and Supabase replaced by in-memory stubs (import_map.json) and
// Brevo replaced by a mocked fetch. Nothing leaves the machine.
//
//   deno run --allow-env --allow-read --import-map=tests/deno/import_map.json tests/deno/stripe-webhook.test.ts
// (or: node tests/deno/run.js, which finds a local deno and skips if absent)
import { TEST_SIGNATURE } from './stubs/stripe.ts';
import { freshDb } from './stubs/supabase.ts';

const env: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_offline', STRIPE_WEBHOOK_SECRET: 'whsec_offline',
  SUPABASE_URL: 'http://offline.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline',
  BREVO_API_KEY: 'offline-brevo-key', BREVO_PAID_LIST_ID: '11',
  PROMO_2026_EASY_START_MONTHLY_COUPON_ID: 'coupon_promo_start', PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID: 'coupon_promo_pro',
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

let handler: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: any) => { handler = h; }, configurable: true, writable: true });

// Brevo (and any other outbound fetch) is mocked. The real network is never used.
const brevoCalls: any[] = [];
let brevoMode: 'created' | 'updated' | 'http500' | 'throw' = 'created';
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected outbound fetch in test: ' + url);
  brevoCalls.push({ url, body: JSON.parse(init.body) });
  if (brevoMode === 'throw') throw new Error('simulated Brevo network failure');
  if (brevoMode === 'http500') return new Response('{"message":"simulated Brevo outage"}', { status: 500 });
  return new Response(brevoMode === 'created' ? '{"id":1}' : null, { status: brevoMode === 'created' ? 201 : 204 });
};

const logs: string[] = [];
const out = console.log.bind(console);
for (const k of ['log', 'warn', 'error'] as const) { const orig = console[k]; console[k] = (...a: any[]) => { logs.push(a.map(String).join(' ')); if (Deno.env.get('VERBOSE')) orig(...a); }; }

await import('../../supabase/functions/stripe-webhook/index.ts');

let passed = 0;
function assert(cond: unknown, msg: string) { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); }
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }
async function test(name: string, fn: () => Promise<void>) {
  (globalThis as any).__db = freshDb(); brevoCalls.length = 0; brevoMode = 'created'; logs.length = 0;
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  await fn(); passed++; out('PASS:', name);
}
const db = () => (globalThis as any).__db;
function seedProfile(p: Record<string, unknown>) { db().tables.profiles.push({ id: 'user-1', topup_credits: 0, subscription_status: 'trialing', plan: 'free', ...p }); }
const balance = () => db().tables.profiles.find((r: any) => r.id === 'user-1').topup_credits;
function paygEvent(id: string, over: Record<string, any> = {}) {
  return { id, type: 'checkout.session.completed', data: { object: {
    id: 'cs_test_' + id, payment_status: 'paid', customer: 'cus_1', subscription: null,
    customer_details: { email: 'buyer@example.com', name: 'Maker Person' },
    metadata: { userId: 'user-1', priceId: 'price_payg', type: 'payg', downloads: '8' }, ...over } } };
}
function send(event: unknown, sig = TEST_SIGNATURE) {
  return handler(new Request('http://localhost/', { method: 'POST', headers: { 'stripe-signature': sig }, body: JSON.stringify(event) }));
}

await test('unsigned/fake webhook is rejected and credits nothing', async () => {
  seedProfile({});
  const r = await send(paygEvent('evt_fake'), 'forged');
  eq(r.status, 400, 'status'); eq(balance(), 0, 'balance'); eq(db().tables.stripe_processed_events.length, 0, 'no event claimed'); eq(brevoCalls.length, 0, 'no Brevo');
});

await test('PAYG purchase: credit 8, then NEW Brevo contact on the EXISTING paid list with PLAN = Pay As You Go (D2)', async () => {
  seedProfile({ subscription_status: 'trialing' });
  const r = await send(paygEvent('evt_new'));
  eq(r.status, 200, 'status'); eq(balance(), 8, 'credited 8');
  eq(brevoCalls.length, 1, 'one Brevo call');
  eq(brevoCalls[0].body.listIds, [11], 'existing paid-customer list (BREVO_PAID_LIST_ID)');
  eq(brevoCalls[0].body.attributes, { FIRSTNAME: 'Maker', PLAN: 'Pay As You Go' }, 'attributes');
  eq(brevoCalls[0].body.updateEnabled, true, 'upsert');
  const creditIdx = db().rpcCalls.findIndex((c: any) => c.name === 'credit_payg_purchase');
  assert(creditIdx === 0, 'credit happened');
  assert(logs.findIndex(l => l.includes('PAYG: +8')) < logs.findIndex(l => l.includes('Brevo PAYG contact upsert HTTP 201')), 'Brevo runs only after the credit');
});

await test('PAYG purchase by an EXISTING Brevo contact (HTTP 204 update) is credited once', async () => {
  seedProfile({ topup_credits: 2, subscription_status: 'trialing' });
  brevoMode = 'updated';
  const r = await send(paygEvent('evt_existing'));
  eq(r.status, 200, 'status'); eq(balance(), 10, '2 + 8'); eq(brevoCalls.length, 1, 'one Brevo upsert');
  assert(logs.some(l => l.includes('Brevo PAYG contact upsert HTTP 204')), 'update logged');
});

await test('duplicate Stripe delivery: no second credit and no second Brevo call', async () => {
  seedProfile({});
  await send(paygEvent('evt_dup'));
  const r2 = await send(paygEvent('evt_dup'));
  eq(r2.status, 200, 'status'); eq((await r2.json()).duplicate, true, 'reported duplicate');
  eq(balance(), 8, 'still 8'); eq(brevoCalls.length, 1, 'Brevo once');
});

await test('credit failure: 500, claim released, NO Brevo; Stripe retry credits once and Brevo runs once; later resend ignored', async () => {
  seedProfile({});
  db().failRpcOnce = 1;
  const r1 = await send(paygEvent('evt_retry'));
  eq(r1.status, 500, 'failure reported to Stripe'); eq(balance(), 0, 'nothing credited');
  eq(db().tables.stripe_processed_events.length, 0, 'claim released for retry'); eq(brevoCalls.length, 0, 'no Brevo before a successful credit');
  const r2 = await send(paygEvent('evt_retry'));
  eq(r2.status, 200, 'retry ok'); eq(balance(), 8, 'credited exactly once'); eq(brevoCalls.length, 1, 'Brevo once');
  const r3 = await send(paygEvent('evt_retry'));
  eq((await r3.json()).duplicate, true, 'resend after recovery ignored'); eq(balance(), 8, 'still 8'); eq(brevoCalls.length, 1, 'Brevo still once');
});

for (const mode of ['http500', 'throw'] as const) {
  await test(`Brevo failure (${mode}) never fails or repeats the credit`, async () => {
    seedProfile({});
    brevoMode = mode;
    const r = await send(paygEvent('evt_brevo_' + mode));
    eq(r.status, 200, 'webhook still succeeds'); eq(balance(), 8, 'credit kept');
    eq(db().tables.stripe_processed_events.length, 1, 'event stays claimed (not released)');
    const again = await send(paygEvent('evt_brevo_' + mode));
    eq((await again.json()).duplicate, true, 'a Stripe resend is a duplicate'); eq(balance(), 8, 'no double credit');
  });
}

await test('Brevo paid list not configured: credit still succeeds, Brevo skipped', async () => {
  seedProfile({});
  Deno.env.delete('BREVO_PAID_LIST_ID');
  const r = await send(paygEvent('evt_nolist'));
  eq(r.status, 200, 'status'); eq(balance(), 8, 'credited'); eq(brevoCalls.length, 0, 'no Brevo call');
});

await test('current subscriber buying PAYG: credited, subscriber PLAN attribute not overwritten', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_pro', topup_credits: 1 });
  const r = await send(paygEvent('evt_sub_buyer'));
  eq(r.status, 200, 'status'); eq(balance(), 9, 'credited'); eq(brevoCalls.length, 0, 'PAYG journey skipped for a current subscriber');
});

await test('unpaid Checkout session is never credited', async () => {
  seedProfile({});
  const r = await send(paygEvent('evt_unpaid', { payment_status: 'unpaid' }));
  eq(r.status, 200, 'acknowledged'); eq(balance(), 0, 'not credited'); eq(brevoCalls.length, 0, 'no Brevo');
});

await test('unexpected PAYG quantity is never credited', async () => {
  seedProfile({});
  const ev = paygEvent('evt_qty'); ev.data.object.metadata.downloads = '50';
  await send(ev);
  eq(balance(), 0, 'not credited'); eq(brevoCalls.length, 0, 'no Brevo');
});

await test('subscription purchase still uses the subscriber Brevo list (unchanged)', async () => {
  seedProfile({});
  const ev = { id: 'evt_sub', type: 'checkout.session.completed', data: { object: {
    id: 'cs_test_sub', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1',
    customer_details: { email: 'buyer@example.com', name: 'Maker Person' },
    metadata: { userId: 'user-1', priceId: 'price_1TyDuRGZLILz5vqU3RIuVFJD' } } } };
  const r = await send(ev);
  eq(r.status, 200, 'status');
  eq(brevoCalls.length, 1, 'one Brevo call'); eq(brevoCalls[0].body.listIds, [11], 'subscriber list');
  eq(brevoCalls[0].body.attributes.PLAN, 'Easy Start Monthly', 'subscription plan label');
});

// ── D5: trial customer buys PAYG ────────────────────────────────────
const prof = () => db().tables.profiles.find((r: any) => r.id === 'user-1');
await test('D5 live trial + successful PAYG: trial ends, account becomes Pay As You Go, 8 downloads', async () => {
  seedProfile({ subscription_status: 'trialing', plan: 'free', trial_end: new Date(Date.now() + 5 * 86400000).toISOString(), downloads_limit: 10, downloads_used: 2 });
  const r = await send(paygEvent('evt_trial_buy'));
  eq(r.status, 200, 'status');
  eq([prof().subscription_status, prof().plan, prof().downloads_limit, prof().topup_credits], ['payg', 'payg', 0, 8], 'converted, trial allowance forfeited');
  assert(new Date(prof().trial_end).getTime() <= Date.now() + 1000, 'trial_end is now');
  eq(brevoCalls.length, 1, 'PAYG Brevo journey for the converted customer'); eq(brevoCalls[0].body.attributes.PLAN, 'Pay As You Go', 'PLAN');
});
await test('D5 duplicate successful webhook: no second credit, no second conversion or Brevo call', async () => {
  seedProfile({ subscription_status: 'trialing', plan: 'free', trial_end: new Date(Date.now() + 5 * 86400000).toISOString(), downloads_limit: 10 });
  await send(paygEvent('evt_trial_dup'));
  const snapshot = JSON.stringify(prof());
  const r2 = await send(paygEvent('evt_trial_dup'));
  eq((await r2.json()).duplicate, true, 'duplicate'); eq(JSON.stringify(prof()), snapshot, 'profile unchanged by the duplicate');
  eq(db().rpcCalls.filter((c: any) => c.name === 'credit_payg_purchase').length, 1, 'credit/convert ran once'); eq(brevoCalls.length, 1, 'Brevo once');
});
await test('D5 unpaid/failed payment: trial untouched, nothing credited', async () => {
  seedProfile({ subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  await send(paygEvent('evt_trial_unpaid', { payment_status: 'unpaid' }));
  eq([prof().subscription_status, prof().topup_credits, prof().downloads_limit], ['trialing', 0, 10], 'still on the trial');
  eq(db().rpcCalls.length, 0, 'credit/convert never called');
});
await test('D5 credit failure: trial untouched; Stripe retry converts exactly once', async () => {
  seedProfile({ subscription_status: 'trialing', plan: 'free', downloads_limit: 10 });
  db().failRpcOnce = 1;
  eq((await send(paygEvent('evt_trial_retry'))).status, 500, 'failure');
  eq([prof().subscription_status, prof().topup_credits], ['trialing', 0], 'nothing changed');
  eq((await send(paygEvent('evt_trial_retry'))).status, 200, 'retry');
  eq([prof().subscription_status, prof().topup_credits], ['payg', 8], 'converted once');
});
await test('D5 expired trial buys PAYG: converted', async () => {
  seedProfile({ subscription_status: 'trialing', plan: 'free', trial_end: new Date(Date.now() - 9 * 86400000).toISOString(), downloads_limit: 10, downloads_used: 10 });
  await send(paygEvent('evt_expired_buy'));
  eq([prof().subscription_status, prof().topup_credits], ['payg', 8], 'Pay As You Go');
});
await test('D5 existing PAYG buys again: +8, stays Pay As You Go', async () => {
  seedProfile({ subscription_status: 'payg', plan: 'payg', downloads_limit: 0, topup_credits: 0 });
  await send(paygEvent('evt_again'));
  eq([prof().subscription_status, prof().plan, prof().topup_credits], ['payg', 'payg', 8], 'credited only');
});
await test('active Easy Pro subscriber buys PAYG: downloads credited, subscription and Brevo PLAN untouched', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_pro', downloads_limit: 30, downloads_used: 4, topup_credits: 0 });
  await send(paygEvent('evt_sub_payg'));
  eq([prof().subscription_status, prof().plan, prof().downloads_limit, prof().downloads_used, prof().topup_credits], ['active', 'easy_pro', 30, 4, 8], 'only the purchased balance changed');
  eq(brevoCalls.length, 0, 'no PLAN overwrite');
});

// ── Subscriber top-up webhook: atomic, paid-only ──────────────────────
function topupEvent(id: string, over: Record<string, any> = {}) {
  return { id, type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + id, payment_status: 'paid', customer: 'cus_1', subscription: null,
    metadata: { userId: 'user-1', priceId: 'price_1Tys3JGZLILz5vqUXA6L9jxc', type: 'topup' }, ...over } } };
}
await test('subscriber top-up: +5 via the atomic credit RPC, duplicate ignored', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_start', topup_credits: 1, topup_months: 0 });
  await send(topupEvent('evt_topup'));
  await send(topupEvent('evt_topup'));
  eq(prof().topup_credits, 6, 'credited once'); eq(prof().topup_months, 1, 'nudge counter once');
  eq(db().rpcCalls.map((c: any) => c.name), ['credit_purchased_downloads'], 'atomic RPC');
});
await test('unpaid top-up session is never credited', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_start', topup_credits: 0 });
  await send(topupEvent('evt_topup_unpaid', { payment_status: 'unpaid' }));
  eq(prof().topup_credits, 0, 'not credited');
});

// ── D3: 2026 monthly promotion removed at the first 2027 renewal ─────
function renewal(id: string, periodStartIso: string, over: Record<string, any> = {}) {
  return { id, type: 'invoice.created', data: { object: { id: 'in_' + id, status: 'draft', billing_reason: 'subscription_cycle', subscription: 'sub_promo',
    discount: { coupon: { id: 'coupon_promo_start' } }, lines: { data: [{ period: { start: Math.floor(new Date(periodStartIso).getTime() / 1000) } }] }, ...over } } };
}
const calls = () => ((globalThis as any).__stripeCalls ??= []);
await test('D3 renewal for a period starting 15 Dec 2026 keeps the promotion', async () => {
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_promo: { id: 'sub_promo', discount: { coupon: { id: 'coupon_promo_start' } } } };
  await send(renewal('evt_dec', '2026-12-15T10:00:00Z'));
  eq(calls(), [], 'nothing removed in 2026');
});
await test('D3 first renewal from 1 Jan 2027 removes the promotion from subscription and draft invoice (standard price)', async () => {
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_promo: { id: 'sub_promo', discount: { coupon: { id: 'coupon_promo_start' } } } };
  const r = await send(renewal('evt_jan', '2027-01-15T10:00:00Z'));
  eq(r.status, 200, 'status');
  eq(calls().map((c: any[]) => c[0]), ['subscriptions.deleteDiscount', 'invoices.update'], 'both removed');
  eq(calls()[1][2], { discounts: '' }, 'draft invoice discounts cleared');
  (globalThis as any).__stripeCalls = [];
  await send(renewal('evt_feb', '2027-02-15T10:00:00Z', { discount: null }));
  eq(calls(), [], 'later renewals: nothing left to remove');
});
await test('D3 other coupons (e.g. account save-offer) are never removed', async () => {
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_promo: { id: 'sub_promo', discount: { coupon: { id: 'coupon_save_offer_50' } } } };
  await send(renewal('evt_other', '2027-01-15T10:00:00Z', { discount: { coupon: { id: 'coupon_save_offer_50' } } }));
  eq(calls(), [], 'untouched');
});

out(`stripe-webhook offline checks passed (${passed} scenarios)`);
