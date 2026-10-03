// Regression: the pricing-page Pay As You Go button (PR #156) threw
// "sb is not defined" / SUPABASE_ANON_KEY on every click, and its sign-up
// redirect used ?return= which auth.html ignores (it only honours ?next=).
// Drives the real pricing.html script with a mocked Supabase and fetch.
// Run from repo root: node tests/payg-pricing-checkout.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('pricing.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');

async function open({ signedIn, pending, response, notice }){
  const calls = [], alerts = [], errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) errors.push(e.message); });
  vc.on('error', m => errors.push(String(m)));
  const dom = new JSDOM(source, {
    url: 'https://clpeasy.com/pricing.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      if (pending) w.sessionStorage.setItem('checkout_payg', pending === true ? 'consented' : pending);
      if (notice) w.eval(fs.readFileSync('checkout-notice.js', 'utf8')); // <script src> tags are stripped above
      w.alert = m => alerts.push(String(m));
      w.scrollTo = () => {};
      w.fetch = async (url, init) => { calls.push({ url, init }); return response || { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_x' }) }; };
      w.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: signedIn ? { access_token: 'user-jwt', user: { id: 'u1', email: 'q@example.com' } } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      } }) };
    }
  });
  await new Promise(r => setTimeout(r, 200));
  return { w: dom.window, calls, alerts, errors };
}

// PAYG immediate-supply consent (2 Oct 2026): the customer must actively tick
// the consent box before a PAYG checkout can start.
function tick(w){ const b = w.document.getElementById('payg-consent'); b.checked = true; b.dispatchEvent(new w.Event('change', { bubbles: true })); }

