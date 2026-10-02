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

// ── Duplicate-protection claim failures (CLPeasy Test, 2 Oct 2026: PostgREST
// rejected one claim insert with PGRST303 "JWT issued at future" on a cold
// start). The webhook must never credit PAYG without a recorded claim, or a
// later redelivery of the same event could credit it a second time.
await test('claim insert rejected once (PGRST303 clock skew): retried, credited once, claim recorded; redelivery is a duplicate', async () => {
  seedProfile({});
  db().failClaimInsert = 1;
  const r = await send(paygEvent('evt_skew_once'));
  eq(r.status, 200, 'processed after a successful retry'); eq(balance(), 8, 'credited once');
  eq(db().tables.stripe_processed_events.map((e: any) => e.event_id), ['evt_skew_once'], 'claim recorded');
  const again = await send(paygEvent('evt_skew_once'));
  eq((await again.json()).duplicate, true, 'redelivery skipped'); eq(balance(), 8, 'NO double credit');
});
await test('claim insert keeps failing: 500 to Stripe, NOTHING credited, nothing claimed; Stripe retry later credits exactly once', async () => {
  seedProfile({});
  db().failClaimInsert = 10;
  const r1 = await send(paygEvent('evt_skew_down'));
  eq(r1.status, 500, 'fail closed: Stripe will retry'); eq(balance(), 0, 'no credit without a claim');
  eq(db().tables.stripe_processed_events.length, 0, 'nothing claimed'); eq(db().rpcCalls.length, 0, 'credit function never called'); eq(brevoCalls.length, 0, 'no Brevo');
  db().failClaimInsert = 0;
  const r2 = await send(paygEvent('evt_skew_down'));
  eq(r2.status, 200, 'retry ok'); eq(balance(), 8, 'credited exactly once');
  const r3 = await send(paygEvent('evt_skew_down'));
  eq((await r3.json()).duplicate, true, 'later resend ignored'); eq(balance(), 8, 'still 8');
});
await test('claim written but response lost (no error code): the retry sees our own claim and processes ONCE (no lost purchase)', async () => {
  seedProfile({});
  db().claimWritesThenErrors = 1;
  const r = await send(paygEvent('evt_ambiguous'));
  eq(r.status, 200, 'processed'); eq(balance(), 8, 'credited once, not lost');
  const again = await send(paygEvent('evt_ambiguous'));
  eq((await again.json()).duplicate, true, 'redelivery skipped'); eq(balance(), 8, 'no double credit');
});
await test('a genuine duplicate is still recognised after a definite (coded) claim failure', async () => {
  seedProfile({});
  await send(paygEvent('evt_dup_after_skew'));
  db().failClaimInsert = 1;
  const r = await send(paygEvent('evt_dup_after_skew'));
  eq((await r.json()).duplicate, true, 'duplicate'); eq(balance(), 8, 'still 8');
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

// ── Approved decision 3: fully ended subscription -> Pay As You Go ─────
await test('decision 3: fully ended subscriber buys PAYG -> current plan Pay As You Go', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'free', is_pro: true, downloads_limit: 0, topup_credits: 0 });
  await send(paygEvent('evt_ended_buy'));
  eq([prof().subscription_status, prof().plan, prof().is_pro, prof().downloads_limit, prof().topup_credits], ['payg', 'payg', false, 0, 8], 'converted');
  eq(brevoCalls.length, 1, 'PAYG Brevo journey'); eq(brevoCalls[0].body.attributes.PLAN, 'Pay As You Go', 'PLAN');
});
await test('decision 3: paid period over but Stripe deletion not yet processed -> converts; the late deletion keeps Pay As You Go', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'easy_pro', is_pro: true, downloads_limit: 30, deletion_date: new Date(Date.now() - 3600e3).toISOString(), topup_credits: 0 });
  await send(paygEvent('evt_period_over_buy'));
  eq([prof().subscription_status, prof().plan], ['payg', 'payg'], 'converted');
  const deleted = { id: 'evt_late_delete', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', metadata: { userId: 'user-1' } } } };
  eq((await send(deleted)).status, 200, 'deletion processed');
  eq([prof().subscription_status, prof().plan, prof().downloads_limit, prof().topup_credits], ['payg', 'payg', 0, 8], 'never reverts to Easy Pro (Cancelled)');
  eq(db().tables.subscriptions[0]?.status, 'cancelled', 'old subscription kept as history');
});
await test('decision 3: unpaid PAYG session never converts an ended subscription', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'free', downloads_limit: 0 });
  await send(paygEvent('evt_ended_unpaid', { payment_status: 'unpaid' }));
  eq([prof().subscription_status, prof().plan, prof().topup_credits], ['cancelled', 'free', 0], 'unchanged');
});
await test('decision 3: duplicate delivery converts/credits once', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'free', downloads_limit: 0 });
  await send(paygEvent('evt_ended_dup')); await send(paygEvent('evt_ended_dup'));
  eq([prof().subscription_status, prof().topup_credits], ['payg', 8], 'once');
});
await test('paused subscriber buys PAYG: credited, stays paused (not converted)', async () => {
  seedProfile({ subscription_status: 'paused', plan: 'easy_start', downloads_limit: 20, topup_credits: 0 });
  await send(paygEvent('evt_paused_buy'));
  eq([prof().subscription_status, prof().plan, prof().topup_credits], ['paused', 'easy_start', 8], 'credited only');
});
await test('a normal subscription deletion (no PAYG) still downgrades as before', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'easy_start', downloads_limit: 20 });
  await send({ id: 'evt_plain_delete', type: 'customer.subscription.deleted', data: { object: { id: 'sub_x', metadata: { userId: 'user-1' } } } });
  eq([prof().subscription_status, prof().plan, prof().downloads_limit], ['cancelled', 'free', 0], 'downgraded');
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
await test('CLPeasy sandbox top-up prices credit 5 and 10', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_start', topup_credits: 0, topup_months: 0 });
  await send(topupEvent('evt_sb5', { metadata: { userId: 'user-1', priceId: 'price_1TeBHjKF3jvQfgEaX2aPZX6E', type: 'topup' } }));
  await send(topupEvent('evt_sb10', { metadata: { userId: 'user-1', priceId: 'price_1TeBIKKF3jvQfgEaxU4TjPHu', type: 'topup' } }));
  eq(prof().topup_credits, 15, '5 + 10');
});
await test('unpaid top-up session is never credited', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_start', topup_credits: 0 });
  await send(topupEvent('evt_topup_unpaid', { payment_status: 'unpaid' }));
  eq(prof().topup_credits, 0, 'not credited');
});

