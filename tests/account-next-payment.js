// Approved decision 4: the Account page shows the customer's ACTUAL next
// Stripe charge (from the billing-status Edge Function), never a guessed list
// price, and shows no amount at all when it cannot be determined.
// billing-status itself is tested offline in tests/deno/billing-status.test.ts.
// Run from repo root: node tests/account-next-payment.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const DAY = 86400000;
const src = fs.readFileSync('account.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const ent = fs.readFileSync('entitlement.js', 'utf8');

async function open(profile, billing, opts = {}) {
  const errors = [], fetches = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) errors.push(e.message); });
  const row = Object.assign({ email:'m@example.com', full_name:'Maker', created_at:new Date(Date.now()-90*DAY).toISOString(), next_payment:new Date(Date.now()+20*DAY).toISOString() }, profile);
  const dom = new JSDOM(src, { url:'https://clpeasy.com/account.html', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){
      if (opts.now) { const Real = w.Date; const t = new Real(opts.now).getTime(); w.Date = class extends Real { constructor(...a){ super(...(a.length ? a : [t])); } static now(){ return t; } }; }
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.eval(ent);
      w.fetch = async (url, init) => {
        fetches.push({ url, init });
        if (billing === 'network') throw new Error('offline');
        return { ok: billing.status ? billing.status < 400 : true, status: billing.status || 200, json: async () => billing.body };
      };
      const q = { select(){return this;}, eq(){return this;}, single(){ return Promise.resolve({ data: row, error: null }); } };
      w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'user-jwt', user: { id: 'u1', email: 'm@example.com', created_at: row.created_at } } } }) }, from: () => Object.create(q) }) };
    } });
  await new Promise(r => setTimeout(r, 300));
  const t = id => dom.window.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
  return { w: dom.window, t, errors, fetches };
}
const at = iso => Math.floor(new Date(iso).getTime() / 1000);
const start = { plan:'easy_start', is_pro:false, subscription_status:'active', billing_cycle:'monthly', downloads_limit:20, downloads_used:1 };
const pro = { plan:'easy_pro', is_pro:true, subscription_status:'active', billing_cycle:'monthly', downloads_limit:30, downloads_used:1 };
const ok = (amount_due, interval, extra = {}) => ({ body: Object.assign({ available:true, amount_due, currency:'gbp', next_payment_at: at('2026-10-15T09:00:00Z'), interval, discounted:false, promo_2026:false }, extra) });

(async () => {
  const cases = [
    ['Easy Start 2026 promotion', start, ok(899, 'month', { discounted:true, promo_2026:true }), 'Next payment: £8.99 on 15 Oct 2026 · 2026 offer applied'],
    ['Easy Pro 2026 promotion',   pro,   ok(1349, 'month', { discounted:true, promo_2026:true }), 'Next payment: £13.49 on 15 Oct 2026 · 2026 offer applied'],
    ['Easy Start standard',       start, ok(999, 'month'), 'Next payment: £9.99 on 15 Oct 2026'],
    ['Easy Pro standard',         pro,   ok(1499, 'month'), 'Next payment: £14.99 on 15 Oct 2026'],
    ['Easy Start annual',         Object.assign({}, start, { billing_cycle:'annual' }), ok(9900, 'year'), 'Next payment: £99 on 15 Oct 2026'],
    ['Easy Pro annual',           Object.assign({}, pro, { billing_cycle:'annual' }), ok(14900, 'year'), 'Next payment: £149 on 15 Oct 2026'],
    ['promotion removed/expired', start, ok(999, 'month', { next_payment_at: at('2027-01-15T09:00:00Z') }), 'Next payment: £9.99 on 15 Jan 2027'],
    ['account save-offer discount', start, ok(499, 'month', { discounted:true }), 'Next payment: £4.99 on 15 Oct 2026 · discount applied'],
  ];
  for (const [name, profile, billing, expected] of cases) {
    const { t, errors, fetches } = await open(profile, billing);
    assert.deepStrictEqual(errors, [], name + ': ' + errors.join('; '));
    assert.strictEqual(t('renewal-line'), expected, name);
    const bs = fetches.filter(f => /\/functions\/v1\/billing-status$/.test(f.url));
    assert.strictEqual(bs.length, 1, name + ': one billing-status call');
    assert.strictEqual(bs[0].init.headers.Authorization, 'Bearer user-jwt', name + ': sends only the user session token');
    assert.strictEqual(t('billing-next'), expected.includes('Jan 2027') ? '15 Jan 2027' : '15 Oct 2026', name + ': billing card date from Stripe');
  }
  console.log('PASS: actual next payment shown for promo, standard, annual, expired-promo and other-discount customers');

  for (const [name, billing] of [
    ['billing lookup unavailable', { body: { available:false, reason:'lookup_failed' } }],
    ['billing-status server error', { status: 500, body: { error: 'x' } }],
    ['network failure', 'network'],
    ['malformed amount', { body: { available:true, amount_due:'8.99', currency:'gbp' } }],
  ]) {
    for (const profile of [start, pro]) {
      const { t } = await open(profile, billing);
      const line = t('renewal-line');
      assert(!/£/.test(line), `${name}: no guessed amount (got "${line}")`);
      assert(/billing portal/.test(line), `${name}: points to the billing portal`);
    }
  }
  console.log('PASS: when the next charge cannot be determined no amount is shown (never a guessed £9.99/£14.99)');

  // Non-active subscriptions never call billing-status.
  for (const profile of [
    { plan:'free', subscription_status:'trialing', trial_end:new Date(Date.now()+5*DAY).toISOString(), downloads_limit:10 },
    { plan:'payg', subscription_status:'payg', downloads_limit:0, topup_credits:3 },
  ]) {
    const { fetches } = await open(profile, ok(999, 'month'));
    assert.strictEqual(fetches.filter(f => /billing-status/.test(f.url)).length, 0, 'no billing lookup without an active subscription');
  }
  console.log('PASS: billing-status is only called for active subscriptions');

  // Resubscribe modal quotes what a NEW monthly checkout will charge.
  {
    const cancelled = { plan:'free', subscription_status:'cancelled', downloads_limit:0 };
    const a = await open(cancelled, ok(999,'month'), { now: '2026-11-01T12:00:00Z' });
    a.w.openModal('resubscribe');
    assert.strictEqual(a.t('resub-start-price'), '£8.99'); assert.strictEqual(a.t('resub-pro-price'), '£13.49');
    assert(/2026 offer until 31 December 2026, then £9\.99\/month/.test(a.t('resub-start')));
    const b = await open(cancelled, ok(999,'month'), { now: '2027-01-02T12:00:00Z' });
    b.w.openModal('resubscribe');
    assert.strictEqual(b.t('resub-start-price'), '£9.99'); assert.strictEqual(b.t('resub-pro-price'), '£14.99');
  }
  console.log('PASS: resubscribe modal matches the server-side 2026 promotion');
  console.log('account next-payment checks passed');
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