(async () => {
  // Consent: not pre-ticked; without it no checkout starts (signed in or out);
  // once ticked the request carries immediateSupplyConsent:true.
  {
    const { w, calls, alerts, errors } = await open({ signedIn: true });
    const box = w.document.getElementById('payg-consent');
    assert(box && box.type === 'checkbox', 'consent checkbox present');
    assert.strictEqual(box.checked, false, 'consent is not pre-ticked');
    assert.strictEqual(box.hasAttribute('checked'), false, 'no checked attribute in the markup');
    const label = box.closest('label').textContent.replace(/\s+/g, ' ');
    assert(/added to my account straight after payment/.test(label), 'asks for the credits to be added straight away');
    assert(/cancel within 14 days I will be refunded for any credits I have not used/.test(label), 'unused credits stay refundable within 14 days');
    assert(!/lose my 14-day right to cancel/.test(label), 'never says the right to cancel is lost when credits are added');
    await w.startPaygCheckout();
    assert.strictEqual(calls.length, 0, 'no checkout request without consent');
    assert.deepStrictEqual(alerts, [], 'inline message, not an alert');
    assert(w.document.getElementById('payg-consent-error').classList.contains('show'), 'consent prompt shown');
    tick(w);
    assert(!w.document.getElementById('payg-consent-error').classList.contains('show'), 'prompt cleared once ticked');
    await w.startPaygCheckout();
    assert.strictEqual(calls.length, 1, 'checkout starts after consent');
    assert.strictEqual(JSON.parse(calls[0].init.body).immediateSupplyConsent, true, 'consent sent to the server');
    assert.deepStrictEqual(errors, [], errors.join('; '));
    const { w: g, calls: gc } = await open({ signedIn: false });
    await g.startPaygCheckout();
    assert.strictEqual(gc.length, 0); assert.strictEqual(g.sessionStorage.getItem('checkout_payg'), null, 'guest without consent is not sent to sign-up');
    // A pending purchase without recorded consent (older '1' marker) never
    // resumes on its own: the box must be ticked on the page.
    const { w: r, calls: rc } = await open({ signedIn: true, pending: '1' });
    r.dispatchEvent(new r.Event('load')); await new Promise(res => setTimeout(res, 100));
    assert.strictEqual(rc.length, 0, 'resumed PAYG purchase without consent does not start');
    assert(r.document.getElementById('payg-consent-error').classList.contains('show'), 'resumed purchase asks for consent');
  }
  // Subscriptions are never gated by the PAYG consent.
  {
    const { w, calls } = await open({ signedIn: true });
    await w.startCheckout('easy_start');
    assert.strictEqual(calls.length, 1, 'subscription checkout starts without the PAYG box');
    assert.strictEqual(JSON.parse(calls[0].init.body).immediateSupplyConsent, undefined, 'no PAYG consent on subscriptions');
  }
  // Signed-in click creates a PAYG session with the page's real key and user JWT.
  {
    const { w, calls, alerts, errors } = await open({ signedIn: true });
    tick(w); await w.startPaygCheckout();
    assert.deepStrictEqual(alerts, [], 'no "Something went wrong" alert');
    assert.deepStrictEqual(errors, [], errors.join('; '));
    assert.strictEqual(calls.length, 1, 'one checkout request');
    assert(/\/functions\/v1\/create-checkout-session$/.test(calls[0].url));
    const body = JSON.parse(calls[0].init.body);
    assert.strictEqual(body.productKey, 'payg_5');
    assert.strictEqual(body.mode, 'payment');
    assert.strictEqual(body.priceId, undefined, 'the browser never chooses the PAYG price');
    assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer user-jwt');
    assert(calls[0].init.headers.apikey && calls[0].init.headers.apikey.startsWith('eyJ'), 'the page anon key is sent');
  }
  // Signed-out click remembers the purchase and sends the maker to sign up
  // with ?next=pricing.html (auth.html ignores ?return=).
  {
    const { w, calls, alerts } = await open({ signedIn: false });
    tick(w); await w.startPaygCheckout();
    assert.strictEqual(calls.length, 0, 'no checkout for a guest');
    assert.deepStrictEqual(alerts, []);
    assert.strictEqual(w.sessionStorage.getItem('checkout_payg'), 'consented', 'pending PAYG purchase remembered with its consent');
    const script = fs.readFileSync('pricing.html', 'utf8');
    assert(script.includes("auth.html?mode=signup&next=pricing.html"), 'PAYG sign-up redirect uses ?next=');
    assert(!script.includes('&return=pricing.html'), 'the ignored ?return= parameter is gone');
  }
  // After signing in, returning to pricing.html resumes the PAYG checkout once.
  {
    const { w, calls } = await open({ signedIn: true, pending: true });
    w.dispatchEvent(new w.Event('load'));
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(calls.length, 1, 'resumed PAYG checkout started once');
    assert.strictEqual(JSON.parse(calls[0].init.body).productKey, 'payg_5');
    assert.strictEqual(JSON.parse(calls[0].init.body).immediateSupplyConsent, true, 'the consent given before sign-up is sent');
    assert.strictEqual(w.sessionStorage.getItem('checkout_payg'), null, 'pending flag cleared so a refresh cannot start a second checkout');
  }
  // Billing selector (Easy Start Unlimited, 2 Oct 2026): Annual shows £89/year
  // and hides the monthly 2026 promotion; switching back to Monthly restores
  // the promotional price exactly. Easy Pro is no longer on the page.
  {
    const { w } = await open({ signedIn: false });
    const d = w.document, t = id => d.getElementById(id).textContent.trim();
    const IDS = ['maker-price','maker-period','maker-sub'];
    const monthly = IDS.map(t);
    assert.strictEqual(t('maker-price'), '£8.99', 'monthly shows the 2026 promotional price');
    assert(/£89\/year available · Save £30\.88/.test(t('maker-sub')), 'monthly view mentions the £89 annual option');
    assert.strictEqual(d.getElementById('easy-pro'), null, 'no Easy Pro card');
    assert.strictEqual(d.getElementById('pro-price'), null);
    const [mBtn, aBtn] = d.querySelectorAll('.toggle-btn');
    assert(/SAVE £30\.88/.test(aBtn.textContent), 'annual toggle shows the £30.88 saving');
    w.setBilling('annual', aBtn);
    assert.deepStrictEqual([t('maker-price'), t('maker-period')], ['£89', '/year']);
    assert(/Save £30\.88\/year vs standard monthly \(£119\.88\/year\)/.test(t('maker-sub')), 'annual saving vs standard monthly');
    assert(/£7\.42\/mo/.test(t('maker-annual-eq')), 'about £7.42 a month');
    assert.strictEqual(d.getElementById('maker-promo').style.display, 'none', 'annual view hides the monthly promotion');
    w.setBilling('monthly', mBtn);
    assert.deepStrictEqual(IDS.map(t), monthly, 'switching back to Monthly restores the promotional price exactly');
    assert.strictEqual(d.getElementById('maker-promo').style.display, '', 'monthly promotion visible again');
    assert.strictEqual(d.getElementById('maker-annual-eq').style.display, 'none', 'annual equivalent hidden on monthly');
  }
  // Easy Start Unlimited checkout requests: monthly sends the monthly price
  // (server adds the coupon); annual sends productKey easy_start_annual so the
  // SERVER chooses the £89 price -- never the old £99 price.
  {
    const { w, calls } = await open({ signedIn: true });
    await w.startCheckout('easy_start');
    assert.deepStrictEqual(JSON.parse(calls[0].init.body).priceId, 'price_1TdoEYGZLILz5vqUIqlEsf4X', 'monthly price');
    const { w: w2, calls: c2 } = await open({ signedIn: true });
    w2.eval("setBilling('annual', document.querySelector('[onclick*=\"annual\"]'))");
    await w2.startCheckout('easy_start');
    const b = JSON.parse(c2[0].init.body);
    assert.deepStrictEqual([b.productKey, b.mode, b.priceId], ['easy_start_annual', 'subscription', undefined], 'annual uses the server-side price');
    assert(!fs.readFileSync('pricing.html', 'utf8').includes('price_1TdoEXGZLILz5vqUQj5n6Zri'), 'old £99 annual price not on the page');
    const { w: w3, calls: c3, alerts: a3 } = await open({ signedIn: true });
    await w3.startCheckout('easy_pro');
    assert.deepStrictEqual([c3.length, a3.length], [0, 1], 'Easy Pro cannot be started from the page');
  }
  // Approved decision 2: the server refuses PAYG for current subscribers; the
  // page explains they already have unlimited downloads (no top-up redirect).
  {
    const refusal = { ok: false, status: 403, json: async () => ({ code: 'PAYG_NOT_FOR_SUBSCRIBERS', error: "You don't need Pay As You Go downloads: your Easy Start Unlimited subscription already includes unlimited downloads." }) };
    const { w, calls, alerts } = await open({ signedIn: true, response: refusal });
    tick(w); await w.startPaygCheckout();
    assert.strictEqual(calls.length, 1, 'the server was asked (and refused)');
    assert.strictEqual(alerts.length, 1);
    assert(/unlimited downloads/.test(alerts[0]), 'explains the subscription is unlimited');
    assert(!/topup/.test(w.location.href), 'no redirect to the retired top-ups');
    assert(!/Something went wrong/.test(alerts[0]), 'not a generic error');
    assert.strictEqual(w.document.getElementById('btn-payg').disabled, false, 'button restored');
  }
  // V13 manual E2E regression (26 Sep 2026): an ACTIVE subscriber clicking
  // a plan's "Get started" (e.g. Easy Start monthly -> Easy Pro annual) is
  // refused by the server's existing duplicate-subscription guard (409
  // ALREADY_SUBSCRIBED). The page used to replace that explanation with a
  // generic "Something went wrong starting checkout". It must show the
  // server's message (as account.html already does) and restore the button.
  for (const [code, pattern] of [['ALREADY_SUBSCRIBED', /billing portal/], ['CHECKOUT_IN_PROGRESS', /already in progress/]]) {
    const refusal = { ok: false, status: 409, json: async () => ({ code, error: code === 'ALREADY_SUBSCRIBED'
      ? "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout."
      : 'A checkout is already in progress for this account. Please wait a moment and try again.' }) };
    const { w, calls, alerts, errors } = await open({ signedIn: true, response: refusal, notice: true });
    w.eval("setBilling('annual', document.querySelector('[onclick*=\"annual\"]'))");
    await w.startCheckout('easy_start');
    assert.strictEqual(calls.length, 1, code + ': the server was asked (and refused)');
    assert(/create-checkout-session/.test(calls[0].url));
    assert.strictEqual(JSON.parse(calls[0].init.body).productKey, 'easy_start_annual', code + ': Easy Start Unlimited ANNUAL was requested');
    if (code === 'CHECKOUT_IN_PROGRESS') {
      // Shown in the shared CLPeasy dialog (checkout-notice.js), not an alert;
      // tests/checkout-in-progress-notice.js covers it in Chromium.
      assert.deepStrictEqual(alerts, [], code + ': no browser alert');
      const d = w.document.querySelector('.clp-cn-dialog[role="dialog"]');
      assert(d && /Checkout already in progress/.test(d.textContent), code + ': in-progress dialog shown');
    } else {
      assert.strictEqual(alerts.length, 1, code + ': one message');
      assert(pattern.test(alerts[0]), code + ': shows the server explanation, got: ' + alerts[0]);
      assert(!/Something went wrong/.test(alerts[0]), code + ': not the generic error');
    }
    const btn = w.document.getElementById('btn-easy_start');
    if (btn) { assert.strictEqual(btn.disabled, false, code + ': button restored'); assert(/Get started/.test(btn.textContent), code + ': button label restored'); }
    assert.deepStrictEqual(errors, []);
  }
  // If checkout-notice.js failed to load, the refusal still shows the
  // server's explanation (never the generic failure).
  {
    const refusal = { ok: false, status: 409, json: async () => ({ code: 'CHECKOUT_IN_PROGRESS', error: 'A checkout is already in progress for this account. Please wait a moment and try again.' }) };
    const { w, alerts } = await open({ signedIn: true, response: refusal });
    await w.startCheckout('easy_start');
    assert.deepStrictEqual(alerts, ['A checkout is already in progress for this account. Please wait a moment and try again.'], 'fallback message');
  }
  // A genuine failure (network/unknown) still shows the generic message.
  {
    const broken = { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
    const { w, alerts } = await open({ signedIn: true, response: broken });
    await w.startCheckout('easy_start');
    assert.strictEqual(alerts.length, 1);
    assert(/Something went wrong starting checkout/.test(alerts[0]), 'unknown failures keep the generic message');
  }
  console.log('PAYG pricing checkout checks passed');
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