// ── D3: 2026 monthly promotion removed at the first 2027 renewal ─────
function renewal(id: string, periodStartIso: string, over: Record<string, any> = {}) {
  const object = { id: 'in_' + id, status: 'draft', billing_reason: 'subscription_cycle', subscription: 'sub_promo',
    discount: { coupon: { id: 'coupon_promo_start' } }, lines: { data: [{ period: { start: Math.floor(new Date(periodStartIso).getTime() / 1000) } }] }, ...over };
  // what stripe.invoices.retrieve returns through the function's pinned API version
  ((globalThis as any).__stripeInvoices ??= {})[object.id] = object;
  return { id, type: 'invoice.created', data: { object } };
}
// The same invoice as sent by a webhook endpoint on API 2025-03-31 or later
// (e.g. 2026-05-27.dahlia): no `subscription` / `discount` on the invoice.
function renewalNewApi(id: string, periodStartIso: string) {
  const pinned = renewal(id, periodStartIso).data.object as any;
  const { subscription: _s, discount: _d, ...rest } = pinned;
  return { id, type: 'invoice.created', data: { object: { ...rest, discounts: ['di_test_1'],
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_promo' } } } } };
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

await test('D3 works when the endpoint sends new-API invoice payloads (parent.subscription_details)', async () => {
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_promo: { id: 'sub_promo', discount: { coupon: { id: 'coupon_promo_start' } } } };
  await send(renewalNewApi('evt_jan_new', '2027-01-15T10:00:00Z'));
  eq(calls().map((c: any[]) => c[0]), ['subscriptions.deleteDiscount', 'invoices.update'], 'both removed');
  (globalThis as any).__stripeCalls = []; (globalThis as any).__stripeSubscriptions = { sub_promo: { id: 'sub_promo', discount: { coupon: { id: 'coupon_promo_start' } } } };
  await send(renewalNewApi('evt_dec_new', '2026-12-15T10:00:00Z'));
  eq(calls(), [], 'nothing removed in 2026');
});

// ── Monthly allowance refill on invoice.paid (both payload shapes) ────
function paidInvoice(id: string, shape: 'pinned' | 'new') {
  const base: Record<string, any> = { id: 'in_' + id, status: 'paid', billing_reason: 'subscription_cycle' };
  if (shape === 'pinned') base.subscription = 'sub_refill';
  else base.parent = { type: 'subscription_details', subscription_details: { subscription: 'sub_refill' } };
  return { id, type: 'invoice.paid', data: { object: base } };
}
for (const shape of ['pinned', 'new'] as const) {
  await test(`invoice.paid refills the monthly allowance (${shape === 'new' ? 'new-API' : 'pinned-API'} payload)`, async () => {
    seedProfile({ subscription_status: 'active', plan: 'easy_start', downloads_used: 14, downloads_limit: 20, topup_credits: 6 });
    (globalThis as any).__stripeSubscriptions = { sub_refill: { id: 'sub_refill', metadata: { userId: 'user-1' }, items: { data: [{ price: { id: 'price_1Tdd5SKF3jvQfgEaclfSUxn5' } }] } } };
    const r = await send(paidInvoice('evt_refill_' + shape, shape));
    eq(r.status, 200, 'status');
    const p: any = db().tables.profiles.find((x: any) => x.id === 'user-1');
    eq([p.downloads_used, p.downloads_limit, p.plan, p.subscription_status, p.topup_credits], [0, 20, 'easy_start', 'active', 6], 'refilled, purchased credits kept');
  });
}

// ── MS-1 (approved): reactivation never refills the allowance ─────────
// Lifting a pause or a scheduled cancellation keeps downloads_used; only a
// successfully paid renewal (invoice.paid) or a genuine plan change starts a
// new allowance. Purchased downloads are never touched by any of it.
const PRICE = { start: 'price_1Tdd5SKF3jvQfgEaclfSUxn5', pro: 'price_1Tdd9OKF3jvQfgEaYsCmOwOa', proAnnual: 'price_1TddAyKF3jvQfgEaE7Vwbxl6' };
const PLAN_OF: Record<string, [string, number]> = { [PRICE.start]: ['easy_start', 20], [PRICE.pro]: ['easy_pro', 30], [PRICE.proAnnual]: ['easy_pro', 30] };
function subObj(price: string, over: Record<string, any> = {}) {
  return { id: 'sub_ms1', customer: 'cus_ms1', status: 'active', cancel_at_period_end: false, cancel_at: null, pause_collection: null,
    metadata: { userId: 'user-1' }, items: { data: [{ price: { id: price } }] }, ...over };
}
function subUpdated(id: string, sub: Record<string, any>, prev: Record<string, any>) {
  return { id, type: 'customer.subscription.updated', data: { object: sub, previous_attributes: prev } };
}
const PAUSED = { behavior: 'mark_uncollectible', resumes_at: null };
const snap = () => { const p: any = prof(); return [p.plan, p.subscription_status, p.downloads_used, p.downloads_limit, p.topup_credits]; };

for (const [label, price] of [['Easy Start', PRICE.start], ['Easy Pro', PRICE.pro]] as const) {
  const [plan, limit] = PLAN_OF[price];
  await test(`MS-1 ${label}: 5/${limit} used -> pause -> reactivate keeps 5/${limit}; purchased downloads untouched`, async () => {
    seedProfile({ subscription_status: 'active', plan, downloads_used: 5, downloads_limit: limit, topup_credits: 7, next_payment: '2026-10-27T00:00:00.000Z', downloads_reset_date: '2026-10-27T00:00:00.000Z' });
    await send(subUpdated('evt_ms1_pause_' + plan, subObj(price, { pause_collection: PAUSED }), { pause_collection: null }));
    eq(snap(), [plan, 'paused', 5, limit, 7], 'paused, allowance kept');
    const r = await send(subUpdated('evt_ms1_resume_' + plan, subObj(price), { pause_collection: PAUSED }));
    eq(r.status, 200, 'status');
    eq(snap(), [plan, 'active', 5, limit, 7], 'reactivated: still 5 used, no refill');
    eq([prof().next_payment, prof().downloads_reset_date], ['2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'], 'allowance period dates unchanged');
  });

  await test(`MS-1 ${label}: cancellation scheduled with usage -> reactivate before the end keeps usage`, async () => {
    seedProfile({ subscription_status: 'active', plan, downloads_used: 12, downloads_limit: limit, topup_credits: 3 });
    await send(subUpdated('evt_ms1_cancel_' + plan, subObj(price, { cancel_at_period_end: true, cancel_at: 1793058374 }), { cancel_at_period_end: false }));
    eq([prof().subscription_status, prof().deletion_date], ['cancelled', new Date(1793058374 * 1000).toISOString()], 'cancel scheduled');
    await send(subUpdated('evt_ms1_uncancel_' + plan, subObj(price), { cancel_at_period_end: true, cancel_at: 1793058374 }));
    eq(snap(), [plan, 'active', 12, limit, 3], 'reactivated: usage preserved, not a new allowance period');
    eq(prof().deletion_date, null, 'deletion date cleared');
  });

  await test(`MS-1 ${label}: paused across an unpaid (uncollectible) renewal -> reactivate gives no free refill`, async () => {
    seedProfile({ subscription_status: 'active', plan, downloads_used: limit, downloads_limit: limit, topup_credits: 2 });
    await send(subUpdated('evt_ms1_p2_' + plan, subObj(price, { pause_collection: PAUSED }), { pause_collection: null }));
    // The paused period's renewal: Stripe creates the invoice and marks it uncollectible (never paid).
    (globalThis as any).__stripeInvoices = { in_unpaid: { id: 'in_unpaid', status: 'draft', billing_reason: 'subscription_cycle', subscription: 'sub_ms1', discount: null } };
    await send({ id: 'evt_ms1_unpaid_created_' + plan, type: 'invoice.created', data: { object: { id: 'in_unpaid', status: 'draft', billing_reason: 'subscription_cycle', subscription: 'sub_ms1', lines: { data: [{ period: { start: 1793058374 } }] } } } });
    await send({ id: 'evt_ms1_uncollectible_' + plan, type: 'invoice.marked_uncollectible', data: { object: { id: 'in_unpaid', status: 'uncollectible', subscription: 'sub_ms1' } } });
    // A new period started in Stripe while paused (current_period_* moved) -- still unpaid.
    await send(subUpdated('evt_ms1_period_' + plan, subObj(price, { pause_collection: PAUSED }), { current_period_start: 1790466374, current_period_end: 1793058374, latest_invoice: 'in_prev' }));
    eq(snap(), [plan, 'paused', limit, limit, 2], 'unpaid period: nothing refilled while paused');
    await send(subUpdated('evt_ms1_r2_' + plan, subObj(price), { pause_collection: PAUSED }));
    eq(snap(), [plan, 'active', limit, limit, 2], 'reactivated: still fully used, no free allowance');
  });

  await test(`MS-1 ${label}: a successfully paid renewal still refills normally (purchased downloads kept)`, async () => {
    seedProfile({ subscription_status: 'active', plan, downloads_used: 9, downloads_limit: limit, topup_credits: 4 });
    (globalThis as any).__stripeSubscriptions = { sub_ms1: subObj(price) };
    await send({ id: 'evt_ms1_paid_' + plan, type: 'invoice.paid', data: { object: { id: 'in_paid', billing_reason: 'subscription_cycle', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_ms1' } } } } });
    eq(snap(), [plan, 'active', 0, limit, 4], 'paid renewal refills');
  });
}

await test('MS-1: duplicate delivery and repeated reactivation (retries / double clicks) never refill', async () => {
  seedProfile({ subscription_status: 'paused', plan: 'easy_start', downloads_used: 6, downloads_limit: 20, topup_credits: 1 });
  const ev = subUpdated('evt_ms1_dup', subObj(PRICE.start), { pause_collection: PAUSED });
  await send(ev); await send(ev); // same event delivered twice
  eq(snap(), ['easy_start', 'active', 6, 20, 1], 'after duplicate delivery');
  // manage-subscription pressed again on an already-active subscription: Stripe
  // sends an ordinary update (no pause/cancel transition), or none at all.
  await send(subUpdated('evt_ms1_again', subObj(PRICE.start), { metadata: {} }));
  await send(subUpdated('evt_ms1_again2', subObj(PRICE.start), { cancel_at_period_end: false }));
  eq(snap(), ['easy_start', 'active', 6, 20, 1], 'after repeated reactivation');
});

await test('MS-1: a genuine plan change (e.g. Easy Pro monthly -> annual) still applies the new plan and allowance (unchanged behaviour)', async () => {
  seedProfile({ subscription_status: 'active', plan: 'easy_pro', downloads_used: 7, downloads_limit: 30, topup_credits: 5, billing_cycle: 'monthly' });
  await send(subUpdated('evt_ms1_switch', subObj(PRICE.proAnnual), { items: { data: [{ price: { id: PRICE.pro } }] } }));
  eq([...snap(), prof().billing_cycle], ['easy_pro', 'active', 0, 30, 5, 'annual'], 'plan change');
});

await test('MS-1: a fully ended subscription is never turned back into a reactivation', async () => {
  seedProfile({ subscription_status: 'cancelled', plan: 'easy_start', downloads_used: 4, downloads_limit: 20, topup_credits: 9 });
  await send(subUpdated('evt_ms1_ended', subObj(PRICE.start, { status: 'canceled' }), { status: 'active', cancel_at_period_end: true }));
  eq(snap(), ['free', 'cancelled', 4, 0, 9], 'ended: free, allowance removed, purchased kept');
  await send({ id: 'evt_ms1_deleted', type: 'customer.subscription.deleted', data: { object: subObj(PRICE.start, { status: 'canceled' }) } });
  eq(snap(), ['free', 'cancelled', 4, 0, 9], 'deleted: still ended, purchased kept');
});

out(`stripe-webhook offline checks passed (${passed} scenarios)`);
